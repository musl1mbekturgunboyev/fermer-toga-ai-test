// Tashxis: tizimga kirgan foydalanuvchi (yoki ?key=CRON_SECRET) har bir AI ishlayaptimi va nega ishlamayotganini ko‘ra oladi.
const { auth } = require('./_lib');
module.exports = async (req, res) => {
  const key = new URL(req.url, 'http://x').searchParams.get('key');
  if (!(process.env.CRON_SECRET && key === process.env.CRON_SECRET)) { const u = await auth(req, res); if (!u) return; }
  res.json(await require('./_ai').test());
};