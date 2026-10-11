const { auth, openai, SYS, ins } = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res); if (!u) return; ins('ai_usage', { user_id: u.id, kind: 'scan' });
  try {
    const b = req.body || {};
    const imgs = (b.images || []).slice(0, 3).filter(x => /^data:image\/jpeg;base64,/.test(x) && x.length < 1500000);
    if (!imgs.length) return res.status(400).json({ error: 'Rasm yuklanmadi. JPG yoki PNG formatidan foydalaning.' });
    const prompt = SYS + `Rasmdagi hayvonni ko‘rinadigan belgilar asosida tahlil qil (tur: ${String(b.type).slice(0, 20)}, yosh: ${String(b.age || 'noma’lum').slice(0, 30)}). Faqat JSON qaytar: {"species":"","breed":"","age":"taxminiy diapazon","weight":"taxminiy diapazon, kg","bcs":"tana holati 1-5","confidence":0-100,"obs":[],"feed":[],"next":[]}. Natijaning hammasi taxminiy.`;
    const out = await openai({ max_tokens: 700, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...imgs.map(url => ({ type: 'image_url', image_url: { url } }))] }] });
    res.json(JSON.parse(out));
  } catch (e) { console.error(e); res.status(500).json({ error: 'AI tahlilini amalga oshirishda muammo yuz berdi.' }); }
};
