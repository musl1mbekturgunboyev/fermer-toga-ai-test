// RFC 8291 aes128gcm + RFC 8292 VAPID; WebCrypto/fetch work in Node and workers.
const wc=require('crypto').webcrypto;
const subtle=wc.subtle;
const b64=b=>Buffer.from(b).toString('base64url');
function decode(s,size){if(typeof s!=='string'||!/^[-_a-zA-Z0-9]+={0,2}$/.test(s))throw Error('Invalid push key');const b=Buffer.from(s,'base64url');if(b.length!==size)throw Error('Invalid push key length');return b;}
function validateSubscription(sub){
 try{const u=new URL(sub?.endpoint);if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||sub.endpoint.length>4096||!(/^(fcm\.googleapis\.com|(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|(?:[a-z0-9-]+\.)*notify\.windows\.com)$/.test(u.hostname)))return false;
 const pub=decode(sub.keys?.p256dh,65);decode(sub.keys?.auth,16);return pub[0]===4;}catch{return false;}
}
async function hkdf(input,salt,info,length){const k=await subtle.importKey('raw',input,'HKDF',false,['deriveBits']);return Buffer.from(await subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},k,length*8));}
async function requestDetails(sub,payload,config){
 if(!validateSubscription(sub))throw Error('Invalid push subscription');
 const message=Buffer.from(JSON.stringify(payload));if(message.length>3000)throw Error('Push payload too large');
 const ua=decode(sub.keys.p256dh,65),auth=decode(sub.keys.auth,16);
 const pair=await subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const as=Buffer.from(await subtle.exportKey('raw',pair.publicKey));
 const client=await subtle.importKey('raw',ua,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=await subtle.deriveBits({name:'ECDH',public:client},pair.privateKey,256);
 const ikm=await hkdf(shared,auth,Buffer.concat([Buffer.from('WebPush: info\0'),ua,as]),32);
 const salt=wc.getRandomValues(new Uint8Array(16));
 const key=await hkdf(ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16);
 const nonce=await hkdf(ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12);
 const aes=await subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
 const ciphertext=Buffer.from(await subtle.encrypt({name:'AES-GCM',iv:nonce},aes,Buffer.concat([message,Buffer.from([2])])));
 const header=Buffer.alloc(21);Buffer.from(salt).copy(header);header.writeUInt32BE(4096,16);header[20]=as.length;
 const pub=decode(config.public_key,65),priv=decode(config.private_key,32);
 const signer=await subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:b64(pub.subarray(1,33)),y:b64(pub.subarray(33)),d:b64(priv),ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const token=b64(Buffer.from(JSON.stringify({typ:'JWT',alg:'ES256'})))+'.'+b64(Buffer.from(JSON.stringify({aud:new URL(sub.endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:'mailto:info@fermertoga.uz'})));
 const sig=await subtle.sign({name:'ECDSA',hash:'SHA-256'},signer,Buffer.from(token));
 return {method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',TTL:'300',Authorization:'vapid t='+token+'.'+b64(sig)+', k='+config.public_key},body:Buffer.concat([header,as,ciphertext])};
}
async function send(sub,payload,config){const r=await fetch(sub.endpoint,await requestDetails(sub,payload,config));if(!r.ok){await r.body?.cancel();throw Object.assign(Error('Push delivery failed'),{statusCode:r.status});}await r.body?.cancel();}
module.exports={validateSubscription,requestDetails,send};
