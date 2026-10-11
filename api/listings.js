// E’lon yaratish: holat (faol / to‘lov kutilmoqda) FAQAT serverda belgilanadi.
const { auth } = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res); if (!u) return;
  const b = req.body || {}, K = process.env.SUPABASE_SERVICE_ROLE_KEY, U = process.env.SUPABASE_URL;
  const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };
  const s = (x, n) => String(x || '').trim().slice(0, n);
  const price = Math.round(+b.price), phone = s(b.phone, 20).replace(/[\s()-]/g, '');
  if (!s(b.title, 80) || !(price > 0 && price < 1e10) || !/^\+?\d{9,13}$/.test(phone) || !String(b.photo_path || '').startsWith(u.id + '/'))
    return res.status(400).json({ error: 'Ma’lumotlar to‘g‘ri emas' });
  const mine = await fetch(U + '/rest/v1/listings?select=id&status=in.(active,pending_payment)&seller_id=eq.' + u.id, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
  if (+((mine.headers.get('content-range') || '0/0').split('/')[1]) >= 50) return res.status(429).json({ error: 'E’lonlar soni chegaradan oshdi' });
  const sub = await (await fetch(U + '/rest/v1/subscriptions?select=plan,period_end&status=eq.active&owner_id=eq.' + u.id, { headers: H })).json();
  const pro = Array.isArray(sub) && sub.some(x => ['Pro', 'Ferma'].includes(x.plan) && new Date(x.period_end) > new Date());
  const row = { seller_id: u.id, title: s(b.title, 80), species: s(b.species, 30), breed: s(b.breed, 40), age: s(b.age, 30), weight: s(b.weight, 30), price, region: s(b.region, 40), phone, description: s(b.description, 1000), photo_path: b.photo_path, status: pro ? 'active' : 'pending_payment' };
  const r = await fetch(U + '/rest/v1/listings', { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(row) });
  const j = await r.json();
  if (!r.ok) return res.status(500).json({ error: 'E’lonni saqlab bo‘lmadi' });
  res.json({ id: j[0].id, status: row.status, pay: process.env.PAY_INFO || '' });
};
