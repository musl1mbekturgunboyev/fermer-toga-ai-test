const { auth, ins, isAdmin } = require('./_lib');
const UUID = /^[0-9a-f-]{36}$/;
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res); if (!u) return;
  if (!(await isAdmin(u.id))) return res.status(403).json({ error: 'Sizda bu amal uchun huquq yo‘q.' });
  const b = req.body || {}, K = process.env.SUPABASE_SERVICE_ROLE_KEY, U = process.env.SUPABASE_URL;
  const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };
  if (b.action === 'approve' && UUID.test(b.id)) {
    const r = await fetch(U + '/rest/v1/listings?status=eq.pending_payment&id=eq.' + b.id, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'active' }) });
    await ins('audit_logs', { actor_id: u.id, action: 'listing_approved', target: b.id });
    return res.json({ ok: r.ok });
  }
  if (b.action === 'set_plan' && UUID.test(b.user_id) && ['Bepul', 'Pro', 'Ferma'].includes(b.plan)) {
    const months = Math.min(24, Math.max(1, +b.months || 1));
    await fetch(U + '/rest/v1/subscriptions?owner_id=eq.' + b.user_id, { method: 'DELETE', headers: H });
    await ins('subscriptions', { owner_id: b.user_id, plan: b.plan, status: 'active', period_end: new Date(Date.now() + months * 30 * 864e5).toISOString() });
    await ins('audit_logs', { actor_id: u.id, action: 'plan_set:' + b.plan, target: b.user_id });
    return res.json({ ok: true });
  }
  res.status(400).json({ error: 'Noto‘g‘ri so‘rov' });
};
