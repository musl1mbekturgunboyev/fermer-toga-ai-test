const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {PGlite}=require('@electric-sql/pglite');
const A='11111111-1111-1111-1111-111111111111',B='22222222-2222-2222-2222-222222222222';
let db;
test.before(async()=>{
 db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges in schema public grant usage,select on sequences to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert on storage.objects to authenticated;
 create function storage.foldername(name text) returns text[] language sql as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
 `);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/setup.sql'),'utf8'));
 await db.exec(`insert into auth.users(id) values('${A}'),('${B}');`);
});
test.after(async()=>{await db?.close()});
test('SQL: distributed API limit is atomic and private; push endpoints cannot be stolen',async()=>{
 for(let i=0;i<6;i++)assert.equal((await db.query('select consume_api_rate($1,$2) as ok',[A,'listings'])).rows[0].ok,true);
 assert.equal((await db.query('select consume_api_rate($1,$2) as ok',[A,'listings'])).rows[0].ok,false);
 await assert.rejects(()=>asUser(A,`select consume_api_rate('${A}','listings')`),/permission denied/);
 const sub={endpoint:'https://fcm.googleapis.com/test',keys:{auth:'test',p256dh:'test'}};
 assert.equal((await db.query('select subscribe_push($1,$2) as ok',[A,sub])).rows[0].ok,true);
 assert.equal((await db.query('select subscribe_push($1,$2) as ok',[B,sub])).rows[0].ok,false);
 assert.equal((await db.query('select user_id from push_subs where endpoint=$1',[sub.endpoint])).rows[0].user_id,A);
});
async function asUser(id,sql){await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);try{return await db.query(sql)}finally{await db.exec('reset role')}}
test('SQL: seller can mark active sold, cannot alter content or publish pending through sold',async()=>{
 await db.exec(`insert into listings(id,seller_id,title,price,phone,status) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','${A}','approved',100,'998901234567','active'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','${A}','pending',100,'998901234567','pending_review');`);
 await assert.rejects(()=>asUser(A,"update listings set status='sold',title='tampered' where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'"),/permission denied/);
 await asUser(A,"update listings set status='sold' where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'");
 const pending=await asUser(A,"update listings set status='sold' where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning id");assert.equal(pending.rows.length,0);
 await assert.rejects(()=>asUser(B,'truncate listings'),/permission denied/);
});
test('SQL: profile self promotion, cross-user state and private RPCs are denied',async()=>{
 await assert.rejects(()=>asUser(A,"update profiles set role='admin'"),/permission denied/);
 await asUser(A,"update profiles set full_name='Farmer' where id='"+A+"'");
 await assert.rejects(()=>asUser(A,`select save_app_state('${A}','{"animals":[]}',null)`),/permission denied/);
 await assert.rejects(()=>asUser(A,`insert into push_subs(endpoint,user_id) values('https://example.test','${A}')`),/permission denied/);
});
test('SQL: atomic state writes preserve newer version and enforce animal quota',async()=>{
 const save=(state,expected)=>db.query('select save_app_state($1,$2::jsonb,$3) as result',[A,JSON.stringify(state),expected]);
 const first=(await save({animals:[],admin:true},null)).rows[0].result;assert.ok(first.updated_at);
 assert.equal((await save({animals:[]},null)).rows[0].result.conflict,true);
 assert.equal((await save({animals:Array.from({length:11},(_,i)=>({id:String(i)}))},first.updated_at)).rows[0].result.quota,true);
 const own=await asUser(B,'select * from app_state');assert.equal(own.rows.length,0);
 const row=(await db.query('select json from app_state where user_id=$1',[A])).rows[0];assert.equal(JSON.parse(row.json).admin,undefined);
});
test('SQL: foreign parent ownership is checked and accounts with dependent rows can be deleted',async()=>{
 const C='33333333-3333-3333-3333-333333333333';await db.exec(`insert into auth.users(id) values('${C}');`);
 await asUser(B,`insert into listing_messages(listing_id,from_id,to_id,body) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','${B}','${A}','question')`);
 await asUser(A,`insert into listing_messages(listing_id,from_id,to_id,body) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','${A}','${B}','reply')`);
 await assert.rejects(()=>asUser(A,`insert into listing_messages(listing_id,from_id,to_id,body) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','${A}','${C}','unsolicited')`),/row-level security/);
 await db.exec(`insert into farms(id,owner_id,name) values('cccccccc-cccc-cccc-cccc-cccccccccccc','${B}','B farm');`);
 await assert.rejects(()=>asUser(A,`insert into animals(farm_id,owner_id) values('cccccccc-cccc-cccc-cccc-cccccccccccc','${A}')`),/owner mismatch/);
 await db.exec(`insert into subscriptions(owner_id,plan,status) values('${B}','Pro','active');insert into animals(farm_id,owner_id) values('cccccccc-cccc-cccc-cccc-cccccccccccc','${B}');delete from auth.users where id='${B}';`);
 assert.equal((await db.query('select * from profiles where id=$1',[B])).rows.length,0);
 assert.equal((await db.query('select * from subscriptions where owner_id=$1',[B])).rows.length,0);
 await assert.rejects(()=>asUser(B,`insert into storage.objects(bucket_id,name) values('animal-photos','${B}/after-deletion.jpg')`),/row-level security/);
});
test('SQL: existing-project upgrades are repeat-safe and preserve stored user state',async()=>{
 const before=(await db.query('select json from app_state where user_id=$1',[A])).rows[0].json;
 for(const f of ['production-fix.sql','terms-consent.sql','seller-profiles.sql','feed-reminders.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',f),'utf8'));
 assert.equal((await db.query('select json from app_state where user_id=$1',[A])).rows[0].json,before);
 await assert.rejects(()=>asUser(A,"update listings set title='tampered'"),/permission denied/);
});
