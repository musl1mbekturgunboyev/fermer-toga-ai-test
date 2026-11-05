const { auth, ins } = require('./_lib');
const ai = require('./_ai');

const LANG_MAP = {
  uz: 'sodda o‘zbek (lotin) tilida',
  ru: 'на русском языке',
  en: 'in English',
  kk: 'қазақ тілінде (кириллица)',
  ky: 'кыргыз тилинде (кириллица)'
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res, 'scan');
  if (!u) return;


  const b = req.body || {};
  const imgs = (Array.isArray(b.images) ? b.images : [])
    .slice(0, 3)
    .filter(x => typeof x === 'string' && /^data:image\/(jpeg|png);base64,/.test(x) && x.length < 1500000);

  if (!imgs.length) {
    return res.status(400).json({ error: 'Rasm yuklanmadi. JPG yoki PNG formatidan foydalaning.' });
  }

  if(!await require('./_billing').quota(u.id,'scan',res))return;
  const lang = String(b.lang || 'uz').toLowerCase();
  const langPrompt = LANG_MAP[lang] || LANG_MAP.uz;

  const type = String(b.type || 'Sigir').trim().slice(0, 20);
  const age = String(b.age || '').trim().slice(0, 30);

  const SYS = `You are "Fermer Tog‘a AI" — an expert livestock specialist and animal scientist.
Provide your response strictly in JSON format. The language for textual values must be: ${langPrompt}.
Estimate weights consistently based on proven livestock biological standards:
- Cattle:
  • Calves (1-6 mo): 45–150 kg; (6-12 mo): 150–260 kg
  • Heifers / Young bulls (1-2 yr): 260–420 kg
  • Adult cows (2.5-6 yr): 380–620 kg depending on breed
  • Adult bulls (2-5 yr): 500–880 kg depending on breed
- Sheep: Lambs 22–38 kg; adult 50–120 kg
- Goats: 30–65 kg; Horses: 380–560 kg
Evaluate Body Condition Score (BCS 1 to 5). Never prescribe pharmaceutical dosages.`;

  const prompt = `Perform a thorough visual biometric evaluation of the farm animal in the photo (Declared species: ${type}, declared age: ${age || 'infer from photo'}).
Return ONLY a valid JSON object with these exact keys translated into ${langPrompt}:
{
  "species": "species name",
  "breed": "breed name",
  "sex": "Female or Male",
  "age": "age range",
  "weight": "weight range (e.g. 420–460 kg)",
  "weight_kg": 440,
  "bcs": "BCS rating (e.g. 3.5 / 5)",
  "health_status": "Healthy or Under observation",
  "health_note": "1 concise sentence on physical appearance and appetite",
  "vacc_recommend": "Seasonal vaccination advice",
  "daily_feed_kg": "daily dry matter recommendation (e.g. 12–14 kg/day)",
  "confidence": 88,
  "obs": ["visual observation 1", "observation 2", "observation 3"],
  "feed": ["feed component 1", "feed component 2", "feed component 3"],
  "next": ["next action step 1", "next step 2"]
}`;

  try {
    const r = await ai.vision(SYS, prompt, imgs, 750, true);
    const d = r.data || {};
    const parsedKg = Number(d.weight_kg) || (
      (() => {
        const m = /(\d{2,4})\s*[-–—]\s*(\d{2,4})/.exec(String(d.weight || ''));
        if (m) return Math.round((+m[1] + +m[2]) / 2);
        const s = /(\d{2,4})/.exec(String(d.weight || ''));
        return s ? +s[1] : 320;
      })()
    );
    const weightStr = String(d.weight || (parsedKg + ' kg'));

    res.json({
      species: String(d.species || type),
      breed: String(d.breed || 'Mahalliy zot'),
      sex: String(d.sex || (type === 'Buqa' ? 'Erkak' : 'Urg‘ochi')),
      age: String(d.age || age || '2–3 yosh'),
      weight: weightStr,
      weight_kg: parsedKg,
      bcs: String(d.bcs || '3.5 / 5 (Yaxshi)'),
      health_status: String(d.health_status || 'Sog‘lom'),
      health_note: String(d.health_note || 'Tashqi ko‘rinishi va tana holati me’yorda'),
      vacc_recommend: String(d.vacc_recommend || 'Mavsumiy profilaktik emlash (Oqsil va Kuydirgi)'),
      daily_feed_kg: String(d.daily_feed_kg || Math.round(parsedKg * 0.03) + ' kg/kun'),
      confidence: Math.min(100, Math.max(50, Number(d.confidence) || 85)),
      obs: Array.isArray(d.obs) && d.obs.length ? d.obs.map(String) : ['Tana holati va suyak tuzilishi me’yorda'],
      feed: Array.isArray(d.feed) && d.feed.length ? d.feed.map(String) : ['Sifatli beda/pichan va toza suv'],
      next: Array.isArray(d.next) && d.next.length ? d.next.map(String) : ['Har 15 kunda vazn o‘zgarishini kuzatib boring'],
      provider: r.provider
    });
  } catch (e) {
    console.error('Scan xato:', e.message || e);
    res.status(503).json({ error: ai.explain(e) });
  }
};
