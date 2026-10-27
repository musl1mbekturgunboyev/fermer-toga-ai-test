// Umumiy yordamchilar: foydalanuvchini tekshirish (Supabase), so‘rovlar chegarasi (rate limit), VAPID kalitlar, admin tekshiruvi.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rl = new Map();
const LIMITS = {
  scan: { max: 8, windowMs: 60000 },
  chat: { max: 15, windowMs: 60000 },
  listings: { max: 6, windowMs: 60000 },
  ip: { max: 30, windowMs: 60000 },
  default: { max: 20, windowMs: 60000 }
};

// Client IP manzilini xavfsiz aniqlash
function getClientIp(req) {
  const xf = req.headers && req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

function ensureVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const cacheFile = path.join(__dirname, '..', '.vapid.json');
  try {
    if (fs.existsSync(cacheFile)) {
      const saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (saved && saved.publicKey && saved.privateKey) {
        process.env.VAPID_PUBLIC_KEY = saved.publicKey;
        process.env.VAPID_PRIVATE_KEY = saved.privateKey;
        return saved;
      }
    }
  } catch (_) {}
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const keys = {
    publicKey: ecdh.getPublicKey('base64url'),
    privateKey: ecdh.getPrivateKey('base64url')
  };
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  try { fs.writeFileSync(cacheFile, JSON.stringify(keys)); } catch (_) {}
  return keys;
}

ensureVapidKeys();

function checkRateLimit(key, kind = 'default') {
  const cfg = LIMITS[kind] || LIMITS.default;
  const now = Date.now();
  const bucketKey = kind + ':' + key;
  const arr = (rl.get(bucketKey) || []).filter(t => now - t < cfg.windowMs);
  if (arr.length >= cfg.max) return false;
  arr.push(now);
  rl.set(bucketKey, arr);
  if (rl.size > 5000) {
    for (const [k, v] of rl.entries()) {
      if (!v.length || now - v[v.length - 1] > 120000) rl.delete(k);
    }
  }
  return true;
}

async function auth(req, res, kind = 'default') {
  // IP darajasida tekshirish (Botnet va DoS hujumlariga qarshi)
  const ip = getClientIp(req);
  if (!checkRateLimit(ip, 'ip')) {
    res.status(429).json({ error: 'Juda ko‘p so‘rov (IP). Biroz kuting.' });
    return null;
  }

  const t = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '').trim();
  if (!t) {
    res.status(401).json({ error: 'Kirish talab qilinadi' });
    return null;
  }
  let r;
  try {
    r = await fetch(process.env.SUPABASE_URL + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + t, apikey: process.env.SUPABASE_ANON_KEY }
    });
  } catch (_) {
    res.status(503).json({ error: 'Avtorizatsiya xizmati vaqtincha band' });
    return null;
  }
  if (!r.ok) {
    res.status(401).json({ error: 'Sessiya yaroqsiz' });
    return null;
  }
  const u = await r.json().catch(() => null);
  if (!u || !u.id) {
    res.status(401).json({ error: 'Sessiya yaroqsiz' });
    return null;
  }
  // Foydalanuvchi darajasida rate limit
  if (!checkRateLimit(u.id, kind)) {
    res.status(429).json({ error: 'Juda ko‘p so‘rov. Biroz kuting.' });
    return null;
  }
  return u;
}

async function openai(body) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', ...body })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || 'OpenAI xatosi');
  return j.choices[0].message.content;
}

const SYS = 'Sen "Fermer Tog‘a AI" yordamchisan. Faqat sodda o‘zbek (lotin) tilida javob ber. Hech qachon aniq veterinariya tashxisi qo‘yma, dori nomi yoki dozasini yozma. Jiddiy belgilarda (qon, yeyishdan bosh tortish, nafas qiyinligi, yiqilish) veterinarga murojaat qilishni ayt. Vazn va yoshni faqat taxminiy diapazon sifatida, noaniqlikni tushuntirib ber. ';

async function ins(table, row) {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k || !process.env.SUPABASE_URL) return;
  try {
    await fetch(process.env.SUPABASE_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' },
      body: JSON.stringify(row)
    });
  } catch (e) {
    console.error(e);
  }
}

async function isAdmin(id) {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k || !process.env.SUPABASE_URL) return false;
  try {
    const r = await (await fetch(process.env.SUPABASE_URL + '/rest/v1/profiles?select=role&id=eq.' + id, {
      headers: { apikey: k, Authorization: 'Bearer ' + k }
    })).json();
    return !!(r && r[0] && r[0].role === 'admin');
  } catch (_) {
    return false;
  }
}

function resetRateLimits() {
  rl.clear();
}

module.exports = { auth, openai, SYS, ins, isAdmin, checkRateLimit, resetRateLimits, ensureVapidKeys, getClientIp };
