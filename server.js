// Vercel'siz ishlaydigan oddiy Node serveri: public/ ni va /api/* ni xizmat qiladi.
const http = require('http'), fs = require('fs'), path = require('path');

for (const f of ['.env', '.env.local']) {
  try {
    fs.readFileSync(path.join(__dirname, f), 'utf8').split(/\r?\n/).forEach(l => {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !l.trim().startsWith('#') && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '').trim();
      }
    });
  } catch (_) {}
}

if (!process.env.CRON_SECRET) process.env.CRON_SECRET = 'internal-cron-secret-fermer-toga';

const T = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

const pub = path.join(__dirname, 'public');

function createHandler() {
  return (req, res) => {
    res.status = c => { res.statusCode = c; return res; };
    res.json = o => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(o));
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    res.setHeader('Content-Security-Policy', CSP);

    const u = new URL(req.url || '/', 'http://x');
    if (u.pathname === '/healthz' || u.pathname === '/api/health') {
      return res.status(200).json({ ok: true, status: 'healthy' });
    }

    if (u.pathname.startsWith('/api/')) {
      const n = u.pathname.slice(5);
      if (!/^[a-z-]+$/.test(n) || n.startsWith('_') || !fs.existsSync(path.join(__dirname, 'api', n + '.js'))) {
        return res.status(404).json({ error: 'Topilmadi' });
      }
      const chunks = [];
      let size = 0;
      let tooLarge = false;
      req.on('data', c => {
        size += c.length;
        if (size > 6e6) {
          tooLarge = true;
          if (!res.headersSent) res.status(413).json({ error: 'So‘rov hajmi juda katta (maksimum 6 MB)' });
          req.destroy();
        } else {
          chunks.push(c);
        }
      });
      req.on('end', async () => {
        if (tooLarge || res.writableEnded) return;
        try {
          req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        } catch (_) {
          req.body = {};
        }
        try {
          await require('./api/' + n + '.js')(req, res);
        } catch (e) {
          console.error(e);
          if (!res.headersSent) res.status(500).json({ error: 'Server xatosi' });
        }
      });
      return;
    }

    let decodedPath = '/';
    try {
      decodedPath = decodeURIComponent(u.pathname);
    } catch (_) {
      return res.status(400).end('Noto‘g‘ri manzil');
    }
    const f = path.normalize(path.join(pub, decodedPath === '/' ? 'index.html' : decodedPath));
    if (u.pathname === '/i18n.json' && !fs.existsSync(f)) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end('{}');
    }
    if (!f.startsWith(pub) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      return res.status(404).end('Topilmadi');
    }
    res.setHeader('Content-Type', T[path.extname(f)] || 'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  };
}

const server = http.createServer(createHandler());

if (require.main === module) {
  const port = process.env.PORT || 3000;
  const host = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
  server.listen(port, host, () => console.log('Tayyor: http://localhost:' + port));

  // Kunlik eslatmalar: har kuni 04:00 UTC (09:00 Toshkent)
  const cron = () => {
    const n = new Date(), t = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 4));
    if (t <= n) t.setUTCDate(t.getUTCDate() + 1);
    setTimeout(async () => {
      const r = { status() { return r; }, json() {}, end() {} };
      try {
        await require('./api/send-reminders.js')({ headers: { authorization: 'Bearer ' + process.env.CRON_SECRET }, body: { mode: 'daily' } }, r);
      } catch (e) {
        console.error(e);
      }
      cron();
    }, t - n);
  };
  cron();

  // Har 60 soniyada: yem berish / parvarish vaqtiga 10 minut qolgan eslatmalarni tekshirib push yuboradi
  setInterval(async () => {
    const r = { status() { return r; }, json() {}, end() {} };
    try {
      await require('./api/send-reminders.js')({ headers: { authorization: 'Bearer ' + process.env.CRON_SECRET }, body: { mode: '10min' } }, r);
    } catch (_) {}
  }, 60000).unref();
}

module.exports = { server, createHandler };
