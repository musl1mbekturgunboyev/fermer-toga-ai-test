const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// HTML parsers normalize CRLF before CSP checks. Hash exactly that script text.
function securityHeaders(html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8')) {
  const hashes = [];
  for (const match of html.replace(/\r\n?/g, '\n').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(match[1]) || !match[2].trim()) continue;
    hashes.push("'sha256-" + createHash('sha256').update(match[2]).digest('base64') + "'");
  }
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
    // Only this host: no assumptions about HTTPS on other subdomains.
    'Strict-Transport-Security': 'max-age=31536000',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' https://cdn.jsdelivr.net " + [...new Set(hashes)].join(' '),
      "script-src-attr 'none'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
      "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co",
      "font-src 'self' data:",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  };
}
module.exports = { securityHeaders };
