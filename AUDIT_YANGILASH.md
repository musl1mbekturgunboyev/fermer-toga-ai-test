# Fermer Tog‘a AI — audit tuzatishlari

2026-11-03. Manba: foydalanuvchi yuborgan `fermer toga test (3).zip`.

## Jonli saytga o‘rnatish

Bu paket manba kodidir. Hozircha Render kodi yoki jonli bazaning siyosatlari o‘zgartirilmadi.

1. GitHub va Supabase ma’lumotlarining zaxira nusxasini oling. Render’dagi amaldagi Environment qiymatlarini saqlang; qiymatsiz `.env.example` bilan almashtirmang.
2. Rejalangan qisqa xizmat oynasida Supabase SQL Editor’da **supabase/schema.sql** ni to‘liq bajaring. Bu yangi va mavjud bazalar uchun birlashtirilgan, qayta bajariladigan tranzaksiyali o‘rnatishdir. Faqat biror parchani bajarmang. Mavjud foydalanuvchilar, e’lonlar, tariflar va AI tarixi o‘chirilmaydi.
3. ZIP tarkibini GitHub loyiha ildiziga joylang. `api/listing-status.js`, `api/_billing.js`, `api/chat.js`, `api/scan.js`, push fayllari va `public/index.html` ham birga yangilansin. Eski zaiflikning qaytmasligi uchun eski SQL fayllarini keyin qayta qo‘llamang: yagona o‘rnatish manbasi `supabase/schema.sql`.
4. Render’da `npm ci` bilan yangilang, **Manual Deploy → Deploy latest commit**. SQL himoyasi qo‘yilib, yangi kod hali chiqmagan qisqa oraliqda eski frontendning “Sotildi” tugmasi rad etiladi; yangi deploy bu yo‘lni server RPC’ga o‘tkazadi. API server yangi quota RPC bo‘lmasa yopiq holatda 503 qaytaradi.
5. Brauzerda Ctrl+Shift+R. Kirish, AI chat, scan, e’lonni “Sotildi” qilish va push testini tekshiring. O‘zingizga tegishli faol e’longina “Sotildi” qilinadi.
6. Scheduler: Supabase’dagi `fermer-reminders-every-minute` 2026-11-03 tekshiruvida faol va `* * * * *` bo‘lgan. Uni qayta yaratish hozir kerak emas. Yangi bazada `supabase/reminder-scheduler.sql` ni schema’dan keyin bir marta bajaring; URL o‘z domeningizga mos bo‘lsin. Tekshirish: `supabase/verify-security.sql`.
7. Asosiy muhit Render + Supabase Cron. `REMINDER_NODE_TIMER` odatda 0. Faqat doim ishlaydigan Node server va alohida tashqi scheduler yo‘q bo‘lsa, 1 va CRON_SECRET bilan zaxira timer ishlaydi. Free Render uxlaganda Node timer ishonchli scheduler emas. Vercel muqobil konfiguratsiyasi ham daqiqalik; tanlangan Vercel rejangiz bunday jadvalni qo‘llashini deploy oldidan tekshiring. Bir necha scheduler bo‘lsa mavjud claim mexanizmi bir eslatmani qayta yuborishni cheklaydi.

## Audit bandlari

| Band | Tuzatish | Tekshiruv |
|---|---|---|
| 1. Maxfiy fayllar | Release buyrug‘i `.env*` (namunadan tashqari), `.vapid.json`, `.git`, `node_modules`, build chiqishi va eski ZIP’larni olmaydi; service-role JWT / aniq API key belgilarini tekshiradi. Namuna qiymatlari bo‘sh. | Yakuniy ZIP ichidagi fayllar va CRC alohida tekshirildi. Kalit rotatsiyasi alohida talab qilinadi. |
| 2. E’lon UPDATE bypass | Client UPDATE bekor. Server autentifikatsiyasi va service_role-only RPC. `active → sold`, o‘z e’lonini olib tashlash; title/photos almashmaydi. | Haqiqiy PostgreSQL semantikasi bilan pending/removed → sold, begona egasi va to‘g‘ridan-to‘g‘ri UPDATE rad etildi. |
| 3. Push bypass/SSRF | Client jadval yozishi yopiq; API’dagi ro‘yxat va kalitlar tekshiruvi yuborishda ham ishlaydi. Jadval endpoint’i va JSON endpoint’i bir xil bo‘lishi shart. Mavjud obunani begona foydalanuvchi egallay olmaydi. | Localhost/IP, soxta subdomain, port, credentials, fragment va endpoint nomuvofiqligi rad etildi; RLS/grantlar sinovdan o‘tdi. |
| 4. Scan sun’iy aniqligi | ZIP’da avvalgi ehtiyotkor scan tuzatishlari borligi tekshirildi. Noma’lum vazn/yosh/jins to‘ldirilmaydi, aniqlik foizi chiqarilmaydi. Egasi kiritgan faktlar bilan AI kuzatuvi ajratilgan. | Mock AI va frontend funksional testlari. Haqiqiy chorva aniqligi o‘lchanmagan. |
| 5. AI kvota | Server yaratgan request ID, atomik reservation, success/failure. Faqat muvaffaqiyatli natija sarf hisoblanadi. Nosoz yoki baholab bo‘lmaydigan scan qaytariladi. | Limit, retry/idempotency, egasini tekshirish, failure refund, success commit, 10 daqiqalik lease expiry. |
| 6. Scheduler | Kunlik va daqiqalik ziddiyat olib tashlandi; Supabase Cron asosiy, Node fallback aniq tanlanadi. Vercel muqobili daqiqalik. | Jonli Cron faolligi faqat o‘qish orqali tasdiqlandi; haqiqiy qurilmaga push kafolati sinovdan o‘tkazilmadi. |
| 7. Toza o‘rnatish | Asosiy schema, production fix, handle, consent, feed/reminder va security SQL birlashtirildi. Rekursiv profil siyosati va app_state yozish bypass’i yopiq. | Toza PostgreSQL/PGlite bazasiga o‘rnatish va ikki marta bajarish o‘tdi. |

## Maxfiy kalitlar: foydalanuvchi bajaradigan qism

Kodning o‘zgarishi avval tarqalgan kalitni bekor qilmaydi. Eski arxivni olganlar ko‘rgan haqiqiy Supabase service-role, Gemini/OpenAI, CRON yoki VAPID private kalitlari bo‘lsa, tegishli provayderda yangisini yarating va eskisini bekor qiling. Render Environment’ni yangilang. Kalitlarni chatga yubormang.

Supabase’da eski JWT kalit turini almashtirish boshqa kalitlar/sessiyalarga ham ta’sir qilishi mumkin; Dashboard’dagi amaldagi rotatsiya ko‘rsatmasiga amal qiling. CRON_SECRET va Vault’dagi scheduler tokeni alohida: biri almashtirilsa, unga tegishli chaqiruvchi ham moslashtiriladi. VAPID yangilansa, `push_config`dagi faol juftlik ham yangilanishi va foydalanuvchilar qayta obuna bo‘lishi kerak; faqat Render env’ni o‘zgartirish eski DB juftligini bekor qilmaydi. Ushbu paket jonli kalitlarni almashtirmadi.

Eski `sold` e’lonlarning qaysi biri avval zaif yo‘l orqali chiqarilganini kod aniqlay olmaydi. Ularni admin ko‘rib chiqsin. Oldin sun’iy vazn/ozuqa/emlash bilan yaratilgan foydalanuvchi yozuvlari avtomatik o‘chirilmagan. Avvalgi muvaffaqiyatsiz AI sarflarini yangi ledger holatlari bo‘lmagani sabab ishonchli ajratib qaytarish mumkin emas; yangi qoida yangilanishdan keyingi so‘rovlarga tegishli.

## Testlar va chegaralar

`npm ci`, `npm test`, `npm run build`, `npm run package:release`.

PostgreSQL/PGlite (ajratilgan, lokal) RLS, grantlar, SQL RPC, advisory lock mavjudligi va quota holatlarini tekshiradi. PGlite bitta DB sessiyasi bilan ishlaydi: haqiqiy ko‘p ulanishli yuklama sinovining o‘rnini bosmaydi. Supabase Auth/Storage tuzilmalari test uchun soddalashtirilgan. Jonli bazada ushbu migratsiya bajarilmadi; Render deploy qilinmadi; brauzer E2E, real AI va qurilmadagi push tekshiruvi bajarilmadi.

Manba hujjatlar: https://supabase.com/docs/guides/database/postgres/row-level-security va https://supabase.com/docs/guides/database/postgres/column-level-security.

## Egress yangilanishi

2026-11-03 tekshiruvida app_state jadvalida 10 qator, jami 6 076 698 bayt JSON bor edi. Oldingi scheduler to‘liq holatni har daqiqa o‘qigan; shu hajmda kunlik nazariy sarf 8,75 GB atrofida. Bu hisob tarixiy trafikning to‘liq atributsiyasi emas. Yangi server-only `get_reminder_inputs()` RPC faqat push obunasi va eslatmasi bor foydalanuvchilarning user_id va rem maydonlarini qaytaradi. Rasmlar, chat va boshqa holat endi schedulerga yuborilmaydi. Ma’lumotlar o‘chirilmaydi; qayta ishlash DB ichida bajariladi.

Avvalgi audit paketini allaqachon o‘rnatgan bo‘lsangiz, Supabase SQL Editor’da faqat `supabase/egress-fix.sql` ni bajaring va `api/send-reminders.js` ni yangilab deploy qiling. SQL birinchi, API ikkinchi. Audit paketini hali o‘rnatmagan bo‘lsangiz, yangilangan `schema.sql` bu RPC’ni ham o‘z ichiga oladi. Render Environment qiymatlari saqlanadi. Sarflangan trafik orqaga kamaymaydi; yangi sarf grafigini taqqoslang.
