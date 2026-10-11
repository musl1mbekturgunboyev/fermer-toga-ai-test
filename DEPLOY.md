# O‘z serveringizda joylash (Vercel'siz)

Kerak: Ubuntu 22.04 server (VPS), domen, Supabase va OpenAI hisoblari.

1. **Serverga kiring** (`ssh root@SERVER_IP`) va o‘rnating:
   `apt update && apt install -y nginx certbot python3-certbot-nginx unzip`
   Node 20: `curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs`
2. **Loyihani yuklang** (masalan `/var/www/fermer`): zip'ni `scp` bilan ko‘chirib `unzip` qiling.
3. `cd /var/www/fermer && npm install --omit=dev`
4. `.env.local` yarating (README'dagi o‘zgaruvchilar). `chmod 600 .env.local`
5. **Doimiy ishga tushirish:** `npm i -g pm2 && pm2 start server.js --name fermer && pm2 save && pm2 startup`
6. **Nginx:** `/etc/nginx/sites-available/fermer`:
```
server {
  server_name SIZNING-DOMEN.uz www.SIZNING-DOMEN.uz;
  client_max_body_size 8m;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; }
}
```
   `ln -s /etc/nginx/sites-available/fermer /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx`
7. **DNS:** domen sozlamalarida `A` yozuv (`@` va `www`) → server IP.
8. **HTTPS:** `certbot --nginx -d SIZNING-DOMEN.uz -d www.SIZNING-DOMEN.uz`
9. **Supabase** → Authentication → URL Configuration: Site URL = `https://SIZNING-DOMEN.uz`.
10. **Xavfsizlik:** `ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable`. Server faqat 80/443 va SSH portlarini ochiq tutsin.

Yangilash: yangi fayllarni yuklang → `npm install --omit=dev && pm2 restart fermer`.
Eslatmalar cron'i `server.js` ichida ishlaydi (alohida sozlash kerak emas).
