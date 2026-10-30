const { auth, ins, isAdmin, sbHeaders } = require('./_lib');
const { PLANS } = require('./_plans');
const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^\S+@\S+\.\S+$/;

// Email bo‘yicha foydalanuvchini topish (Supabase Auth admin API)
async function userIdByEmail(email) {
  const U = process.env.SUPABASE_URL;
  const want = String(email).trim().toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(U + '/auth/v1/admin/users?page=' + page + '&per_page=200', { headers: sbHeaders() });
    const j = await r.json().catch(() => ({}));
    const list = Array.isArray(j.users) ? j.users : [];
    const hit = list.find(x => String(x.email || '').toLowerCase() === want);
    if (hit) return hit.id;
    if (list.length < 200) break;
  }
  return null;
}

// Tarifni berish: eski obunalar o‘chirilib, yangisi yoziladi
async function grantPlan(adminId, userId, plan, months) {
  const U = process.env.SUPABASE_URL;
  const H = sbHeaders({ 'Content-Type': 'application/json' });
  await fetch(U + '/rest/v1/subscriptions?owner_id=eq.' + userId, { method: 'DELETE', headers: H });
  await ins('subscriptions', {
    owner_id: userId,
    plan,
    status: 'active',
    period_end: new Date(Date.now() + months * 30 * 864e5).toISOString()
  });
  await ins('audit_logs', { actor_id: adminId, action: 'plan_set:' + plan + ':' + months + 'm', target: userId });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res, 'admin');
  if (!u) return;
  if (!(await isAdmin(u.id))) return res.status(403).json({ error: 'Sizda bu amal uchun huquq yo‘q.' });

  const b = req.body || {};
  const U = process.env.SUPABASE_URL;
  const H = sbHeaders({ 'Content-Type': 'application/json' });

  if (b.action === 'approve' && UUID.test(b.id)) {
    const r = await fetch(
      U + '/rest/v1/listings?status=in.(pending_payment,pending_review)&id=eq.' + b.id,
      { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'active' }) }
    );
    await ins('audit_logs', { actor_id: u.id, action: 'listing_approved', target: b.id });
    return res.json({ ok: r.ok });
  }

  if (b.action === 'reject' && UUID.test(b.id)) {
    const r = await fetch(
      U + '/rest/v1/listings?status=in.(pending_payment,pending_review,active)&id=eq.' + b.id,
      { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'removed' }) }
    );
    await ins('audit_logs', { actor_id: u.id, action: 'listing_rejected', target: b.id });
    return res.json({ ok: r.ok });
  }

  // Foydalanuvchiga tarif berish: ID yoki EMAIL bo‘yicha
  if (b.action === 'set_plan' && Object.prototype.hasOwnProperty.call(PLANS, b.plan)) {
    const months = Math.min(24, Math.max(1, Math.round(+b.months) || 1));
    let uid = UUID.test(String(b.user_id || '').trim()) ? String(b.user_id).trim() : null;
    if (!uid && EMAIL.test(String(b.email || b.user_id || '').trim())) {
      uid = await userIdByEmail(b.email || b.user_id);
      if (!uid) return res.status(404).json({ error: 'Bu email bilan foydalanuvchi topilmadi.' });
    }
    if (!uid) return res.status(400).json({ error: 'Foydalanuvchi ID yoki email kiriting.' });
    await grantPlan(u.id, uid, b.plan, months);
    return res.json({ ok: true });
  }

  // Foydalanuvchi so‘roviga ko‘ra tarifni faollashtirish (to‘lov tasdiqlangandan keyin)
  if (b.action === 'plan_approve' && UUID.test(b.id)) {
    const months = Math.min(24, Math.max(1, Math.round(+b.months) || 1));
    const rr = await fetch(U + '/rest/v1/plan_requests?select=id,user_id,plan,status&id=eq.' + b.id, { headers: H });
    const row = (await rr.json().catch(() => []))[0];
    if (!row || row.status !== 'pending' || !PLANS[row.plan]) return res.status(404).json({ error: 'So‘rov topilmadi yoki allaqachon ko‘rib chiqilgan.' });
    await grantPlan(u.id, row.user_id, row.plan, months);
    await fetch(U + '/rest/v1/plan_requests?id=eq.' + b.id, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'approved' }) });
    return res.json({ ok: true });
  }

  if (b.action === 'plan_reject' && UUID.test(b.id)) {
    const r = await fetch(U + '/rest/v1/plan_requests?status=eq.pending&id=eq.' + b.id, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'rejected' }) });
    await ins('audit_logs', { actor_id: u.id, action: 'plan_request_rejected', target: b.id });
    return res.json({ ok: r.ok });
  }

  res.status(400).json({ error: 'Noto‘g‘ri so‘rov' });
};
