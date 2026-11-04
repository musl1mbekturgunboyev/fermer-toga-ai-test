const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const billing=require('../api/_billing'),lib=require('../api/_lib'),ai=require('../api/_ai'),push=require('../api/_push');
const user='00000000-0000-4000-8000-000000000001';
const reply=(status,body)=>({ok:status<300,status,text:async()=>JSON.stringify(body),json:async()=>body});
const res=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(x){this.body=x;return this},end(){}});
function setup(){lib.resetRateLimits();process.env.SUPABASE_URL='https://mock.example';process.env.SUPABASE_ANON_KEY='test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';}
const request=body=>({method:'POST',headers:{authorization:'Bearer test'},body});
function fetcher(settlements){return async(url,opts={})=>{
 if(url.endsWith('/auth/v1/user'))return reply(200,{id:user});
 if(url.includes('terms_acceptances'))return reply(200,[{user_id:user}]);
 if(url.includes('reserve_ai_quota'))return reply(200,JSON.parse(opts.body).p_request);
 if(url.includes('finish_ai_quota')){settlements.push(JSON.parse(opts.body));return reply(200,true);}
 throw Error('Unexpected network call');
};}
test('failed and successful AI calls settle only their own request',async()=>{
 setup();const savedFetch=global.fetch,chat=ai.chat;const settled=[];
 try{
 global.fetch=fetcher(settled);ai.chat=async()=>{throw Error('offline')};let out=res();await require('../api/chat')(request({message:'hello'}),out);
 assert.equal(out.statusCode,503);assert.deepEqual(settled.map(x=>x.p_success),[false]);
 ai.chat=async()=>({data:'answer',provider:'mock'});out=res();await require('../api/chat')(request({message:'hello'}),out);
 assert.equal(out.statusCode,200);assert.deepEqual(settled.map(x=>x.p_success),[false,true]);assert.notEqual(settled[0].p_request,settled[1].p_request);
 }finally{global.fetch=savedFetch;ai.chat=chat;}
});
test('rejected and malformed scans return their reservation and never invent results',async()=>{
 setup();const f=global.fetch,v=ai.vision,settled=[];
 try{
 global.fetch=fetcher(settled);ai.vision=async()=>({data:{assessable:false},provider:'mock'});
 let out=res();const body={images:['data:image/jpeg;base64,YQ==']};await require('../api/scan')(request(body),out);assert.equal(out.statusCode,422);
 ai.vision=async()=>({data:{},provider:'mock'});out=res();await require('../api/scan')(request(body),out);assert.equal(out.statusCode,503);
 ai.vision=async()=>({data:{assessable:true,weight_kg:320,confidence:99,health_status:'Healthy'},provider:'mock'});out=res();await require('../api/scan')(request(body),out);assert.equal(out.statusCode,200);assert.equal(out.body.weight_kg,null);assert.equal(out.body.confidence,null);assert.notEqual(out.body.health_status,'Healthy');
 assert.deepEqual(settled.map(x=>x.p_success),[false,false,true]);
 }finally{global.fetch=f;ai.vision=v;}
});
test('push rejects malicious endpoints and mismatched stored endpoint before any network/config access',async()=>{
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:Buffer.concat([Buffer.from([4]),crypto.randomBytes(64)]).toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
 assert.equal(push.validSubscription(sub,sub.endpoint),true);
 for(const endpoint of ['https://127.0.0.1/test','https://169.254.169.254/test','https://fcm.googleapis.com.evil.example/test','https://fcm.googleapis.com:8443/test','https://fcm.googleapis.com@evil.example/test','http://fcm.googleapis.com/test','https://fcm.googleapis.com/test#fragment']){
  assert.equal(push.validSubscription({...sub,endpoint},endpoint),false);
 }
 const f=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('must not fetch')};
 try{await assert.rejects(push.send(sub,{},'https://evil.example/test'),e=>e.code==='INVALID_PUSH_SUBSCRIPTION');assert.equal(calls,0)}finally{global.fetch=f;}
});
test('listing status server binds RPC owner to authenticated user and rejects arbitrary updates',async()=>{
 setup();const f=global.fetch;let body;
 try{
 global.fetch=async(url,opts={})=>{if(url.endsWith('/auth/v1/user'))return reply(200,{id:user});body=JSON.parse(opts.body);return reply(200,true)};
 const id='10000000-0000-4000-8000-000000000001';let out=res();await require('../api/listing-status')(request({id,status:'sold',p_user:'attacker',title:'changed'}),out);
 assert.equal(out.statusCode,200);assert.deepEqual(body,{p_user:user,p_id:id,p_status:'sold'});
 out=res();await require('../api/listing-status')(request({id,status:'active'}),out);assert.equal(out.statusCode,400);
 }finally{global.fetch=f;}
});
