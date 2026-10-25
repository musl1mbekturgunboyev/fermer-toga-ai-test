// E’lon yaratish: rasm AI orqali tekshiriladi (jonli hayvonmi?), keyin serverning o‘zi saqlaydi. Holat serverda belgilanadi.
const { auth } = require('./_lib');
const ai = require('./_ai');
const GROUP = { Sigir: 'cattle', Buqa: 'cattle', Buzoq: 'cattle', 'Qo‘y': 'sheep', Echki: 'goat', Ot: 'horse', Tovuq: 'poultry', 'G‘oz / o‘rdak': 'poultry', 'Boshqa parranda': 'poultry', Boshqa: 'any' };
const DET = { sigir: 'cattle', buqa: 'cattle', buzoq: 'cattle', qoy: 'sheep', echki: 'goat', ot: 'horse', eshak: 'horse', tovuq: 'poultry', goz_ordak: 'poultry', boshqa_parranda: 'poultry' };
const SYS = 'You are a strict image moderator for a livestock marketplace in Uzbekistan. Reply with JSON only.';
const PROMPT = 'Does this photo clearly show a REAL, LIVE farm animal as the main subject (cattle/cow/bull/calf, sheep/lamb, goat, horse/donkey, camel, or poultry like chicken/duck/goose/turkey)? REJECT (is_live_animal=false): meat, carcass, food, products, tools, vehicles, buildings, people only, cats/dogs/pets, wild animals, drawings, cartoons, toys, screenshots, AI-generated or watermarked stock images, collages. Return JSON: {"is_live_animal":true|false,"species":"sigir|buqa|buzoq|qoy|echki|ot|eshak|tovuq|goz_ordak|boshqa_parranda|tuya|boshqa|none","confidence":0-100,"reason":"short Uzbek reason"}';
async function check(img, declared) {
  const r = (await ai.vision(SYS, PROMPT, [img], 300, true)).data;
  if (!r.is_live_animal || +r.confidence < 60) return 'Rasmda jonli hayvon aniq ko‘rinmayapti. Faqat sotiladigan hayvonning haqiqiy rasmini yuklang (boshqa buyum yoki mahsulot rasmi qabul qilinmaydi).';
  const g = GROUP[declared] || 'any', d = DET[r.species] || 'other';
  if (g !== 'any' && d !== g) return 'Tanlangan tur (' + declared + ') rasmga mos kelmadi. Turni tekshiring yoki to‘g‘ri rasm yuklang.';
  return null;
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res); if (!u) return;
  const b = req.body || {}, K = process.env.SUPABASE_SERVICE_ROLE_KEY, U = process.env.SUPABASE_URL;
  const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };
  const s = (x, n) => String(x || '').trim().slice(0, n);
  const price = Math.round(+b.price), phone = s(b.phone, 20).replace(/[\s()-]/g, ''), species = s(b.species, 30);
  const imgs = (Array.isArray(b.images) ? b.images : []).slice(0, 3);
  if (!s(b.title, 80) || !(price > 0 && price < 1e10) || !/^\+?\d{9,13}$/.test(phone) || !GROUP[species]) return res.status(400).json({ error: 'Ma’lumotlar to‘g‘ri emas' });
  if (!imgs.length || imgs.some(x => !/^data:image\/jpeg;base64,/.test(x) || x.length > 1500000)) return res.status(400).json({ error: 'Rasm yuklanmadi. JPG yoki PNG formatidan foydalaning.' });
  const bufs = imgs.map(x => Buffer.from(x.split(',')[1], 'base64'));
  if (bufs.some(x => x[0] !== 0xFF || x[1] !== 0xD8)) return res.status(400).json({ error: 'Rasm formati noto‘g‘ri.' });
  const mine = await fetch(U + '/rest/v1/listings?select=id&status=in.(active,pending_payment)&seller_id=eq.' + u.id, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
  if (+((mine.headers.get('content-range') || '0/0').split('/')[1]) >= 50) return res.status(429).json({ error: 'E’lonlar soni chegaradan oshdi' });
  let bad; try { bad = await Promise.all(imgs.map(x => check(x, species))); } catch (e) { console.error(e); return res.status(503).json({ error: 'Rasmni tekshirib bo‘lmadi. ' + ai.explain(e) }); }
  const i = bad.findIndex(Boolean); if (i >= 0) return res.status(422).json({ error: (imgs.length > 1 ? (i + 1) + '-rasm: ' : '') + bad[i] });
  const paths = [];
  for (const buf of bufs) {
    const p = u.id + '/' + Date.now() + '-' + paths.length + '.jpg';
    const r = await fetch(U + '/storage/v1/object/listing-photos/' + p, { method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'image/jpeg' }, body: buf });
    if (!r.ok) return res.status(500).json({ error: 'Rasmni saqlab bo‘lmadi' }); paths.push(p);
  }
  const sub = await (await fetch(U + '/rest/v1/subscriptions?select=plan,period_end&status=eq.active&owner_id=eq.' + u.id, { headers: H })).json();
  const pro = Array.isArray(sub) && sub.some(x => ['Pro', 'Ferma'].includes(x.plan) && new Date(x.period_end) > new Date());
  const free = (process.env.LISTING_FEE_MODE || 'off') !== 'manual';
  const row = { seller_id: u.id, title: s(b.title, 80), species, breed: s(b.breed, 40), age: s(b.age, 30), weight: s(b.weight, 30), price, region: s(b.region, 40), phone, description: s(b.description, 1000), photo_path: paths[0], photos: paths, status: free || pro ? 'active' : 'pending_payment' };
  const r = await fetch(U + '/rest/v1/listings', { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(row) });
  const j = await r.json(); if (!r.ok) return res.status(500).json({ error: 'E’lonni saqlab bo‘lmadi' });
  res.json({ id: j[0].id, status: row.status, pay: process.env.PAY_INFO || '' });
};