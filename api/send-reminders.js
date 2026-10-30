// Eslatmalarni yuborish: kunlik (bugun/ertaga) hamda soatlik yem berish / parvarish vaqtiga 10 minut qolganda push/email xabar yuboradi.
const { ensureVapidKeys } = require('./_lib');
let webpush = null;
try { webpush = require('web-push'); } catch (_) {}

const tashkentNow = () => new Date(Date.now() + 5 * 36e5);
const iso = d => new Date(Date.now() + d * 864e5 + 5 * 36e5).toISOString().slice(0, 10);
const sent10MinCache = new Set(); // bir xil 10-minutlik eslatmani qayta-qayta yubormaslik uchun

function is10MinBefore(timeStr, nowTashkent) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || '').trim());
  if (!m) return false;
  const targetMin = (+m[1]) * 60 + (+m[2]);
  const curMin = nowTashkent.getUTCHours() * 60 + nowTashkent.getUTCMinutes();
  const diff = targetMin - curMin;
  return diff >= 8 && diff <= 11; // 10 daqiqa qolganda (±1 daqiqa oyna)
}

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).end();
  }
  const K = process.env.SUPABASE_SERVICE_ROLE_KEY, U = process.env.SUPABASE_URL;
  if (!K || !U) return res.json({ sent: 0 });
  const H = { apikey: K, Authorization: 'Bearer ' + K };
  const mode = (req.body && req.body.mode) || 'daily'; // 'daily' yoki '10min'

  const rows = await (await fetch(U + '/rest/v1/app_state?select=user_id,json&limit=5000', { headers: H })).json().catch(() => []);
  const subs = await (await fetch(U + '/rest/v1/push_subs?select=user_id,sub', { headers: H })).json().catch(() => []);
  const days = [iso(0), iso(1)];
  const today = iso(0);
  const nowT = tashkentNow();

  const vapid = ensureVapidKeys();
  if (webpush && vapid.publicKey && vapid.privateKey) {
    try {
      webpush.setVapidDetails('mailto:' + (process.env.FROM_EMAIL || 'info@fermertoga.uz').replace(/^.*<|>.*$/g, ''), vapid.publicKey, vapid.privateKey);
    } catch (_) {}
  }

  let sent = 0;
  for (const r of (Array.isArray(rows) ? rows : [])) {
    let rems = [];
    try { rems = JSON.parse(r.json).rem || []; } catch (_) {}
    if (!rems.length) continue;

    let dueItems = [];
    if (mode === '10min') {
      for (const x of rems) {
        const title = x[0], dateStr = x[1], timeStr = x[2] || '';
        const isTodayOrDaily = !dateStr || dateStr === today || dateStr === 'Har kuni';
        if (timeStr && isTodayOrDaily && is10MinBefore(timeStr, nowT)) {
          const cacheKey = `${r.user_id}|${today}|${timeStr}|${title}`;
          if (!sent10MinCache.has(cacheKey)) {
            sent10MinCache.add(cacheKey);
            dueItems.push(`${title} vaqtiga 10 minut qoldi! (soat ${timeStr})`);
          }
        }
      }
    } else {
      dueItems = rems
        .filter(x => days.includes(x[1]) || x[1] === 'Har kuni')
        .map(x => x[0] + ' (' + x[1] + (x[2] ? ' soat ' + x[2] : '') + ')');
    }

    if (!dueItems.length) continue;
    const body = dueItems.join('\n');
    const pushTitle = mode === '10min' ? '⏰ 10 daqiqa qoldi — Fermer Tog‘a AI' : '🔔 Eslatma — Fermer Tog‘a AI';

    if (process.env.RESEND_API_KEY && mode === 'daily') {
      try {
        const e = await (await fetch(U + '/auth/v1/admin/users/' + r.user_id, { headers: H })).json();
        if (e && e.email) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: process.env.FROM_EMAIL,
              to: [e.email],
              subject: 'Fermer Tog‘a AI: eslatmalar',
              html: '<p>Assalomu alaykum! Yaqin eslatmalaringiz:</p><p>' + body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</p>'
            })
          });
        }
      } catch (_) {}
    }

    if (webpush) {
      for (const s of (Array.isArray(subs) ? subs : []).filter(x => x.user_id === r.user_id)) {
        try {
          await webpush.sendNotification(s.sub, JSON.stringify({ title: pushTitle, body }));
        } catch (_) {}
      }
    }
    sent++;
  }
  res.json({ sent });
};
