const { auth, ins } = require('./_lib');
const ai = require('./_ai');

const SYS = `Sen "Fermer Tog‘a AI" — O‘zbekistondagi eng tajribali zootexnik va chorva eksperti tizimisan.
Faqat aniq, sodda o‘zbek (lotin) tilida va FAQAT JSON formatida javob ber.
Har safar bitta rasm uchun BIR XIL, barqaror va haqiqiy zootexnik me’yorlarga asoslangan aniq o‘lchamlarni chiqar:
- Qoramol (Sigir/Buqa/Buzoq):
  • Buzoq (1-6 oy): 45–150 kg; (6-12 oy): 150–260 kg
  • G‘unajin / yosh novvos (1-2 yosh): 260–420 kg
  • Voyaga yetgan sigir (2.5-6 yosh): Mahalliy/Qora-ola 380–480 kg, Golshtin/Simmental/Shvits 480–620 kg
  • Voyaga yetgan buqa (2-5 yosh): Mahalliy 450–600 kg, Simmental/Angus/Gereford/Limuzin 620–880 kg
- Qo‘y / Qo‘zi:
  • Qo‘zi (3-6 oy): 22–38 kg
  • Hisori / Edilboy / Jaydari qo‘y (1-3 yosh): urg‘ochi 52–75 kg, qo‘chqor 75–125 kg
- Echki: 32–65 kg
- Ot: 380–560 kg
Tana holati (BCS 1 dan 5 gacha): qovurg‘a va dumg‘aza suyaklari ko‘rinishiga qarab aniq bahola (1-juda oriq, 2-oriqroq, 3-o‘rtacha/me’yorda, 4-semiz/bo‘rdoqi, 5-o‘ta semiz).
Hech qachon aniq veterinariya tashxisi yoki dori dozasi yozma, lekin profilaktik emlash va parvarish rejasini aniq ko‘rsat.`;

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

  const type = String(b.type || 'Sigir').trim().slice(0, 20);
  const age = String(b.age || '').trim().slice(0, 30);

  const prompt = `Rasmdagi hayvonni chuqur zootexnik ko‘rikdan o‘tkaz (foydalanuvchi kiritgan tur: ${type}, kiritgan yosh: ${age || 'rasmga qarab aniqla'}).
Quyidagi barcha maydonlarni to‘liq va aniq to‘ldirib FAQAT JSON qaytar:
{
  "species": "Sigir|Buqa|Buzoq|Qo‘y|Echki|Ot",
  "breed": "aniq zot nomi (masalan: Simmental, Qora-ola, Golshtin, Shvits, Angus, Hisori, Jaydari)",
  "sex": "Urg‘ochi yoki Erkak",
  "age": "aniq yosh diapazoni (masalan: 2 – 2.5 yosh)",
  "weight": "vazn diapazoni (masalan: 410–440 kg)",
  "weight_kg": 425,
  "bcs": "masalan: 3.5 / 5 (Yaxshi, etdor)",
  "health_status": "Sog‘lom yoki Kuzatuvda",
  "health_note": "Teri qoplami, turishi, ko‘rinishi va ishtaha belgisi bo‘yicha 1 jumla xulosa",
  "vacc_recommend": "Mavsumiy profilaktik emlash tavsiyasi (masalan: Oqsil (Yashur) va Kuydirgi (Sibir yarasi) ga qarshi profilaktika)",
  "daily_feed_kg": "masalan: 12–14 kg quruq modda (pichan + yem)",
  "confidence": 88,
  "obs": ["1-aniq ko‘rinadigan tana va suyak tuzilishi kuzatuvi", "2-go‘sht yoki sut yo‘nalishi salohiyati", "3-teri va jun holati"],
  "feed": ["1-kunlik pichan/beda va силос miqdori (kg)", "2-kunlik arpa/kepak/omuxta yem miqdori (kg)", "3-suv va mineral tuz normasi"],
  "next": ["1-vazn va o‘sishni nazorat qilish qadami", "2-veterinar profilaktika va emlash qadami"]
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
      feed: Array.isArray(d.feed) && d.feed.length ? d.feed.map(String) : ['Kuniga sifatli beda/pichan va toza suv'],
      next: Array.isArray(d.next) && d.next.length ? d.next.map(String) : ['Har 15 kunda vazn o‘zgarishini kuzatib boring'],
      provider: r.provider
    });
  } catch (e) {
    console.error('Scan xato:', e.message || e);
    res.status(503).json({ error: ai.explain(e) });
  }
};
