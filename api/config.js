const { ensureVapidKeys } = require('./_lib');
module.exports = (req, res) => {
  const vapid = ensureVapidKeys();
  res.json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    vapid: process.env.VAPID_PUBLIC_KEY || vapid.publicKey,
    fee: process.env.LISTING_FEE_MODE || 'off'
  });
};
