# HSTS va CSP yangilanishi — 10 noyabr 2026

## O‘zgartirishlar
- security-headers.js: umumiy sarlavhalar va index.html ichidagi aniq skriptlar uchun SHA-256 hashlar.
- server.js: HTML, API va xato javoblariga umumiy sarlavhalar, jumladan Strict-Transport-Security: max-age=31536000.
- script-src ichidagi unsafe-inline olib tashlandi. Inline skriptlar o‘z holida saqlandi, ular hash orqali ishlaydi.
- script-src-attr 'none' va object-src 'none' qo‘shildi.
- style-src unsafe-inline saqlandi: hozirgi dizayn inline CSS ishlatadi. ZAP uslublar uchun ogohlantirish ko‘rsatishi mumkin.
- vercel.json va Worker build ham bir xil siyosatni qo‘llaydi.
- scripts/sync-security-headers.cjs: Vercel uchun hashlarni yangilash.
- tests/security-headers.test.js: sarlavhalar, hashlar va Vercel mosligi tekshiriladi.

## O‘z loyihangizga joylash
1. ZIPni yangi papkaga oching. Uning ichidagi loyiha fayllarini VS Code’dagi mavjud loyihangizga nusxalab, almashtiring. Butun eski papkani o‘chirmang: mahalliy .env va .git saqlanishi kerak.
2. server.js bilan birga yangi security-headers.js fayli ham loyiha ildiziga tushganiga ishonch hosil qiling.
3. VS Code terminalida tekshiring:

    npm test
    git status --short

4. Faqat shu yangilanish fayllarini Gitga qo‘shing:

    git add server.js security-headers.js vercel.json package.json scripts/sync-security-headers.cjs scripts/build-worker.cjs tests/security-headers.test.js SECURITY_UPDATE_UZ.md
    git commit -m "Add HSTS and restrict inline scripts with CSP hashes"
    git push

5. Render auto deploy tugashini kuting. Render’da oldindan saqlangan environment o‘zgaruvchilarini qoldiring. Agar auto deploy o‘chiq bo‘lsa, Render’da Deploy latest commit bosing.
6. Yangi brauzer oynasida sayt, kirish, bozor, AI scan va profilni sinab ko‘ring.
7. Terminalda tekshiring:

    curl -sS -D - -o /dev/null https://fermertoga.uz

200 javobda Strict-Transport-Security: max-age=31536000 bo‘lishi kerak. CSP script-src qismida sha256-... bo‘ladi, unsafe-inline bo‘lmaydi. style-src qismida unsafe-inline qolishi kutiladi.

## Keyingi kod o‘zgarishlari
Render Node server har ishga tushganda HTMLdan hashlarni qayta hisoblaydi. HTMLni yangilagandan keyin serverni qayta ishga tushiring/deploy qiling.
Vercelga joylashdan oldin `npm run security:headers` bajaring va yangilangan vercel.json’ni commit qiling. Worker build hashlarni build paytida hisoblaydi.
HTMLni deploydan so‘ng CDN orqali minifikatsiya qilish yoki unga skript qo‘shish hashlarni buzishi mumkin; bunday transformatsiya bo‘lsa, o‘chirib qayta tekshiring.

## Tekshiruv va chegaralar
54 ta Node testi o‘tdi, shu jumladan uchta yangi xavfsizlik testi. Brauzer sinovi muhitdagi socket cheklovi sabab ishga tushmadi; real login, AI xizmatlari va vizual oqimlar tekshirilgani yo‘q.
Bu yangilanish akkauntlar orasidagi ruxsatlarni tekshirmaydi yoki o‘zgartirmaydi. A/B akkaunt va baza ruxsatlari alohida tekshirilishi kerak.
Render uyqudan uyg‘onayotganda qaytaradigan 503 sahifasi ilova kodidan tashqarida; undagi sarlavhalarni bu kod boshqarmaydi.
HSTS faqat asosiy hostga qo‘llanadi, subdomenlar/preload yoqilmadi.

## Rasmiy manbalar
https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src
https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security
