// Vercel Cron (har kuni 09:00 Toshkent): bugun/ertaga sanasi kelgan eslatmalarni email va push orqali yuboradi.
const webpush = require('web-push');
const iso = d => new Date(Date.now() + d * 864e5 + 5 * 36e5).toISOString().slice(0, 10);
module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).end();
  const K = process.env.SUPABASE_SERVICE_ROLE_KEY, U = process.env.SUPABASE_URL, H = { apikey: K, Authorization: 'Bearer ' + K };
  const rows = await (await fetch(U + '/rest/v1/app_state?select=user_id,json&limit=5000', { headers: H })).json();
  const subs = await (await fetch(U + '/rest/v1/push_subs?select=user_id,sub', { headers: H })).json();
  const days = [iso(0), iso(1)];
  if (process.env.VAPID_PRIVATE_KEY) webpush.setVapidDetails('mailto:' + process.env.FROM_EMAIL, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  let sent = 0;
  for (const r of rows) {
    let items = []; try { items = (JSON.parse(r.json).rem || []).filter(x => days.includes(x[1])); } catch (_) {}
    if (!items.length) continue;
    const body = items.map(x => x[0] + ' (' + x[1] + ')').join('\n');
    if (process.env.RESEND_API_KEY) {
      const e = await (await fetch(U + '/auth/v1/admin/users/' + r.user_id, { headers: H })).json();
      if (e.email) await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.FROM_EMAIL, to: [e.email], subject: 'Fermer Tog‘a AI: eslatmalar', html: '<p>Assalomu alaykum! Yaqin eslatmalaringiz:</p><p>' + body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</p>' }) });
    }
    for (const s of subs.filter(x => x.user_id === r.user_id)) {
      try { await webpush.sendNotification(s.sub, JSON.stringify({ title: 'Eslatma', body })); } catch (_) {}
    }
    sent++;
  }
  res.json({ sent });
};
