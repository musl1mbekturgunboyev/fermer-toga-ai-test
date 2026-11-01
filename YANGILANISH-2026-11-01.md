# Ozuqa bozori va bildirishnomalar

Butun loyiha fayllarini repozitoriyga yangilang; faqat index.html yetarli emas. Render Environment qiymatlarini saqlang. Build: npm ci; Start: npm start. Manual Deploy → Deploy latest commit. Node 22 tavsiya etiladi.

Fermer tog‘a test bazasiga feed-reminders va minutlik scheduler migratsiyalari qo‘llandi. Shu bazada qayta SQL bajarish shart emas. Boshqa baza uchun avval supabase/feed-reminders.sql, keyin supabase/reminder-scheduler.sql. Scheduler manzilini o‘z domeningizga moslang.

Eslatmalar Toshkent vaqti (UTC+5) bo‘yicha serverdan har daqiqa tekshiriladi. Sana, vaqt va oldindan ogohlantirishni tanlab saqlang. Har qurilmada Eslatmalar → Bildirishnomani yoqish → Test xabari. iPhone: Safari → Ulashish → Bosh ekranga qo‘shish; o‘sha belgidan ochib ruxsat bering (iOS 16.4+). Internet va tizim ruxsati kerak; OS yoki tarmoq xabarni kechiktirishi mumkin. Sinov haqiqiy push xabarini yuboradi, soxta muvaffaqiyat ko‘rsatmaydi.

Ozuqa bozori: rasm, narx, birlik, hudud va telefon bilan e’lon. Admin tasdiqlagach xaridorlarga chiqadi. Admin → Ozuqa e’lonlari.

AI javobini kutayotganda kichik “Javob tayyorlanmoqda…” animatsiyasi ko‘rinadi; bir savol takror yuborilmaydi.

Push yuborish Node/Render serveri va web-push paketiga mo‘ljallangan. Sites Worker nusxasida Node web-push kutubxonasi mavjud emas. Render deployidan so‘ng telefonda haqiqiy yetkazilishni sinab ko‘ring.
