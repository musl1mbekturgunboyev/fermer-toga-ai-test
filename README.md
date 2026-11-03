# Fermer Tog‘a AI 1.4.1

Chorva hisobi, ehtiyotkor AI kuzatuvi, yordamchi chat, eslatmalar va moderatsiyali hayvon/ozuqa bozori.

**Yangilashdan oldin [SECURITY-UPDATE.md](SECURITY-UPDATE.md) ni o‘qing.** Unda tuzatishlar, SQL tartibi va tekshiruv cheklovlari bor.

## Mahalliy ishga tushirish

Node 22 yoki 24 kerak.

```sh
npm ci
npm test
npm start
```

Server odatda `http://127.0.0.1:3000` da ishlaydi. `.env.local` ni `.env.example` asosida yarating. Haqiqiy kalitlarni Git yoki frontendga kiritmang.

Majburiy sozlamalar: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. AI uchun kamida GEMINI_API_KEY yoki OPENAI_API_KEY kerak. Foydalanuvchi Auth xizmati orqali tekshiriladi, rollar server/bazada tekshiriladi.

## Supabase

Yangi bo‘sh loyiha uchun SQL Editor’da `supabase/setup.sql` ni bir marta bajaring. Mavjud bazada qayta ishlatmang: SECURITY-UPDATE.md dagi alohida SQL tartibidan foydalaning.

Birinchi administratorni vakolatli SQL Editor orqali tayinlang:

```sql
update public.profiles set role='admin' where id='<foydalanuvchi UUID>';
```

Auth’da Site URL va redirect manzillarini domeningizga moslang, email tasdiqlash/SMTP va kerak bo‘lsa Google providerini sozlang. Yangi foydalanuvchi shartlar va maxfiylik siyosatini qabul qilgandan keyin AI va e’lon APIlaridan foydalanadi.

Bepul tarif: 10 hayvon, oyiga 5 scan va 30 chat; Pro: 100/100/500; Ferma: 1000/1000/5000. Oylik kvota UTC kalendar oyiga bog‘liq. Tarifni faqat admin o‘zgartiradi. Qabul qilingan AI urinishlari sarfga hisoblanadi. Muayyan tarif bo‘yicha maydonlar `_billing.js` va bazadagi quota funksiyalarida belgilangan.

Bepul hisobda hayvon e’loni to‘lov tasdiqlanishini kutadi. Amaldagi Pro/Ferma hisobida muvaffaqiyatli AI tekshiruvidan keyin faol bo‘ladi; AI tekshiruvi ishlamasa admin ko‘rigini kutadi. Ozuqa e’lonlari admin ko‘rigidan o‘tadi. Eski LISTING_FEE_MODE sozlamasi amaldagi kodda ishlatilmaydi.

## Push va cron

VAPID kalitlari bazadagi push_config’da saqlanadi. Node kerak bo‘lsa juftlik yaratadi; worker uchun muhitda VAPID_PUBLIC_KEY va VAPID_PRIVATE_KEY berilishi kerak. CRON_SECRET tasodifiy uzun maxfiy qiymat bo‘lsin. Serverlessda `supabase/reminder-scheduler.sql` ichidagi domenni sozlab, scheduler’ni har daqiqada chaqiring. Batafsil: SECURITY-UPDATE.md.

## Tekshiruv va build

```sh
npm test
npm run test:worker
npx playwright install chromium-headless-shell
npm run test:browser
npm audit
```

Brauzer testi uchun mavjud Chrome/Edge yo‘lini CHROME_PATH bilan berish mumkin. API, brauzer va worker sinovlari tashqi xizmatlarni mock qiladi; SQL sinovlari PGlite ichida haqiqiy PostgreSQL/RLS qoidalarini bajaradi.

`npm run build` worker artefaktini `dist/` ichiga chiqaradi. `public/index.html` o‘zgarsa CSP hashlarini ham qayta yaratish uchun buildni takrorlang. Node uchun `npm ci --omit=dev && npm start`; joylashtirish tafsilotlari [DEPLOY.md](DEPLOY.md) va [SECURITY-UPDATE.md](SECURITY-UPDATE.md) da.

## Tuzilma

`server.js` — Node HTTP server; `api/` — himoyalangan endpointlar; `public/` — SPA va lokal Supabase SDK; `supabase/` — SQL; `scripts/` — build; `tests/` — API, SQL, xavfsizlik, worker va brauzer tekshiruvlari.
