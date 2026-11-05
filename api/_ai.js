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

const fail = (r, j, model) => {
  const raw = (j && j.error && (j.error.message || j.error.status || j.error)) || ('AI xatosi (' + r.status + ')');
  const details = Array.isArray(j?.error?.details) ? j.error.details : [];
  const quota = details.flatMap(d => (d.violations || []).map(v => ({
    metric: mask(v.quotaMetric), id: mask(v.quotaId),
    model: mask(v.quotaDimensions?.model)
  })));
  const retry = details.find(d => d.retryDelay)?.retryDelay;
  const seconds = Number.parseFloat(retry);
  return Object.assign(new Error(mask(raw)), {
    status: r.status, model, quota,
    retryMs: Number.isFinite(seconds) ? Math.min(3600000, Math.max(1000, seconds * 1000)) : undefined
  });
};

const cleanKey = k => String(k || '').trim().replace(/^["']|["']$/g, '');
// Explicit models take precedence. Gemini scans can also use the default model as a fallback.
const models = (env, def) => {
  const configured = cleanKey(process.env[env]);
  const extra = cleanKey(process.env[env.replace(/_MODEL$/, '_FALLBACK_MODELS')])
    .split(',').map(s => s.trim()).filter(Boolean);
  return [...new Set([...(configured ? [configured] : def), ...extra])];
};
const SWITCH = [400, 404, 408, 429, 500, 502, 503, 504];
const isTimeout = e => !!(e && (e.name === 'TimeoutError' || e.name === 'AbortError' || /timeout|aborted|Vaqt tugadi/i.test(e.message || '')));

const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash-lite'];

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

async function tryModels(name, list, deadline, fn, scan) {
  let last;
  const now = Date.now();
  const modelKey = m => (scan ? 'scan:' : '') + name + ':' + m;
  const avail = list.filter(m => !(badModel[modelKey(m)] > now));
  const pool = avail.length ? avail : list;
  const ordered = pool;

  for (const m of ordered) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (deadline && Date.now() > deadline - 1500) {
        throw last || Object.assign(new Error('Vaqt tugadi'), { name: 'TimeoutError', status: 504 });
      }
      try {
        const res = await fn(m, attempt);
        good[name] = m;
        delete badModel[modelKey(m)];
        return res;
      } catch (e) {
        last = e;
        e.model = e.model || m;
        // Quota/auth errors must reach the backup provider immediately.
        if ([401, 402, 403, 429].includes(e.status)) throw e;
        if (isTimeout(e)) {
          if (scan) break;
          throw e;
        }
        if (e.status === 404 || /not found|not supported for generateContent|shut down/i.test(e.message || '')) {
          badModel[modelKey(m)] = Date.now() + 3600000;
          break;
        }
        if (e.status === 503 && (!scan || ordered.length === 1) && attempt === 0 && (!deadline || Date.now() < deadline - 4000)) {
          const waitMs = Number(process.env.AI_RETRY_MS) || 800;
          await sleep(waitMs);
          continue;
        }
        if (e.status === 429 || isTimeout(e) || [500, 502, 503, 504].includes(e.status)) {
          if (!scan) badModel[modelKey(m)] = Date.now() + 20000;
          break;
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
    call({ system, user, images, json, max, deadline, scan, parseScan }) {
      const key = P.openai.key();
      const content = images && images.length
        ? [{ type: 'text', text: user }, ...images.map(u => ({ type: 'image_url', image_url: { url: u, detail: 'high' } }))]
        : user;
      const attemptMax = (scan && (Number(process.env.AI_SCAN_ATTEMPT_MS) || 19000)) || Number(process.env.AI_ATTEMPT_MS) || 14000;
      return tryModels('openai', P.openai.models(), deadline, async model => {
        const rem = deadline ? deadline - Date.now() - 500 : attemptMax;
        if (rem < 1500) throw Object.assign(new Error('Vaqt tugadi'), { name: 'TimeoutError', status: 504 });
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: T(Math.min(attemptMax, rem)),
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_completion_tokens: max || 700,
            ...(json ? { response_format: { type: 'json_object' } } : {}),
            messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }]
          })
        });
        const j = await r.json().catch(e => { if (isTimeout(e)) throw e; return {}; });
        if (!r.ok) throw fail(r, j, model);
        const t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (!t) throw Object.assign(new Error('Bo‘sh javob'), { status: 502 });
        return parseScan ? parseScan(t) : t;
      }, scan);
    }
  },
  gemini: {
    key: () => cleanKey(process.env.GEMINI_API_KEY),
    models: () => models('GEMINI_MODEL', DEFAULT_GEMINI_MODELS),
    call({ system, user, images, json, max, deadline, fast, scan, parseScan }) {
      const key = P.gemini.key();
      const imgParts = (images || []).map(u => {
        const m = /^data:([^;]+);base64,(.+)$/s.exec(u || '');
        if (!m) throw Object.assign(new Error('Rasm formati noto‘g‘ri'), { status: 400 });
        return { inline_data: { mime_type: m[1], data: m[2].replace(/\s+/g, '') } };
      });
      const parts = [{ text: String(user || '') }, ...imgParts];
      const baseModels = P.gemini.models();
      const fastModel = cleanKey(process.env.GEMINI_FAST_MODEL) || baseModels[0];
      const list = fast ? [...new Set([fastModel, ...baseModels])] : baseModels;
      if (scan && list.length === 1 && !list.includes(DEFAULT_GEMINI_MODELS[0])) {
        list.push(DEFAULT_GEMINI_MODELS[0]);
      }
      const attemptMax = (scan && (Number(process.env.AI_SCAN_ATTEMPT_MS) || 19000)) || Number(process.env.AI_ATTEMPT_MS) || (fast ? 12000 : 15000);

      return tryModels('gemini', list, deadline, async model => {
        const rem = deadline ? deadline - Date.now() - 500 : attemptMax;
        if (rem < 1500) throw Object.assign(new Error('Vaqt tugadi'), { name: 'TimeoutError', status: 504 });
        const isLegacyTemp = !/gemini-[34]/i.test(model);
        const body = {
          contents: [{ role: 'user', parts }],
          generationConfig: {
            maxOutputTokens: Math.min(Math.max(Number(max) || 600, 150), 2048),
            ...(isLegacyTemp ? { temperature: 0.1 } : {}),
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
        const j = await r.json().catch(e => { if (isTimeout(e)) throw e; return {}; });
        if (!r.ok) throw fail(r, j, model);
        const cand = j.candidates && j.candidates[0];
        const candParts = (cand && cand.content && Array.isArray(cand.content.parts)) ? cand.content.parts : [];
        const t = candParts.filter(p => !p.thought).map(p => p.text || '').join('').trim()
          || candParts.map(p => p.text || '').join('').trim();
        if (!t) {
          const blockReason = (j.promptFeedback && j.promptFeedback.blockReason) || (cand && cand.finishReason) || '';
          throw Object.assign(new Error('Bo‘sh javob' + (blockReason ? ' (' + blockReason + ')' : ' (xavfsizlik filtri bo‘lishi mumkin)')), { status: 502 });
        }
        return parseScan ? parseScan(t) : t;
      }, scan);
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

function parseScanJson(raw) {
  const data = parseJson(raw);
  if (typeof data.assessable !== 'boolean' ||
      (data.assessable && (typeof data.species !== 'string' || !data.species.trim()))) {
    throw Object.assign(new Error('AI skan natijasi to‘liq emas'), { status: 502 });
  }
  return data;
}

async function run(opts, parse) {
  const totalMs = Math.min(Number(process.env.AI_DEADLINE_MS) || 45000, 48000);
  opts = { ...opts, deadline: Date.now() + totalMs };
  const order = (process.env.AI_PRIORITY || 'openai,gemini')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(n => P[n] && P[n].key());
  if (!order.length) throw Object.assign(new Error('AI kalitlari sozlanmagan'), { code: 'no_key', status: 503 });

  const now = Date.now();
  const cooldownKey = n => opts.scan ? 'scan:' + n : n;
  const ready = order.filter(n => !(cool[cooldownKey(n)] > now));
  if (!ready.length) {
    const wait = Math.max(1000, Math.min(...order.map(n => cool[cooldownKey(n)])) - now);
    throw Object.assign(new Error('AI vaqtincha cheklangan. Birozdan keyin qayta urinib ko‘ring.'), { status: 429, retryMs: wait });
  }
  const list = ready;
  let last;
  const tried = [];

  for (const n of list) {
    try {
      // Leave a fair share of the deadline for every remaining provider.
      const remaining = list.length - list.indexOf(n);
      const providerDeadline = Date.now() + Math.floor((opts.deadline - Date.now()) / remaining);
      const output = await P[n].call({ ...opts, deadline: providerDeadline, parseScan: opts.scan ? parse : undefined });
      const data = parse && !opts.scan ? parse(output) : output;
      delete cool[cooldownKey(n)];
      return { provider: n, model: good[n], data };
    } catch (e) {
      last = e;
      const code = e.status || (isTimeout(e) ? 'TimeoutError' : e.name || 'Error');
      tried.push(n + ' ' + code + ': ' + mask(e.message));
      e.tried = tried;
      const isAuthOrQuota = [401, 402, 403, 429].includes(e.status);
      if (!opts.scan || isAuthOrQuota) {
        cool[cooldownKey(n)] = Date.now() + (e.retryMs || (isAuthOrQuota ? 60000 : 15000));
      }
      console.error('AI xato [' + n + ']', JSON.stringify({ status: code, model: e.model || null, quota: e.quota || [], retryMs: e.retryMs || null, message: mask(e.message) }));
    }
  }
  throw last;
}

exports.chat = (system, user, max, images) => run({ system, user, images, max: max || 700 });
exports.vision = (system, user, images, max, fast, scan = false) => run({ system, user, images, json: true, max: max || 650, fast: !!fast, scan }, scan ? parseScanJson : parseJson);
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
  cooldown: Math.max(cool[n] || 0, cool['scan:' + n] || 0) > Date.now(),
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
          ? 'AI xizmati vaqtincha cheklangan. Birozdan keyin qayta urinib ko‘ring.'
          : [401, 403].includes(st)
            ? 'AI kaliti yaroqsiz yoki unga ruxsat yo‘q. Administrator kalitni tekshirsin.'
            : st === 404 || /is not found|not supported for generateContent|shut down/i.test(m)
              ? 'AI modeli topilmadi yoki eskirgan. Administrator model nomini yangilashi kerak.'
              : /Bo‘sh javob|JSON|skan natijasi to‘liq emas/i.test(m)
                ? 'AI xizmati to‘liq javob qaytarmadi. Qayta urinib ko‘ring.'
                : isTimeout(e) || st === 504
                  ? 'AI javobi kechikdi. Rasmni kichraytirib yoki birozdan keyin qayta urinib ko‘ring.'
                  : 'AI xizmati hozir band. Birozdan keyin qayta urinib ko‘ring.';
  return t; // Provider diagnostics belong in server logs, not customer messages.
};

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