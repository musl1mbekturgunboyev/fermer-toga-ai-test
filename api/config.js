module.exports = (req, res) => res.json({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY, vapid: process.env.VAPID_PUBLIC_KEY, fee: process.env.LISTING_FEE_MODE || "off" });
