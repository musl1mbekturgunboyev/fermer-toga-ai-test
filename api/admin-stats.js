const { auth, ins } = require('./_lib');
module.exports = async (req, res) => {
  const u = await auth(req, res); if (!u) return;
  const K = process.env.SUPABASE_SERVICE_ROLE_KEY, U = process.env.SUPABASE_URL, H = { apikey: K, Authorization: 'Bearer ' + K };
  const q = (p, h) => fetch(U + '/rest/v1/' + p, { headers: { ...H, ...h } });
  const pr = await (await q('profiles?select=role&id=eq.' + u.id)).json();
  if (!pr[0] || pr[0].role !== 'admin') return res.status(403).json({ error: 'Sizda bu ma’lumotni ko‘rish huquqi yo‘q.' });
  const cnt = async p => +((await q(p, { Prefer: 'count=exact', Range: '0-0' })).headers.get('content-range') || '0/0').split('/')[1];
  const st = await (await q('app_state?select=json&limit=5000')).json();
  let animals = 0; const plans = {};
  st.forEach(s => { try { const j = JSON.parse(s.json); animals += (j.animals || []).length; const p = j.plan || 'Bepul'; plans[p] = (plans[p] || 0) + 1; } catch (_) {} });
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  await ins('audit_logs', { actor_id: u.id, action: 'admin_stats_view' });
  res.json({
    users: await cnt('profiles?select=id'), animals, plans,
    scans: await cnt('ai_usage?select=id&kind=eq.scan&at=gte.' + since),
    chats: await cnt('ai_usage?select=id&kind=eq.chat&at=gte.' + since),
    recent: await (await q('profiles?select=full_name,region,created_at&order=created_at.desc&limit=8')).json(),
    ai: require('./_ai').status(),
    pending: await (await q('listings?select=id,title,phone,price&status=eq.pending_payment&order=created_at.desc&limit=30')).json(),
    audit: await (await q('audit_logs?select=at,action&order=at.desc&limit=8')).json()
  });
};
