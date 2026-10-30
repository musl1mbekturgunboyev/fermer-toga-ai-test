// Hisobni o‘chirish: bazadagi barcha ma’lumotlar (FK cascade) + Storage’dagi rasmlar.
const { auth, ins, sbHeaders } = require('./_lib');

async function wipeBucket(bucket, userId) {
  const U = process.env.SUPABASE_URL;
  try {
    const r = await fetch(U + '/storage/v1/object/list/' + bucket, {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix: userId, limit: 1000 })
    });
    const items = await r.json().catch(() => []);
    const paths = (Array.isArray(items) ? items : []).filter(x => x && x.name).map(x => userId + '/' + x.name);
    if (!paths.length) return;
    await fetch(U + '/storage/v1/object/' + bucket, {
      method: 'DELETE',
      headers: sbHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: paths })
    });
  } catch (e) {
    console.error('Storage tozalash xatosi:', bucket, e.message || e);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res);
  if (!u) return;
  await ins('audit_logs', { actor_id: u.id, action: 'account_deleted' });
  await Promise.all([wipeBucket('animal-photos', u.id), wipeBucket('listing-photos', u.id)]);
  const r = await fetch(process.env.SUPABASE_URL + '/auth/v1/admin/users/' + u.id, { method: 'DELETE', headers: sbHeaders() });
  res.status(r.ok ? 200 : 500).json({ ok: r.ok });
};
