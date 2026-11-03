# Xavfsizlik yangilanishi — Fermer Tog‘a AI 1.4.1

2026-11-03. Ushbu paket lokal kod tuzatishlaridir. Haqiqiy sayt va Supabase loyihasiga o‘zgarish yuborilmadi.

## O‘rnatish / yangilash

1. Ishlayotgan bazaning va Storage fayllarining zaxira nusxasini oling. Avval alohida test loyihasida yangilang.
2. **Yangi, bo‘sh Supabase loyihasi:** SQL Editor’da `supabase/setup.sql` ni bir marta bajaring. Bu fayl barcha majburiy SQL fayllarini to‘g‘ri tartibda birlashtiradi.
3. **Avvalgi versiya o‘rnatilgan loyiha:** `schema.sql` yoki `setup.sql` ni qayta bajarmang. Quyidagilarni shu tartibda bajaring:
   - `supabase/production-fix.sql`;
   - `supabase/terms-consent.sql`;
   - `supabase/seller-profiles.sql`;
   - `supabase/feed-reminders.sql`.
4. Yangi API va frontendni birga joylashtiring. Yangi state API `save_app_state`, autentifikatsiya esa `consume_api_rate` RPCsini talab qiladi. SQL qo‘llanmasa, bu operatsiyalar 503 qaytarib yopiq qoladi. Eski ochiq oynalarni yangilang.
5. Node 22 yoki 24 ishlating. `npm ci` → `npm test` → `npm run build`. Ishlab chiqarishda `npm ci --omit=dev` → `npm start`. Worker artefakti `dist/` ichida.
6. `.env.example` asosida haqiqiy server sozlamalarini kiriting. Service role, AI kalitlari va CRON_SECRET brauzerga berilmaydi. ZIP ichida haqiqiy kalitlar yo‘q.
7. Node oldida Nginx ishlasa, u `X-Forwarded-For` ni haqiqiy `$remote_addr` bilan almashtirsin. `TRUSTED_PROXY_IPS` ga faqat Node ko‘rayotgan proksi IPsini yozing. Ishonchli proksi ro‘yxatisiz mijoz yuborgan header hisobga olinmaydi. Workerda IP aniqlanmasa, hamma mijoz bitta IP deb bloklanmaydi; bazadagi foydalanuvchi cheklovi ishlaydi.
8. Serverless/worker va uxlab qoladigan hostingda eslatmalar uchun `supabase/reminder-scheduler.sql` ni ishlating. Undagi domenni o‘z domeningizga moslang va kerakli Supabase Cron, Net, Vault imkoniyatlarini sozlang. Scheduler **har daqiqa** ishlashi kerak. Kuniga bir marta ishlaydigan Vercel cron olib tashlandi. Doim ishlab turadigan Node serverida ichki 60 soniyalik timer bor; takror chaqiriqlarga bazadagi claim himoyasi qo‘yilgan.
9. `public/index.html` dagi skriptni tahrirlasangiz, `npm run security:build` yoki `npm run build` ni qayta bajaring. Bu CSP hashlarini, Vercel headerlarini va yangi baza setup faylini yangilaydi.

## Tuzatilgan muammolar

- Baza o‘qish/parsing xatosi endi bo‘sh holatni eski ma’lumot ustiga yozmaydi.
- State yozish bazada atomik: versiya tekshiruvi, hayvonlar kvotasi va foydalanuvchi bo‘yicha lock. Eskirgan oynadan yozish 409 bilan rad etiladi. Bitta oynadagi yozuvlar ketma-ket yuboriladi; hisob almashsa eski navbat ishlamaydi.
- Hayvon IDlari endi UUID asosida yaratiladi; arxivlashdan keyin ID takrorlanmaydi. Takror ID, noto‘g‘ri massiv va eslatma ma’lumotlari rad etiladi.
- Chorva, pasport, hisobot va ozuqa maydonlarida yetishmagan HTML/atribut escaping qo‘shildi. CSV kataklari formulalar, vergul, qo‘shtirnoq va yangi satrlarga xavfsiz kodlanadi.
- Script CSP’dan `unsafe-inline` olib tashlandi. Asosiy inline skript aniq SHA-256 hash bilan ruxsat oladi. Supabase SDK 2.118.0 loyiha ichida saqlanadi, dinamik CDN versiyasiga bog‘liqlik yo‘q. Node, Vercel va worker uchun bir xil headerlar yaratiladi.
- RLS’ni chetlab o‘tadigan TRUNCATE kabi ortiqcha jadval huquqlari olindi. E’lon egasi faqat statusni o‘zgartira oladi; moderatsiya/to‘lov kutilayotgan e’lonni sold orqali chiqarish bloklandi. Ozuqa e’lonida ham sold faqat active holatdan o‘tadi.
- Begona ferma/hayvon/suhbatga yozuv bog‘lash bazadagi trigger bilan tekshiriladi. Oddiy foydalanuvchi admin rolini, obunani yoki himoyalangan RPCni ishlata olmaydi.
- IP headerga ko‘r-ko‘rona ishonish olib tashlandi. Foydalanuvchi so‘rovlari uchun PostgreSQLda atomik, bir nechta instance va restartdan mustaqil limit qo‘shildi. Xotiradagi limiter hajmi ham cheklangan.
- Marketplace xabarlari uchun server belgilaydigan vaqt va bazadagi tezlik limiti bor. Sotuvchi faqat o‘zi bilan avval bog‘langan xaridorga javob bera oladi.
- Hisobni o‘chirishdagi profiles foreign key to‘siqlari cascade bilan tuzatildi. Endpoint foydalanuvchiga tegishli private/public Storage prefikslarini tozalab, so‘ng Auth hisobini o‘chiradi. Bu tarmoqlararo tranzaksiya emas: Storage bosqichi yarim bajarilib qolsa, xato qaytariladi va qayta urinish kerak bo‘ladi.
- Push obunalarining domeni, HTTPS, porti va kalit hajmi tekshiriladi. Yuborishda ham tekshiruv ishlaydi; redirect kuzatilmaydi. Endpointni boshqa hisobga o‘zlashtirish va qurilmalar limitini parallel so‘rov bilan chetlash atomik RPC orqali bloklanadi.
- Workerda ishlamagan `web-push` require o‘rniga WebCrypto/fetch asosidagi RFC 8291/8292 yuborish qo‘shildi. Shifrlangan xabar alohida `http_ece` kutubxonasi bilan ochib, VAPID imzosi tekshirildi.
- Eski `web-push` va uning tranzitiv production bog‘liqliklari olib tashlandi. Test kutubxonalari aniq versiyada devDependencies ichida.
- Buzilgan eslatma boshqa foydalanuvchilarning ishini to‘xtatmaydi. State va push obunalari cursor bilan sahifalab o‘qiladi. Yuborishlar kichik parallel guruhlarda bajariladi.
- Admin statistikasidagi sahifalanmagan hisoblar ham tuzatildi.
- Yuklanadigan rasmlarda kanonik base64, format, JPEG/PNG tuzilmasi, hajm va dekodlangan o‘lcham chegaralari tekshiriladi. Bu to‘liq antivirus yoki rasmning haqiqiyligini kafolatlovchi vosita emas; mazmun moderatsiyasi alohida qoladi.
- Muvaffaqiyatsiz e’lon yaratishda avval yuklangan rasmlarni tozalash qo‘shildi. Hayvon e’lonlari uchun parallel limit bazada ham tekshiriladi.
- AI moderator javobi strict boolean/son bilan tekshiriladi. Farm konteksti system ko‘rsatmasiga qo‘shilmaydi; foydalanuvchi ma’lumoti sifatida yuboriladi. AI jadvalidagi noto‘g‘ri soatlar rad etiladi.
- Auth va baza/tashqi so‘rovlarga vaqt chegaralari, noto‘g‘ri JSON uchun 400, body hajmi va Node’da bir paytdagi API so‘rovlari chegarasi qo‘shildi. Private javoblar keshga saqlanmaydi.
- Eski test fixturelari joriy model zaxirasi va ehtiyotkor scan formatiga moslashtirildi.

## Tekshirish

- `npm test`: API, xavfsizlik va PGlite PostgreSQL/RLS integratsion testlari. PGlite ichida Supabase Auth/Storage uchun minimal test stublari mavjud; haqiqiy Supabase xizmatini to‘liq almashtirmaydi.
- `npm run test:worker`: buildni hosil qilib, uning statik fayllari, CSP, autentifikatsiya va push shifrlash oqimini tekshiradi.
- `npm run test:browser`: haqiqiy Chromium bilan asosiy sahifalar, saqlash, mobil navigatsiya va XSS payloadlarini tekshiradi. `npx playwright install chromium-headless-shell` bilan test brauzerini o‘rnating. Mavjud Chrome/Edge uchun `CHROME_PATH` ko‘rsatish mumkin. Testlar tashqi xizmatlarni mock qiladi.
- `npm audit`: paketga e’lon qilingan npm advisorylarini tekshiradi. Nol advisory xavfsizlikning mutlaq kafolati emas.

## Ishlab chiqarishda qoladigan tekshiruvlar

Haqiqiy SMTP/OTP, AI kalitlari, domen/TLS, hostingning worker imkoniyatlari, Supabase Data API grantlari, cron sozlamalari va telefonlarga real push yetib borishi alohida staging sinovini talab qiladi. Juda katta foydalanuvchi sonida cron ishini hosting vaqt chegarasiga sig‘dirish uchun navbat/batch arxitekturasi kerak bo‘lishi mumkin. Bu paket ularga kirishsiz 100% xavfsizlik yoki barcha mumkin bo‘lgan xatolar yo‘qligini kafolatlamaydi.

Manbalar: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291), [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292).
