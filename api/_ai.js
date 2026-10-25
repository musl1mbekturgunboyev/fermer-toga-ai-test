// AI qatlami: ChatGPT (OpenAI) va Gemini. Biri tokeni tugasa/xato bersa, avtomatik ikkinchisiga o‘tadi.
// Model nomi eskirgan bo‘lsa (404), shu provayderning boshqa modelini sinaydi.
const cool = {}, good = {}; // provayder -> o‘chiq vaqt; ishlagan model
const T = ms => AbortSignal.timeout(ms);
const fail = (r, j) => Object.assign(new Error((j && j.error && (j.error.message || j.error)) || 'AI xatosi (' + r.status + ')'), { status: r.status });
const models = (env, def) => [...new Set([process.env[env], ...def].filter(Boolean))];
const SWITCH = [404, 429, 500, 502, 503, 504]; // shu xatolarda boshqa modelni sinaymiz (band yoki limit modelga xos bo‘ladi)
const tryModels = async (name, list, fn) => {
  let last;
  for (let round = 0; round < 2; round++) {
    const order = good[name] ? [good[name], ...list.filter(m => m !== good[name])] : list;
    for (const m of order) { try { const t = await fn(m); good[name] = m; return t; } catch (e) { last = e; if (!SWITCH.includes(e.status) && e.name !== 'TimeoutError') throw e; } }
    if (![500, 502, 503, 504].includes(last.status)) break;
    await new Promise(r => setTimeout(r, 1500)); // hammasi band bo‘lsa, 1,5 soniya kutib bir marta qayta urinamiz
  }
  throw last;
};
const P = {
  openai: {
    key: () => process.env.OPENAI_API_KEY, models: () => models('OPENAI_MODEL', ['gpt-4o-mini', 'gpt-4.1-mini']),
    call({ system, user, images, json, max, deadline, fast }) {
      const content = images && images.length ? [{ type: 'text', text: user }, ...images.map(u => ({ type: 'image_url', image_url: { url: u } }))] : user;
      return tryModels('openai', P.openai.models(), async model => {
        if (deadline && Date.now() > deadline - 2500) throw Object.assign(new Error('Vaqt tugadi'), { name: 'TimeoutError' });
        const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: T(Math.max(3000, Math.min(Number(process.env.AI_ATTEMPT_MS) || 20000, (deadline || Date.now() + 25000) - Date.now()))),
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
          body: JSON.stringify({ model, max_completion_tokens: max || 800, ...(json ? { response_format: { type: 'json_object' } } : {}), messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }] }) });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw fail(r, j);
        const t = j.choices && j.choices[0] && j.choices[0].message.content; if (!t) throw Object.assign(new Error('Bo‘sh javob'), { status: 502 }); return t;
      });
    }
  },
  gemini: {
    key: () => process.env.GEMINI_API_KEY, models: () => models('GEMINI_MODEL', ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-flash-latest']),
    call({ system, user, images, json, max, deadline, fast }) {
      const parts = [{ text: user }, ...(images || []).map(u => { const m = /^data:(.+?);base64,(.+)$/.exec(u); return { inline_data: { mime_type: m[1], data: m[2] } }; })];
      return tryModels('gemini', fast ? [...new Set([process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite', ...P.gemini.models()])] : P.gemini.models(), async model => {
        if (deadline && Date.now() > deadline - 2500) throw Object.assign(new Error('Vaqt tugadi'), { name: 'TimeoutError' });
        const body = { contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: Math.max(max || 800, 1500), ...(json ? { responseMimeType: 'application/json' } : {}), ...(/2\.5-flash/.test(model) && !/lite|pro/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } };
        if (system) body.systemInstruction = { parts: [{ text: system }] };
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'POST', signal: T(Math.max(3000, Math.min(Number(process.env.AI_ATTEMPT_MS) || 20000, (deadline || Date.now() + 25000) - Date.now()))),
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw fail(r, j);
        const t = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts.map(p => p.text || '').join('');
        if (!t) throw Object.assign(new Error('Bo‘sh javob (xavfsizlik filtri bo‘lishi mumkin)'), { status: 502 }); return t;
      });
    }
  }
};
async function run(opts, parse) {
  opts = { ...opts, deadline: Date.now() + 50000 }; // umumiy vaqt chegarasi: Render 100 soniyada uzib qo‘yadi
  const order = (process.env.AI_PRIORITY || 'openai,gemini').split(',').map(s => s.trim()).filter(n => P[n] && P[n].key());
  if (!order.length) throw Object.assign(new Error('AI kalitlari sozlanmagan'), { code: 'no_key', status: 503 });
  const ready = order.filter(n => !(cool[n] > Date.now())), list = ready.length ? ready : order; let last; const tried = [];
  for (const n of list) {
    try { const text = await P[n].call(opts); return { provider: n, data: parse ? parse(text) : text }; }
    catch (e) { last = e; tried.push(n + ' ' + (e.status || e.name)); e.tried = tried; cool[n] = Date.now() + ([401, 402, 403, 429].includes(e.status) ? 600000 : 30000); console.error('AI xato [' + n + ']', e.status || '', e.message); }
  }
  throw last;
}
const parseJson = t => { const a = t.indexOf('{'), b = t.lastIndexOf('}'); return JSON.parse(t.slice(a, b + 1)); };
exports.chat = (system, user, max) => run({ system, user, max });
exports.vision = (system, user, images, max, fast) => run({ system, user, images, json: true, max, fast }, parseJson);
exports.status = () => Object.keys(P).map(n => ({ name: n, enabled: !!P[n].key(), cooldown: cool[n] > Date.now() }));
exports.explain = e => {
  const m = String((e && e.message) || ''), st = e && e.status, tag = e && e.tried && e.tried.length ? ' (' + e.tried.join(', ') + ')' : '';
  const t = e && e.code === 'no_key' ? 'AI hali sozlanmagan. Administrator serverga AI kalitini (OPENAI_API_KEY yoki GEMINI_API_KEY) kiritishi kerak.'
    : /API key not valid|API_KEY_INVALID|Incorrect API key|invalid_api_key/i.test(m) ? 'AI kaliti noto‘g‘ri. Administrator kalitni qayta nusxalab, Render’ga qo‘shtirnoqsiz va bo‘sh joysiz kiritsin.'
    : /location is not supported|unsupported_country|not available in your (country|region)|territory/i.test(m) ? 'AI xizmati server joylashgan hududda mavjud emas. Administrator serverni boshqa hududga (masalan, AQSh) ko‘chirishi kerak.'
    : /quota|billing|RESOURCE_EXHAUSTED|rate limit|insufficient/i.test(m) || [402, 429].includes(st) ? 'AI limiti (token) hozircha tugagan. Birozdan keyin qayta urinib ko‘ring.'
    : [401, 403].includes(st) ? 'AI kaliti yaroqsiz yoki unga ruxsat yo‘q. Administrator kalitni tekshirsin.'
    : st === 404 || /is not found|not supported for generateContent/i.test(m) ? 'AI modeli topilmadi. Administrator model nomini yangilashi kerak.'
    : /Bo‘sh javob/.test(m) ? 'AI javob bermadi (xavfsizlik filtri bo‘lishi mumkin). Boshqa rasm bilan urinib ko‘ring.'
    : e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'AI javobi kechikdi. Qayta urinib ko‘ring.'
    : 'AI xizmati hozir band. Birozdan keyin qayta urinib ko‘ring.';
  return t + tag;
};
// Tashxis: har bir provayderni alohida sinaydi (kalitni ko‘rsatmaydi)
exports.test = async () => {
  const mask = s => String(s || '').replace(/sk-[\w*\-]+/g, 'sk-…').replace(/AIza[\w\-*]+/g, 'AIza…').slice(0, 260), out = [];
  for (const n of Object.keys(P)) {
    if (!P[n].key()) { out.push({ provider: n, key: false, ok: false, error: 'Kalit kiritilmagan' }); continue; }
    const t0 = Date.now();
    try { await P[n].call({ user: 'Reply with the single word OK', max: 20 }); out.push({ provider: n, key: true, ok: true, model: good[n], ms: Date.now() - t0 }); }
    catch (e) { out.push({ provider: n, key: true, ok: false, status: e.status, error: mask(e.message), triedModels: P[n].models() }); }
  }
  return { priority: process.env.AI_PRIORITY || 'openai,gemini', providers: out };
};