// Tashxis: https://SAYT/api/ai-test?key=CRON_SECRET  — har bir AI ishlayaptimi va nega ishlamayotganini ko‘rsatadi.
module.exports = async (req, res) => {
  const key = new URL(req.url, 'http://x').searchParams.get('key');
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Kalit noto‘g‘ri (CRON_SECRET).' });
  res.json(await require('./_ai').test());
};
