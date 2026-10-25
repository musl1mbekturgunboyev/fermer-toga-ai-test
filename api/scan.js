const { auth, ins } = require('./_lib');
const ai = require('./_ai');
const SYS = 'Sen "Fermer Tog‘a AI" yordamchisan. Faqat sodda o‘zbek (lotin) tilida javob ber. Hech qachon aniq veterinariya tashxisi qo‘yma, dori yoki doza yozma. Vazn va yoshni faqat taxminiy diapazon qilib ber. ';
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res); if (!u) return; ins('ai_usage', { user_id: u.id, kind: 'scan' });
  const b = req.body || {};
  const imgs = (b.images || []).slice(0, 3).filter(x => /^data:image\/jpeg;base64,/.test(x) && x.length < 1500000);
  if (!imgs.length) return res.status(400).json({ error: 'Rasm yuklanmadi. JPG yoki PNG formatidan foydalaning.' });
  const prompt = `Rasmdagi hayvonni ko‘rinadigan belgilar asosida tahlil qil (tur: ${String(b.type).slice(0, 20)}, yosh: ${String(b.age || 'noma’lum').slice(0, 30)}). Faqat JSON qaytar: {"species":"","breed":"","age":"taxminiy diapazon","weight":"taxminiy diapazon, kg","bcs":"tana holati 1-5","confidence":0-100,"obs":[],"feed":[],"next":[]}. Natijaning hammasi taxminiy.`;
  try { const r = await ai.vision(SYS, prompt, imgs, 900); res.json({ ...r.data, provider: r.provider }); }
  catch (e) { console.error(e); res.status(503).json({ error: ai.explain(e) }); }
};
