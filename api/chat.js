const { auth, ins } = require('./_lib');
const ai = require('./_ai');
const SYS = 'Sen "Fermer Tog‘a AI" yordamchisan. Faqat sodda o‘zbek (lotin) tilida javob ber. Hech qachon aniq veterinariya tashxisi qo‘yma, dori nomi yoki dozasini yozma. Jiddiy belgilarda (qon, yeyishdan bosh tortish, nafas qiyinligi, yiqilish) veterinarga murojaat qilishni ayt. Vazn va yoshni faqat taxminiy diapazon sifatida, noaniqlikni tushuntirib ber. ';
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res); if (!u) return; ins('ai_usage', { user_id: u.id, kind: 'chat' });
  const m = String((req.body || {}).message || '').slice(0, 1500);
  if (!m) return res.status(400).json({ error: 'Savol bo‘sh' });
  try { const r = await ai.chat(SYS + 'Foydalanuvchi hayvonlari: ' + String((req.body || {}).context || '').slice(0, 1500), m, 700); res.json({ text: r.data, provider: r.provider }); }
  catch (e) { console.error(e); res.status(503).json({ error: 'AI xizmati hozir band. Birozdan keyin qayta urinib ko‘ring.' }); }
};
