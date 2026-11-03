const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),test=require('node:test');
test('Postgres: clean/repeat install, RLS, listing transitions and quota settlement',async()=>{
 const db=new PGlite();await db.waitReady;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean);
 create table storage.objects(id uuid primary key,bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
 const schema=fs.readFileSync(path.join(__dirname,'../supabase/schema.sql'),'utf8');await db.exec(schema);await db.exec(schema);
 const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
 await db.exec(`insert into auth.users(id)values('${A}'),('${B}')`);
 async function as(role,user,sql){await db.exec(`set role ${role};select set_config('request.jwt.claim.sub','${user||''}',false)`);try{return await db.query(sql)}finally{await db.exec('reset role')}}
 const val=async(role,user,sql)=>(await as(role,user,sql)).rows[0].v;
 const denied=async(role,user,sql)=>assert.rejects(as(role,user,sql),e=>e.code==='42501');
 const ids={};for(const [i,st]of ['pending_payment','pending_review','removed','active'].entries()){
 const id='10000000-0000-4000-8000-'+String(i+1).padStart(12,'0');ids[st]=id;
 await db.exec(`insert into public.listings(id,seller_id,title,price,phone,status)values('${id}','${A}','original',100,'123','${st}')`);
 }
 await denied('authenticated',A,`update public.listings set status='sold',title='bypass' where id='${ids.pending_payment}'`);
 await denied('authenticated',A,`select public.set_listing_status('${A}','${ids.active}','sold')`);
 for(const st of ['pending_payment','pending_review','removed'])assert.equal(await val('service_role',null,`select public.set_listing_status('${A}','${ids[st]}','sold') v`),false);
 assert.equal(await val('service_role',null,`select public.set_listing_status('${B}','${ids.active}','sold') v`),false);
 assert.equal(await val('service_role',null,`select public.set_listing_status('${A}','${ids.active}','sold') v`),true);
 assert.equal(await val('service_role',null,`select public.set_listing_status('${A}','${ids.active}','sold') v`),false);
 assert.equal((await db.query(`select title from public.listings where id='${ids.active}'`)).rows[0].title,'original');
 assert.equal(await val('authenticated',B,'select count(*)::int v from public.listings'),1);
 await denied('authenticated',A,`insert into public.push_subs(endpoint,user_id,sub)values('https://localhost','${A}','{}')`);
 await denied('authenticated',A,`update public.push_subs set sub='{}'`);
 await denied('authenticated',A,`insert into public.app_state(user_id,json)values('${A}','{}')`);
 await denied('authenticated',A,`update public.profiles set role='admin' where id='${A}'`);
 assert.equal(await val('authenticated',A,`update public.profiles set full_name='valid' where id='${A}' returning full_name v`),'valid');
 const endpoint='https://fcm.googleapis.com/fcm/send/test';
 assert.equal(await val('service_role',null,`select public.save_push_subscription('${A}','{"endpoint":"${endpoint}"}') v`),true);
 assert.equal(await val('service_role',null,`select public.save_push_subscription('${B}','{"endpoint":"${endpoint}"}') v`),false);
 await assert.rejects(as('service_role',null,`update public.push_subs set sub='{"endpoint":"https://localhost"}'`),e=>e.code==='23514');
 await denied('authenticated',A,`select public.reserve_ai_quota('${A}','scan',gen_random_uuid())`);
 const rq=Array.from({length:8},(_,i)=>'20000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
 const reserve=id=>val('service_role',null,`select public.reserve_ai_quota('${A}','scan','${id}') v`);
 const finish=(id,success,user=A)=>val('service_role',null,`select public.finish_ai_quota('${user}','${id}',${success}) v`);
 for(let i=0;i<5;i++)assert.equal(await reserve(rq[i]),rq[i]);
 assert.equal(await reserve(rq[5]),null);assert.equal(await reserve(rq[0]),rq[0]);
 assert.equal(await finish(rq[0],false,B),false);
 assert.equal(await finish(rq[0],false),true);assert.equal(await finish(rq[0],false),true);assert.equal(await reserve(rq[5]),rq[5]);
 assert.equal(await finish(rq[1],true),true);assert.equal(await finish(rq[1],true),true);assert.equal(await finish(rq[1],false),false);
 await db.exec(`update public.ai_usage set expires_at=now()-interval '1 second' where request_id='${rq[2]}'`);
 assert.equal(await reserve(rq[6]),rq[6]);assert.equal(await finish(rq[2],true),false);
 await denied('anon',null,`select public.set_listing_status('${A}','${ids.active}','sold')`);
 }finally{await db.close()}
});
