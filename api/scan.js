const { auth, ins, checkAiQuota } = require('./_lib');
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

  if (!(await checkAiQuota(res, u.id, 'scan'))) return;

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
Evaluate Body Condition Score (BCS 1 to 5). Never prescribe pharmaceutical dosages.
If the photo does NOT clearly show a real live farm animal, set "is_farm_animal" to false and leave the other fields empty. Never invent values you cannot see.`;

  const prompt = `Perform a thorough visual biometric evaluation of the farm animal in the photo (Declared species: ${type}, declared age: ${age || 'infer from photo'}).
Return ONLY a valid JSON object. Keep these exact English key names (do NOT translate the keys); write the text values ${langPrompt}:
{
  "is_farm_animal": true,
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
    if (d.is_farm_animal === false || d.is_farm_animal === 'false') {
      return res.status(422).json({ error: 'Rasmda chorva hayvoni aniq ko‘rinmadi. Hayvonning yon tomonidan, yaxshi yoritilgan rasmini yuklang.' });
    }
    const fromRange = String(d.weight || '');
    let parsedKg = Number(d.weight_kg) || 0;
    if (!parsedKg) {
      const m = /(\d{2,4})\s*[-–—]\s*(\d{2,4})/.exec(fromRange);
      if (m) parsedKg = Math.round((+m[1] + +m[2]) / 2);
      else { const s1 = /(\d{2,4})/.exec(fromRange); if (s1) parsedKg = +s1[1]; }
    }
    // Vazn aniqlanmagan bo‘lsa, o‘ylab topilgan raqam ko‘rsatilmaydi — foydalanuvchiga rost aytiladi
    if (!(parsedKg > 0)) {
      return res.status(422).json({ error: 'Rasmdan vaznni aniqlab bo‘lmadi. Hayvon to‘liq ko‘rinadigan, aniqroq rasm bilan qayta urinib ko‘ring.' });
    }
    const weightStr = String(d.weight || (parsedKg + ' kg'));
    const str = (v, fb) => (v == null || String(v).trim() === '' ? fb : String(v));
    const list = (v, fb) => (Array.isArray(v) && v.length ? v.map(String).slice(0, 8) : fb);

    ins('ai_usage', { user_id: u.id, kind: 'scan' }); // limit faqat muvaffaqiyatli tahlil uchun hisoblanadi

    res.json({
      species: str(d.species, type),
      breed: str(d.breed, 'Aniqlanmadi'),
      sex: str(d.sex, 'Aniqlanmadi'),
      age: str(d.age || age, 'Aniqlanmadi'),
      weight: weightStr,
      weight_kg: parsedKg,
      bcs: str(d.bcs, 'Aniqlanmadi'),
      health_status: str(d.health_status, 'Noaniq'),
      health_note: str(d.health_note, 'Rasmga qarab aniq xulosa berish qiyin. Shubha bo‘lsa veterinarga murojaat qiling.'),
      vacc_recommend: str(d.vacc_recommend, 'Emlash jadvali uchun mahalliy veterinar bilan maslahatlashing'),
      daily_feed_kg: str(d.daily_feed_kg, Math.round(parsedKg * 0.03) + ' kg/kun (taxminiy)'),
      confidence: Math.min(95, Math.max(20, Number(d.confidence) || 60)),
      obs: list(d.obs, ['Tashqi ko‘rinish rasm asosida baholandi']),
      feed: list(d.feed, ['Sifatli pichan/beda va toza suv']),
      next: list(d.next, ['Aniq vazn uchun hayvonni tarozida o‘lchang'])
    });
  } catch (e) {
    console.error('Scan xato:', e.message || e);
    res.status(503).json({ error: ai.publicMessage(e) });
  }
};
