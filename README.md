# Fermer Tog‘a AI — Production ishga tushirish qo‘llanmasi

**Tuzilma:** `server.js` (Node HTTP server + `/healthz` + kunlik cron) · `public/index.html` (vanilla JS SPA, o‘zbek tilida) · `api/*` (AI qatlami, rasm tahlili, bozor moderatsiyasi, admin panel) · `supabase/schema.sql` (PostgreSQL + RLS + Storage).

---

## Bosqichma-bosqich sozlash tartibi (Aniq ketma-ketlik)

### 1-qadam: Supabase ma’lumotlar bazasi va SQL migratsiya
1. [supabase.com](https://supabase.com) da yangi loyiha yarating (tavsiya etiladigan region: **Frankfurt** yoki **Mumbai**).
2. **SQL Editor** bo‘limiga kiring va `supabase/schema.sql` faylini **boshidan oxirigacha** nusxalab ishga tushiring (`Run`).
   - Agar baza avval yaratilgan bo‘lsa, faqat oxiridagi **`v1.4` migratsiya** qismini ishga tushiring:
     ```sql
     alter table listings drop constraint if exists listings_status_check;
     alter table listings add constraint listings_status_check check(status in('pending_payment','pending_review','active','sold','removed'));
     alter table farm_members enable row level security;
     alter table feed_items enable row level security;
     ```
3. **Project Settings → API** bo‘limidan quyidagilarni nusxalab oling:
   - `Project URL` (`SUPABASE_URL`)
   - `anon public` kaliti (`SUPABASE_ANON_KEY`)
   - `service_role secret` kaliti (`SUPABASE_SERVICE_ROLE_KEY` — **faqat serverga qo‘yiladi!**)

### 2-qadam: AI kalitlari (Gemini va/yoki OpenAI)
1. **Google Gemini:** [aistudio.google.com/apikey](https://aistudio.google.com/apikey) dan API kalit oling (`GEMINI_API_KEY`).
   - Bepul (Free tier) kvotasi daqiqasiga/kuniga cheklangan va ba’zan Google serverlari `503` qaytarishi mumkin. Barqaror ishlash uchun Google AI Studio’da **Pay-as-you-go (Tier 1 billing)** ni yoqing.
   - Standart tez va arzon modellar: `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.8-flash`.
2. **OpenAI (ixtiyoriy, lekin zaxira sifatida juda tavsiya etiladi):** [platform.openai.com](https://platform.openai.com) da API kalit yarating (`OPENAI_API_KEY`) va $5 balans qo‘shing. Shunda Gemini band bo‘lsa ham tizim uzluksiz ishlaydi.

### 3-qadam: Render’da joylash va Environment Variables
1. GitHub repozitoriyangizni [render.com](https://render.com) → **New → Web Service** (yoki **Blueprint** orqali `render.yaml`) ga ulang.
2. **Region tanlash (MUHIM):** Render xizmatini **Oregon (US West)** yoki **Ohio (US East)** regionida yarating. Yevropa/Osiyo IP manzillarida Gemini API ba’zan hududiy cheklov (`User location is not supported`) yoki yuqori kechikish berishi mumkin.
   - *Agar xizmat boshqa regionda yaratilgan bo‘lsa:* Render’da yangi Web Service’ni **Oregon (US West)** da ochib, Environment Variables’ni ko‘chirib o‘tkazing.
3. **Environment Variables** bo‘limiga `.env.example` dagi o‘zgaruvchilarni qo‘shtirnoqsiz va bo‘sh joysiz kiriting:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-2.5-flash-lite`, `AI_PRIORITY=gemini,openai`
   - `LISTING_FEE_MODE=off` (bepul) yoki `manual` (10 000 so‘m, admin tasdiqlaydi)
   - `CRON_SECRET` (ixtiyoriy uzun maxfiy satr)
4. **Health Check Path:** `/healthz`

### 4-qadam: Supabase URL Configuration
1. Render deploy tugagach, saytingiz manzili (masalan, `https://fermer-toga-ai.onrender.com`) tayyor bo‘ladi.
2. **Supabase → Authentication → URL Configuration** bo‘limiga kiring:
   - **Site URL:** `https://fermer-toga-ai.onrender.com` (yoki shaxsiy domeningiz)
   - **Redirect URLs:** `https://fermer-toga-ai.onrender.com/**` va `http://localhost:3000/**` ni qo‘shib saqlang.

### 5-qadam: Google OAuth (Google orqali kirish)
1. [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials → Create Credentials → OAuth client ID** (Web application).
2. **Authorized redirect URIs** ga Supabase callback manzilini qo‘shing:
   `https://<SIZNING-SUPABASE-ID>.supabase.co/auth/v1/callback`
3. Olingan `Client ID` va `Client Secret` ni **Supabase → Authentication → Providers → Google** bo‘limiga yoqib kiriting.

### 6-qadam: Shaxsiy domen (Custom Domain) ulash
1. **Render → Settings → Custom Domains** bo‘limiga domeningizni (masalan, `fermertoga.uz` va `www.fermertoga.uz`) qo‘shing.
2. Domen DNS panelida Render ko‘rsatgan `A` va `CNAME` yozuvlarini kiriting. Render SSL (HTTPS) sertifikatni avtomatik beradi.
3. Domen ulangach, **Supabase → Authentication → URL Configuration → Site URL** ni yangi domenga yangilang.

### 7-qadam: Birinchi Administratorni tayinlash
1. Saytdan oddiy foydalanuvchi sifatida ro‘yxatdan o‘ting.
2. **Supabase → SQL Editor** da quyidagi so‘rovni ishga tushiring:
   ```sql
   update profiles set role='admin' where id='<FOYDALANUVCHI_UUID>';
   ```

---

## Muhim funksiyalar va AI zaxira tartibi (v1.4)
- **AI barqarorligi (`api/_ai.js`):** Har bir model urinishi uchun `14s` taymaut, umumiy so‘rov uchun `45s` chegara (Render `100s` da uzmasligi uchun). `503` xatosida 1 marta tezkor qayta urinish, `404/429/5xx/TimeoutError` holatida keyingi modelga (`gemini-2.5-flash-lite` → `gemini-2.5-flash` → `gemini-3.5-flash-lite` → `gemini-3.8-flash`) va keyingi provayderga avtomatik o‘tish ishlaydi.
- **Bozor e’lonlari to‘xtab qolmaydi (`pending_review`):** Agar foydalanuvchi e’lon joylayotganda barcha AI provayderlar vaqtincha ishlamayotgan bo‘lsa, e’lon `503` xato bilan yo‘qolmaydi — rasm saqlanib, e’lon **`pending_review`** (*Tekshiruvda (admin)*) holatida bazaga yoziladi. Administrator **Admin panel** orqali uni bir tugma bilan **Tasdiqlash** (`active`) yoki **Rad etish** (`removed`) mumkin.
- **Tashxis:** **AI Scan** yoki **AI yordamchi** sahifasidagi **"AI holatini tekshirish"** tugmasi (`/api/ai-test`) har bir provayder, javob vaqti (`ms`) va kalit uchun ochiq Gemini modellar ro‘yxatini ko‘rsatadi.
- **Testlar:**
  - Backend unit/integratsiya testlari: `npm test`
  - E2E brauzer (desktop + 390px mobil) smoke testlari: `npm run test:e2e`
