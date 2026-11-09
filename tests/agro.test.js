const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ai = require('../api/_ai');
const lib = require('../api/_lib');
const handler = require('../api/agro-scan');
const image = 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 224, 0, 1, 255, 217]).toString('base64');
const result = { is_plant: true, plant: 'Pomidor', problem: 'Sarg‘ayish', severity: 'medium', summary: 'Suratdan aniq tashxis qo‘yib bo‘lmaydi.', observations: ['Pastki barglarda sariqlik'], actions: ['Tuproq namligini tekshiring'], possible_causes: ['Namlik bilan bog‘liq bo‘lishi mumkin'], prevention: ['Belgilarni qayd eting'], next_check_days: 3 };
function response() { return { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; }, end() {} }; }
function fixture(t, { accepted = true, quota = true, data = result } = {}) {
  const original = { fetch: global.fetch, vision: ai.vision, configured: ai.configured };
  const calls = { ai: 0, quota: 0 };
  process.env.SUPABASE_URL = 'https://mock.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'mock';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
  lib.resetRateLimits();
  ai.configured = () => true;
  ai.vision = async () => { calls.ai++; return { data, provider: 'mock' }; };
  global.fetch = async url => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'agro-user' });
    if (url.includes('terms_acceptances')) return Response.json(accepted ? [{ user_id: 'agro-user' }] : []);
    if (url.includes('consume_ai_quota')) { calls.quota++; return Response.json(quota); }
    throw Error('Unexpected external request');
  };
  t.after(() => { global.fetch = original.fetch; ai.vision = original.vision; ai.configured = original.configured; });
  return calls;
}
const request = body => ({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body });

test('Agro scan requires sign-in and accepted consent before AI or quota work', async t => {
  const calls = fixture(t, { accepted: false });
  const unsigned = response();
  await handler({ method: 'POST', headers: {}, body: { images: [image] } }, unsigned);
  assert.equal(unsigned.statusCode, 401);
  const res = response();
  await handler(request({ images: [image] }), res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(calls, { ai: 0, quota: 0 });
});
test('Agro scan rejects missing, excessive and forged images before charging quota', async t => {
  const calls = fixture(t);
  for (const images of [[], [image, image, image, image], ['data:image/png;base64,SGVsbG8='], ['https://example.com/plant.jpg']]) {
    const res = response(); await handler(request({ images }), res); assert.equal(res.statusCode, 400);
  }
  assert.deepEqual(calls, { ai: 0, quota: 0 });
});
test('Agro scan uses the existing scan quota and refuses unavailable AI before quota', async t => {
  const calls = fixture(t, { quota: false });
  const res = response(); await handler(request({ images: [image] }), res);
  assert.equal(res.statusCode, 429); assert.deepEqual(calls, { ai: 0, quota: 1 });
  ai.configured = () => false;
  const noKey = response(); await handler(request({ images: [image] }), noKey);
  assert.equal(noKey.statusCode, 503); assert.equal(calls.quota, 1);
});
test('Agro scan returns a structured assessment and bounded follow-up interval', async t => {
  fixture(t, { data: { ...result, next_check_days: 999, severity: 'invented', actions: [...result.actions, {}] } });
  const res = response(); await handler(request({ images: [image], crop: 'Pomidor', lang: 'uz' }), res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.next_check_days, 14);
  assert.equal(res.body.severity, 'unknown'); assert.equal(res.body.actions.length, 1);
  assert.equal(res.body.confidence, undefined);
});
test('Agro scan never displays a fabricated result for non-plants or incomplete AI output', async t => {
  fixture(t, { data: { is_plant: false } });
  const res = response(); await handler(request({ images: [image] }), res); assert.equal(res.statusCode, 422);
  ai.vision = async () => ({ data: { is_plant: true, plant: 'Pomidor' } });
  const incomplete = response(); await handler(request({ images: [image] }), incomplete); assert.equal(incomplete.statusCode, 502);
});
test('Agro UI is guarded, escapes AI text and renders old accounts without crop history', () => {
  const source = fs.readFileSync('public/agro-scan.js', 'utf8');
  const esc = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const context = { S: {}, R: {}, X: [], guarded: [], document: { addEventListener() {} }, shell: (_, body) => body, esc };
  vm.createContext(context); vm.runInContext(fs.readFileSync('public/ui-icons.js', 'utf8'), context); vm.runInContext(source, context);
  assert.ok(context.guarded.includes('#/agro-scan'));
  assert.match(context.R['#/agro-scan'](), /Birinchi kuzatuvingizni boshlang/);
  context.S.agroScans = [{ ...result, id: '1', group: '1', plant: '<img src=x onerror=alert(1)>', createdAt: '2026-11-09T10:00:00Z', nextCheck: '2026-11-12' }];
  const html = context.R['#/agro-scan']();
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img src=x/);
  const index = fs.readFileSync('public/index.html', 'utf8');
  assert.match(index, /'chatLog','agroScans'/);
  const serialized = index.match(/agroScans:S\.agroScans\|\|\[\]/g);
  assert.equal(serialized.length, 2, 'both debounced and immediate saving must retain plant history');
});
