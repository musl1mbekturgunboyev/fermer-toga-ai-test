const { auth, ins, isAdmin, sbHeaders } = require('./_lib');

module.exports = async (req, res) => {
  const u = await auth(req, res, 'admin');
  if (!u) return;
  if (!(await isAdmin(u.id))) {
    return res.status(403).json({ error: 'Sizda bu ma’lumotni ko‘rish huquqi yo‘q.' });
  }

  const U = process.env.SUPABASE_URL;
  const q = (p, h) => fetch(U + '/rest/v1/' + p, { headers: sbHeaders(h) });
  const js = async p => { const r = await (await q(p)).json().catch(() => []); return Array.isArray(r) ? r : []; };
  const cnt = async (p) => +((await q(p, { Prefer: 'count=exact', Range: '0-0' })).headers.get('content-range') || '0/0').split('/')[1] || 0;

  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const nowIso = new Date().toISOString();
  await ins('audit_logs', { actor_id: u.id, action: 'admin_stats_view' });

  const [users, scans, chats, subs, st, recent, pending, audit, reqs] = await Promise.all([
    cnt('profiles?select=id'),
    cnt('ai_usage?select=id&kind=eq.scan&at=gte.' + since),
    cnt('ai_usage?select=id&kind=eq.chat&at=gte.' + since),
    js('subscriptions?select=owner_id,plan&status=eq.active&period_end=gt.' + encodeURIComponent(nowIso) + '&limit=5000'),
    js('app_state?select=animals_n&limit=5000'),
    js('profiles?select=full_name,region,created_at&order=created_at.desc&limit=8'),
    js('listings?select=id,title,phone,price,status,photo_path,photos&status=in.(pending_payment,pending_review)&order=created_at.desc&limit=30'),
    js('audit_logs?select=at,action&order=at.desc&limit=8'),
    js('plan_requests?select=id,plan,created_at,user_id,profiles(full_name,phone)&status=eq.pending&order=created_at.asc&limit=30')
  ]);

  const animals = st.reduce((s, r) => s + (+r.animals_n || 0), 0);
  const paidOwners = new Set();
  const plans = {};
  for (const s of subs) {
    if (paidOwners.has(s.owner_id)) continue;
    paidOwners.add(s.owner_id);
    plans[s.plan] = (plans[s.plan] || 0) + 1;
  }
  plans.Bepul = Math.max(0, users - paidOwners.size);

  // So‘rov yuborgan foydalanuvchilarning emaili (to‘lovni topish uchun qulay)
  for (const r of reqs) {
    try {
      const e = await (await fetch(U + '/auth/v1/admin/users/' + r.user_id, { headers: sbHeaders() })).json();
      r.email = e && e.email ? e.email : '';
    } catch (_) { r.email = ''; }
  }

  res.json({
    users,
    animals,
    plans,
    scans,
    chats,
    recent,
    ai: require('./_ai').status(),
    pending,
    audit,
    plan_requests: reqs
  });
};
