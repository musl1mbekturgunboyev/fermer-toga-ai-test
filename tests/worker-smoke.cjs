const assert=require('assert/strict'),crypto=require('crypto'),path=require('path'),{pathToFileURL}=require('url');
(async()=>{
 const worker=(await import(pathToFileURL(path.resolve('dist/server/index.js')).href)).default;
 const env={SUPABASE_URL:'https://mock.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-test'};
 let r=await worker.fetch(new Request('https://farm.test/'),env);assert.equal(r.status,200);assert.ok(r.headers.get('Content-Security-Policy').includes('sha256-'));
 r=await worker.fetch(new Request('https://farm.test/vendor/supabase-2.118.0.js'),env);assert.equal(r.status,200);
 r=await worker.fetch(new Request('https://farm.test/api/push',{method:'POST',body:'{}'}),env);assert.equal(r.status,401);
 const ua=crypto.createECDH('prime256v1'),vapid=crypto.createECDH('prime256v1');ua.generateKeys();vapid.generateKeys();const auth=crypto.randomBytes(16),sub={endpoint:'https://fcm.googleapis.com/test',keys:{p256dh:ua.getPublicKey('base64url'),auth:auth.toString('base64url')}};const original=global.fetch;let pushed=false;
 global.fetch=async(url,opts={})=>{let data;if(url.endsWith('/auth/v1/user'))data={id:'11111111-1111-1111-1111-111111111111'};else if(url.includes('consume_api_rate'))data=true;else if(url.includes('push_subs?'))data=[{sub}];else if(url.includes('push_config?'))data=[{public_key:vapid.getPublicKey('base64url'),private_key:vapid.getPrivateKey('base64url')}];else if(url===sub.endpoint){const decoded=require('http_ece').decrypt(opts.body,{version:'aes128gcm',privateKey:ua,authSecret:auth});assert.match(decoded.toString(),/Fermer/);pushed=true;return new Response(null,{status:201});}else throw Error('Unexpected URL '+url);return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})};
 try{r=await worker.fetch(new Request('https://farm.test/api/push',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:'{"action":"test"}'}),env);assert.equal(r.status,200);assert.equal((await r.json()).delivered,1);assert.equal(pushed,true);}finally{global.fetch=original}
 console.log('PASS: built worker assets, CSP, authentication and independently decrypted push delivery');
})().catch(e=>{console.error(e);process.exitCode=1});
