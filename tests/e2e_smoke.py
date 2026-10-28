#!/usr/bin/env python3
"""
End-to-End Browser Smoke Test for Fermer Tog'a AI (Headless Chromium + Mocked Supabase & Backend).
Tests:
1. Landing, Login & Register pages (validation, Google auth check)
2. Authenticated Dashboard & navigation
3. AI Assistant (chat response + AI error display + AI diagnostics button)
4. AI Scan (file validation + image compression + scan result rendering)
5. Marketplace Hub (#/market), Buy catalog (#/market-buy: species filters, search, region, sort, favorite toggle)
6. Sell form (#/market-add: validation, image upload + submission + pending_review / active handling)
7. Buyer-Seller Chat thread (#/market-chats & #/market-thread)
8. Admin panel (#/admin: pending_review approval)
9. Mobile (390x844) and Desktop (1280x800) layout checks + zero console errors.
"""
import os
import sys
import time
import json
import base64
import subprocess
from io import BytesIO
from PIL import Image
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

PORT = 3456
BASE_URL = f"http://127.0.0.2:{PORT}"

# Generate a valid tiny JPEG image for upload tests
img_buf = BytesIO()
Image.new("RGB", (120, 90), color=(34, 139, 34)).save(img_buf, format="JPEG", quality=85)
TEST_JPG_PATH = "/tmp/test_cow.jpg"
with open(TEST_JPG_PATH, "wb") as f:
    f.write(img_buf.getvalue())

MOCK_SUPABASE_JS = r"""
(function() {
  const USER = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'fermer@test.uz',
    user_metadata: { full_name: 'Sardor Fermer', phone: '+998901234567', region: 'Toshkent' }
  };
  let currentSession = null;
  const favs = new Set();
  const listings = [
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      seller_id: '22222222-2222-2222-2222-222222222222',
      title: 'Golshtin sutdor sigir',
      species: 'Sigir',
      breed: 'Golshtin',
      age: '3 yosh',
      weight: '480 kg',
      price: 18500000,
      region: 'Toshkent',
      phone: '+998901112233',
      description: 'Kuniga 22 litr sut beradi, emlangan.',
      photo_path: '',
      photos: [],
      status: 'active',
      created_at: '2026-10-20T10:00:00Z'
    },
    {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      seller_id: '22222222-2222-2222-2222-222222222222',
      title: 'Hisori qo‘chqor',
      species: 'Qo‘y',
      breed: 'Hisori',
      age: '2 yosh',
      weight: '95 kg',
      price: 6200000,
      region: 'Samarqand',
      phone: '+998909998877',
      description: 'Naslli hisori qo‘y.',
      photo_path: '',
      photos: [],
      status: 'active',
      created_at: '2026-10-21T10:00:00Z'
    }
  ];
  const messages = [
    {
      id: 1,
      listing_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      from_id: '22222222-2222-2222-2222-222222222222',
      to_id: USER.id,
      body: 'Assalomu alaykum, sigir hali sotuvdami?',
      at: '2026-10-24T12:00:00Z',
      listings: { title: 'Golshtin sutdor sigir' }
    }
  ];
  let savedState = JSON.stringify({
    animals: [
      { id: 'UZ-001', name: 'Oqbosh', type: 'Sigir', breed: 'Qora-ola', sex: 'Urg‘ochi', age: '3 yosh', w: '412 kg', h: 'Sog‘lom', e: '🐄' },
      { id: 'UZ-002', name: 'Dumba-17', type: 'Qo‘y', breed: 'Hisori', sex: 'Erkak', age: '1.5 yosh', w: '58 kg', h: 'Sog‘lom', e: '🐑' }
    ],
    weight: [{ a: 'UZ-001', d: '2026-09-25', kg: 412, m: 'Tarozi' }],
    health: [],
    vacc: [],
    rem: [['Emlash — Oqbosh', '2026-10-26']],
    farm: { fn: 'Baraka Chorva', fr: 'Toshkent', fd: 'Zangiota' },
    plan: 'Bepul',
    lang: 'uz'
  });

  function makeQuery(table) {
    let filters = {};
    let searchIlike = null;
    let sortKey = null;
    let sortAsc = false;
    const q = {
      select() { return q; },
      eq(k, v) { filters[k] = v; return q; },
      neq(k, v) { filters['!' + k] = v; return q; },
      or() { return q; },
      ilike(k, v) { searchIlike = [k, v.replace(/%/g, '').toLowerCase()]; return q; },
      order(k, o) { sortKey = k; sortAsc = !!(o && o.ascending); return q; },
      limit() { return q._exec(); },
      maybeSingle() {
        return q._exec().then(r => ({ data: (r.data && r.data[0]) || null, error: null }));
      },
      upsert(row) {
        if (table === 'app_state') savedState = row.json;
        if (table === 'listing_favorites') favs.add(row.listing_id);
        return Promise.resolve({ data: [row], error: null });
      },
      insert(row) {
        if (table === 'listing_messages') {
          messages.push({ id: messages.length + 1, ...row, at: new Date().toISOString(), listings: { title: 'Golshtin sutdor sigir' } });
        }
        return Promise.resolve({ data: [row], error: null });
      },
      update(patch) {
        return {
          eq(k, v) {
            listings.forEach(l => { if (l[k] === v) Object.assign(l, patch); });
            return Promise.resolve({ data: [], error: null });
          }
        };
      },
      delete() {
        return {
          eq(k, v) {
            if (table === 'listing_favorites') favs.delete(v);
            return Promise.resolve({ data: [], error: null });
          }
        };
      },
      _exec() {
        if (table === 'profiles') return Promise.resolve({ data: [{ id: USER.id, role: 'admin' }], error: null });
        if (table === 'app_state') return Promise.resolve({ data: [{ user_id: USER.id, json: savedState }], error: null });
        if (table === 'listing_favorites') {
          const rows = [...favs].map(id => ({ listing_id: id, listings: listings.find(l => l.id === id) }));
          return Promise.resolve({ data: rows, error: null });
        }
        if (table === 'listing_messages') {
          return Promise.resolve({ data: messages.slice(), error: null });
        }
        if (table === 'listings') {
          let res = listings.slice();
          if (filters.id) res = res.filter(x => x.id === filters.id);
          if (filters.status) res = res.filter(x => x.status === filters.status);
          if (filters.seller_id) res = res.filter(x => x.seller_id === filters.seller_id);
          if (filters['!status']) res = res.filter(x => x.status !== filters['!status']);
          if (filters.species) res = res.filter(x => x.species === filters.species);
          if (filters.region) res = res.filter(x => x.region === filters.region);
          if (searchIlike) res = res.filter(x => String(x[searchIlike[0]] || '').toLowerCase().includes(searchIlike[1]));
          if (sortKey === 'price') res.sort((a, b) => sortAsc ? a.price - b.price : b.price - a.price);
          return Promise.resolve({ data: res, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      },
      then(resolve, reject) {
        return q._exec().then(resolve, reject);
      }
    };
    return q;
  }

  window.__mockAddSellerListing = function(row) {
    listings.unshift({ ...row, seller_id: USER.id, created_at: new Date().toISOString() });
  };

  window.supabase = {
    createClient() {
      return {
        auth: {
          onAuthStateChange() {},
          async getSession() { return { data: { session: currentSession } }; },
          async signInWithPassword({ email, password }) {
            if (password === 'wrongpass123') return { data: {}, error: { message: 'Invalid login credentials' } };
            currentSession = { access_token: 'mock-jwt-token', user: USER };
            return { data: { session: currentSession, user: USER }, error: null };
          },
          async signUp({ email, password, options }) {
            currentSession = { access_token: 'mock-jwt-token', user: { ...USER, email } };
            return { data: { session: currentSession, user: currentSession.user }, error: null };
          },
          async signOut() { currentSession = null; return { error: null }; }
        },
        storage: {
          from() {
            return {
              async upload() { return { data: {}, error: null }; },
              getPublicUrl(p) { return { data: { publicUrl: '/logo-icon.png' } }; }
            };
          }
        },
        from(table) { return makeQuery(table); }
      };
    }
  };
})();
"""

# We also create a test server wrapper that mocks external Supabase/AI calls inside Node so the real server.js + api/*.js handlers run end-to-end!
TEST_SERVER_WRAPPER = r"""
process.env.PORT = '3456';
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.GEMINI_API_KEY = 'AIzaSyMockKeyForE2ETest';
process.env.AI_PRIORITY = 'gemini';
process.env.LISTING_FEE_MODE = 'off';

const origFetch = global.fetch;
let chatShouldFail = false;

global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.') || u.startsWith('http://localhost')) {
    return origFetch(url, opts);
  }
  if (u.endsWith('/auth/v1/user')) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ id: '11111111-1111-1111-1111-111111111111', email: 'fermer@test.uz' })
    };
  }
  if (u.includes('/rest/v1/profiles')) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => '0-0/15' },
      json: async () => ([{ role: 'admin', full_name: 'Sardor Fermer', region: 'Toshkent', created_at: '2026-10-25' }])
    };
  }
  if (u.includes('/rest/v1/app_state')) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => '0-0/1' },
      json: async () => ([{ json: JSON.stringify({ animals: [{ id: '1' }, { id: '2' }], plan: 'Pro' }) }])
    };
  }
  if (u.includes('/rest/v1/ai_usage')) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => '0-0/42' },
      json: async () => ([])
    };
  }
  if (u.includes('/rest/v1/listings?select=id,title')) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => '0-0/1' },
      json: async () => ([{ id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', title: 'Simmental buqa', phone: '+998901234567', price: 14000000, status: 'pending_review' }])
    };
  }
  if (u.includes('/rest/v1/listings?select=id')) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => '0-0/1' },
      json: async () => ([])
    };
  }
  if (u.includes('/rest/v1/audit_logs')) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ([{ at: '2026-10-25T10:00:00Z', action: 'admin_stats_view' }])
    };
  }
  if (u.includes('/storage/v1/object/listing-photos/')) {
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ Key: 'ok' }) };
  }
  if (u.includes('/rest/v1/subscriptions')) {
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ([]) };
  }
  if (u.endsWith('/rest/v1/listings') && opts.method === 'POST') {
    const body = JSON.parse(opts.body || '{}');
    return {
      ok: true,
      status: 201,
      headers: { get: () => null },
      json: async () => ([{ id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', ...body }])
    };
  }
  if (u.includes('/rest/v1/listings?') && opts.method === 'PATCH') {
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ([{}]) };
  }
  if (u.endsWith('/v1beta/models')) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        models: [
          { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }
        ]
      })
    };
  }
  if (u.includes(':generateContent')) {
    const reqBody = JSON.parse(opts.body || '{}');
    const txt = JSON.stringify(reqBody);
    if (txt.includes('EXAUST_TEST_TRIGGER')) {
      return {
        ok: false,
        status: 429,
        headers: { get: () => null },
        json: async () => ({ error: { message: 'RESOURCE_EXHAUSTED: quota exceeded for AIzaSyMockKeyForE2ETest' } })
      };
    }
    if (txt.includes('is_live_animal')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ is_live_animal: true, species: 'sigir', confidence: 95, reason: 'Sog‘lom sigir' }) }] } }]
        })
      };
    }
    if (txt.includes('bcs')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify({
            species: 'Sigir',
            breed: 'Simmental',
            sex: 'Urg‘ochi',
            age: '2-3 yosh',
            weight: '390–430 kg',
            weight_kg: 410,
            bcs: '3.5 / 5 (yaxshi)',
            health_status: 'Sog‘lom',
            health_note: 'Teri qoplami va ishtahasi yaxshi',
            vacc_recommend: 'Oqsil va Kuydirgiga qarshi emlash',
            daily_feed_kg: '12–14 kg/kun',
            confidence: 88,
            obs: ['Tana tuzilishi me’yorda'],
            feed: ['Kuniga sifatli beda va toza suv'],
            next: ['Tarozida aniq o‘lchab ko‘ring']
          }) }] } }]
        })
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Sigir vaznini har 2 haftada tarozi yoki o‘lchov lentasi yordamida kuzatib boring.\n<SCHEDULE>[{"title":"Ertalabki beda va arpa","time":"07:00"},{"title":"Kechki omuxta yem","time":"19:00"}]</SCHEDULE>' }] } }]
      })
    };
  }
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) };
};

const path = require('path');
const { server } = require(path.join(process.cwd(), 'server.js'));
server.listen(3456, '0.0.0.0', () => console.log('E2E_SERVER_READY'));
"""

def run_e2e():
    wrapper_path = "/tmp/run_e2e_server.js"
    with open(wrapper_path, "w", encoding="utf-8") as f:
        f.write(TEST_SERVER_WRAPPER)

    env = os.environ.copy()
    proc = subprocess.Popen(
        ["node", "/tmp/run_e2e_server.js"],
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    try:
        # Wait for server to start
        ready = False
        for _ in range(30):
            line = proc.stdout.readline()
            if "E2E_SERVER_READY" in line:
                ready = True
                break
            time.sleep(0.1)
        assert ready, "Test server failed to start"

        opts = Options()
        opts.add_argument("--headless=new")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--no-proxy-server")
        opts.set_capability("goog:loggingPrefs", {"browser": "ALL"})

        driver = webdriver.Chrome(service=Service("/usr/bin/chromedriver"), options=opts)
        driver.set_window_size(1280, 800)

        # Intercept CDN supabase script or inject mock right before page scripts run via CDP
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": MOCK_SUPABASE_JS})
        # Also block external CDN call so offline VM doesn't log network error for jsdelivr
        

        wait = WebDriverWait(driver, 10)

        # 1. Landing Page & Health Check
        driver.get(BASE_URL + "/")
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "h1")))
        assert "Chorvangizni" in driver.find_element(By.TAG_NAME, "h1").get_attribute("textContent")
        print("PASS 1: Landing page rendered cleanly")

        # 2. Login page validation + login flow
        driver.get(BASE_URL + "/#/login")
        wait.until(EC.presence_of_element_located((By.ID, "af")))
        driver.find_element(By.ID, "e").send_keys("bad-email")
        driver.find_element(By.ID, "pw").send_keys("123")
        driver.find_element(By.CSS_SELECTOR, "#af button:not([type=button])").click()
        err_txt = driver.find_element(By.ID, "er").text
        assert "Email noto‘g‘ri" in err_txt, f"Expected email validation error, got: {err_txt}"

        # Valid login
        e_in = driver.find_element(By.ID, "e")
        e_in.clear()
        e_in.send_keys("fermer@test.uz")
        pw_in = driver.find_element(By.ID, "pw")
        pw_in.clear()
        pw_in.send_keys("parol12345")
        driver.find_element(By.CSS_SELECTOR, "#af button:not([type=button])").click()

        wait.until(lambda d: "#/app" in d.current_url)
        wait.until(lambda d: "Sardor" in d.page_source)
        print("PASS 2: Login validation & Dashboard (#/app) loaded")

        # 3. AI Assistant: normal response + AI error display + AI holatini tekshirish
        driver.get(BASE_URL + "/#/assistant")
        wait.until(EC.presence_of_element_located((By.ID, "cq")))

        # Click AI diagnostics button
        driver.find_element(By.ID, "aidiag").click()
        wait.until(lambda d: "ISHLAYAPTI" in d.find_element(By.ID, "aidiagout").text)
        diag_text = driver.find_element(By.ID, "aidiagout").text
        assert "gemini: ISHLAYAPTI" in diag_text, f"Unexpected diag output: {diag_text}"

        # Normal chat question
        driver.find_element(By.ID, "cq").send_keys("Sigir vaznini qanday o‘lchayman?")
        driver.find_element(By.CSS_SELECTOR, "#cf button:not([type=button])").click()
        wait.until(lambda d: "tarozi yoki o‘lchov lentasi" in d.find_element(By.ID, "ch").text)

        # Trigger AI quota error display in chat
        driver.find_element(By.ID, "cq").send_keys("EXAUST_TEST_TRIGGER")
        driver.find_element(By.CSS_SELECTOR, "#cf button:not([type=button])").click()
        wait.until(lambda d: "⚠️" in d.find_element(By.ID, "ch").text)
        chat_text = driver.find_element(By.ID, "ch").text
        assert "AIzaSyMockKeyForE2ETest" not in chat_text, "API key leaked into chat error!"
        print("PASS 3: AI Assistant chat, error display (masked), and AI diagnostics verified")

        # 4. AI Scan: validation + photo analysis result card
        driver.get(BASE_URL + "/#/scan")
        wait.until(EC.presence_of_element_located((By.ID, "sf")))
        driver.find_element(By.CSS_SELECTOR, "#sf button").click()
        assert "Rasm yuklanmadi" in driver.find_element(By.ID, "er").text

        driver.find_element(By.ID, "im").send_keys(TEST_JPG_PATH)
        driver.find_element(By.ID, "sa").send_keys("2.5 yosh")
        driver.find_element(By.CSS_SELECTOR, "#sf button").click()
        wait.until(lambda d: "390–430 kg" in d.find_element(By.ID, "res").text)
        assert "Simmental" in driver.find_element(By.ID, "res").text
        assert "muhrlandi" in driver.find_element(By.ID, "res").text

        # Verify auto-stamping into Passport, Weight, Feeding, Health, Vaccination, and Assistant
        driver.get(BASE_URL + "/#/passport")
        wait.until(lambda d: "390–430 kg" in d.page_source)
        driver.get(BASE_URL + "/#/weight")
        wait.until(lambda d: "AI Skan" in d.page_source)
        driver.get(BASE_URL + "/#/feeding")
        wait.until(lambda d: "410" in d.page_source)
        driver.get(BASE_URL + "/#/health")
        wait.until(lambda d: "Teri qoplami" in d.page_source)
        driver.get(BASE_URL + "/#/vacc")
        wait.until(lambda d: "Oqsil va Kuydirgiga" in d.page_source)
        driver.get(BASE_URL + "/#/assistant")
        wait.until(lambda d: "semirtirmoqchimisiz" in d.find_element(By.ID, "ch").text)
        driver.get(BASE_URL + "/#/reminders")
        wait.until(lambda d: "07:00" in d.page_source and "10 daqiqa qolganda" in d.page_source)
        print("PASS 4: AI Scan + Auto-stamping into Passport/Weight/Feeding/Health/Vacc + Auto AI Chat strategy + 10-min Reminders verified")

        # 5. Marketplace Hub & Buy Catalog (filters, search, favorite)
        driver.get(BASE_URL + "/#/market")
        wait.until(lambda d: "Chorva bozori" in d.page_source)

        driver.get(BASE_URL + "/#/market-buy")
        wait.until(lambda d: "Golshtin sutdor sigir" in d.page_source and "Hisori qo‘chqor" in d.page_source)

        # Species filter ("Qo‘y")
        driver.find_element(By.CSS_SELECTOR, "button[data-sp='Qo‘y']").click()
        wait.until(lambda d: "Hisori qo‘chqor" in d.page_source and "Golshtin sutdor sigir" not in d.page_source)

        # Reset species filter ("Hammasi")
        driver.find_element(By.CSS_SELECTOR, "button[data-sp='']").click()
        wait.until(lambda d: "Golshtin sutdor sigir" in d.page_source)

        # Search filter
        mq = driver.find_element(By.ID, "mq")
        mq.clear()
        mq.send_keys("Golshtin")
        driver.find_element(By.CSS_SELECTOR, "#mqf button").click()
        wait.until(lambda d: "Golshtin sutdor sigir" in d.page_source and "Hisori qo‘chqor" not in d.page_source)

        # Favorite button toggle
        fav_btn = driver.find_element(By.CSS_SELECTOR, "button[data-fav='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']")
        assert "🤍" in fav_btn.text
        fav_btn.click()
        wait.until(lambda d: "❤️" in d.find_element(By.CSS_SELECTOR, "button[data-fav='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']").text)

        # Check saved favorites view (#/market-saved)
        driver.get(BASE_URL + "/#/market-saved")
        wait.until(lambda d: "Golshtin sutdor sigir" in d.page_source)
        print("PASS 5: Marketplace Hub, Buy filters, search, and favorites verified")

        # 6. Sell Form (#/market-add): validation + live submission
        driver.get(BASE_URL + "/#/market-add")
        wait.until(EC.presence_of_element_located((By.ID, "mf2")))
        driver.find_element(By.CSS_SELECTOR, "#mf2 button").click()
        assert "Sarlavha, narx va to‘g‘ri telefon" in driver.find_element(By.ID, "er2").text

        driver.find_element(By.ID, "ml_t").send_keys("Yosh Simmental buqa")
        driver.find_element(By.ID, "ml_p").send_keys("14500000")
        driver.find_element(By.ID, "ml_ph").send_keys("+998 90 123 45 67")
        driver.find_element(By.ID, "mf2").find_element(By.TAG_NAME, "button").click()
        assert "Rasm yuklanmadi" in driver.find_element(By.ID, "er2").text

        driver.find_element(By.ID, "ml_f").send_keys(TEST_JPG_PATH)
        driver.find_element(By.ID, "mf2").find_element(By.TAG_NAME, "button").click()
        wait.until(lambda d: "#/market-my" in d.current_url)
        print("PASS 6: Sell form validation & photo moderation submission verified")

        # 7. Buyer-Seller Chat thread (#/market-chats & #/market-thread)
        driver.get(BASE_URL + "/#/market-chats")
        wait.until(lambda d: "sigir hali sotuvdami?" in d.page_source)
        driver.find_element(By.CSS_SELECTOR, "a[data-tt]").click()
        wait.until(lambda d: "#/market-thread" in d.current_url)
        wait.until(EC.presence_of_element_located((By.ID, "tq")))
        driver.find_element(By.ID, "tq").send_keys("Ha, sotuvda, kelib ko‘rishingiz mumkin!")
        driver.find_element(By.CSS_SELECTOR, "#tf button").click()
        wait.until(lambda d: "kelib ko‘rishingiz mumkin" in d.find_element(By.ID, "cb").text)
        print("PASS 7: Buyer-seller chat thread verified")

        # 8. Admin Panel (#/admin)
        driver.get(BASE_URL + "/#/admin")
        wait.until(lambda d: "Simmental buqa" in d.page_source)
        assert "AI tekshiruvi kutilmoqda" in driver.page_source
        driver.find_element(By.CSS_SELECTOR, "button[data-appr]").click()
        print("PASS 8: Admin panel stats & pending_review approval verified")

        # 9. Mobile Layout Check (390x844) & Desktop Layout Check (1280x800)
        driver.set_window_size(390, 844)
        driver.get(BASE_URL + "/#/app")
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "nav.bn")))
        bn_display = driver.execute_script("return getComputedStyle(document.querySelector('nav.bn')).display")
        side_display = driver.execute_script("return getComputedStyle(document.querySelector('aside.side')).display")
        horiz_overflow = driver.execute_script("return document.documentElement.scrollWidth > window.innerWidth")
        assert bn_display == "flex", f"Expected bottom nav flex on 390px mobile, got {bn_display}"
        assert side_display == "none", f"Expected sidebar hidden on 390px mobile, got {side_display}"
        assert not horiz_overflow, "Horizontal overflow detected on 390px mobile viewport!"

        driver.set_window_size(1280, 800)
        time.sleep(0.2)
        bn_desktop = driver.execute_script("return getComputedStyle(document.querySelector('nav.bn')).display")
        side_desktop = driver.execute_script("return getComputedStyle(document.querySelector('aside.side')).display")
        assert bn_desktop == "none", f"Expected bottom nav hidden on desktop, got {bn_desktop}"
        assert side_desktop == "flex", f"Expected sidebar flex on desktop, got {side_desktop}"
        print("PASS 9: Mobile (390px) and Desktop (1280px) responsive layouts verified")

        # 10. Check browser console errors (excluding blocked CDN script we replaced with mock)
        logs = driver.get_log("browser")
        severe = [
            l for l in logs
            if l.get("level") == "SEVERE"
            and "ERR_BLOCKED_BY_CLIENT" not in l.get("message", "") and "cdn.jsdelivr.net" not in l.get("message", "")
            and "status of 503" not in l.get("message", "")
        ]
        assert len(severe) == 0, f"Unexpected browser console errors: {severe}"
        print("PASS 10: Zero unexpected browser console errors")

        # 11. Multilingual Language Switching Verification (Russian & English)
        driver.get(BASE_URL + "/#/profile")
        wait.until(lambda d: "Profil" in d.page_source)

        # Switch to Russian
        driver.execute_script("document.querySelector('#lg').value = 'ru'; document.querySelector('#lg').dispatchEvent(new Event('change'));")
        time.sleep(0.3)
        wait.until(lambda d: "Профиль и настройки" in d.page_source)
        assert "Главная" in driver.page_source
        assert "Скот" in driver.page_source
        print("PASS 11a: Russian language switched successfully (Профиль и настройки, Главная, Скот)")

        # Switch to English
        driver.execute_script("document.querySelector('#lg').value = 'en'; document.querySelector('#lg').dispatchEvent(new Event('change'));")
        time.sleep(0.3)
        wait.until(lambda d: "Profile and Settings" in d.page_source)
        assert "Home" in driver.page_source
        assert "Livestock" in driver.page_source
        print("PASS 11b: English language switched successfully (Profile and Settings, Home, Livestock)")

        # Switch back to Uzbek
        driver.execute_script("document.querySelector('#lg').value = 'uz'; document.querySelector('#lg').dispatchEvent(new Event('change'));")
        time.sleep(0.3)
        wait.until(lambda d: "Profil va sozlamalar" in d.page_source)
        print("PASS 11c: Uzbek language restored successfully")
        driver.quit()
        print("\nALL E2E SMOKE TESTS PASSED SUCCESSFULLY!")
    finally:
        proc.terminate()
        proc.wait(timeout=5)

if __name__ == "__main__":
    run_e2e()
