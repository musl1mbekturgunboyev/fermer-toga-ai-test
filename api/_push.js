const crypto=require('crypto');const {db}=require('./_billing');const {ensureVapidKeys}=require('./_lib');
let cached,pending;
async function config(){if(cached)return cached;if(pending)return pending;pending=(async()=>{let rows=await db('push_config?select=public_key,private_key,cron_hash&id=eq.main');let c=rows[0];if(!c?.public_key){const k=ensureVapidKeys();if(!k.publicKey||!k.privateKey)throw Error('Push kalitlari sozlanmagan');await db('push_config?id=eq.main&public_key=is.null',{method:'PATCH',body:JSON.stringify({public_key:k.publicKey,private_key:k.privateKey})});rows=await db('push_config?select=public_key,private_key,cron_hash&id=eq.main');c=rows[0];}if(!c?.public_key||!c.private_key)throw Error('Push sozlanmagan');cached=c;return c;})();try{return await pending}finally{pending=null}}
function validSubscription(sub,endpoint){
 if(!sub||typeof sub!=='object'||typeof endpoint!=='string'||sub.endpoint!==endpoint)return false;
 let u;try{u=new URL(endpoint)}catch{return false;}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||endpoint.length>4096)return false;
 if(!/^(fcm\.googleapis\.com|(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|(?:[a-z0-9-]+\.)*notify\.windows\.com)$/.test(u.hostname))return false;
 const key=(value,size)=>typeof value==='string'&&/^[A-Za-z0-9_-]+={0,2}$/.test(value)&&value.length<140&&Buffer.from(value,'base64url').length===size;
 return key(sub.keys?.p256dh,65)&&Buffer.from(sub.keys.p256dh,'base64url')[0]===4&&key(sub.keys?.auth,16);
}
async function send(sub,payload,endpoint){if(!validSubscription(sub,endpoint))throw Object.assign(new Error('Invalid stored push subscription'),{code:'INVALID_PUSH_SUBSCRIPTION'});let wp;try{wp=require('web-push')}catch{throw Error('Push yuborish ushbu serverda mavjud emas')};const c=await config();wp.setVapidDetails('mailto:info@fermertoga.uz',c.public_key,c.private_key);await wp.sendNotification(sub,JSON.stringify(payload),{TTL:300,timeout:15000});}
async function cronAllowed(req){const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!token)return false;if(process.env.CRON_SECRET&&token===process.env.CRON_SECRET)return true;const c=await config();return !!c.cron_hash&&crypto.createHash('sha256').update(token).digest('hex')===c.cron_hash;}
module.exports={config,send,cronAllowed,validSubscription};
