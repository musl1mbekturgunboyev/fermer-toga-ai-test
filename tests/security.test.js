const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const response=(data,status=200)=>({ok:status<400,status,text:async()=>JSON.stringify(data),json:async()=>data});
const res=()=>({statusCode:200,status(c){this.statusCode=c;return this},json(x){this.body=x;return this},end(){return this}});
const uid='11111111-1111-1111-1111-111111111111';
test('Security: untrusted forwarded IP cannot rotate limits; trusted proxy uses last hop',()=>{
 const {getClientIp}=require('../api/_lib');const saved=process.env.TRUSTED_PROXY_IPS;try{delete process.env.TRUSTED_PROXY_IPS;const req={socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'198.51.100.1, 203.0.113.2'}};assert.equal(getClientIp(req),'127.0.0.1');process.env.TRUSTED_PROXY_IPS='127.0.0.1';assert.equal(getClientIp(req),'203.0.113.2')}finally{if(saved===undefined)delete process.env.TRUSTED_PROXY_IPS;else process.env.TRUSTED_PROXY_IPS=saved;}
});
test('Security: invalid reminder/state and duplicate IDs are rejected before database write',async()=>{
 const handler=require('../api/state'),lib=require('../api/_lib'),original=global.fetch;let writes=0;lib.resetRateLimits();process.env.SUPABASE_URL='https://mock.supabase.co';
 global.fetch=async(url,opts={})=>{if(url.endsWith('/auth/v1/user'))return response({id:uid});if(url.includes('consume_api_rate'))return response(true);if(opts.method==='POST')writes++;return response({updated_at:'2026-11-03T00:00:00Z'})};
 try{for(const state of [{animals:[],rem:[{}]},{animals:[{id:'x'},{id:'x'}]},{animals:[],rem:[['test','Har kuni','25:00',10]]}]){const r=res();await handler({method:'POST',headers:{authorization:'Bearer t'},body:{json:JSON.stringify(state),expectedUpdatedAt:null}},r);assert.equal(r.statusCode,400)}assert.equal(writes,0);
 const r=res();await handler({method:'POST',headers:{authorization:'Bearer t'},body:{json:'{"animals":[]}',expectedUpdatedAt:null}},r);assert.equal(r.statusCode,200);assert.equal(writes,1);
 }finally{global.fetch=original}
 assert.equal(require('../api/_reminder-time').dueReminder({}),null);
});
test('Security: database rate limits fail closed and conflict never reports a save success',async()=>{
 const handler=require('../api/state'),lib=require('../api/_lib'),old=global.fetch;process.env.SUPABASE_URL='https://mock.supabase.co';let mode='denied';global.fetch=async url=>url.endsWith('/auth/v1/user')?response({id:uid}):url.includes('consume_api_rate')?response(mode==='denied'?false:true):response({conflict:true});
 try{for(const [m,status] of [['denied',429],['conflict',409]]){mode=m;lib.resetRateLimits();const r=res();await handler({method:'POST',headers:{authorization:'Bearer t'},body:{json:'{"animals":[]}',expectedUpdatedAt:null}},r);assert.equal(r.statusCode,status)}}finally{global.fetch=old}
});
test('Security: failed or corrupted state load keeps remote saving disabled',async()=>{
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8'),code=html.slice(html.indexOf('async function onSession('),html.indexOf('function authErr('));
 for(const state of [{data:null,error:{message:'down'}},{data:{json:'invalid'},error:null}]){const ctx={S:{},DB:null,KEYS:['animals'],tm:null,clearTimeout,fresh(){ctx.S.animals=[]},URLSearchParams,location:{hash:'',search:''},render(){throw Error('must not render loaded state')},SB:{from:t=>({select:()=>({eq:()=>({maybeSingle:async()=>t==='profiles'?{data:{role:'user'}}:state})})})}};vm.createContext(ctx);vm.runInContext(code,ctx);await assert.rejects(()=>ctx.onSession({user:{id:uid,user_metadata:{},email:'farmer@example.test'}}));assert.equal(ctx.DB,null);assert.equal(ctx.S.sessionReady,null);}
});
test('Security: image headers cannot disguise arbitrary files or huge decoded images',()=>{
 const {imageBuffer,validBuffer}=require('../api/_image');const jpg=fs.readFileSync(path.join(__dirname,'fixtures/valid.jpg'));assert.ok(imageBuffer('data:image/jpeg;base64,'+jpg.toString('base64')));assert.equal(imageBuffer('data:image/jpeg;base64,'+Buffer.from([255,216,...Array(32).fill(65)]).toString('base64')),null);assert.equal(imageBuffer('data:image/png;base64,'+jpg.toString('base64')),null);
 for(let size=0;size<100;size++)assert.doesNotThrow(()=>validBuffer(crypto.randomBytes(size)));
 const malicious=Buffer.from(jpg),sof=malicious.indexOf(Buffer.from([255,192]));assert.ok(sof>0);malicious.writeUInt16BE(65535,sof+5);assert.equal(validBuffer(malicious),false);
});
test('Security: exported CSV escapes formulas, commas, quotes and multiline cells',()=>{
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8'),code=html.slice(html.indexOf('const csvCell='),html.indexOf('const esc='));const ctx={};vm.createContext(ctx);vm.runInContext(code+'globalThis.cell=csvCell;',ctx);assert.equal(ctx.cell('=1+1'),'"\'=1+1"');assert.equal(ctx.cell('a,"b"\nc'),'"a,""b""\nc"');assert.equal(ctx.cell('  @SUM(1)'),'"\'  @SUM(1)"');
});
test('Security: web push interoperates with independent RFC encryption implementation and verifies VAPID signature',async()=>{
 const {requestDetails,validateSubscription}=require('../api/_webpush');const ece=require('http_ece');const ua=crypto.createECDH('prime256v1');ua.generateKeys();const vapid=crypto.createECDH('prime256v1');vapid.generateKeys();const auth=crypto.randomBytes(16),subscription={endpoint:'https://fcm.googleapis.com/test',keys:{p256dh:ua.getPublicKey('base64url'),auth:auth.toString('base64url')}},config={public_key:vapid.getPublicKey('base64url'),private_key:vapid.getPrivateKey('base64url')};const payload={title:'Test',body:'O‘zbekcha xabar'};
 const req=await requestDetails(subscription,payload,config);assert.deepEqual(JSON.parse(ece.decrypt(req.body,{version:'aes128gcm',privateKey:ua,authSecret:auth}).toString()),payload);
 const jwt=/t=([^,]+)/.exec(req.headers.Authorization)[1],parts=jwt.split('.'),pub=vapid.getPublicKey();const key=crypto.createPublicKey({key:{kty:'EC',crv:'P-256',x:pub.subarray(1,33).toString('base64url'),y:pub.subarray(33).toString('base64url')},format:'jwk'});assert.ok(crypto.verify('sha256',Buffer.from(parts.slice(0,2).join('.')),{key,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')));assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).aud,'https://fcm.googleapis.com');
 for(const endpoint of ['http://127.0.0.1','https://example.test','https://fcm.googleapis.com:444/x','https://fcm.googleapis.com.evil.test/x'])assert.equal(validateSubscription({...subscription,endpoint}),false);assert.equal(req.redirect,'error');
});
test('Security: server rejects malformed JSON and ships matching CSP hashes without inline-script permission',async()=>{
 const headers=require('../security-headers.json'),html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');assert.ok(!headers['Content-Security-Policy'].includes("script-src 'self' 'unsafe-inline'"));for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(/src=/.test(m[1]))continue;const hash=crypto.createHash('sha256').update(m[2].replace(/\r\n?/g,'\n')).digest('base64');assert.ok(headers['Content-Security-Policy'].includes(hash));}
 const {server}=require('../server');await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{const invalid=await fetch(origin+'/api/state',{method:'POST',body:'{'});assert.equal(invalid.status,400);const array=await fetch(origin+'/api/state',{method:'POST',body:'[]'});assert.equal(array.status,400);const main=await fetch(origin);assert.equal(main.status,200);assert.equal(main.headers.get('Content-Security-Policy'),headers['Content-Security-Policy']);const vendor=await fetch(origin+'/vendor/supabase-2.118.0.js');assert.equal(vendor.status,200)}finally{await new Promise(r=>server.close(r))}
});
