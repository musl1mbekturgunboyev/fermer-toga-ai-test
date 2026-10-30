// Tariflar va cheklovlar — YAGONA MANBA. Narx va limitlarni faqat shu yerda (yoki Render env orqali) o‘zgartiring.
// Eslatma: hayvonlar soni limiti bazada ham (supabase/schema.sql -> plan_animal_limit) takrorlangan. Ikkalasini bir xil tuting.
const num = (v, d) => (Number.isFinite(+v) && +v >= 0 && v !== '' && v != null ? +v : d);

const PLANS = {
  Bepul: {
    rank: 1,
    price: 0,
    animals: 10,
    scans: 5,        // oyiga AI skan
    chats: 30,       // oyiga AI yordamchi savollari
    listings: 3,     // bir vaqtda faol e’lonlar
    freeListing: false, // e’lon berish pullikmi (LISTING_FEE_MODE=manual bo‘lsa)
    exports: false   // CSV / PDF hisobot
  },
  Pro: {
    rank: 2,
    price: num(process.env.PRICE_PRO, 49000),
    animals: 50,
    scans: 100,
    chats: 600,
    listings: 20,
    freeListing: true,
    exports: true
  },
  Ferma: {
    rank: 3,
    price: num(process.env.PRICE_FERMA, 149000),
    animals: 200,
    scans: 400,
    chats: 2000,
    listings: 100,
    freeListing: true,
    exports: true
  }
};

const PAID = ['Pro', 'Ferma'];

// Toshkent (UTC+5) bo‘yicha joriy oy boshlanishi — oylik limitlar shu paytdan hisoblanadi
function monthStartISO(now = Date.now()) {
  const t = new Date(now + 5 * 36e5);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - 5 * 36e5).toISOString();
}

// Faol obunalar ro‘yxatidan eng yuqori amaldagi tarifni tanlaydi
function pickPlan(rows, now = Date.now()) {
  let best = { name: 'Bepul', until: null };
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !PLANS[r.plan] || r.status === 'canceled') continue;
    const end = r.period_end ? new Date(r.period_end).getTime() : 0;
    if (!(end > now)) continue;
    if (PLANS[r.plan].rank > PLANS[best.name].rank || (r.plan === best.name && end > new Date(best.until || 0).getTime())) {
      best = { name: r.plan, until: new Date(end).toISOString() };
    }
  }
  return best;
}

module.exports = { PLANS, PAID, monthStartISO, pickPlan };
