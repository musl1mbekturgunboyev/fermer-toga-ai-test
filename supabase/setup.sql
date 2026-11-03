-- NEW EMPTY SUPABASE PROJECT ONLY. Existing project: follow SECURITY-UPDATE.md.

-- SOURCE: schema.sql
-- Fermer Tog‘a AI — PostgreSQL (Supabase-style: auth.users, RLS)
create type app_role as enum('user','vet','admin');
create table profiles(id uuid primary key references auth.users on delete cascade,full_name text,phone text,region text,role app_role default 'user',lang text default 'uz',created_at timestamptz default now());
create table farms(id uuid primary key default gen_random_uuid(),owner_id uuid references profiles not null,name text not null,region text,district text,notes text);
create table farm_members(farm_id uuid references farms on delete cascade,user_id uuid references profiles on delete cascade,role text default 'worker',primary key(farm_id,user_id));
create table animals(id uuid primary key default gen_random_uuid(),farm_id uuid references farms on delete cascade not null,owner_id uuid references profiles not null,tag text,name text,species text check(species in('sigir','buqa','buzoq','qoy','qozi','echki','ot','boshqa')),breed text,sex text,birth_date date,notes text,archived bool default false,created_at timestamptz default now());
create table animal_photos(id uuid primary key default gen_random_uuid(),animal_id uuid references animals on delete cascade,owner_id uuid references profiles,storage_path text not null); -- private bucket + signed URLs
create table animal_measurements(id uuid primary key default gen_random_uuid(),animal_id uuid references animals on delete cascade,owner_id uuid references profiles,measured_on date,weight_kg numeric,method text,notes text); -- faqat o‘lchangan vazn
create table animal_scans(id uuid primary key default gen_random_uuid(),animal_id uuid references animals on delete set null,owner_id uuid references profiles,model text,is_estimate bool default true,result jsonb,confidence numeric,created_at timestamptz default now()); -- AI taxmin
create table animal_health_records(id uuid primary key default gen_random_uuid(),animal_id uuid references animals on delete cascade,owner_id uuid references profiles,on_date date,observation text,symptoms text,vet_visit bool,treatment_note text);
create table animal_vaccinations(id uuid primary key default gen_random_uuid(),animal_id uuid references animals on delete cascade,owner_id uuid references profiles,vaccine text,on_date date,next_date date,notes text);
create table feed_items(id uuid primary key default gen_random_uuid(),name text,category text,unit text default 'kg',price numeric,nutrition jsonb);
create table animal_feed_plans(id uuid primary key default gen_random_uuid(),animal_id uuid references animals on delete cascade,owner_id uuid references profiles,goal text,items jsonb,edited_by_user bool default false,created_at timestamptz default now());
create table ai_conversations(id uuid primary key default gen_random_uuid(),owner_id uuid references profiles,created_at timestamptz default now());
create table ai_messages(id uuid primary key default gen_random_uuid(),conversation_id uuid references ai_conversations on delete cascade,owner_id uuid references profiles,role text,content text,created_at timestamptz default now());
create table reminders(id uuid primary key default gen_random_uuid(),owner_id uuid references profiles,animal_id uuid references animals on delete cascade,kind text,due_at timestamptz,done bool default false);
create table notifications(id uuid primary key default gen_random_uuid(),owner_id uuid references profiles,body text,read bool default false,created_at timestamptz default now());
create table subscriptions(id uuid primary key default gen_random_uuid(),owner_id uuid references profiles,plan text default 'free',status text,period_end timestamptz);
create table reports(id uuid primary key default gen_random_uuid(),owner_id uuid references profiles,kind text,params jsonb,created_at timestamptz default now());
create table audit_logs(id bigserial primary key,actor_id uuid,action text,target text,meta jsonb,at timestamptz default now());
create function is_admin() returns bool language sql security definer as $$select exists(select 1 from profiles where id=auth.uid() and role='admin')$$;
do $$ declare t text; begin
 foreach t in array array['animals','animal_photos','animal_measurements','animal_scans','animal_health_records','animal_vaccinations','animal_feed_plans','ai_conversations','ai_messages','reminders','notifications','subscriptions','reports','farms'] loop
  execute format('alter table %I enable row level security',t);
  execute format('create policy own_%1$s on %1$I for all using(%2$s=auth.uid() or is_admin()) with check(%2$s=auth.uid())',t,case when t='farms' then 'owner_id' else 'owner_id' end);
 end loop;
 alter table profiles enable row level security; create policy own_profile on profiles for all using(id=auth.uid() or is_admin());
 alter table audit_logs enable row level security; create policy admin_audit on audit_logs for select using(is_admin());
 alter table farm_members enable row level security;
 create policy own_farm_members on farm_members for all using(user_id=auth.uid() or exists(select 1 from farms f where f.id=farm_id and f.owner_id=auth.uid()) or is_admin()) with check(exists(select 1 from farms f where f.id=farm_id and f.owner_id=auth.uid()) or is_admin());
 alter table feed_items enable row level security;
 create policy read_feed_items on feed_items for select using(auth.uid() is not null);
 create policy admin_feed_items on feed_items for all using(is_admin()) with check(is_admin());
end $$;

-- ===== Production qo‘shimchalari =====
-- Foydalanuvchi o‘z rolini/tarifini o‘zgartira olmasligi kerak
drop policy own_profile on profiles;
create policy read_profile on profiles for select using(id=auth.uid() or is_admin());
create policy upd_profile on profiles for update using(id=auth.uid()) with check(id=auth.uid() and role=(select role from profiles where id=auth.uid()));
drop policy own_subscriptions on subscriptions;
create policy read_sub on subscriptions for select using(owner_id=auth.uid() or is_admin());
-- Ro‘yxatdan o‘tganda profil avtomatik yaratiladi
create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,full_name,phone,region) values(new.id,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'phone',new.raw_user_meta_data->>'region'); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
-- Ilova holati (frontend shu jadvaldan foydalanadi)
create table app_state(user_id uuid primary key references auth.users on delete cascade, json text, updated_at timestamptz default now());
alter table app_state enable row level security;
create policy own_state on app_state for all using(user_id=auth.uid()) with check(user_id=auth.uid());
-- Yopiq rasm saqlash
insert into storage.buckets(id,name,public) values('animal-photos','animal-photos',false) on conflict do nothing;
create policy own_photos on storage.objects for all using(bucket_id='animal-photos' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='animal-photos' and (storage.foldername(name))[1]=auth.uid()::text);
-- Birinchi adminni qo‘lda tayinlang: update profiles set role='admin' where id='<user id>';
-- AI sarfi (faqat server yozadi) va push obunalar
create table ai_usage(id bigserial primary key,user_id uuid references auth.users on delete cascade,kind text,at timestamptz default now());
alter table ai_usage enable row level security;
create policy admin_ai_usage on ai_usage for select using(is_admin());
create table push_subs(endpoint text primary key,user_id uuid references auth.users on delete cascade,sub jsonb);
alter table push_subs enable row level security;
create policy own_push on push_subs for all using(user_id=auth.uid()) with check(user_id=auth.uid());
-- ===== Hayvon bozori =====
create table listings(id uuid primary key default gen_random_uuid(),seller_id uuid references auth.users on delete cascade not null,title text not null,species text,breed text,age text,weight text,price bigint not null,region text,phone text not null,description text,photo_path text,status text default 'pending_payment' check(status in('pending_payment','pending_review','active','sold','removed')),created_at timestamptz default now());
alter table listings enable row level security;
create policy read_listings on listings for select using((status='active' and auth.uid() is not null) or seller_id=auth.uid() or is_admin());
create policy mark_listing on listings for update using(seller_id=auth.uid()) with check(seller_id=auth.uid() and status in('sold','removed'));
create table listing_messages(id bigserial primary key,listing_id uuid references listings on delete cascade,from_id uuid references auth.users on delete cascade,to_id uuid references auth.users on delete cascade,body text check(length(body)<=1000),at timestamptz default now());
alter table listing_messages enable row level security;
create policy read_msgs on listing_messages for select using(from_id=auth.uid() or to_id=auth.uid());
create policy send_msg on listing_messages for insert with check(from_id=auth.uid() and exists(select 1 from listings l where l.id=listing_id and (l.seller_id=to_id or l.seller_id=from_id)));
-- E’lon rasmlari ochiq (xaridorlar ko‘rishi uchun); yuklash faqat server (service_role) orqali
insert into storage.buckets(id,name,public) values('listing-photos','listing-photos',true) on conflict do nothing;
-- Pro berish (qo‘lda): insert into subscriptions(owner_id,plan,status,period_end) values('<user id>','Pro','active',now()+interval '30 days');

-- ===== v1.3: bozor (rasm tekshiruvi, saqlanganlar) =====
alter table listings add column if not exists photos jsonb default '[]';
-- Rasmni foydalanuvchi to‘g‘ridan-to‘g‘ri yuklay olmasin: faqat server (AI tekshiruvidan keyin) yuklaydi
drop policy if exists lp_up on storage.objects;
-- Sotilgan e’lonlar ham ko‘rinsin (belgisi bilan)
drop policy if exists read_listings on listings;
create policy read_listings on listings for select using((status in('active','sold') and auth.uid() is not null) or seller_id=auth.uid() or is_admin());
create table if not exists listing_favorites(user_id uuid references auth.users on delete cascade, listing_id uuid references listings on delete cascade, created_at timestamptz default now(), primary key(user_id,listing_id));
alter table listing_favorites enable row level security;
create policy own_fav on listing_favorites for all using(user_id=auth.uid()) with check(user_id=auth.uid());

-- ===== v1.4: AI band bo‘lganda qo‘lda moderatsiya (pending_review) va to‘liq RLS =====
alter table listings drop constraint if exists listings_status_check;
alter table listings add constraint listings_status_check check(status in('pending_payment','pending_review','active','sold','removed'));
alter table farm_members enable row level security;
alter table feed_items enable row level security;


-- SOURCE: production-fix.sql
-- Existing project: run this migration once in Supabase SQL Editor.
begin;
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
commit;

-- Security hardening, 2026-11-03. Apply after the original production-fix block.
begin;
-- RLS does not govern TRUNCATE. Remove administrative table privileges from API roles.
do $$declare t text;begin
 foreach t in array array['profiles','farms','farm_members','animals','animal_photos','animal_measurements','animal_scans','animal_health_records','animal_vaccinations','feed_items','animal_feed_plans','ai_conversations','ai_messages','reminders','notifications','subscriptions','reports','audit_logs','app_state','ai_usage','push_subs','listings','listing_messages','listing_favorites'] loop
  execute format('revoke truncate,references,trigger on public.%I from anon,authenticated',t);
 end loop;
end$$;
revoke insert,update,delete on public.push_subs from anon,authenticated;
revoke update on public.listings from anon,authenticated;
grant update(status) on public.listings to authenticated;
drop policy if exists mark_listing on public.listings;
create policy mark_listing on public.listings for update to authenticated
 using(seller_id=(select auth.uid()) and status in('active','sold'))
 with check(seller_id=(select auth.uid()) and status in('sold','removed'));
-- Users cannot start arbitrary conversations on behalf of a seller.
drop policy if exists send_msg on public.listing_messages;
create policy send_msg on public.listing_messages for insert to authenticated with check(
 from_id=(select auth.uid()) and from_id<>to_id and exists(
 select 1 from public.listings l where l.id=listing_id and l.status in('active','sold') and
 (l.seller_id=to_id or (l.seller_id=from_id and exists(
 select 1 from public.listing_messages m where m.listing_id=l.id and m.from_id=listing_messages.to_id and m.to_id=auth.uid())))));
-- Ensure parent relationships cannot point to another owner's rows.
create or replace function public.enforce_owned_parent() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='animals' then
  if not exists(select 1 from public.farms where id=new.farm_id and owner_id=new.owner_id) then raise exception 'Farm owner mismatch';end if;
 elsif tg_table_name='ai_messages' then
  if not exists(select 1 from public.ai_conversations where id=new.conversation_id and owner_id=new.owner_id) then raise exception 'Conversation owner mismatch';end if;
 else
  if new.animal_id is not null and not exists(select 1 from public.animals where id=new.animal_id and owner_id=new.owner_id) then raise exception 'Animal owner mismatch';end if;
 end if;
 return new;
end$$;
revoke all on function public.enforce_owned_parent() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['animals','animal_photos','animal_measurements','animal_scans','animal_health_records','animal_vaccinations','animal_feed_plans','ai_messages','reminders'] loop
  execute format('drop trigger if exists owned_parent on public.%I',t);
  execute format('create trigger owned_parent before insert or update on public.%I for each row execute function public.enforce_owned_parent()',t);
 end loop;
end$$;
-- Allow deletion of an account with subscriptions, farms and normalized records.
do $$declare c record;begin
 for c in select con.conname,cl.relname,at.attname from pg_constraint con
 join pg_class cl on cl.oid=con.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
 join pg_attribute at on at.attrelid=con.conrelid and at.attnum=con.conkey[1]
 where con.contype='f' and con.confrelid='public.profiles'::regclass and ns.nspname='public' and array_length(con.conkey,1)=1 loop
  execute format('alter table public.%I drop constraint %I',c.relname,c.conname);
  execute format('alter table public.%I add constraint %I foreign key(%I) references public.profiles(id) on delete cascade',c.relname,c.conname,c.attname);
 end loop;
end$$;
-- Atomic full-state write, quota and optimistic concurrency control share one user lock.
create or replace function public.save_app_state(p_user uuid,p_state jsonb,p_expected timestamptz)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.app_state%rowtype;p text;lim integer;n integer;prior integer:=0;stamp timestamptz;
begin
 if jsonb_typeof(p_state) is distinct from 'object' or jsonb_typeof(p_state->'animals') is distinct from 'array' then raise exception 'Invalid state';end if;
 if octet_length(p_state::text)>4000000 then raise exception 'State too large';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into old from public.app_state where user_id=p_user for update;
 if old.updated_at is distinct from p_expected then return jsonb_build_object('conflict',true);end if;
 if old.json is not null then
  begin prior:=jsonb_array_length(old.json::jsonb->'animals');exception when others then prior:=0;end;
 end if;
 select plan into p from public.subscriptions where owner_id=p_user and status='active' and period_end>now()
 order by case plan when 'Ferma' then 2 when 'Pro' then 1 else 0 end desc limit 1;
 lim:=case p when 'Ferma' then 1000 when 'Pro' then 100 else 10 end;
 n:=jsonb_array_length(p_state->'animals');
 if n>lim and n>coalesce(prior,0) then return jsonb_build_object('quota',true);end if;
 stamp:=clock_timestamp();
 insert into public.app_state(user_id,json,updated_at) values(p_user,(p_state-'admin'-'plan')::text,stamp)
 on conflict(user_id) do update set json=excluded.json,updated_at=excluded.updated_at;
 return jsonb_build_object('updated_at',stamp);
end$$;
revoke all on function public.save_app_state(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_app_state(uuid,jsonb,timestamptz) to service_role;
commit;
notify pgrst,'reload schema';

-- Persistent rate limits survive process restarts and multiple API instances.
begin;
create table if not exists public.api_rate_limits(
 user_id uuid not null references auth.users(id) on delete cascade,kind text not null,
 window_at timestamptz not null,n integer not null,primary key(user_id,kind));
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public,anon,authenticated;
grant all on public.api_rate_limits to service_role;
create or replace function public.consume_api_rate(p_user uuid,p_kind text) returns boolean
 language plpgsql security definer set search_path='' as $$
declare lim integer;n integer;slot timestamptz:=date_trunc('minute',clock_timestamp());
begin
 if p_kind not in('scan','chat','listings','default','admin','message') then raise exception 'Invalid kind';end if;
 lim:=case p_kind when 'scan' then 8 when 'chat' then 15 when 'listings' then 6 when 'message' then 30 else 20 end;
 insert into public.api_rate_limits as r(user_id,kind,window_at,n) values(p_user,p_kind,slot,1)
 on conflict(user_id,kind) do update set window_at=excluded.window_at,
 n=case when r.window_at=excluded.window_at then r.n+1 else 1 end
 where r.window_at<>excluded.window_at or r.n<lim returning r.n into n;
 return found;
end$$;
revoke all on function public.consume_api_rate(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_api_rate(uuid,text) to service_role;
create or replace function public.subscribe_push(p_user uuid,p_sub jsonb) returns boolean
 language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if (select count(*) from public.push_subs where user_id=p_user)>=20 and not exists(select 1 from public.push_subs where endpoint=p_sub->>'endpoint' and user_id=p_user) then return false;end if;
 insert into public.push_subs as s(endpoint,user_id,sub) values(p_sub->>'endpoint',p_user,p_sub)
 on conflict(endpoint) do update set sub=excluded.sub where s.user_id=excluded.user_id;
 return found;
end$$;
revoke all on function public.subscribe_push(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.subscribe_push(uuid,jsonb) to service_role;
commit;
notify pgrst,'reload schema';

begin;
create or replace function public.enforce_listing_limit() returns trigger language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.seller_id::text,0));
 if tg_table_name='listings' then select count(*) into n from public.listings where seller_id=new.seller_id and status in('active','pending_payment','pending_review');
 else select count(*) into n from public.feed_listings where seller_id=new.seller_id and status in('active','pending_review');end if;
 if n>=50 then raise exception 'Listing limit reached';end if;return new;
end$$;
revoke all on function public.enforce_listing_limit() from public,anon,authenticated;
drop trigger if exists listing_limit on public.listings;
create trigger listing_limit before insert on public.listings for each row execute function public.enforce_listing_limit();
commit;

begin;
revoke insert,update,delete on public.listing_messages from anon,authenticated;
grant insert(listing_id,from_id,to_id,body) on public.listing_messages to authenticated;
create or replace function public.limit_listing_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.consume_api_rate(new.from_id,'message') then raise exception 'Message rate limit reached';end if;
 new.at:=clock_timestamp();return new;
end$$;
revoke all on function public.limit_listing_message() from public,anon,authenticated;
drop trigger if exists message_rate on public.listing_messages;
create trigger message_rate before insert on public.listing_messages for each row execute function public.limit_listing_message();
commit;

-- An old stateless JWT must not be able to upload after its profile is deleted.
drop policy if exists own_photos on storage.objects;
create policy own_photos on storage.objects for all to authenticated
 using(bucket_id='animal-photos' and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from public.profiles where id=auth.uid()))
 with check(bucket_id='animal-photos' and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from public.profiles where id=auth.uid()));


-- SOURCE: terms-consent.sql
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


-- SOURCE: seller-profiles.sql
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
select id,'fermer_'||replace(id::text,'-','')::varchar(16) from auth.users on conflict(user_id) do nothing;
create or replace function public.create_seller_handle() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.seller_profiles(user_id,nickname) values(new.id,'fermer_'||left(replace(new.id::text,'-',''),16)) on conflict(user_id) do nothing;return new;end$$;
revoke all on function public.create_seller_handle() from public,anon,authenticated;
drop trigger if exists create_marketplace_handle on auth.users;
create trigger create_marketplace_handle after insert on auth.users for each row execute function public.create_seller_handle();
notify pgrst,'reload schema';


-- SOURCE: feed-reminders.sql
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

drop trigger if exists feed_listing_limit on public.feed_listings;
create trigger feed_listing_limit before insert on public.feed_listings for each row execute function public.enforce_listing_limit();
