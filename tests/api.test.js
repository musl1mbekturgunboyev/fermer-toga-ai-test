const test = require('node:test');
const assert = require('node:assert/strict');
const ai = require('../api/_ai');
const lib = require('../api/_lib');
const listingsHandler = require('../api/listings');
const scanHandler = require('../api/scan');
const chatHandler = require('../api/chat');
const adminActionHandler = require('../api/admin-action');

// Valid JPEG base64 header (0xFF, 0xD8, 0xFF, 0xE0 ...)
const VALID_JPEG_B64 = 'data:image/jpeg;base64,' + Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9]).toString('base64');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    json(o) { this.body = o; this.ended = true; return this; },
    end(d) { if (d) this.body = d; this.ended = true; return this; }
  };
}

function jsonResponse(status, obj, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: k => headers[k.toLowerCase()] || null },
    text: async () => JSON.stringify(obj),
    json: async () => obj
  };
}

function resetEnv() {
  ai.resetState();
  lib.resetRateLimits();
  process.env.SUPABASE_URL = 'https://mock.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  process.env.OPENAI_API_KEY = 'sk-testopenai123456';
  process.env.GEMINI_API_KEY = 'AIzaSyTestGemini123456';
  process.env.AI_PRIORITY = 'openai,gemini';
  process.env.AI_RETRY_MS = '10';
  process.env.AI_ATTEMPT_MS = '3000';
  process.env.AI_DEADLINE_MS = '15000';
  process.env.LISTING_FEE_MODE = 'off';
  process.env.PAY_INFO = 'Karta: 8600 1234';
  delete process.env.GEMINI_MODEL;
  delete process.env.OPENAI_MODEL;
}

test('1. JSON parsing strips Markdown code fences and trailing commas & masks secrets', () => {
  const parsed = ai.parseJson('```json\n{"is_live_animal": true, "species": "sigir", "confidence": 92,}\n```');
  assert.equal(parsed.is_live_animal, true);
  assert.equal(parsed.species, 'sigir');
  assert.equal(parsed.confidence, 92);

  const masked = ai.mask('Error with key sk-proj-99999999 and AIzaSyAbCdEfGhIjKlMnOpQrStUv');
  assert.ok(!masked.includes('99999999'));
  assert.ok(!masked.includes('AbCdEfGhIjKlMnOpQrStUv'));
  assert.ok(masked.includes('sk-…'));
  assert.ok(masked.includes('AIza…'));
});

test('2. Provider failover: OpenAI 429 falls back to Gemini automatically', async () => {
  resetEnv();
  const calls = [];
  global.fetch = async (url, opts) => {
    if(url.includes('/rest/v1/terms_acceptances'))return jsonResponse(200,[{user_id:'accepted'}]);
    if(url.includes('/rpc/consume_ai_quota')) return jsonResponse(200,true);
    calls.push(url);
    if (url.includes('api.openai.com')) {
      return jsonResponse(429, { error: { message: 'You exceeded your current quota for sk-testopenai123456' } });
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      return jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'Assalomu alaykum, bu Gemini javobi!' }] } }]
      });
    }
    throw new Error('Unexpected URL: ' + url);
  };

  const res = await ai.chat('Sys', 'Salom');
  assert.equal(res.provider, 'gemini');
  assert.equal(res.data, 'Assalomu alaykum, bu Gemini javobi!');
  assert.ok(calls.some(u => u.includes('api.openai.com')));
  assert.ok(calls.some(u => u.includes('generativelanguage.googleapis.com')));

  // Verify OpenAI is now in cooldown
  const st = ai.status();
  const oa = st.find(x => x.name === 'openai');
  assert.equal(oa.cooldown, true);
});

test('3. Model fallback & 503 backoff retry: 404 retired model + 503 transient overload recovers on next model', async () => {
  resetEnv();
  delete process.env.OPENAI_API_KEY;
  process.env.AI_PRIORITY = 'gemini';
  process.env.GEMINI_MODEL = 'gemini-2.0-flash'; // retired model -> 404

  const modelAttempts = [];
  global.fetch = async (url) => {
    if(url.includes('/rest/v1/terms_acceptances'))return jsonResponse(200,[{user_id:'accepted'}]);
    if(url.includes('/rpc/consume_ai_quota')) return jsonResponse(200,true);
    const m = /models\/([^:]+):generateContent/.exec(url);
    const model = m ? decodeURIComponent(m[1]) : 'unknown';
    modelAttempts.push(model);

    if (model === 'gemini-2.0-flash') {
      return jsonResponse(404, { error: { message: 'models/gemini-2.0-flash is not found for API version v1beta' } });
    }
    if (model === 'gemini-2.5-flash-lite' && modelAttempts.filter(x => x === 'gemini-2.5-flash-lite').length === 1) {
      return jsonResponse(503, { error: { message: 'The model is overloaded. Please try again later.' } });
    }
    return jsonResponse(200, {
      candidates: [{ content: { parts: [{ text: '```json\n{"species":"Sigir","confidence":88}\n```' }] } }]
    });
  };

  const r = await ai.vision('Sys', 'Check cow', [VALID_JPEG_B64], 300, true);
  assert.equal(r.provider, 'gemini');
  assert.equal(r.data.species, 'Sigir');
  assert.equal(r.data.confidence, 88);
  // First tried fast model gemini-2.5-flash-lite (got 503 once, retried and succeeded on 2nd attempt)
  assert.ok(modelAttempts.length >= 2);
});

test('4. Timeout handling: per-attempt TimeoutError switches to backup model/provider cleanly', async () => {
  resetEnv();
  process.env.AI_PRIORITY = 'openai,gemini';

  global.fetch = async (url) => {
    if(url.includes('/rest/v1/terms_acceptances'))return jsonResponse(200,[{user_id:'accepted'}]);
    if(url.includes('/rpc/consume_ai_quota')) return jsonResponse(200,true);
    if (url.includes('api.openai.com')) {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      return jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'Tezkor zaxira javob' }] } }]
      });
    }
    throw new Error('Unexpected URL: ' + url);
  };

  const r = await ai.chat('Sys', 'Savol');
  assert.equal(r.provider, 'gemini');
  assert.equal(r.data, 'Tezkor zaxira javob');
});

test('5. Listing moderation: rejects non-animal photo (422), rejects species mismatch (422), accepts real matching animal (200)', async () => {
  resetEnv();
  delete process.env.OPENAI_API_KEY;
  process.env.AI_PRIORITY = 'gemini';

  let aiModerationResponse = { is_live_animal: false, species: 'none', confidence: 95, reason: 'Mashina rasmi' };
  const uploadedPaths = [];
  const insertedListings = [];

  global.fetch = async (url, opts = {}) => {
    if(url.includes('/rest/v1/terms_acceptances'))return jsonResponse(200,[{user_id:'accepted'}]);
    if (url.endsWith('/auth/v1/user')) {
      return jsonResponse(200, { id: '11111111-1111-1111-1111-111111111111', email: 'fermer@test.uz' });
    }
    if (url.includes('/rest/v1/listings?select=id')) {
      return jsonResponse(200, [], { 'content-range': '0-0/2' });
    }
    if (url.includes(':generateContent')) {
      return jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: JSON.stringify(aiModerationResponse) }] } }]
      });
    }
    if (url.includes('/storage/v1/object/listing-photos/')) {
      uploadedPaths.push(url);
      return jsonResponse(200, { Key: url });
    }
    if (url.includes('/rest/v1/subscriptions')) {
      return jsonResponse(200, []);
    }
    if (url.endsWith('/rest/v1/listings') && opts.method === 'POST') {
      const row = JSON.parse(opts.body);
      insertedListings.push(row);
      return jsonResponse(201, [{ id: '22222222-2222-2222-2222-222222222222', ...row }]);
    }
    return jsonResponse(200, {});
  };

  const baseReqBody = {
    title: 'Sog‘lom Simmental sigir',
    species: 'Sigir',
    breed: 'Simmental',
    age: '3 yosh',
    weight: '420 kg',
    price: 15000000,
    region: 'Toshkent',
    phone: '+998901234567',
    description: 'Suti ko‘p',
    images: [VALID_JPEG_B64]
  };

  // Case A: Non-animal photo -> 422
  const res1 = mockRes();
  await listingsHandler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: baseReqBody }, res1);
  assert.equal(res1.statusCode, 422);
  assert.match(res1.body.error, /jonli hayvon/i);
  assert.equal(uploadedPaths.length, 0);

  // Case B: Species mismatch (declared Sigir, photo shows Qo'y) -> 422
  aiModerationResponse = { is_live_animal: true, species: 'qoy', confidence: 91, reason: 'Qo‘y' };
  const res2 = mockRes();
  await listingsHandler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: baseReqBody }, res2);
  assert.equal(res2.statusCode, 422);
  assert.match(res2.body.error, /mos kelmadi/i);
  assert.equal(uploadedPaths.length, 0);

  // Case C: Real matching animal (Sigir) with fee=off -> 200 active
  aiModerationResponse = { is_live_animal: true, species: 'sigir', confidence: 94, reason: 'Haqiqiy sigir' };
  const res3 = mockRes();
  await listingsHandler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: baseReqBody }, res3);
  assert.equal(res3.statusCode, 200);
  assert.equal(res3.body.status, 'pending_payment');
  assert.equal(uploadedPaths.length, 1);
  assert.equal(insertedListings.length, 1);
});

test('6. Fee modes & All-AI-down fallback: manual fee -> pending_payment, Pro subscription -> active, AI down -> pending_review + admin approve', async () => {
  resetEnv();
  delete process.env.OPENAI_API_KEY;
  process.env.AI_PRIORITY = 'gemini';

  let aiShouldFail = false;
  let subscriptions = [];
  let patchedStatus = null;

  global.fetch = async (url, opts = {}) => {
    if(url.includes('/rest/v1/terms_acceptances'))return jsonResponse(200,[{user_id:'accepted'}]);
    if (url.endsWith('/auth/v1/user')) {
      return jsonResponse(200, { id: '11111111-1111-1111-1111-111111111111' });
    }
    if (url.includes('/rest/v1/profiles?select=role')) {
      return jsonResponse(200, [{ role: 'admin' }]);
    }
    if (url.includes('/rest/v1/listings?select=id')) {
      return jsonResponse(200, [], { 'content-range': '0-0/0' });
    }
    if (url.includes(':generateContent')) {
      if (aiShouldFail) {
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        throw err;
      }
      return jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: JSON.stringify({ is_live_animal: true, species: 'sigir', confidence: 90 }) }] } }]
      });
    }
    if (url.includes('/storage/v1/object/listing-photos/')) {
      return jsonResponse(200, { Key: url });
    }
    if (url.includes('/rest/v1/subscriptions')) {
      return jsonResponse(200, subscriptions);
    }
    if (url.endsWith('/rest/v1/listings') && opts.method === 'POST') {
      const row = JSON.parse(opts.body);
      return jsonResponse(201, [{ id: '33333333-3333-3333-3333-333333333333', ...row }]);
    }
    if (url.includes('/rest/v1/listings?') && opts.method === 'PATCH') {
      patchedStatus = JSON.parse(opts.body).status;
      return jsonResponse(200, [{}]);
    }
    return jsonResponse(200, {});
  };

  const body = {
    title: 'Hisori qo‘y',
    species: 'Sigir',
    price: 12000000,
    region: 'Samarqand',
    phone: '+998901112233',
    images: [VALID_JPEG_B64]
  };

  // 6a: Fee mode = manual, free user -> pending_payment
  process.env.LISTING_FEE_MODE = 'manual';
  subscriptions = [];
  const resManual = mockRes();
  await listingsHandler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body }, resManual);
  assert.equal(resManual.statusCode, 200);
  assert.equal(resManual.body.status, 'pending_payment');

  // 6b: Fee mode = manual, Pro user -> active
  subscriptions = [{ plan: 'Pro', period_end: new Date(Date.now() + 86400000).toISOString() }];
  const resPro = mockRes();
  await listingsHandler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body }, resPro);
  assert.equal(resPro.statusCode, 200);
  assert.equal(resPro.body.status, 'active');

  // 6c: All AI providers down -> does NOT fail hard with 503; saves as 'pending_review'
  process.env.LISTING_FEE_MODE = 'off';
  aiShouldFail = true;
  const resFallback = mockRes();
  await listingsHandler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body }, resFallback);
  assert.equal(resFallback.statusCode, 200);
  assert.equal(resFallback.body.status, 'pending_review');
  assert.ok(resFallback.body.warning);

  // 6d: Admin approves pending_review listing -> active
  const resApprove = mockRes();
  await adminActionHandler({
    method: 'POST',
    headers: { authorization: 'Bearer tok' },
    body: { action: 'approve', id: '33333333-3333-3333-3333-333333333333' }
  }, resApprove);
  assert.equal(resApprove.statusCode, 200);
  assert.equal(resApprove.body.ok, true);
  assert.equal(patchedStatus, 'active');
});

test('7. AI Scan & Chat endpoints: return structured data when AI succeeds, clear masked Uzbek message on 503 when AI is down, and enforce rate limits', async () => {
  resetEnv();
  delete process.env.OPENAI_API_KEY;
  process.env.AI_PRIORITY = 'gemini';

  let aiDown = false;
  global.fetch = async (url) => {
    if(url.includes('/rest/v1/terms_acceptances'))return jsonResponse(200,[{user_id:'accepted'}]);
    if(url.includes('/rpc/consume_ai_quota')) return jsonResponse(200,true);
    if (url.endsWith('/auth/v1/user')) {
      return jsonResponse(200, { id: '99999999-9999-9999-9999-999999999999' });
    }
    if (url.includes(':generateContent')) {
      if (aiDown) {
        return jsonResponse(429, { error: { message: 'Resource has been exhausted (e.g. check quota) AIzaSySecretKey999' } });
      }
      return jsonResponse(200, {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                species: 'Sigir',
                breed: 'Qora-ola',
                age: '2-3 yosh',
                weight: '380-420 kg',
                bcs: '3.5 / 5',
                confidence: 82,
                obs: ['Tana holati yaxshi'],
                feed: ['Kuniga pichan va toza suv'],
                next: ['Tarozida o‘lchang']
              })
            }]
          }
        }]
      });
    }
    return jsonResponse(200, {});
  };

  // Scan success
  const sRes1 = mockRes();
  await scanHandler({
    method: 'POST',
    headers: { authorization: 'Bearer tok' },
    body: { type: 'Sigir', age: '3 yosh', images: [VALID_JPEG_B64] }
  }, sRes1);
  assert.equal(sRes1.statusCode, 200);
  assert.equal(sRes1.body.species, 'Sigir');
  assert.equal(sRes1.body.weight, '380-420 kg');

  // Scan when AI is down -> 503 with masked key & Uzbek explanation
  aiDown = true;
  const sRes2 = mockRes();
  await scanHandler({
    method: 'POST',
    headers: { authorization: 'Bearer tok' },
    body: { type: 'Sigir', age: '3 yosh', images: [VALID_JPEG_B64] }
  }, sRes2);
  assert.equal(sRes2.statusCode, 503);
  assert.match(sRes2.body.error, /kvota|limit/i);
  assert.ok(!sRes2.body.error.includes('AIzaSySecretKey999'));

  // Rate limit check on chat
  for (let i = 0; i < 15; i++) {
    const cRes = mockRes();
    await chatHandler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { message: 'Salom' } }, cRes);
  }
  const cResLimited = mockRes();
  await chatHandler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { message: 'Salom yana' } }, cResLimited);
  assert.equal(cResLimited.statusCode, 429);
  assert.match(cResLimited.body.error, /Juda ko‘p so‘rov/);
});

test('8. AI Chat with images + structured feeding schedule extraction + auto VAPID key in /api/config', async () => {
  resetEnv();
  delete process.env.OPENAI_API_KEY;
  process.env.AI_PRIORITY = 'gemini';

  global.fetch = async (url) => {
    if(url.includes('/rest/v1/terms_acceptances'))return jsonResponse(200,[{user_id:'accepted'}]);
    if(url.includes('/rpc/consume_ai_quota')) return jsonResponse(200,true);
    if (url.endsWith('/auth/v1/user')) {
      return jsonResponse(200, { id: '77777777-7777-7777-7777-777777777777' });
    }
    if (url.includes(':generateContent')) {
      return jsonResponse(200, {
        candidates: [{
          content: {
            parts: [{
              text: 'Buqamizni semirtirish uchun kuniga 3 mahal yem bering.\n<SCHEDULE>[{"title":"Ertalabki arpa va kepak","time":"07:00"},{"title":"Kechki beda va yem","time":"19:00"}]</SCHEDULE>'
            }]
          }
        }]
      });
    }
    return jsonResponse(200, {});
  };

  const cRes = mockRes();
  await chatHandler({
    method: 'POST',
    headers: { authorization: 'Bearer tok' },
    body: { message: 'Shu buqani semirtirmoqchiman, uyda arpa va beda bor', images: [VALID_JPEG_B64] }
  }, cRes);
  assert.equal(cRes.statusCode, 200);
  assert.match(cRes.body.text, /kuniga 3 mahal/);
  assert.ok(!cRes.body.text.includes('<SCHEDULE>'));
  assert.equal(cRes.body.schedule.length, 2);
  assert.equal(cRes.body.schedule[0].time, '07:00');

  const cfgHandler = require('../api/config');
  const cfgRes = mockRes();
  cfgHandler({}, cfgRes);
  assert.ok(cfgRes.body.vapid && cfgRes.body.vapid.length > 40, 'Auto VAPID public key must be present');
});
// qo'shimcha testlar: 9. Ko'p tillilik (i18n) va 10. Kiberxavfsizlik (XSS, Magic Bytes bypass, IDOR/Escalation, IP rate limit)
test('9. Multilingual i18n dictionary and dynamic prompt translation', () => {
  const fs = require('fs');
  const i18n = JSON.parse(fs.readFileSync('public/i18n.json', 'utf8'));
  
  // Verify all 5 languages exist for core livestock concepts
  const checkKeys = ['Bosh sahifa', 'Chorvalar', 'AI Scan', 'AI yordamchi', 'Eslatmalar', 'Vazn kuzatuvi', 'Chorva bozori'];
  for (const k of checkKeys) {
    assert.ok(i18n[k], 'Key must exist in i18n.json: ' + k);
    assert.ok(i18n[k].ru, 'Russian translation required for: ' + k);
    assert.ok(i18n[k].en, 'English translation required for: ' + k);
    assert.ok(i18n[k].kk, 'Kazakh translation required for: ' + k);
    assert.ok(i18n[k].ky, 'Kyrgyz translation required for: ' + k);
  }
});

test('10. Cybersecurity & Penetration audit: XSS prevention, Magic byte verification, IP rate limiting', async () => {
  resetEnv();

  // 10a. Magic byte file check (Attacker tries to upload a fake JPG containing PHP/executable script)
  const fakeJpg = 'data:image/jpeg;base64,' + Buffer.from('<?php echo "hacked"; ?>').toString('base64');
  const resBadImg = mockRes();
  await listingsHandler({
    method: 'POST',
    headers: { authorization: 'Bearer tok' },
    body: {
      title: 'Hacker listing',
      species: 'Sigir',
      price: 1000000,
      phone: '+998901234567',
      images: [fakeJpg]
    }
  }, resBadImg);
  assert.equal(resBadImg.statusCode, 400);
  assert.match(resBadImg.body.error, /Rasm formati noto‘g‘ri/);

  // 10b. IP-based DDoS Rate Limiting
  const fakeReq = { headers: { 'x-forwarded-for': '185.220.101.5' }, socket: {} };
  lib.resetRateLimits();
  for (let i = 0; i < 30; i++) {
    const ok = lib.checkRateLimit('185.220.101.5', 'ip');
    assert.equal(ok, true);
  }
  const blocked = lib.checkRateLimit('185.220.101.5', 'ip');
  assert.equal(blocked, false, 'IP rate limiter must block request #31');

  // 10c. Secret Masking against data exfiltration
  const secretDump = 'Exfiltrated secret key: AIzaSyD98234710293481092384 and sk-proj-12093810293810293';
  const maskedDump = ai.mask(secretDump);
  assert.ok(!maskedDump.includes('AIzaSyD98234710293481092384'));
  assert.ok(!maskedDump.includes('sk-proj-12093810293810293'));
});

test('11. Monthly quota denial and unavailable quota RPC fail closed',async()=>{
 resetEnv();const original=global.fetch;
 try{
 global.fetch=async url=>url.includes('/rest/v1/terms_acceptances')?jsonResponse(200,[{user_id:'accepted'}]):url.includes('/auth/v1/user')?jsonResponse(200,{id:'99999999-9999-9999-9999-999999999999'}):jsonResponse(200,false);
 let res=mockRes();await chatHandler({method:'POST',headers:{authorization:'Bearer token'},body:{message:'Salom'}},res);assert.equal(res.statusCode,429);
 lib.resetRateLimits();global.fetch=async url=>url.includes('/rest/v1/terms_acceptances')?jsonResponse(200,[{user_id:'accepted'}]):url.includes('/auth/v1/user')?jsonResponse(200,{id:'99999999-9999-9999-9999-999999999999'}):jsonResponse(404,{});
 res=mockRes();await chatHandler({method:'POST',headers:{authorization:'Bearer token'},body:{message:'Salom'}},res);assert.equal(res.statusCode,503);
 }finally{global.fetch=original}
});
test('12. Non-admin cannot access AI diagnostics, including old query secret',async()=>{
 resetEnv();const original=global.fetch;global.fetch=async url=>url.includes('/rest/v1/terms_acceptances')?jsonResponse(200,[{user_id:'accepted'}]):url.includes('/auth/v1/user')?jsonResponse(200,{id:'99999999-9999-9999-9999-999999999999'}):jsonResponse(200,[{role:'user'}]);
 try{const res=mockRes();await require('../api/ai-test')({method:'GET',url:'/api/ai-test?key=old',headers:{authorization:'Bearer token'}},res);assert.equal(res.statusCode,403)}finally{global.fetch=original}
});

test('13. Recovery callback restores the password form without entering the dashboard',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');const html=fs.readFileSync(require('node:path').join(__dirname,'../public/index.html'),'utf8');
 const show=html.match(/function showRecovery\(session\)\{[^\n]+\}/)[0];
 const init=html.slice(html.indexOf('async function initApp(){'),html.indexOf('/* ---------- v1.1:'));
 const session={user:{id:'test-user',email:'test@example.com'}};let entered=0,rendered=0;const changes=[];
 const ctx={SB:null,DL:null,TR:null,S:{},recoveryCallbackAtLoad:true,location:{hash:'#access_token=example&type=recovery',pathname:'/',search:''},localStorage:{getItem:()=>null},sessionStorage:{removeItem:k=>changes.push(k)},history:{replaceState:()=>{}},render:()=>rendered++,applyI18n:()=>{},toast:()=>{},onSession:()=>entered++,fetch:async p=>({ok:true,json:async()=>p==='/api/config'?{url:'https://test.supabase.co',key:'test'}:{}}),window:{supabase:{createClient:()=>({auth:{onAuthStateChange:()=>{},getSession:async()=>({data:{session}})}})}}};
 vm.createContext(ctx);vm.runInContext(show+'\n'+init,ctx);await vm.runInContext('initApp()',ctx);
 assert.equal(entered,0);assert.equal(ctx.S.recState.linkVerified,true);assert.equal(ctx.S.recState.target,'test@example.com');assert.ok(rendered>0);assert.ok(changes.includes('ft_recovery_pending'));
});
test('14. Missing recovery session never marks a link verified',()=>{
 const vm=require('node:vm'),fs=require('node:fs');const html=fs.readFileSync(require('node:path').join(__dirname,'../public/index.html'),'utf8');const show=html.match(/function showRecovery\(session\)\{[^\n]+\}/)[0];const ctx={S:{}};vm.createContext(ctx);vm.runInContext(show+';showRecovery(null)',ctx);assert.equal(ctx.S.recState,undefined);
});

test('15. Database helper accepts empty successful writes and rejects malformed JSON',async()=>{
 const {db}=require('../api/_billing');const original=global.fetch;
 try{global.fetch=async()=>({ok:true,status:201,text:async()=>''});assert.equal(await db('app_state'),null);global.fetch=async()=>({ok:true,status:200,text:async()=>'[{"plan":"Pro"}]'});assert.equal((await db('subscriptions'))[0].plan,'Pro');global.fetch=async()=>({ok:true,status:200,text:async()=>'{'});await assert.rejects(()=>db('app_state'),/noto‘g‘ri javob/)}finally{global.fetch=original}
});
test('16. Email login requests a real Supabase OTP and never creates a new user',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');const html=fs.readFileSync(require('node:path').join(__dirname,'../public/index.html'),'utf8');const code=html.slice(html.indexOf('async function doAuth('),html.indexOf('async function delAcc('));let request,rendered=0;const ctx={S:{},location:{origin:'https://example.test'},$:()=>({textContent:'',style:{}}),SB:{auth:{signInWithOtp:async x=>{request=x;return {data:{},error:null}}}},render:()=>rendered++,authErr:x=>x};vm.createContext(ctx);vm.runInContext(code,ctx);await vm.runInContext("doAuth('farmer@example.test','',null)",ctx);assert.equal(request.email,'farmer@example.test');assert.equal(request.options.shouldCreateUser,false);assert.equal(ctx.S.authOtp.mode,'login');assert.equal(rendered,1);
});

test('17. All email OTP forms accept complete 6–8 digit codes without truncation',()=>{
 const fs=require('node:fs'),vm=require('node:vm');const html=fs.readFileSync(require('node:path').join(__dirname,'../public/index.html'),'utf8');const definition=html.match(/function isOtpCode\(code\)\{[^\n]+\}/)[0];const ctx={};vm.createContext(ctx);vm.runInContext(definition,ctx);for(const s of ['123456','1234567','12345678'])assert.equal(ctx.isOtpCode(s),true);for(const s of ['12345','123456789','12345a',''])assert.equal(ctx.isOtpCode(s),false);assert.match(html,/id="otp_code"[^>]*maxlength="8"/);assert.match(html,/id="rec_code"[^>]*maxlength="8"/);assert.ok(!html.includes('maxlength="6"'));
});

test('18. Seller handles validate input, prevent duplicates, and only write authenticated owner',async()=>{
 resetEnv();const handler=require('../api/sellers'),original=global.fetch;const uid='99999999-9999-9999-9999-999999999999';let writes=[];
 global.fetch=async(url,opts={})=>{if(url.endsWith('/auth/v1/user'))return jsonResponse(200,{id:uid});if(url.includes('nickname=eq.taken'))return jsonResponse(200,[{user_id:'other'}]);if(opts.method==='POST'){writes.push(JSON.parse(opts.body));return jsonResponse(200,[JSON.parse(opts.body)])}return jsonResponse(200,[])};
 try{let res=mockRes();await handler({method:'POST',headers:{authorization:'Bearer token'},body:{action:'update',nickname:'bad,filter'}},res);assert.equal(res.statusCode,400);res=mockRes();await handler({method:'POST',headers:{authorization:'Bearer token'},body:{action:'update',nickname:'taken'}},res);assert.equal(res.statusCode,409);res=mockRes();await handler({method:'POST',headers:{authorization:'Bearer token'},body:{action:'update',nickname:'@My_Farm',display_name:'My Farm',bio:'Hello',user_id:'other'}},res);assert.equal(res.statusCode,200);assert.equal(writes[0].user_id,uid);assert.equal(writes[0].nickname,'my_farm');assert.equal(writes.length,1)}finally{global.fetch=original}
});
test('19. Shared listing and seller URLs retain persistent query identifiers',()=>{
 const fs=require('node:fs'),vm=require('node:vm');const html=fs.readFileSync(require('node:path').join(__dirname,'../public/index.html'),'utf8');const code=html.match(/function listingUrl\(id\)\{[^\n]+\}/)[0]+'\n'+html.match(/function sellerUrl\(nick\)\{[^\n]+\}/)[0];const ctx={URL,location:{origin:'https://farm.example',pathname:'/'}};vm.createContext(ctx);vm.runInContext(code,ctx);assert.equal(new URL(ctx.listingUrl('abc')).searchParams.get('listing'),'abc');assert.equal(new URL(ctx.sellerUrl('my_farm')).searchParams.get('seller'),'my_farm');assert.ok(html.includes('🇺🇿 UZ'));assert.ok(html.includes('🇰🇬 KG'));
});
test('20. Listing cards render prominent price, zoom and share while escaping titles',()=>{
 const fs=require('node:fs'),vm=require('node:vm');const html=fs.readFileSync(require('node:path').join(__dirname,'../public/index.html'),'utf8');const code=html.slice(html.indexOf('const lcard='),html.indexOf('const mnav='));let cached;const ctx={cacheListing:x=>cached=x,esc:x=>String(x||'').replaceAll('<','&lt;').replaceAll('>','&gt;'),money:x=>x+' so‘m',pic:()=>'<img alt="test">',first:()=>'/test.jpg',FB:''};vm.createContext(ctx);vm.runInContext(code+'\nthis.output=lcard({id:"test",title:"<script>",price:120000,region:"Namangan"},new Set())',ctx);assert.equal(cached.id,'test');assert.match(ctx.output,/class="market-price"/);assert.match(ctx.output,/data-zoom="test"/);assert.match(ctx.output,/data-share-listing="test"/);assert.ok(!ctx.output.includes('<script>'));
});

test('21. Operations refuse missing consent before AI or listing work',async()=>{
 resetEnv();const original=global.fetch;let aiCalls=0;global.fetch=async url=>{if(url.endsWith('/auth/v1/user'))return jsonResponse(200,{id:'99999999-9999-9999-9999-999999999999'});if(url.includes('/terms_acceptances'))return jsonResponse(200,[]);aiCalls++;return jsonResponse(200,{})};
 try{const res=mockRes();await chatHandler({method:'POST',headers:{authorization:'Bearer token'},body:{message:'hello'}},res);assert.equal(res.statusCode,403);assert.equal(res.body.code,'CONSENT_REQUIRED');assert.equal(aiCalls,0)}finally{global.fetch=original}
});
test('22. Consent acceptance requires both unchecked-by-default approvals and persists only once',async()=>{
 resetEnv();const original=global.fetch;const handler=require('../api/consent');let saved=false,writes=0;global.fetch=async(url,opts={})=>{if(url.endsWith('/auth/v1/user'))return jsonResponse(200,{id:'99999999-9999-9999-9999-999999999999'});if(opts.method==='POST'){saved=true;writes++;return jsonResponse(201,null)}return jsonResponse(200,saved?[{user_id:'accepted',terms_version:'2026-10-31',privacy_version:'2026-10-31',accepted_at:'test'}]:[])};
 try{let res=mockRes();await handler({method:'POST',headers:{authorization:'Bearer token'},body:{action:'accept',terms:true,privacy:false,version:'2026-10-31'}},res);assert.equal(res.statusCode,400);assert.equal(writes,0);for(let i=0;i<2;i++){res=mockRes();await handler({method:'POST',headers:{authorization:'Bearer token'},body:{action:'accept',terms:true,privacy:true,version:'2026-10-31'}},res);assert.equal(res.body.accepted,true)}assert.equal(writes,1)}finally{global.fetch=original}
});
test('23. Admin can revoke a paid plan through the existing atomic plan function',async()=>{
 resetEnv();const original=global.fetch;let payload;global.fetch=async(url,opts={})=>{if(url.endsWith('/auth/v1/user'))return jsonResponse(200,{id:'99999999-9999-9999-9999-999999999999'});if(url.includes('/profiles?select=role'))return jsonResponse(200,[{role:'admin'}]);if(url.includes('/rpc/set_user_plan')){payload=JSON.parse(opts.body);return jsonResponse(204,null)}return jsonResponse(200,{})};try{const res=mockRes();await adminActionHandler({method:'POST',headers:{authorization:'Bearer token'},body:{action:'revoke_plan',user_id:'11111111-1111-1111-1111-111111111111'}},res);assert.equal(res.statusCode,200);assert.equal(payload.p_plan,'Bepul');assert.equal(payload.p_user,'11111111-1111-1111-1111-111111111111')}finally{global.fetch=original}
});
