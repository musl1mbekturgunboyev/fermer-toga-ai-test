# fermertoga.uz — Google va Yandex

Ushbu fayllar Renderga deploy qilingandan keyin ishga tushadi. Domen ulanganining o‘zi yangi kodni yuklamaydi.

1. Yangilangan loyiha fayllarini Render ulangan GitHub repozitoriyga yuklang. .env va .env.local fayllarini yuklamang. Render Environment qiymatlarini saqlang.
2. Render → Manual Deploy → Deploy latest commit (Auto Deploy yoqilgan bo‘lsa avtomatik).
3. https://fermertoga.uz/robots.txt matn, https://fermertoga.uz/sitemap.xml XML ko‘rsatishini tekshiring.
4. Google Search Console → Файлы Sitemap → https://fermertoga.uz/sitemap.xml → Отправить.
5. Yandex Webmaster → Индексирование → Файлы Sitemap → shu to‘liq manzilni qo‘shing.
6. Google URL inspection orqali bosh sahifa o‘zgarganidan so‘ng bir marta qayta indekslash so‘rang.

Sitemap faqat ochiq bosh sahifani o‘z ichiga oladi. # bilan ochiladigan ilova bo‘limlari alohida indekslanadigan sahifalar emas. Shaxsiy profil, chat, admin va API sitemapga kiritilmagan. robots.txt kirish himoyasi emas; mavjud autentifikatsiya saqlangan.

Canonical asosiy domenni ko‘rsatadi. Boshlang‘ich HTMLda mazmunli sarlavha va qisqa matn bor; JavaScript ishga tushgach mavjud ilova odatdagidek chiziladi. WebSite JSON-LD yolg‘on reyting va sharhlarsiz berilgan. SEO qidiruvda chiqish yoki birinchi o‘rinni kafolatlamaydi.
