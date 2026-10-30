# Fermer Tog‘a AI v2.0 — ishga tushirish va admin qo‘llanmasi

## 1) Bir martalik: bazani yangilash (MAJBURIY)
Supabase → SQL Editor → `supabase/migration-v2.sql` faylini to‘liq nusxalab **Run** qiling.
Usiz tarif limitlari, admin panel va eslatmalar to‘g‘ri ishlamaydi.

## 2) Render sozlamalari
- `PAY_INFO` — to‘lov rekvizitlari (karta raqami, ism, Telegram). Mijoz «Faollashtirish»ni bossa shu matn ko‘rinadi.
- `PRICE_PRO`, `PRICE_FERMA` — narxlar (standart 49 000 / 149 000 so‘m — o‘zingiznikiga o‘zgartiring).
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — `npx web-push generate-vapid-keys` bilan yarating va kiriting (aks holda har deployda push obunalar uziladi).
- `CRON_SECRET` — `render.yaml` o‘zi yaratadi.
Keyin GitHub’ga push → Render avtomatik deploy.

## 3) Admin bo‘lib kirish
1. Saytda oddiy ro‘yxatdan o‘ting (yoki Google bilan kiring).
2. Supabase → SQL Editor:
   `update profiles set role='admin' where id=(select id from auth.users where email='SIZNING@EMAIL.COM');`
3. Saytdan **Profildan chiqing** va qayta kiring → menyuda **🛡️ Admin** paydo bo‘ladi (manzil: `/#/admin`).
4. O‘zingizga limitsiz sinash uchun Ferma tarifi: Admin panel → «Tarif berish» → emailingiz → Ferma → 12 oy.

## 4) Tarif qanday faollashadi
Mijoz: Tariflar → Pro/Ferma → **Faollashtirish** → to‘lov rekvizitlari chiqadi → to‘laydi.
Admin: Admin panel → **Tarif so‘rovlari** → to‘lovni tekshirib **Faollashtirish (1 oy)**.
Muddat tugagach mijoz avtomatik Bepulga qaytadi.

## 5) Limitlar (`api/_plans.js`)
| | Bepul | Pro | Ferma |
|---|---|---|---|
| Hayvonlar | 10 | 50 | 200 |
| AI skan / oy | 5 | 100 | 400 |
| AI savol / oy | 30 | 600 | 2000 |
| Faol e’lon | 3 | 20 | 100 |
| CSV/PDF eksport | yo‘q | bor | bor |
Hayvonlar limiti bazada ham majburlanadi (`plan_animal_limit` — SQL). O‘zgartirsangiz ikkalasini bir xil qiling.
