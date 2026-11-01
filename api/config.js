const { ensureVapidKeys } = require('./_lib');
module.exports = async (req, res) => {
  let vapid={};try{const c=await require('./_push').config();vapid.publicKey=c.public_key;}catch(_){vapid=ensureVapidKeys();}
  res.json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    vapid: vapid.publicKey,
    fee: 'manual',
    support: 'https://t.me/Life_Uz1'
  });
};
