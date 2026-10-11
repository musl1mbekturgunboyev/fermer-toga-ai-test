// Umumiy yordamchilar: foydalanuvchini tekshirish (Supabase), so‘rovlar chegarasi, OpenAI chaqiruvi.
const rl = new Map();
async function auth(req, res) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) { res.status(401).json({ error: 'Kirish talab qilinadi' }); return null; }
  const r = await fetch(process.env.SUPABASE_URL + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + t, apikey: process.env.SUPABASE_ANON_KEY } });
  if (!r.ok) { res.status(401).json({ error: 'Sessiya yaroqsiz' }); return null; }
  const u = await r.json(), now = Date.now();
  const a = (rl.get(u.id) || []).filter(x => now - x < 60000);
  if (a.length >= 10) { res.status(429).json({ error: 'Juda ko‘p so‘rov. Biroz kuting.' }); return null; }
  a.push(now); rl.set(u.id, a); return u;
}
async function openai(body) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', ...body })
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || 'OpenAI xatosi');
  return j.choices[0].message.content;
}
const SYS = 'Sen "Fermer Tog‘a AI" yordamchisan. Faqat sodda o‘zbek (lotin) tilida javob ber. Hech qachon aniq veterinariya tashxisi qo‘yma, dori nomi yoki dozasini yozma. Jiddiy belgilarda (qon, yeyishdan bosh tortish, nafas qiyinligi, yiqilish) veterinarga murojaat qilishni ayt. Vazn va yoshni faqat taxminiy diapazon sifatida, noaniqlikni tushuntirib ber. ';
module.exports = { auth, openai, SYS };
// Server tomonidagi yozuvlar (service role): AI sarfi va audit log
async function ins(table, row) {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try { await fetch(process.env.SUPABASE_URL + '/rest/v1/' + table, { method: 'POST', headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, body: JSON.stringify(row) }); } catch (e) { console.error(e); }
}
module.exports.ins = ins;
async function isAdmin(id) {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await (await fetch(process.env.SUPABASE_URL + '/rest/v1/profiles?select=role&id=eq.' + id, { headers: { apikey: k, Authorization: 'Bearer ' + k } })).json();
  return !!(r[0] && r[0].role === 'admin');
}
module.exports.isAdmin = isAdmin;
