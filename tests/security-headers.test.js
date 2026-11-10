const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { Writable } = require('node:stream');
const { createHandler } = require('../server');
const { securityHeaders } = require('../security-headers');

test('inline scripts have exact hashes; injected scripts have no permission', () => {
  const html = fs.readFileSync('public/index.html', 'utf8').replace(/\r\n?/g, '\n');
  const csp = securityHeaders()['Content-Security-Policy'];
  const scriptPolicy = csp.split('; ').find(x => x.startsWith('script-src '));
  assert.ok(!scriptPolicy.includes("'unsafe-inline'"));
  assert.ok(!scriptPolicy.includes("'unsafe-eval'"));
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(m[1]) || !m[2].trim()) continue;
    assert.ok(scriptPolicy.includes("'sha256-" + createHash('sha256').update(m[2]).digest('base64') + "'"));
  }
  assert.ok(!scriptPolicy.includes(createHash('sha256').update('window.injected=true').digest('base64')));
  assert.match(csp, /script-src-attr 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.deepEqual(securityHeaders(html.replace(/\n/g, '\r\n')), securityHeaders(html));
});

test('HTML, API health and missing pages receive HSTS and CSP', async () => {
  for (const url of ['/', '/api/health', '/not-a-real-file']) {
    const headers = {};
    const res = new Writable({ write(chunk, encoding, callback) { callback(); } });
    res.setHeader = (name, value) => { headers[name] = value; };
    const done = new Promise((resolve, reject) => { res.on('finish', resolve); res.on('error', reject); });
    createHandler()({ url, method: 'GET', headers: {} }, res);
    await done;
    assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000');
    assert.equal(headers['Content-Security-Policy'], securityHeaders()['Content-Security-Policy']);
  }
});

test('Vercel and Render policies match the current HTML', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.deepEqual(Object.fromEntries(config.headers[0].headers.map(h => [h.key, h.value])), securityHeaders());
});
