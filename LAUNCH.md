# Fermer Tog‘a AI — ishga tushirish

Sayt: https://fermertoga-ai.keencrane4096.chatgpt.site
Hozirgi nashr faqat sayt egasi uchun yopiq. Mijozlar uchun kirish Sites sharing sozlamalarida alohida ochiladi.

## 1. Bazani yangilash — majburiy
Supabase Dashboard → SQL Editor → New query. `supabase/production-fix.sql` faylidagi kodni joylang va Run bosing. Avval mavjud baza backupini saqlang. Bu fayl mavjud loyiha uchun; `schema.sql` ni mavjud bazada qayta ishga tushirmang.
Yangi bazaga avval schema.sql, keyin production-fix.sql kerak.
Migratsiyasiz yangi AI so‘rovlari xavfsizlik uchun 503 bilan to‘xtaydi. Profil o‘qish va oddiy saqlash mavjud jadvallarga bog‘liq.
Oylik AI kvotalar UTC bo‘yicha kalendar oyda yangilanadi. Qabul qilingan AI urinishlari, jumladan provayder xatosi bilan tugagan urinishlar ham hisoblanadi.

## 2. Google va email
Supabase Authentication → URL Configuration:
- Site URL: https://fermertoga-ai.keencrane4096.chatgpt.site
- Redirect URLs: https://fermertoga-ai.keencrane4096.chatgpt.site va shu originning / manzilini qo‘shing.
- Oldingi ishlayotgan domenlarni saqlang.
Authentication → Sign In / Providers → Google yoqilgan (tekshirildi). Google Cloud OAuth klientining Authorized redirect URI maydonida Supabase ko‘rsatgan callback manzili bo‘lishi shart.
Google ilovasi Testing holatida bo‘lsa, mijozlar faqat test foydalanuvchi sifatida qo‘shilganida kira oladi; ommaviy ishlash uchun Google sozlamasini tekshiring.
Authentication → Email templates → Confirm signup: kod ko‘rsatilishi uchun `{{ .Token }}` ni xat matniga qo‘shing. Masalan: `<h2>Hisobni tasdiqlash</h2><p>Kodingiz: <strong>{{ .Token }}</strong></p><p><a href="{{ .ConfirmationURL }}">Emailni tasdiqlash</a></p>`.
OTP uzunligini 6 raqam qilib sozlang. Tasdiqlash havolasi ham ishlaydi.
Production xat yetkazilishi uchun Supabase Custom SMTP sozlamalarini tekshiring. Serverdagi RESEND_API_KEY avtomatik ravishda Supabase emailini yubormaydi. Tasdiqlangan yuboruvchi domen va amaldagi SMTP ma’lumotlari kerak.
Real Google akkaunti va real pochtaga kod kelishi yakuniy foydalanuvchi bilan tekshirilmagan.

## 3. Admin bo‘lish
Avval oddiy foydalanuvchi sifatida ro‘yxatdan o‘ting va emailni tasdiqlang. Keyin Supabase SQL Editor’da o‘zingizning emailingizni qo‘yib bajaring:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'SIZNING_EMAILINGIZ');
```
Faqat o‘zingizning emailingizdan foydalaning. Saytdan chiqib qayta kiring. `/#/admin` sahifasini oching.
Admin paneldagi foydalanuvchi ID bilan Pro yoki Ferma tarifini 1–24 oyga bering. Profil sahifasida ham foydalanuvchi ID ko‘rinadi. To‘lov qo‘lda tasdiqlanadi, avtomatik billing ulanmagan.

## Limitlar
| Tarif | Hayvon | AI skan/oy | AI savol/oy | E’lon |
|---|---:|---:|---:|---|
| Bepul | 10 | 5 | 30 | 10 000 so‘m, qo‘lda tasdiq |
| Pro | 100 | 100 | 500 | Bepul |
| Ferma | 1000 | 1000 | 5000 | Bepul |
Narx belgilanmagani uchun Pro/Ferma narxi kelishiladi. Muddat tugagach Bepul ishlaydi. Oldingi hayvon yozuvlari o‘chirilmaydi; limitdan ortiq yangi hayvon qo‘shilmaydi.

## Tekshirish
`npm test`: 12 API testi. `npm run build`: Worker paketi. Brauzerda bosh sahifa tekshirildi. Haqiqiy to‘lov, Google callback, email yetkazilishi, ko‘p foydalanuvchili yuklama va SQL migratsiyasining real bazada bajarilishi hali tasdiqlanmagan.
Node server mahalliy eslatma taymerlarini ishlatadi. Sites Worker nashrida sahifa yopiq paytdagi avtomatik push/email uchun alohida rejalashtirilgan chaqiruv kerak; u hozir sozlanmagan. Sahifa ochiq paytdagi eslatmalar frontendga bog‘liq.

## Muhit
.env.local va .vapid.json maxfiy; Git va nashr paketiga kiritilmaydi. Maxfiy kalitlar Sites runtime sozlamalarida saqlanadi. Supabase service-role kaliti brauzerga uzatilmaydi.
