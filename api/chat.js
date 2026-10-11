const { auth, openai, SYS, ins } = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res); if (!u) return; ins('ai_usage', { user_id: u.id, kind: 'chat' });
  try {
    const m = String((req.body || {}).message || '').slice(0, 1500);
    if (!m) return res.status(400).json({ error: 'Savol bo‘sh' });
    const ctx = String((req.body || {}).context || '').slice(0, 1500);
    const text = await openai({ max_tokens: 600, messages: [{ role: 'system', content: SYS + 'Foydalanuvchi hayvonlari: ' + ctx }, { role: 'user', content: m }] });
    res.json({ text });
  } catch (e) { console.error(e); res.status(500).json({ error: 'AI xizmatida muammo yuz berdi' }); }
};
