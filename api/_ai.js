// AI qatlami: ChatGPT (OpenAI) va Gemini. Biri tokeni tugasa/xato bersa, avtomatik ikkinchisiga o‘tadi.
// Model nomi eskirgan bo‘lsa (404), shu provayderning boshqa modelini sinaydi.
const cool = {}, good = {}; // provayder -> o‘chiq vaqt; ishlagan model
const T = ms => AbortSignal.timeout(ms);
const fail = (r, j) => Object.assign(new Error((j && j.error && (j.error.message || j.error)) || 'AI xatosi (' + r.status + ')'), { status: r.status });
const models = (env, def) => [...new Set([process.env[env], ...def].filter(Boolean))];
const tryModels = async (name, list, fn) => {
  const order = good[name] ? [good[name], ...list.filter(m => m !== good[name])] : list; let last;
  for (const m of order) { try { const t = await fn(m); good[name] = m; return t; } catch (e) { last = e; if (e.status !== 404) throw e; } }
  throw last;
};
const P = {
  openai: {
    key: () => process.env.OPENAI_API_KEY, models: () => models('OPENAI_MODEL', ['gpt-4o-mini', 'gpt-4.1-mini']),
    call({ system, user, images, json, max }) {
      const content = images && images.length ? [{ type: 'text', text: user }, ...images.map(u => ({ type: 'image_url', image_url: { url: u } }))] : user;
      return tryModels('openai', P.openai.models(), async model => {
        const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: T(45000),
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
          body: JSON.stringify({ model, max_completion_tokens: max || 800, ...(json ? { response_format: { type: 'json_object' } } : {}), messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }] }) });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw fail(r, j);
        const t = j.choices && j.choices[0] && j.choices[0].message.content; if (!t) throw Object.assign(new Error('Bo‘sh javob'), { status: 502 }); return t;
      });
    }
  },
  gemini: {
    key: () => process.env.GEMINI_API_KEY, models: () => models('GEMINI_MODEL', ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash']),
    call({ system, user, images, json, max }) {
      const parts = [{ text: user }, ...(images || []).map(u => { const m = /^data:(.+?);base64,(.+)$/.exec(u); return { inline_data: { mime_type: m[1], data: m[2] } }; })];
      return tryModels('gemini', P.gemini.models(), async model => {
        const body = { contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: Math.max(max || 800, 1500), ...(json ? { responseMimeType: 'application/json' } : {}), ...(/2\.5-flash/.test(model) && !/lite|pro/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } };
        if (system) body.systemInstruction = { parts: [{ text: system }] };
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'POST', signal: T(45000),
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw fail(r, j);
        const t = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts.map(p => p.text || '').join('');
        if (!t) throw Object.assign(new Error('Bo‘sh javob (xavfsizlik filtri bo‘lishi mumkin)'), { status: 502 }); return t;
      });
    }
  }
};
async function run(opts, parse) {
  const order = (process.env.AI_PRIORITY || 'openai,gemini').split(',').map(s => s.trim()).filter(n => P[n] && P[n].key());
  if (!order.length) throw Object.assign(new Error('AI kalitlari sozlanmagan'), { code: 'no_key', status: 503 });
  const ready = order.filter(n => !(cool[n] > Date.now())), list = ready.length ? ready : order; let last;
  for (const n of list) {
    try { const text = await P[n].call(opts); return { provider: n, data: parse ? parse(text) : text }; }
    catch (e) { last = e; cool[n] = Date.now() + ([401, 402, 403, 429].includes(e.status) ? 600000 : 30000); console.error('AI xato [' + n + ']', e.status || '', e.message); }
  }
  throw last;
}
const parseJson = t => { const a = t.indexOf('{'), b = t.lastIndexOf('}'); return JSON.parse(t.slice(a, b + 1)); };
exports.chat = (system, user, max) => run({ system, user, max });
exports.vision = (system, user, images, max) => run({ system, user, images, json: true, max }, parseJson);
exports.status = () => Object.keys(P).map(n => ({ name: n, enabled: !!P[n].key(), cooldown: cool[n] > Date.now() }));
exports.explain = e => e && e.code === 'no_key' ? 'AI hali sozlanmagan. Administrator serverga AI kalitini (OPENAI_API_KEY yoki GEMINI_API_KEY) kiritishi kerak.'
  : e && [401, 403].includes(e.status) ? 'AI kaliti yaroqsiz yoki ruxsat yo‘q. Administrator kalitni tekshirsin.'
  : e && [402, 429].includes(e.status) ? 'AI limiti (token) hozircha tugagan. Birozdan keyin qayta urinib ko‘ring.'
  : e && e.status === 404 ? 'AI modeli topilmadi. Administrator model nomini yangilashi kerak.'
  : 'AI xizmati hozir band. Birozdan keyin qayta urinib ko‘ring.';
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
