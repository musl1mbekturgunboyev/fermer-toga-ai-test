const { ensureVapidKeys } = require('./_lib');
const { PLANS } = require('./_plans');
module.exports = (req, res) => {
  const vapid = ensureVapidKeys();
  res.json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    vapid: process.env.VAPID_PUBLIC_KEY || vapid.publicKey,
    fee: process.env.LISTING_FEE_MODE || 'off',
    // Ochiq ma’lumot: narx va limitlar (landing va tariflar sahifasi uchun)
    plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { price: v.price, animals: v.animals, scans: v.scans, chats: v.chats, listings: v.listings, exports: v.exports, freeListing: v.freeListing }]))
  });
};
