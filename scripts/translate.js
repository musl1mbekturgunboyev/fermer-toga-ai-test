// Ishlatish: OPENAI_API_KEY=sk-... node scripts/translate.js  → public/i18n.json hosil bo‘ladi.
// Natijani ona tilida so‘zlashuvchi odam ko‘rib chiqsin; faylni qo‘lda tahrirlash mumkin.
const fs = require('fs');
const src = fs.readFileSync('public/index.html', 'utf8'), set = new Set();
for (const m of src.matchAll(/>([^<>{}$`]{2,160})</g)) { const t = m[1].trim(); if (/[A-Za-zА-Яа-я‘’]{3}/.test(t)) set.add(t); }
for (const m of src.matchAll(/(["'])([^"'\n<>{}$=;()\\]{4,160})\1/g)) { const t = m[2].trim(); if (/^[A-ZА-Я‘]/.test(t) && /\s/.test(t)) set.add(t); }
const out = fs.existsSync('public/i18n.json') ? JSON.parse(fs.readFileSync('public/i18n.json', 'utf8')) : {};
const todo = [...set].filter(s => !out[s]);
(async () => {
  for (let i = 0; i < todo.length; i += 40) {
    const batch = todo.slice(i, i + 40);
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', response_format: { type: 'json_object' }, messages: [{ role: 'user', content: 'Translate these Uzbek (Latin) app UI strings for livestock farmers into Russian (ru), English (en), Kazakh Cyrillic (kk), Kyrgyz Cyrillic (ky). Keep emojis, numbers and punctuation. Return JSON {"items":[{"src":"...","ru":"...","en":"...","kk":"...","ky":"..."}]}.\n' + JSON.stringify(batch) }] }) });
    const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j));
    JSON.parse(j.choices[0].message.content).items.forEach(x => { out[x.src] = { ru: x.ru, en: x.en, kk: x.kk, ky: x.ky }; });
    console.log(Math.min(i + 40, todo.length) + '/' + todo.length);
  }
  fs.writeFileSync('public/i18n.json', JSON.stringify(out, null, 1));
})();
