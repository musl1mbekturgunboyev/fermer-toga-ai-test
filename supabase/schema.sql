-- COMPLETE, REPEAT-SAFE INSTALL / UPGRADE. Scheduler is installed separately.
begin;
-- Fermer Tog‘a AI — PostgreSQL (Supabase-style: auth.users, RLS)
do $$begin create type app_role as enum('user','vet','admin');exception when duplicate_object then null;end$$;
create table if not exists profiles(id uuid primary key references auth.users on delete cascade,full_name text,phone text,region text,role app_role default 'user',lang text default 'uz',created_at timestamptz default now());
create table if not exists farms(id uuid primary key default gen_random_uuid(),owner_id uuid references profiles not null,name text not null,region text,district text,notes text);
create table if not exists farm_members(farm_id uuid references farms on delete cascade,user_id uuid references profiles on delete cascade,role text default 'worker',primary key(farm_id,user_id));
create table if not exists animals(id uuid primary key default gen_random_uuid(),farm_id uuid references farms on delete cascade not null,owner_id uuid references profiles not null,tag text,name text,species text check(species in('sigir','buqa','buzoq','qoy','qozi','echki','ot','boshqa')),breed text,sex text,birth_date date,notes text,archived bool default false,created_at timestamptz default now());
create table if not exists animal_photos(id uuid primary key default gen_random_uuid(),animal_id uuid references animals on delete cascade,owner_id uuid references profiles,storage_path text not null); -- private bucket + signed URLs
create table if not exists animal_measurements(id uuid primary key default gen_random_uuid(),animal_id uuid references animals on delete cascade,owner_id uuid references profiles,measured_on date,weight_kg numeric,method text,notes text); -- faqat o‘lchangan vazn
create table if not exists animal_scans(id uuid primary key default gen_random_uuid(),animal_id uuid references animals on delete set null,owner_id uuid references profiles,model text,is_estimate bool default true,result jsonb,confidence numeric,created_at timestamptz default now()); -- AI taxmin
create table if not exists animal_health_records(id uuid primary key default gen_random_uuid(),animal_id uuid references animals on delete cascade,owner_id uuid references profiles,on_date date,observation text,symptoms text,vet_visit bool,treatment_note text);
create table if not exists animal_vaccinations(id uuid primary key default gen_random_uuid(),animal_id uuid references animals on delete cascade,owner_id uuid references profiles,vaccine text,on_date date,next_date date,notes text);
create table if not exists feed_items(id uuid primary key default gen_random_uuid(),name text,category text,unit text default 'kg',price numeric,nutrition jsonb);
create table if not exists animal_feed_plans(id uuid primary key default gen_random_uuid(),animal_id uuid references animals on delete cascade,owner_id uuid references profiles,goal text,items jsonb,edited_by_user bool default false,created_at timestamptz default now());
create table if not exists ai_conversations(id uuid primary key default gen_random_uuid(),owner_id uuid references profiles,created_at timestamptz default now());
create table if not exists ai_messages(id uuid primary key default gen_random_uuid(),conversation_id uuid references ai_conversations on delete cascade,owner_id uuid references profiles,role text,content text,created_at timestamptz default now());
create table if not exists reminders(id uuid primary key default gen_random_uuid(),owner_id uuid references profiles,animal_id uuid references animals on delete cascade,kind text,due_at timestamptz,done bool default false);
create table if not exists notifications(id uuid primary key default gen_random_uuid(),owner_id uuid references profiles,body text,read bool default false,created_at timestamptz default now());
create table if not exists subscriptions(id uuid primary key default gen_random_uuid(),owner_id uuid references profiles,plan text default 'free',status text,period_end timestamptz);
create table if not exists reports(id uuid primary key default gen_random_uuid(),owner_id uuid references profiles,kind text,params jsonb,created_at timestamptz default now());
create table if not exists audit_logs(id bigserial primary key,actor_id uuid,action text,target text,meta jsonb,at timestamptz default now());
create or replace function is_admin() returns bool language sql security definer as $$select exists(select 1 from profiles where id=auth.uid() and role='admin')$$;
do $$ declare t text; begin
 foreach t in array array['animals','animal_photos','animal_measurements','animal_scans','animal_health_records','animal_vaccinations','animal_feed_plans','ai_conversations','ai_messages','reminders','notifications','subscriptions','reports','farms'] loop
  execute format('alter table %I enable row level security',t);
  execute format('drop policy if exists own_%1$s on %1$I',t);
  execute format('create policy own_%1$s on %1$I for all using(%2$s=auth.uid() or is_admin()) with check(%2$s=auth.uid())',t,case when t='farms' then 'owner_id' else 'owner_id' end);
 end loop;
 alter table profiles enable row level security; drop policy if exists own_profile on profiles; create policy own_profile on profiles for all using(id=auth.uid() or is_admin());
 alter table audit_logs enable row level security; drop policy if exists admin_audit on audit_logs; create policy admin_audit on audit_logs for select using(is_admin());
 alter table farm_members enable row level security;
 drop policy if exists own_farm_members on farm_members; create policy own_farm_members on farm_members for all using(user_id=auth.uid() or exists(select 1 from farms f where f.id=farm_id and f.owner_id=auth.uid()) or is_admin()) with check(exists(select 1 from farms f where f.id=farm_id and f.owner_id=auth.uid()) or is_admin());
 alter table feed_items enable row level security;
 drop policy if exists read_feed_items on feed_items; create policy read_feed_items on feed_items for select using(auth.uid() is not null);
 drop policy if exists admin_feed_items on feed_items; create policy admin_feed_items on feed_items for all using(is_admin()) with check(is_admin());
end $$;

-- ===== Production qo‘shimchalari =====
-- Foydalanuvchi o‘z rolini/tarifini o‘zgartira olmasligi kerak
drop policy if exists own_profile on profiles;
drop policy if exists read_profile on profiles; create policy read_profile on profiles for select using(id=auth.uid() or is_admin());
drop policy if exists upd_profile on profiles; create policy upd_profile on profiles for update using(id=auth.uid()) with check(id=auth.uid() and role=(select role from profiles where id=auth.uid()));
drop policy if exists own_subscriptions on subscriptions;
drop policy if exists read_sub on subscriptions; create policy read_sub on subscriptions for select using(owner_id=auth.uid() or is_admin());
-- Ro‘yxatdan o‘tganda profil avtomatik yaratiladi
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,full_name,phone,region) values(new.id,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'phone',new.raw_user_meta_data->>'region'); return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
-- Ilova holati (frontend shu jadvaldan foydalanadi)
create table if not exists app_state(user_id uuid primary key references auth.users on delete cascade, json text, updated_at timestamptz default now());
alter table app_state enable row level security;
drop policy if exists own_state on app_state; create policy own_state on app_state for all using(user_id=auth.uid()) with check(user_id=auth.uid());
-- Yopiq rasm saqlash
insert into storage.buckets(id,name,public) values('animal-photos','animal-photos',false) on conflict do nothing;
drop policy if exists own_photos on storage.objects; create policy own_photos on storage.objects for all using(bucket_id='animal-photos' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='animal-photos' and (storage.foldername(name))[1]=auth.uid()::text);
-- Birinchi adminni qo‘lda tayinlang: update profiles set role='admin' where id='<user id>';
-- AI sarfi (faqat server yozadi) va push obunalar
create table if not exists ai_usage(id bigserial primary key,user_id uuid references auth.users on delete cascade,kind text,at timestamptz default now());
alter table ai_usage enable row level security;
drop policy if exists admin_ai_usage on ai_usage; create policy admin_ai_usage on ai_usage for select using(is_admin());
create table if not exists push_subs(endpoint text primary key,user_id uuid references auth.users on delete cascade,sub jsonb);
alter table push_subs enable row level security;
drop policy if exists own_push on push_subs; create policy own_push on push_subs for all using(user_id=auth.uid()) with check(user_id=auth.uid());
-- ===== Hayvon bozori =====
create table if not exists listings(id uuid primary key default gen_random_uuid(),seller_id uuid references auth.users on delete cascade not null,title text not null,species text,breed text,age text,weight text,price bigint not null,region text,phone text not null,description text,photo_path text,status text default 'pending_payment' check(status in('pending_payment','pending_review','active','sold','removed')),created_at timestamptz default now());
alter table listings enable row level security;
drop policy if exists read_listings on listings; create policy read_listings on listings for select using((status='active' and auth.uid() is not null) or seller_id=auth.uid() or is_admin());
drop policy if exists mark_listing on listings; create policy mark_listing on listings for update using(seller_id=auth.uid()) with check(seller_id=auth.uid() and status in('sold','removed'));
create table if not exists listing_messages(id bigserial primary key,listing_id uuid references listings on delete cascade,from_id uuid references auth.users on delete cascade,to_id uuid references auth.users on delete cascade,body text check(length(body)<=1000),at timestamptz default now());
alter table listing_messages enable row level security;
drop policy if exists read_msgs on listing_messages; create policy read_msgs on listing_messages for select using(from_id=auth.uid() or to_id=auth.uid());
drop policy if exists send_msg on listing_messages; create policy send_msg on listing_messages for insert with check(from_id=auth.uid() and exists(select 1 from listings l where l.id=listing_id and (l.seller_id=to_id or l.seller_id=from_id)));
-- E’lon rasmlari ochiq (xaridorlar ko‘rishi uchun); yuklash faqat server (service_role) orqali
insert into storage.buckets(id,name,public) values('listing-photos','listing-photos',true) on conflict do nothing;
-- Pro berish (qo‘lda): insert into subscriptions(owner_id,plan,status,period_end) values('<user id>','Pro','active',now()+interval '30 days');

-- ===== v1.3: bozor (rasm tekshiruvi, saqlanganlar) =====
alter table listings add column if not exists photos jsonb default '[]';
-- Rasmni foydalanuvchi to‘g‘ridan-to‘g‘ri yuklay olmasin: faqat server (AI tekshiruvidan keyin) yuklaydi
drop policy if exists lp_up on storage.objects;
-- Sotilgan e’lonlar ham ko‘rinsin (belgisi bilan)
drop policy if exists read_listings on listings;
drop policy if exists read_listings on listings; create policy read_listings on listings for select using((status in('active','sold') and auth.uid() is not null) or seller_id=auth.uid() or is_admin());
create table if not exists listing_favorites(user_id uuid references auth.users on delete cascade, listing_id uuid references listings on delete cascade, created_at timestamptz default now(), primary key(user_id,listing_id));
alter table listing_favorites enable row level security;
drop policy if exists own_fav on listing_favorites; create policy own_fav on listing_favorites for all using(user_id=auth.uid()) with check(user_id=auth.uid());

-- ===== v1.4: AI band bo‘lganda qo‘lda moderatsiya (pending_review) va to‘liq RLS =====
alter table listings drop constraint if exists listings_status_check;
alter table listings add constraint listings_status_check check(status in('pending_payment','pending_review','active','sold','removed'));
alter table farm_members enable row level security;
alter table feed_items enable row level security;


-- Existing project: run this migration once in Supabase SQL Editor.

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;
-- Avoid recursive profile RLS; column grants prevent self promotion.
drop policy if exists upd_profile on public.profiles;
create policy upd_profile on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
revoke update on public.profiles from anon,authenticated;
grant update(full_name,phone,region,lang) on public.profiles to authenticated;
-- Only backend may write subscription and app state; reading stays user scoped.
do $$declare p record;begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='subscriptions' loop execute format('drop policy %I on public.subscriptions',p.policyname);end loop;
end$$;
create policy read_sub on public.subscriptions for select to authenticated using(owner_id=auth.uid() or public.is_admin());
revoke insert,update,delete on public.subscriptions from anon,authenticated;
drop policy if exists own_state on public.app_state;
drop policy if exists read_state on public.app_state;
create policy read_state on public.app_state for select to authenticated using(user_id=auth.uid());
revoke insert,update,delete on public.app_state from anon,authenticated;
-- Atomic AI reservation: advisory lock prevents parallel requests bypassing limits.
create or replace function public.consume_ai_quota(p_user uuid,p_kind text) returns boolean language plpgsql security definer set search_path=public as $$
declare p text;lim integer;n integer;
begin
 if p_kind not in ('scan','chat') then raise exception 'Invalid kind';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select plan into p from subscriptions where owner_id=p_user and status='active' and period_end>now() and plan in ('Pro','Ferma') order by case plan when 'Ferma' then 2 else 1 end desc limit 1;
 lim:=case when p='Ferma' then case p_kind when 'scan' then 1000 else 5000 end when p='Pro' then case p_kind when 'scan' then 100 else 500 end else case p_kind when 'scan' then 5 else 30 end end;
 select count(*) into n from ai_usage where user_id=p_user and kind=p_kind and at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 if n>=lim then return false;end if;
 insert into ai_usage(user_id,kind)values(p_user,p_kind);return true;
end$$;
revoke all on function public.consume_ai_quota(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_ai_quota(uuid,text) to service_role;
create index if not exists ai_usage_user_kind_at on public.ai_usage(user_id,kind,at);
create or replace function public.set_user_plan(p_user uuid,p_plan text,p_months integer) returns void language plpgsql security definer set search_path=public as $$begin
 if p_plan not in ('Bepul','Pro','Ferma') or p_months<1 or p_months>24 then raise exception 'Invalid plan';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from profiles where id=p_user) then raise exception 'User missing';end if;
 update subscriptions set status='cancelled' where owner_id=p_user and status='active';
 insert into subscriptions(owner_id,plan,status,period_end)values(p_user,p_plan,'active',now()+make_interval(months=>p_months));
end$$;
revoke all on function public.set_user_plan(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.set_user_plan(uuid,text,integer) to service_role;
-- Block direct normalized animal inserts beyond plan quota too.
create or replace function public.check_animal_limit() returns trigger language plpgsql security definer set search_path=public as $$declare lim integer;p text;begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,0));
 select plan into p from subscriptions where owner_id=new.owner_id and status='active' and period_end>now() order by case plan when 'Ferma' then 2 when 'Pro' then 1 else 0 end desc limit 1;
 lim:=case p when 'Ferma' then 1000 when 'Pro' then 100 else 10 end;
 if (select count(*) from animals where owner_id=new.owner_id)>=lim then raise exception 'Animal limit reached';end if;return new;end$$;
drop trigger if exists animal_limit on public.animals;
create trigger animal_limit before insert on public.animals for each row execute function public.check_animal_limit();


-- Public marketplace handles; private profiles and emails stay private.
create table if not exists public.seller_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 nickname text not null unique check(nickname ~ '^[a-z0-9][a-z0-9._]{2,23}$'),
 display_name text not null default '' check(length(display_name)<=80),
 bio text not null default '' check(length(bio)<=300),
 created_at timestamptz not null default now()
);
alter table public.seller_profiles enable row level security;
revoke all on public.seller_profiles from anon,authenticated;
grant select on public.seller_profiles to authenticated;
grant all on public.seller_profiles to service_role;
drop policy if exists marketplace_read_handles on public.seller_profiles;
create policy marketplace_read_handles on public.seller_profiles for select to authenticated using(true);
insert into public.seller_profiles(user_id,nickname)
select id,'fermer_'||replace(id::text,'-','')::varchar(16) from auth.users on conflict do nothing;
create or replace function public.create_seller_handle() returns trigger language plpgsql security definer set search_path='' as $$
declare candidate text;attempt integer;
begin
 for attempt in 0..7 loop
  candidate:='fermer_'||case when attempt=0 then left(replace(new.id::text,'-',''),16) else left(replace(gen_random_uuid()::text,'-',''),16) end;
  begin
   insert into public.seller_profiles(user_id,nickname) values(new.id,candidate) on conflict(user_id) do nothing;
   return new;
  exception when unique_violation then null;
  end;
 end loop;
 raise exception 'Cannot allocate unique seller handle';
end$$;
revoke all on function public.create_seller_handle() from public,anon,authenticated;
drop trigger if exists create_marketplace_handle on auth.users;
create trigger create_marketplace_handle after insert on auth.users for each row execute function public.create_seller_handle();
notify pgrst,'reload schema';

create table if not exists public.terms_acceptances(
 user_id uuid primary key references auth.users(id) on delete cascade,
 terms_version text not null,
 privacy_version text not null,
 accepted_at timestamptz not null default now()
);
alter table public.terms_acceptances enable row level security;
revoke all on public.terms_acceptances from anon,authenticated;
grant select on public.terms_acceptances to authenticated;
grant all on public.terms_acceptances to service_role;
drop policy if exists own_terms_acceptance on public.terms_acceptances;
create policy own_terms_acceptance on public.terms_acceptances for select to authenticated using(user_id=(select auth.uid()));
notify pgrst,'reload schema';


-- Repeat-safe upgrade; run on an existing database, not schema.sql.
create table if not exists public.feed_listings(
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 80), category text not null,
 price numeric not null check(price>0 and price<10000000000), unit text not null,
 region text not null, phone text not null, description text not null default '', photos jsonb not null default '[]',
 status text not null default 'pending_review' check(status in ('pending_review','active','sold','removed')),
 created_at timestamptz not null default now());
create index if not exists feed_listings_active_created on public.feed_listings(created_at desc) where status='active';
create index if not exists feed_listings_seller on public.feed_listings(seller_id);
alter table public.feed_listings enable row level security;
revoke all on public.feed_listings from anon,authenticated;
grant all on public.feed_listings to service_role;
create table if not exists public.push_config(id text primary key check(id='main'),public_key text,private_key text,cron_hash text);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon,authenticated;
grant all on public.push_config to service_role;
insert into public.push_config(id) values('main') on conflict do nothing;
create table if not exists public.reminder_deliveries(
 id text primary key, user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending', locked_until timestamptz, sent_at timestamptz);
create index if not exists reminder_deliveries_user on public.reminder_deliveries(user_id);
alter table public.reminder_deliveries enable row level security;
revoke all on public.reminder_deliveries from anon,authenticated;
grant all on public.reminder_deliveries to service_role;
create or replace function public.claim_reminder(p_id text,p_user uuid) returns boolean language plpgsql security invoker set search_path=public as $$
begin
 insert into public.reminder_deliveries(id,user_id,locked_until) values(p_id,p_user,now()+interval '90 seconds')
 on conflict(id) do update set locked_until=excluded.locked_until where reminder_deliveries.status<>'sent' and reminder_deliveries.locked_until<now();
 return found;
end $$;
revoke execute on function public.claim_reminder(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_reminder(text,uuid) to service_role;


-- Existing installations: apply after production-fix.sql and feed-reminders.sql.
-- Repeat-safe. No user records, plans or listing content are deleted.

-- All marketplace mutations go through server-only RPCs.
drop policy if exists mark_listing on public.listings;
revoke insert,update,delete on public.listings from public,anon,authenticated;
grant select on public.listings to authenticated;
grant all on public.listings to service_role;
create or replace function public.set_listing_status(p_user uuid,p_id uuid,p_status text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_status not in ('sold','removed') or p_user is null then return false;end if;
 update public.listings set status=p_status where id=p_id and seller_id=p_user
 and ((p_status='sold' and status='active') or (p_status='removed' and status<>'removed'));
 return found;
end$$;
revoke all on function public.set_listing_status(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_listing_status(uuid,uuid,text) to service_role;
-- Direct writes cannot bypass API subscription validation.
drop policy if exists own_push on public.push_subs;
revoke all on public.push_subs from public,anon,authenticated;
grant all on public.push_subs to service_role;
do $$begin
 if not exists(select 1 from pg_constraint where conname='push_endpoint_matches' and conrelid='public.push_subs'::regclass) then
 alter table public.push_subs add constraint push_endpoint_matches check(coalesce(sub->>'endpoint'=endpoint,false)) not valid;
 end if;
end$$;
create or replace function public.save_push_subscription(p_user uuid,p_sub jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_user is null or jsonb_typeof(p_sub)<>'object' or coalesce(p_sub->>'endpoint','')='' then return false;end if;
 insert into public.push_subs(endpoint,user_id,sub)values(p_sub->>'endpoint',p_user,p_sub)
 on conflict(endpoint) do update set sub=excluded.sub where public.push_subs.user_id=excluded.user_id;
 return found;
end$$;
revoke all on function public.save_push_subscription(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_push_subscription(uuid,jsonb) to service_role;
-- Preserve historical usage as successful, but new requests are reserved until settled.
alter table public.ai_usage add column if not exists request_id uuid;
alter table public.ai_usage add column if not exists state text not null default 'succeeded';
alter table public.ai_usage add column if not exists expires_at timestamptz;
create unique index if not exists ai_usage_request_unique on public.ai_usage(request_id);
revoke all on public.ai_usage from public,anon,authenticated;
grant all on public.ai_usage to service_role;
grant usage,select on sequence public.ai_usage_id_seq to service_role;
create or replace function public.reserve_ai_quota(p_user uuid,p_kind text,p_request uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare p text;lim integer;n integer;oldrow public.ai_usage%rowtype;
begin
 if p_user is null or p_request is null or p_kind not in ('scan','chat') then raise exception 'Invalid reservation';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into oldrow from public.ai_usage where request_id=p_request;
 if found then
  if oldrow.user_id=p_user and oldrow.kind=p_kind and (oldrow.state='succeeded' or (oldrow.state='reserved' and oldrow.expires_at>now())) then return p_request;end if;
  raise exception 'Reservation already closed';
 end if;
 select plan into p from public.subscriptions where owner_id=p_user and status='active' and period_end>now() and plan in ('Pro','Ferma') order by case plan when 'Ferma' then 2 else 1 end desc limit 1;
 lim:=case when p='Ferma' then case p_kind when 'scan' then 1000 else 5000 end when p='Pro' then case p_kind when 'scan' then 100 else 500 end else case p_kind when 'scan' then 5 else 30 end end;
 select count(*) into n from public.ai_usage where user_id=p_user and kind=p_kind and at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' and (state='succeeded' or (state='reserved' and expires_at>now()));
 if n>=lim then return null;end if;
 insert into public.ai_usage(user_id,kind,request_id,state,expires_at)values(p_user,p_kind,p_request,'reserved',now()+interval '10 minutes');
 return p_request;
end$$;
create or replace function public.finish_ai_quota(p_user uuid,p_request uuid,p_success boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare desired text;
begin
 if p_success is null or p_user is null then return false;end if;
 desired:=case when p_success then 'succeeded' else 'failed' end;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 update public.ai_usage set state=desired,expires_at=null where request_id=p_request and user_id=p_user and state='reserved' and (not p_success or expires_at>now());
 if found then return true;end if;
 return exists(select 1 from public.ai_usage where request_id=p_request and user_id=p_user and state=desired);
end$$;
revoke all on function public.reserve_ai_quota(uuid,text,uuid),public.finish_ai_quota(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_ai_quota(uuid,text,uuid),public.finish_ai_quota(uuid,uuid,boolean) to service_role;
-- Older callers remain safe against parallel reservations during a rolling deploy.
create or replace function public.consume_ai_quota(p_user uuid,p_kind text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare token uuid;begin
 token:=public.reserve_ai_quota(p_user,p_kind,gen_random_uuid());
 if token is null then return false;end if;
 return public.finish_ai_quota(p_user,token,true);
end$$;
revoke all on function public.consume_ai_quota(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_ai_quota(uuid,text) to service_role;
-- Harden legacy privileged helpers; user-controlled metadata never grants roles.
alter function public.is_admin() set search_path=public;
alter function public.handle_new_user() set search_path=public;
revoke all on function public.handle_new_user() from public,anon,authenticated;
grant execute on function public.is_admin() to authenticated,service_role;
revoke execute on function public.is_admin() from public,anon;
notify pgrst,'reload schema';

-- Harden legacy helpers if an older deployment installed them.
revoke create on schema public from public,anon,authenticated;
revoke insert,update,delete on public.app_state from public,anon,authenticated;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('plan_animal_limit','guard_listing_update') loop
  execute format('alter function %s set search_path=public',f);
 end loop;
end$$;

grant select on public.profiles,public.app_state,public.listings,public.listing_messages,public.listing_favorites to authenticated;
grant insert on public.listing_messages,public.listing_favorites to authenticated;
grant usage,select on sequence public.listing_messages_id_seq to authenticated;
grant delete on public.listing_favorites to authenticated;
grant update(full_name,phone,region,lang) on public.profiles to authenticated;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;
commit;
