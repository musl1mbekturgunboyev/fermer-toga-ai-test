const { auth, ins } = require('./_lib');
const ai = require('./_ai');

const SYS = `Sen "Fermer Tog‘a AI" — O‘zbekiston chorvadorlari uchun aqlli zootexnik va parvarish strategisan.
Faqat sodda, tushunarli o‘zbek (lotin) tilida javob ber.
Qoidalar:
1. Hech qachon aniq veterinariya tashxisi qo‘yma va dori dozasini yozma. Jiddiy kasallik belgilarida veterinarga murojaat qilishni ayt.
2. Agar foydalanuvchi rasm yuborgan bo‘lsa (hayvon rasmi, yem-xashak rasmi, tezak/holat rasmi), rasmni diqqat bilan tahlil qilib, aniq va foydali ma’lumot ber.
3. Agar suhbatda skaner qilingan hayvon haqida gap ketayotgan bo‘lsa:
   - Mijozning maqsadini aniqla (semirtirish/bo‘rdoqi, sut ko‘paytirish, naslchilik yoki sog‘lom o‘stirish).
   - Mijozda hozir uyda bergani qanday yem-xashaklar borligini so‘ra.
   - Mijoz bor yemlarini aytganda, ularni qanday miqdorda berishni va tezroq natija olish uchun yana qanday qo‘shimcha yemlar (masalan: kepak, arpa yormasi, kunjaralar, makkajo‘xori, mineral tuz/mel) qo‘shish kerakligini taklif qil, va: "Shu tartibda kunlik eslatma vaqtlarini belgilab beraymi?" deb so‘ra.
   - Har safar kunlik yem berish / suv berish vaqtlarini rejalashtirganda yoki mijoz rozi bo‘lganda, javobingda soat nechada va necha mahal berishni aniq jadval qilib yoz VA javobning eng oxirida quyidagi formatda maxsus blok qo‘sh (tizim buni o‘qib, avtomatik eslatmalarga qo‘shadi va 10 minut qolganda xabar yuboradi):
<SCHEDULE>[{"title":"Ertalabki yem va pichan berish","time":"07:00"},{"title":"Tushlik suv va ozuqa berish","time":"13:00"},{"title":"Kechki yem va beda berish","time":"19:00"}]</SCHEDULE>`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res, 'chat');
  if (!u) return;
  ins('ai_usage', { user_id: u.id, kind: 'chat' });

  const b = req.body || {};
  const m = String(b.message || '').trim().slice(0, 2000);
  const imgs = (Array.isArray(b.images) ? b.images : [])
    .slice(0, 3)
    .filter(x => typeof x === 'string' && /^data:image\/(jpeg|png);base64,/.test(x) && x.length < 1500000);

  if (!m && !imgs.length) return res.status(400).json({ error: 'Savol yoki rasm kiriting' });

  const ctx = String(b.context || '').trim().slice(0, 2500);
  const prompt = m || 'Ushbu rasmda nima tasvirlangan va chorvador uchun qanday tavsiya berasiz?';

  try {
    const r = await ai.chat(
      SYS + (ctx ? '\n\nFoydalanuvchi fermasi va suhbat tarixi:\n' + ctx : ''),
      prompt,
      800,
      imgs.length ? imgs : undefined
    );
    const raw = String(r.data || '');
    let schedule = [];
    const match = /<SCHEDULE>\s*(\[[\s\S]*?\])\s*<\/SCHEDULE>/i.exec(raw);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          schedule = parsed
            .filter(x => x && x.title && /^\d{1,2}:\d{2}$/.test(String(x.time || '').trim()))
            .map(x => ({ title: String(x.title).slice(0, 120), time: String(x.time).trim().padStart(5, '0') }));
        }
      } catch (_) {}
    }
    const cleanText = raw.replace(/<SCHEDULE>[\s\S]*?<\/SCHEDULE>/gi, '').trim();
    res.json({ text: cleanText, schedule, provider: r.provider });
  } catch (e) {
    console.error('Chat xato:', e.message || e);
    res.status(503).json({ error: ai.explain(e) });
  }
};
