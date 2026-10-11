# Fermer Tog‘a AI — ishga tushirish

Tuzilma: `public/index.html` (interfeys) · `api/*` (Vercel serverless: ChatGPT, tekshiruv) · `supabase/schema.sql` (baza + xavfsizlik).

## 1. Supabase
1. supabase.com → yangi loyiha (region: Frankfurt yoki Mumbai).
2. **SQL Editor** → `supabase/schema.sql` ni to‘liq qo‘yib ishga tushiring.
3. **Authentication → Providers**: Email yoqilgan bo‘lsin (email tasdiqlash yoqilgan tavsiya). Google uchun Google Cloud'da OAuth kalit yaratib, shu yerga kiriting.
4. **Authentication → URL Configuration**: Site URL = sizning Vercel manzilingiz.
5. **Settings → API**: `URL`, `anon` va `service_role` kalitlarini nusxalang.

## 2. OpenAI
platform.openai.com → API key yarating, hisobga balans qo‘shing. Xarajat chegarasini (usage limit) o‘rnating.

## 3. Vercel
1. Papkani GitHub'ga yuklang → vercel.com → **Add New Project** → shu repo (Framework: *Other*).
2. **Environment Variables**: `.env.example` dagi 5 ta o‘zgaruvchini kiriting.
3. Deploy. Keyin Supabase'dagi Site URL'ni yangi manzilga yangilang.
4. O‘z domeningiz bo‘lsa: Vercel → Domains.

## 4. Birinchi admin
Ro‘yxatdan o‘ting, so‘ng SQL Editor'da: `update profiles set role='admin' where id='<user id>';`

## Ishga tushirishdan oldin
- Maxfiylik/Shartlar matnini yurist ko‘rsin. AI javoblarini veterinar bilan sinab ko‘ring.
- Kalitlarni hech qachon `public/` ichiga yozmang.
- Admin panel hozir namuna raqamlar ko‘rsatadi — haqiqiy statistika keyin ulanadi.
- To‘lov (Payme/Click), email/push bildirishnomalar va tarjimalar hali qo‘shilmagan.

## Qo‘shimcha (v1.1)
**Admin panel** haqiqiy ma’lumot ko‘rsatadi (`api/admin-stats.js`), faqat `role='admin'` uchun.
**Tarjima:** `OPENAI_API_KEY=sk-... npm run translate` → `public/i18n.json` yaratiladi (RU/EN/KK/KY). Faylni ona tilida so‘zlashuvchi tekshirib chiqsin; keyin deploy qiling.
**Email:** resend.com'da domen tasdiqlang, `RESEND_API_KEY` va `FROM_EMAIL` kiriting. Kirish/parol xatlari uchun Supabase → Auth → SMTP Settings'da ham Resend SMTP'ni ulang (standart SMTP juda cheklangan).
**Push:** `npx web-push generate-vapid-keys` → ikkala kalitni env'ga yozing. Foydalanuvchi "Eslatmalar" sahifasida "Bildirishnomani yoqish"ni bosadi.
**Eslatma yuborish:** `vercel.json` dagi cron har kuni 09:00 (Toshkent) ishlaydi; `CRON_SECRET` o‘rnating. Sanasi bugun/ertaga bo‘lgan eslatmalar yuboriladi.

## Hayvon bozori (v1.2)
- E’lon narxi: 10 000 so‘m / dona. **Pro/Ferma** (jadval `subscriptions`, faol va muddati tugamagan) uchun bepul — server tekshiradi (`api/listings.js`). Interfeysdagi "Tarif tanlash" tugmasi faqat namuna, haqiqiy Pro bermaydi.
- Hozircha onlayn to‘lov yo‘q: to‘lamagan sotuvchining e’loni "to‘lov kutilmoqda" holatida turadi, `PAY_INFO` matni ko‘rsatiladi. To‘lov kelgach admin panelda "Tasdiqlash"ni bosasiz. Pro berish: admin panelda foydalanuvchi ID, tarif va oy kiritiladi.
- Yangi SQL qismini ("Hayvon bozori") Supabase'da ishga tushiring. E’lon rasmlari ochiq bucket'da saqlanadi.
- Chat: xaridor va sotuvchi o‘rtasida, telefon raqam esa faqat tizimga kirgan foydalanuvchilarga ko‘rinadi.
