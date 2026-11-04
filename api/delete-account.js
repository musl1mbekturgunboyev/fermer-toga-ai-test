const { auth, ins } = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res); if (!u) return;
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY; await ins('audit_logs', { actor_id: u.id, action: 'account_deleted' });
  const r = await fetch(process.env.SUPABASE_URL + '/auth/v1/admin/users/' + u.id, { method: 'DELETE', headers: { apikey: k, Authorization: 'Bearer ' + k } });
  res.status(r.ok ? 200 : 500).json({ ok: r.ok });
};
