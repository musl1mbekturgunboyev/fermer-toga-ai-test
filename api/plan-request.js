// Pro / Ferma tarifini faollashtirish so‘rovi. To‘lov tasdiqlangach administrator tarifni yoqadi (admin panel -> Tarif so‘rovlari).
const { auth, ins, sbHeaders } = require('./_lib');
const { PLANS, PAID } = require('./_plans');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res);
  if (!u) return;
  const plan = String((req.body || {}).plan || '');
  if (!PAID.includes(plan)) return res.status(400).json({ error: 'Noto‘g‘ri tarif' });

  const U = process.env.SUPABASE_URL;
  const H = sbHeaders({ 'Content-Type': 'application/json' });
  const ex = await fetch(U + '/rest/v1/plan_requests?select=id&status=eq.pending&user_id=eq.' + u.id, { headers: H });
  const exj = await ex.json().catch(() => []);
  if (Array.isArray(exj) && exj.length) {
    await fetch(U + '/rest/v1/plan_requests?id=eq.' + exj[0].id, { method: 'PATCH', headers: H, body: JSON.stringify({ plan }) });
  } else {
    const r = await fetch(U + '/rest/v1/plan_requests', { method: 'POST', headers: H, body: JSON.stringify({ user_id: u.id, plan, status: 'pending' }) });
    if (!r.ok) return res.status(500).json({ error: 'So‘rovni saqlab bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.' });
  }
  await ins('audit_logs', { actor_id: u.id, action: 'plan_requested:' + plan });
  res.json({ ok: true, plan, price: PLANS[plan].price, pay: process.env.PAY_INFO || '' });
};
