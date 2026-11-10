const fs = require('node:fs');
const path = require('node:path');
const { securityHeaders } = require('../security-headers');
const file = path.join(__dirname, '../vercel.json');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.headers = [{ source: '/(.*)', headers: Object.entries(securityHeaders()).map(([key, value]) => ({ key, value })) }];
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
console.log('Vercel security headers synchronized.');
