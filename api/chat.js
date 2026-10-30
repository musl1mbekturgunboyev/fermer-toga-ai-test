const { auth, ins, checkAiQuota } = require('./_lib');
const ai = require('./_ai');

const LANG_MAP = {
  uz: 'sodda, tushunarli o‘zbek (lotin) tilida',
  ru: 'на русском языке грамотно и понятно для фермеров',
  en: 'in clear English tailored for farmers',
  kk: 'қазақ тілінде (кириллица)',
  ky: 'кыргыз тилинде (кириллица)'
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res, 'chat');
  if (!u) return;

  const b = req.body || {};
  const m = String(b.message || '').trim().slice(0, 2000);
  const imgs = (Array.isArray(b.images) ? b.images : [])
    .slice(0, 3)
    .filter(x => typeof x === 'string' && /^data:image\/(jpeg|png);base64,/.test(x) && x.length < 1500000);

  if (!m && !imgs.length) return res.status(400).json({ error: 'Savol yoki rasm kiriting' });
  if (!(await checkAiQuota(res, u.id, 'chat'))) return;

  const lang = String(b.lang || 'uz').toLowerCase();
  const langPrompt = LANG_MAP[lang] || LANG_MAP.uz;

  const SYS = `You are "Fermer Tog‘a AI" — an intelligent livestock consultant, animal nutritionist and livestock strategist.
Always reply strictly in the requested language: ${langPrompt}.
Guidelines:
1. Never provide strict veterinary clinical diagnoses or pharmaceutical drug dosages. Recommend contacting a local veterinarian for serious distress.
2. If photos are provided (animal, feed/forage, manure/condition), analyze the visual details thoroughly and offer practical farm advice.
3. Tailor feeding and care advice to the farmer's specific goal (fattening/beef, dairy, breeding, or growth).
4. When planning feeding schedules or if requested, provide clear times and meal allocations. Whenever presenting daily feeding times, append a structured JSON block at the very end in this format:
<SCHEDULE>[{"title":"Morning feed & hay","time":"07:00"},{"title":"Noon water & silage","time":"13:00"},{"title":"Evening feed & alfalfa","time":"19:00"}]</SCHEDULE>`;

  const ctx = String(b.context || '').trim().slice(0, 2500);
  const prompt = m || 'Please analyze this photo and advise the farmer.';

  try {
    const r = await ai.chat(
      SYS + (ctx ? '\n\nFarm Context & History:\n' + ctx : ''),
      prompt,
      800,
      imgs.length ? imgs : undefined
    );
    ins('ai_usage', { user_id: u.id, kind: 'chat' }); // limit faqat muvaffaqiyatli javob uchun hisoblanadi
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
    res.json({ text: cleanText, schedule });
  } catch (e) {
    console.error('Chat xato:', e.message || e);
    res.status(503).json({ error: ai.publicMessage(e) });
  }
};
