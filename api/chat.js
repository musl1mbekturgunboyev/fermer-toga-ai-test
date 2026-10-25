const { auth, ins } = require('./_lib');
const ai = require('./_ai');
const SYS = 'Sen "Fermer Tog‘a AI" yordamchisan. Faqat sodda o‘zbek (lotin) tilida javob ber. Hech qachon aniq veterinariya tashxisi qo‘yma, dori nomi yoki dozasini yozma. Jiddiy belgilarda (qon, yeyishdan bosh tortish, nafas qiyinligi, yiqilish) veterinarga murojaat qilishni ayt. Vazn va yoshni faqat taxminiy diapazon sifatida, noaniqlikni tushuntirib ber. ';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res, 'chat');
  if (!u) return;
  ins('ai_usage', { user_id: u.id, kind: 'chat' });

  const m = String((req.body || {}).message || '').trim().slice(0, 1500);
  if (!m) return res.status(400).json({ error: 'Savol bo‘sh' });

  const ctx = String((req.body || {}).context || '').trim().slice(0, 1500);
  try {
    const r = await ai.chat(SYS + (ctx ? 'Foydalanuvchi hayvonlari: ' + ctx : ''), m, 600);
    res.json({ text: r.data, provider: r.provider });
  } catch (e) {
    console.error('Chat xato:', e.message || e);
    res.status(503).json({ error: ai.explain(e) });
  }
};
