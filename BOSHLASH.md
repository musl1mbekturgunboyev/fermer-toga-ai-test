# Fermer Tog‘a AI — to‘liq manba kodi

Admin email: **muslimbekturgunboyev08@gmail.com**.
Parol ZIP ichida yo‘q. O‘zingiz shu email orqali ro‘yxatdan o‘ting va emailni tasdiqlang. Admin huquqi server skripti yoki SQL orqali beriladi; brauzerning email matni yoki localStorage qiymati huquq bermaydi.

## Windows’da ishga tushirish
1. ZIPni oching, `Fermer_Toga_AI` papkasini VS Code’da oching.
2. Terminalda: `npm install`.
3. `.env.example` nusxasini `.env.local` nomi bilan saqlang. Supabase URL, anon key, service-role key va kamida bitta AI kalitini kiriting. Maxfiy kalitlar paketga kiritilmagan. Ular dastlabki loyihangizdagi `.env.local` faylida bor; uni faqat server papkasiga qo‘ying, public/ ichiga yoki Git’ga qo‘ymang.
4. Supabase SQL Editor’da mavjud baza uchun `supabase/production-fix.sql`, so‘ng `supabase/admin-account.sql` ni bajaring. Yangi, bo‘sh baza uchun avval `supabase/schema.sql` kerak. Mavjud bazada schema.sql ni qayta bajarmang.
5. `npm start`, keyin brauzerda `http://localhost:3000` ni oching.
6. Admin emailingiz bilan ro‘yxatdan o‘ting, pochtani tasdiqlang. `admin-account.sql` bajarilgan bo‘lsa admin avtomatik beriladi. Muqobil: `npm run setup:admin` (service-role kaliti kerak). Chiqib qayta kiring va `http://localhost:3000/#/admin` ni oching.

## Google orqali kirish
Google Cloud Console → Google Auth Platform → Clients → Web OAuth klient → Authorized redirect URIs:
`https://ehvsfeelxqybyaequxxv.supabase.co/auth/v1/callback`
Yangi Supabase loyiha ishlatsangiz, uning callback manzilini qo‘ying.
Supabase Authentication → URL Configuration’da ishlatayotgan sayt URL’ini Site URL va Redirect URLs ichiga qo‘shing. Lokal uchun http://localhost:3000/; production uchun haqiqiy domeningiz. Oldingi ishlayotgan domenlarni saqlang.
Google klient ID va secret Supabase Google provider sozlamasida bir xil klientga tegishli bo‘lsin. Testing rejimida test users ro‘yxatiga email qo‘shilishi yoki ilova productionga o‘tkazilishi kerak.

## 6 xonali email kodi
Supabase Authentication → Email Templates → Confirm signup va Reset password shablonlariga:
```html
<p>Tasdiqlash kodingiz: <strong>{{ .Token }}</strong></p>
<p><a href="{{ .ConfirmationURL }}">Tasdiqlash</a></p>
```
OTP uzunligi 6 bo‘lsin. Xatda havola kelgan bo‘lsa, havola orqali tasdiqlash ham ishlaydi. Reset password xati — parol tiklash uchun, ro‘yxatdan o‘tish uchun emas.
Mijozlarga email yuborish uchun Supabase Custom SMTP va tasdiqlangan yuboruvchi domenini sozlang. RESEND_API_KEY serverda turgani Supabase SMTP avtomatik sozlandi degani emas.

## Tariflar
Bepul: 10 hayvon, 5 skan/oy, 30 savol/oy.
Pro: 100 hayvon, 100 skan/oy, 500 savol/oy.
Ferma: 1000 hayvon, 1000 skan/oy, 5000 savol/oy.
Pro/Ferma narxi kelishiladi va admin panelida qo‘lda faollashtiriladi. Avtomatik Click/Payme billing yo‘q. Kvotalar UTC kalendar oyiga qarab hisoblanadi. AI urinishlari provayder xatosi bilan tugasa ham sarfga hisoblanadi.

## Tekshiruv va nashr
- `npm test`: 14 ta avtomatik test, jumladan tasdiqlangan tiklash havolasida OTP talab qilinmasligi.
- `npm run build`: Sites Worker buildi, dist/server/index.js.
- `npm start`: Node server, Render yoki VPS uchun.
- ZIPdagi `.openai/hosting.json` ataylab bo‘sh: yangi Sites loyihasiga uning project_id qiymati yoziladi. Sizning mavjud Sites nashringiz o‘zgartirilmaydi.
- Node server mahalliy eslatma taymerlarini ishga tushiradi. Worker uchun sahifa yopiq paytdagi bildirishnomalar alohida scheduler chaqiruvini talab qiladi.

## Hozirgi holat
Kod avtomatik testlardan o‘tgan. Ammo Google Cloud OAuth, Supabase email shablonlari/SMTP va SQL migratsiyalari hisobingizda to‘g‘ri sozlanmaguncha platformani 100% ishlaydi deb bo‘lmaydi. Ushbu tashqi sozlamalar ZIP ichidagi kod orqali avtomatik o‘zgarmaydi. Real email va Google kirishi, real to‘lov, yuklama va barcha sahifalar bo‘yicha to‘liq end-to-end sinov bajarilmagan.

## Oxirgi Auth tuzatishi
Kirish email va 6 xonali OTP orqali bajariladi. Kirishda yangi hisob avtomatik yaratilmaydi; yangi foydalanuvchi avval ro‘yxatdan o‘tadi. Bo‘sh muvaffaqiyatli REST javoblari JSON sifatida o‘qilmaydi. 16 ta test o‘tgan.

### Hali Dashboard’da bajarish kerak
Authentication → URL Configuration → Site URL:
`https://fermertoga-ai.keencrane4096.chatgpt.site`
Redirect URLs ichiga:
`https://fermertoga-ai.keencrane4096.chatgpt.site/`
ni qo‘shing. Boshqa ishlayotgan production domenlarini saqlang. Localhost faqat kompyuteringizda server ishga tushganida ishlaydi; production uchun Site URL localhost bo‘lmasin.
Authentication → Email Templates’da uchta shablonni yangilang:
- Confirm signup ← supabase/email-templates/confirm-signup.html
- Magic Link ← supabase/email-templates/magic-link.html
- Reset Password ← supabase/email-templates/reset-password.html
Har biri uchun Save bosing. Email provider sozlamasida OTP Length=6, Expiration=600 seconds tanlang.
Bu sozlamalarni SQL Editor’da bajarib bo‘lmaydi. Google’dan localhostga qaytish — Site URL yoki Redirect URLs allowlist muammosi; Authorized redirect URIs’da esa Supabase callback manzili turadi.
Dashboard kirishi yakunlanmagani uchun ushbu shablonlar serverga hali qo‘llanmadi. Paketdagi kod xat shabloni o‘rnini bosa olmaydi. Real email yetkazilishi va Google callback hali qayta tekshirilmagan.

## OTP uzunligi yangilanishi
Ro‘yxatdan o‘tish, kirish va parol tiklash maydonlari endi 6–8 raqamli kodni to‘liq qabul qiladi. Supabase 8 raqam yuborsa uni qisqartirmang. 17 ta test o‘tgan. Render’da yangi kodni deploy qiling.
