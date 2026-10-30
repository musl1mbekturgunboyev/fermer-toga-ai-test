// Tashxis: FAQAT administrator uchun (mijozlarga AI holati, provayder nomlari va xato tafsilotlari ko‘rsatilmaydi).
const { auth, isAdmin } = require('./_lib');
module.exports = async (req, res) => {
  const u = await auth(req, res, 'admin');
  if (!u) return;
  if (!(await isAdmin(u.id))) return res.status(403).json({ error: 'Ruxsat yo‘q' });
  res.json(await require('./_ai').test());
};
