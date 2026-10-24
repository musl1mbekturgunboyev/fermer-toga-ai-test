// Vercel'siz ishlaydigan oddiy Node serveri: public/ ni va /api/* ni xizmat qiladi.
const http = require('http'), fs = require('fs'), path = require('path');
for (const f of ['.env', '.env.local']) {
  try {
    fs.readFileSync(path.join(__dirname, f), 'utf8').split(/\r?\n/).forEach(l => {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !l.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  } catch (_) {}
}
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const pub = path.join(__dirname, 'public');
http.createServer((req, res) => {
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const n = u.pathname.slice(5);
    if (!/^[a-z-]+$/.test(n) || n.startsWith('_') || !fs.existsSync(path.join(__dirname, 'api', n + '.js'))) return res.status(404).json({ error: 'Topilmadi' });
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 6e6) req.destroy(); else chunks.push(c); });
    req.on('end', async () => {
      try { req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (_) { req.body = {}; }
      try { await require('./api/' + n + '.js')(req, res); } catch (e) { console.error(e); if (!res.headersSent) res.status(500).json({ error: 'Server xatosi' }); }
    });
    return;
  }
  const f = path.normalize(path.join(pub, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname)));
  if (u.pathname === '/i18n.json' && !fs.existsSync(f)) { res.setHeader('Content-Type', 'application/json'); return res.end('{}'); }
  if (!f.startsWith(pub) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.status(404).end('Topilmadi');
  res.setHeader('Content-Type', T[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(process.env.PORT || 3000, process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1'), () => console.log('Tayyor: http://localhost:' + (process.env.PORT || 3000)));
// Kunlik eslatmalar: har kuni 04:00 UTC (09:00 Toshkent)
const cron = () => {
  const n = new Date(), t = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 4));
  if (t <= n) t.setUTCDate(t.getUTCDate() + 1);
  setTimeout(async () => {
    const r = { status() { return r; }, json() {}, end() {} };
    try { await require('./api/send-reminders.js')({ headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } }, r); } catch (e) { console.error(e); }
    cron();
  }, t - n);
};
cron();
