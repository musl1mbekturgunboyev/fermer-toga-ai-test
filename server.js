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



const T = {
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const SECURITY=require('./security-headers.json');


const pub = path.join(__dirname, 'public');

function createHandler() {
  let active=0;
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
    for(const [name,value] of Object.entries(SECURITY))res.setHeader(name,value);

    res.setHeader('Cache-Control','no-store');
    let u;try{u=new URL(req.url || '/', 'http://x')}catch{return res.status(400).end('Noto‘g‘ri manzil')}
    if (u.pathname === '/healthz' || u.pathname === '/api/health') {
      return res.status(200).json({ ok: true, status: 'healthy' });
    }

    if (u.pathname.startsWith('/api/')) {
      const n = u.pathname.slice(5);
      if (!/^[a-z-]+$/.test(n) || n.startsWith('_') || !fs.existsSync(path.join(__dirname, 'api', n + '.js'))) {
        return res.status(404).json({ error: 'Topilmadi' });
      }
      if(active>=32){res.setHeader('Retry-After','3');return res.status(503).json({error:'Server band. Birozdan keyin qayta urinib ko‘ring.'});}
      active++;res.once('close',()=>{active--});
      if(Number(req.headers['content-length'])>6000000)return res.status(413).json({error:'So‘rov hajmi juda katta'});
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
          return res.status(400).json({error:'JSON noto‘g‘ri'});
        }
        try {
          if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))return res.status(400).json({error:'JSON obyekt bo‘lishi kerak'});
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
    if (!f.startsWith(pub + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      return res.status(404).end('Topilmadi');
    }
    res.setHeader('Content-Type', T[path.extname(f)] || 'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  };
}

const server = http.createServer({requestTimeout:30000,headersTimeout:15000},createHandler());

if (require.main === module) {
  const pi=process.argv.indexOf('--port'),hi=process.argv.indexOf('--host');
  const port = process.env.PORT || (pi>=0?process.argv[pi+1]:3000);
  const host = (hi>=0?process.argv[hi+1]:null) || process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
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
