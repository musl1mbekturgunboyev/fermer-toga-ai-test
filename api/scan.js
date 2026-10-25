const { auth, ins } = require('./_lib');
const ai = require('./_ai');
const SYS = 'Sen "Fermer Tog‘a AI" yordamchisan. Faqat sodda o‘zbek (lotin) tilida javob ber. Hech qachon aniq veterinariya tashxisi qo‘yma, dori yoki doza yozma. Vazn va yoshni faqat taxminiy diapazon qilib ber.';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res, 'scan');
  if (!u) return;
  ins('ai_usage', { user_id: u.id, kind: 'scan' });

  const b = req.body || {};
  const imgs = (Array.isArray(b.images) ? b.images : [])
    .slice(0, 3)
    .filter(x => typeof x === 'string' && /^data:image\/(jpeg|png);base64,/.test(x) && x.length < 1500000);

  if (!imgs.length) {
    return res.status(400).json({ error: 'Rasm yuklanmadi. JPG yoki PNG formatidan foydalaning.' });
  }

  const type = String(b.type || 'Chorva').trim().slice(0, 20);
  const age = String(b.age || 'noma’lum').trim().slice(0, 30);
  const prompt = `Rasmdagi hayvonni ko‘rinadigan belgilar asosida tahlil qil (tur: ${type}, yosh: ${age}). Faqat qisqa JSON qaytar: {"species":"","breed":"","age":"taxminiy diapazon","weight":"taxminiy diapazon, kg","bcs":"tana holati 1-5","confidence":0-100,"obs":["1-2 qisqa kuzatuv"],"feed":["1-2 qisqa ozuqa tavsiyasi"],"next":["1-2 keyingi qadam"]}. Natijaning hammasi taxminiy.`;

  try {
    const r = await ai.vision(SYS, prompt, imgs, 550, true);
    const d = r.data || {};
    res.json({
      species: String(d.species || type),
      breed: String(d.breed || 'Aniqlanmadi'),
      age: String(d.age || age),
      weight: String(d.weight || 'Aniqlanmadi'),
      bcs: String(d.bcs || '3 / 5'),
      confidence: Math.min(100, Math.max(0, Number(d.confidence) || 60)),
      obs: Array.isArray(d.obs) ? d.obs.map(String) : [],
      feed: Array.isArray(d.feed) ? d.feed.map(String) : [],
      next: Array.isArray(d.next) ? d.next.map(String) : [],
      provider: r.provider
    });
  } catch (e) {
    console.error('Scan xato:', e.message || e);
    res.status(503).json({ error: ai.explain(e) });
  }
};
