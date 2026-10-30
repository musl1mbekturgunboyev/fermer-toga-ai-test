// Foydalanuvchining tarifi, limitlari va joriy oy sarfi (hammasi serverdan; mijoz o‘zgartira olmaydi).
const { auth, isAdmin, getPlan, usageCount, sbHeaders } = require('./_lib');
const { PLANS, PAID } = require('./_plans');

const head = async path => {
  try {
    const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/' + path, { headers: sbHeaders({ Prefer: 'count=exact', Range: '0-0' }) });
    return +((r.headers.get('content-range') || '0/0').split('/')[1]) || 0;
  } catch (_) { return 0; }
};

module.exports = async (req, res) => {
  const u = await auth(req, res);
  if (!u) return;
  const [plan, admin, scans, chats, listings, pending] = await Promise.all([
    getPlan(u.id),
    isAdmin(u.id),
    usageCount(u.id, 'scan'),
    usageCount(u.id, 'chat'),
    head('listings?select=id&status=in.(active,pending_payment,pending_review)&seller_id=eq.' + u.id),
    (async () => {
      try {
        const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/plan_requests?select=plan,created_at&status=eq.pending&user_id=eq.' + u.id + '&order=created_at.desc&limit=1', { headers: sbHeaders() });
        const j = await r.json().catch(() => []);
        return Array.isArray(j) && j[0] ? j[0] : null;
      } catch (_) { return null; }
    })()
  ]);
  const L = plan.limits;
  res.json({
    plan: plan.name,
    until: plan.until,
    admin,
    limits: { animals: L.animals, scans: L.scans, chats: L.chats, listings: L.listings, exports: L.exports },
    usage: { scans, chats, listings },
    pending_request: pending,
    pay: process.env.PAY_INFO || '',
    plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { price: v.price, animals: v.animals, scans: v.scans, chats: v.chats, listings: v.listings, exports: v.exports, freeListing: v.freeListing }])),
    paid: PAID
  });
};
