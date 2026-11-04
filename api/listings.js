// E’lon yaratish: rasm AI orqali tekshiriladi (jonli hayvonmi?), keyin serverning o‘zi saqlaydi.
// Agar barcha AI provayderlar band yoki ishlamayotgan bo‘lsa, e’lon yo‘qolmaydi — 'pending_review' (admin tekshiruvi) holatida saqlanadi.
const { auth, ins } = require('./_lib');
const ai = require('./_ai');

const GROUP = {
  Sigir: 'cattle',
  Buqa: 'cattle',
  Buzoq: 'cattle',
  'Qo‘y': 'sheep',
  Echki: 'goat',
  Ot: 'horse',
  Tovuq: 'poultry',
  'G‘oz / o‘rdak': 'poultry',
  'Boshqa parranda': 'poultry',
  Boshqa: 'any'
};

const DET = {
  sigir: 'cattle',
  buqa: 'cattle',
  buzoq: 'cattle',
  qoy: 'sheep',
  echki: 'goat',
  ot: 'horse',
  eshak: 'horse',
  tovuq: 'poultry',
  goz_ordak: 'poultry',
  boshqa_parranda: 'poultry'
};

const SYS = 'You are a strict image moderator for a livestock marketplace in Uzbekistan. Reply with JSON only.';
const PROMPT = 'Does this photo clearly show a REAL, LIVE farm animal as the main subject (cattle/cow/bull/calf, sheep/lamb, goat, horse/donkey, camel, or poultry like chicken/duck/goose/turkey)? REJECT (is_live_animal=false): meat, carcass, food, products, tools, vehicles, buildings, people only, cats/dogs/pets, wild animals, drawings, cartoons, toys, screenshots, AI-generated or watermarked stock images, collages. Return JSON: {"is_live_animal":true|false,"species":"sigir|buqa|buzoq|qoy|echki|ot|eshak|tovuq|goz_ordak|boshqa_parranda|tuya|boshqa|none","confidence":0-100,"reason":"short Uzbek reason"}';

async function check(img, declared) {
  const r = (await ai.vision(SYS, PROMPT, [img], 250, true)).data || {};
  if (!r.is_live_animal || +r.confidence < 60) {
    return 'Rasmda jonli hayvon aniq ko‘rinmayapti. Faqat sotiladigan hayvonning haqiqiy rasmini yuklang (boshqa buyum yoki mahsulot rasmi qabul qilinmaydi).';
  }
  const g = GROUP[declared] || 'any';
  const d = DET[String(r.species || '').toLowerCase()] || 'other';
  if (g !== 'any' && d !== g) {
    return 'Tanlangan tur (' + declared + ') rasmga mos kelmadi. Turni tekshiring yoki to‘g‘ri rasm yuklang.';
  }
  return null;
}

function isValidImageBuffer(buf) {
  if (!buf || buf.length < 16) return false;
  const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  return isJpeg || isPng;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const u = await auth(req, res, 'listings');
  if (!u) return;

  const b = req.body || {};
  const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const U = process.env.SUPABASE_URL;
  const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };
  const s = (x, n) => String(x || '').trim().slice(0, n);

  const title = s(b.title, 80);
  const price = Math.round(+b.price);
  const phone = s(b.phone, 20).replace(/[\s()-]/g, '');
  const species = s(b.species, 30);
  const imgs = (Array.isArray(b.images) ? b.images : []).slice(0, 3);

  if (!title || !(price > 0 && price < 1e10) || !/^\+?\d{9,13}$/.test(phone) || !GROUP[species]) {
    return res.status(400).json({ error: 'Ma’lumotlar to‘g‘ri emas' });
  }
  if (!imgs.length || imgs.some(x => typeof x !== 'string' || !/^data:image\/(jpeg|png);base64,/.test(x) || x.length > 1500000)) {
    return res.status(400).json({ error: 'Rasm yuklanmadi. JPG yoki PNG formatidan foydalaning.' });
  }

  const bufs = imgs.map(x => Buffer.from(x.split(',')[1] || '', 'base64'));
  if (bufs.some(buf => !isValidImageBuffer(buf))) {
    return res.status(400).json({ error: 'Rasm formati noto‘g‘ri.' });
  }

  const mine = await fetch(
    U + '/rest/v1/listings?select=id&status=in.(active,pending_payment,pending_review)&seller_id=eq.' + u.id,
    { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } }
  );
  if (+((mine.headers.get('content-range') || '0/0').split('/')[1]) >= 50) {
    return res.status(429).json({ error: 'E’lonlar soni chegaradan oshdi' });
  }

  let aiFailed = false;
  let aiNotice = '';
  for (let idx = 0; idx < imgs.length; idx++) {
    try {
      const badReason = await check(imgs[idx], species);
      if (badReason) {
        return res.status(422).json({ error: (imgs.length > 1 ? (idx + 1) + '-rasm: ' : '') + badReason });
      }
    } catch (e) {
      console.error('Listing AI check fallback:', e.message || e);
      aiFailed = true;
      aiNotice = ai.explain(e);
      break;
    }
  }

  const paths = [];
  for (let i = 0; i < bufs.length; i++) {
    const buf = bufs[i];
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const ext = isPng ? '.png' : '.jpg';
    const ctype = isPng ? 'image/png' : 'image/jpeg';
    const p = u.id + '/' + Date.now() + '-' + i + ext;
    const r = await fetch(U + '/storage/v1/object/listing-photos/' + p, {
      method: 'POST',
      headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': ctype },
      body: buf
    });
    if (!r.ok) return res.status(500).json({ error: 'Rasmni saqlab bo‘lmadi' });
    paths.push(p);
  }

  const subRes = await fetch(
    U + '/rest/v1/subscriptions?select=plan,period_end&status=eq.active&owner_id=eq.' + u.id,
    { headers: H }
  );
  const sub = await subRes.json().catch(() => []);
  const pro = Array.isArray(sub) && sub.some(x => ['Pro', 'Ferma'].includes(x.plan) && new Date(x.period_end) > new Date());


  let status = pro ? 'active' : 'pending_payment';
  if (aiFailed && status === 'active') {
    status = 'pending_review';
  }

  const row = {
    seller_id: u.id,
    title,
    species,
    breed: s(b.breed, 40),
    age: s(b.age, 30),
    weight: s(b.weight, 30),
    price,
    region: s(b.region, 40),
    phone,
    description: s(b.description, 1000),
    photo_path: paths[0],
    photos: paths,
    status
  };

  let r = await fetch(U + '/rest/v1/listings', {
    method: 'POST',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  let j = await r.json().catch(() => ({}));

  // Agar bazada eski CHECK constraint bo‘lib 'pending_review' hali qo‘shilmagan bo‘lsa, 'pending_payment' sifatida saqlaymiz
  if (!r.ok && status === 'pending_review') {
    row.status = 'pending_payment';
    r = await fetch(U + '/rest/v1/listings', {
      method: 'POST',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify(row)
    });
    j = await r.json().catch(() => ({}));
  }

  if (!r.ok || !Array.isArray(j) || !j[0]) {
    return res.status(500).json({ error: 'E’lonni saqlab bo‘lmadi' });
  }

  if (aiFailed) {
    await ins('audit_logs', { actor_id: u.id, action: 'listing_pending_review', target: j[0].id });
  }

  res.json({
    id: j[0].id,
    status: row.status,
    pay: 'To‘lovni Telegram orqali @Life_Uz1 bilan kelishing. Administrator tasdiqlagach e’lon faollashadi.',
    fee_amount: pro ? 0 : 10000,
    ...(aiFailed ? { warning: 'AI tekshiruvi vaqtincha band bo‘lgani uchun e’loningiz saqlandi va administrator tekshiruvidan so‘ng faollashtiriladi.' } : {})
  });
};