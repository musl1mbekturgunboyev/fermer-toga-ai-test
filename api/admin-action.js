const { auth, ins, isAdmin } = require('./_lib');
const UUID = /^[0-9a-f-]{36}$/i;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res, 'admin');
  if (!u) return;
  if (!(await isAdmin(u.id))) return res.status(403).json({ error: 'Sizda bu amal uchun huquq yo‘q.' });

  const b = req.body || {};
  const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const U = process.env.SUPABASE_URL;
  const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };

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

  if (b.action === 'set_plan' && UUID.test(b.user_id) && ['Bepul', 'Pro', 'Ferma'].includes(b.plan)) {
    const months = Math.min(24, Math.max(1, +b.months || 1));
    try {
      await require('./_billing').db('rpc/set_user_plan',{method:'POST',body:JSON.stringify({p_user:b.user_id,p_plan:b.plan,p_months:months})});
    } catch(e) {return res.status(503).json({error:'Tarif saqlanmadi. Baza migratsiyasini tekshiring.'});}
    await ins('audit_logs', { actor_id: u.id, action: 'plan_set:' + b.plan, target: b.user_id });
    return res.json({ ok: true });
  }

  res.status(400).json({ error: 'Noto‘g‘ri so‘rov' });
};
