// AI qatlami: ChatGPT (OpenAI) va Gemini. Biri tokeni tugasa/xato bersa, avtomatik ikkinchisiga o‘tadi.
// Model nomi eskirgan bo‘lsa (404) yoki band/sekin bo‘lsa (429/5xx/timeout), shu provayderning boshqa modelini sinaydi.
const mask = x => String(x || '')
  .replace(/sk-[\w*\-]+/g, 'sk-…')
  .replace(/AIza[\w\-*]+/g, 'AIza…')
  .replace(/Bearer\s+[\w\-._~+/]+=*/gi, 'Bearer …')
  .replace(/key=[\w\-]+/gi, 'key=…')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 120);

const cool = {}, good = {}, badModel = {}; // provayder -> o‘chiq vaqt; ishlagan model; vaqtincha yaroqsiz modellar
const T = ms => AbortSignal.timeout(Math.max(1000, Math.floor(ms)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const fail = (r, j) => {
  const raw = (j && j.error && (j.error.message || j.error.status || j.error)) || ('AI xatosi (' + r.status + ')');
  return Object.assign(new Error(mask(raw)), { status: r.status });
};

const cleanKey = k => String(k || '').trim().replace(/^["']|["']$/g, '');
const models = (env, def) => [...new Set([ cleanKey(process.env[env]), ...def ].filter(Boolean))];
const SWITCH = [400, 404, 408, 429, 500, 502, 503, 504];
const isTimeout = e => !!(e && (e.name === 'TimeoutError' || e.name === 'AbortError' || /timeout|aborted|Vaqt tugadi/i.test(e.message || '')));

const DEFAULT_GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-latest'
];

const DEFAULT_OPENAI_MODELS = [
  'gpt-4o-mini',
  'gpt-4.1-mini'
];

function geminiThinkingConfig(model) {
  if (/2\.5-flash/.test(model) && !/lite|pro/.test(model)) return { thinkingConfig: { thinkingBudget: 0 } };
  if (/3\.5-flash-lite|3\.6-flash/.test(model)) return { thinkingConfig: { thinkingLevel: 'minimal' } };
  if (/3\.8-flash|3-flash/.test(model)) return { thinkingConfig: { thinkingLevel: 'low' } };
  return {};
}

async function tryModels(name, list, deadline, fn) {
  let last;
  const now = Date.now();
  const avail = list.filter(m => !(badModel[name + ':' + m] > now));
  const pool = avail.length ? avail : list;
  const ordered = good[name] && pool.includes(good[name])
    ? [good[name], ...pool.filter(m => m !== good[name])]
    : pool;

  for (const m of ordered) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (deadline && Date.now() > deadline - 1500) {
        throw last || Object.assign(new Error('Vaqt tugadi'), { name: 'TimeoutError', status: 504 });
      }
      try {
        const res = await fn(m, attempt);
        good[name] = m;
        delete badModel[name + ':' + m];
        return res;
      } catch (e) {
        last = e;
        if (e.status === 404 || /not found|not supported for generateContent|shut down/i.test(e.message || '')) {
          badModel[name + ':' + m] = Date.now() + 3600000; // 1 soatga o‘chiramiz
          break;
        }
        // 503 (band) bo‘lsa va vaqt yetsa, qisqa kutib xuddi shu modelni 1 marta qayta sinaymiz
        if (e.status === 503 && attempt === 0 && (!deadline || Date.now() < deadline - 4000)) {
          const waitMs = Number(process.env.AI_RETRY_MS) || 800;
          await sleep(waitMs);
          continue;
        }
        if (e.status === 429 || isTimeout(e) || [500, 502, 503, 504].includes(e.status)) {
          badModel[name + ':' + m] = Date.now() + (e.status === 429 ? 60000 : 20000);
          break; // keyingi modelga o‘tamiz
        }
        if (!SWITCH.includes(e.status) && !isTimeout(e)) throw e;
        break;
      }
    }
  }
  throw last || Object.assign(new Error('AI xizmati javob bermadi'), { status: 503 });
}

const P = {
  openai: {
    key: () => cleanKey(process.env.OPENAI_API_KEY),
    models: () => models('OPENAI_MODEL', DEFAULT_OPENAI_MODELS),
    call({ system, user, images, json, max, deadline }) {
      const key = P.openai.key();
      const content = images && images.length
        ? [{ type: 'text', text: user }, ...images.map(u => ({ type: 'image_url', image_url: { url: u, detail: 'low' } }))]
        : user;
      const attemptMax = Number(process.env.AI_ATTEMPT_MS) || 14000;
      return tryModels('openai', P.openai.models(), deadline, async model => {
        const rem = deadline ? deadline - Date.now() - 500 : attemptMax;
        if (rem < 1500) throw Object.assign(new Error('Vaqt tugadi'), { name: 'TimeoutError', status: 504 });
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: T(Math.min(attemptMax, rem)),
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({
            model,
            max_completion_tokens: max || 600,
            ...(json ? { response_format: { type: 'json_object' } } : {}),
            messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }]
          })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw fail(r, j);
        const t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (!t) throw Object.assign(new Error('Bo‘sh javob'), { status: 502 });
        return t;
      });
    }
  },
  gemini: {
    key: () => cleanKey(process.env.GEMINI_API_KEY),
    models: () => models('GEMINI_MODEL', DEFAULT_GEMINI_MODELS),
    call({ system, user, images, json, max, deadline, fast }) {
      const key = P.gemini.key();
      const imgParts = (images || []).map(u => {
        const m = /^data:([^;]+);base64,(.+)$/s.exec(u || '');
        if (!m) throw Object.assign(new Error('Rasm formati noto‘g‘ri'), { status: 400 });
        return { inline_data: { mime_type: m[1], data: m[2].replace(/\s+/g, '') } };
      });
      const parts = [{ text: String(user || '') }, ...imgParts];
      const baseModels = P.gemini.models();
      const fastModel = cleanKey(process.env.GEMINI_FAST_MODEL) || 'gemini-2.5-flash-lite';
      const list = fast ? [...new Set([fastModel, ...baseModels])] : baseModels;
      const attemptMax = Number(process.env.AI_ATTEMPT_MS) || (fast ? 12000 : 15000);

      return tryModels('gemini', list, deadline, async model => {
        const rem = deadline ? deadline - Date.now() - 500 : attemptMax;
        if (rem < 1500) throw Object.assign(new Error('Vaqt tugadi'), { name: 'TimeoutError', status: 504 });
        const body = {
          contents: [{ role: 'user', parts }],
          generationConfig: {
            maxOutputTokens: Math.min(Math.max(Number(max) || 500, 150), 2048),
            ...(json ? { responseMimeType: 'application/json' } : {}),
            ...geminiThinkingConfig(model)
          }
        };
        if (system) body.systemInstruction = { parts: [{ text: String(system) }] };

        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
          method: 'POST',
          signal: T(Math.min(attemptMax, rem)),
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body)
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw fail(r, j);
        const cand = j.candidates && j.candidates[0];
        const candParts = (cand && cand.content && Array.isArray(cand.content.parts)) ? cand.content.parts : [];
        const t = candParts.filter(p => !p.thought).map(p => p.text || '').join('').trim()
          || candParts.map(p => p.text || '').join('').trim();
        if (!t) {
          const blockReason = (j.promptFeedback && j.promptFeedback.blockReason) || (cand && cand.finishReason) || '';
          throw Object.assign(new Error('Bo‘sh javob' + (blockReason ? ' (' + blockReason + ')' : ' (xavfsizlik filtri bo‘lishi mumkin)')), { status: 502 });
        }
        return t;
      });
    }
  }
};

function parseJson(raw) {
  const s = String(raw || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw Object.assign(new Error('AI noto‘g‘ri JSON qaytardi'), { status: 502 });
  const slice = s.slice(a, b + 1).replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(slice);
  } catch (_) {
    throw Object.assign(new Error('AI javobini o‘qib bo‘lmadi (JSON xato)'), { status: 502 });
  }
}

async function run(opts, parse) {
  const totalMs = Math.min(Number(process.env.AI_DEADLINE_MS) || 45000, 48000); // Render ~100s da uzadi, 45s ichida tugatamiz
  opts = { ...opts, deadline: Date.now() + totalMs };
  const order = (process.env.AI_PRIORITY || 'openai,gemini')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(n => P[n] && P[n].key());
  if (!order.length) throw Object.assign(new Error('AI kalitlari sozlanmagan'), { code: 'no_key', status: 503 });

  const now = Date.now();
  const ready = order.filter(n => !(cool[n] > now));
  const list = ready.length ? ready : order;
  let last;
  const tried = [];

  for (const n of list) {
    try {
      const text = await P[n].call(opts);
      const data = parse ? parse(text) : text;
      delete cool[n];
      return { provider: n, model: good[n], data };
    } catch (e) {
      last = e;
      const code = e.status || (isTimeout(e) ? 'TimeoutError' : e.name || 'Error');
      tried.push(n + ' ' + code + ': ' + mask(e.message));
      e.tried = tried;
      const isAuthOrQuota = [401, 402, 403, 429].includes(e.status);
      cool[n] = Date.now() + (isAuthOrQuota ? 180000 : 25000);
      console.error('AI xato [' + n + ']', code, mask(e.message));
    }
  }
  throw last;
}

exports.chat = (system, user, max) => run({ system, user, max: max || 600 });
exports.vision = (system, user, images, max, fast) => run({ system, user, images, json: true, max: max || 500, fast: !!fast }, parseJson);
exports.parseJson = parseJson;
exports.mask = mask;
exports.resetState = () => {
  for (const k of Object.keys(cool)) delete cool[k];
  for (const k of Object.keys(good)) delete good[k];
  for (const k of Object.keys(badModel)) delete badModel[k];
};
exports.status = () => Object.keys(P).map(n => ({
  name: n,
  enabled: !!P[n].key(),
  cooldown: !!(cool[n] && cool[n] > Date.now()),
  model: good[n] || null
}));

exports.explain = e => {
  const m = mask((e && e.message) || '');
  const st = e && e.status;
  const tag = e && e.tried && e.tried.length ? ' [' + e.tried.map(mask).join(' | ') + ']' : '';
  const t = e && e.code === 'no_key'
    ? 'AI hali sozlanmagan. Administrator serverga AI kalitini (GEMINI_API_KEY yoki OPENAI_API_KEY) kiritishi kerak.'
    : /API key not valid|API_KEY_INVALID|Incorrect API key|invalid_api_key/i.test(m)
      ? 'AI kaliti noto‘g‘ri. Administrator kalitni qayta nusxalab, Render’ga qo‘shtirnoqsiz va bo‘sh joysiz kiritsin.'
      : /location is not supported|unsupported_country|not available in your (country|region)|User location is not supported|territory/i.test(m)
        ? 'AI xizmati server joylashgan hududda mavjud emas. Administrator Render regionini AQSh (Oregon/Ohio) ga o‘zgartirishi kerak.'
        : /quota|billing|RESOURCE_EXHAUSTED|rate limit|insufficient/i.test(m) || [402, 429].includes(st)
          ? 'AI bepul limiti (kvota) hozircha tugagan. Birozdan keyin qayta urinib ko‘ring yoki pullik tarif / ikkinchi AI kalitini ulang.'
          : [401, 403].includes(st)
            ? 'AI kaliti yaroqsiz yoki unga ruxsat yo‘q. Administrator kalitni tekshirsin.'
            : st === 404 || /is not found|not supported for generateContent|shut down/i.test(m)
              ? 'AI modeli topilmadi yoki eskirgan. Administrator model nomini yangilashi kerak.'
              : /Bo‘sh javob|JSON/i.test(m)
                ? 'AI javobni to‘liq qaytarmadi (xavfsizlik filtri yoki rasm noaniq bo‘lishi mumkin). Boshqa aniqroq rasm bilan urinib ko‘ring.'
                : isTimeout(e) || st === 504
                  ? 'AI javobi kechikdi. Rasmni kichraytirib yoki birozdan keyin qayta urinib ko‘ring.'
                  : 'AI xizmati hozir band. Birozdan keyin qayta urinib ko‘ring.';
  return t + tag;
};

// Gemini'da mavjud va generateContent'ni qo‘llaydigan modellarni aniqlash (kalit hech qachon chiqarilmaydi)
async function listGeminiModels() {
  const key = P.gemini.key();
  if (!key) return [];
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      signal: T(8000),
      headers: { 'x-goog-api-key': key }
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(j.models)) return [];
    return j.models
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}
exports.listGeminiModels = listGeminiModels;

// Tashxis: har bir provayderni alohida sinaydi (kalitni hech qachon ko‘rsatmaydi)
exports.test = async () => {
  const out = [];
  for (const n of Object.keys(P)) {
    if (!P[n].key()) {
      out.push({ provider: n, key: false, ok: false, error: 'Kalit kiritilmagan' });
      continue;
    }
    const t0 = Date.now();
    const extra = {};
    if (n === 'gemini') {
      const avail = await listGeminiModels();
      if (avail.length) extra.availableModels = avail.filter(m => /flash|pro/i.test(m)).slice(0, 12);
    }
    try {
      await P[n].call({ user: 'Reply with the single word OK', max: 30, fast: true, deadline: Date.now() + 25000 });
      out.push({ provider: n, key: true, ok: true, model: good[n], ms: Date.now() - t0, ...extra });
    } catch (e) {
      out.push({
        provider: n,
        key: true,
        ok: false,
        status: e.status || (isTimeout(e) ? 504 : 503),
        error: mask(e.message),
        triedModels: P[n].models(),
        ...extra
      });
    }
  }
  return { priority: process.env.AI_PRIORITY || 'openai,gemini', providers: out };
};