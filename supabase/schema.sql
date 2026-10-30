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


-- =====================================================================
-- Fermer Tog‘a AI — v2.0 migratsiya (tariflar, cheklovlar, xavfsizlik)
-- Supabase -> SQL Editor da BIR MARTA ishga tushiring. Qayta ishga tushirsa ham xavfsiz.
-- =====================================================================

-- 0) Eski foydalanuvchilar uchun profil qatorlari yo‘q bo‘lsa, yaratib qo‘yamiz
insert into profiles(id,full_name,phone,region)
select u.id,u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'phone',u.raw_user_meta_data->>'region'
from auth.users u on conflict (id) do nothing;

-- 1) Profilni tahrirlash: foydalanuvchi o‘z ismi/telefoni/viloyatini o‘zgartira oladi, ROLNI o‘zgartira olmaydi
drop policy if exists ins_profile on profiles;
create policy ins_profile on profiles for insert with check(id=auth.uid() and coalesce(role,'user')='user');
drop policy if exists upd_profile on profiles;
create policy upd_profile on profiles for update using(id=auth.uid())
  with check(id=auth.uid() and role=(select p.role from profiles p where p.id=auth.uid()));

-- 2) Ilova holati: hisoblagichlar + hajm chegarasi + TARIF LIMITI (bazaning o‘zida majburlanadi)
alter table app_state add column if not exists animals_n int not null default 0;
alter table app_state add column if not exists rem_n int not null default 0;
alter table app_state add column if not exists rem_json jsonb not null default '[]'::jsonb;
create index if not exists app_state_rem_idx on app_state(rem_n) where rem_n>0;

-- Hayvonlar soni limiti (api/_plans.js dagi bilan bir xil bo‘lsin)
create or replace function plan_animal_limit(p text) returns int language sql immutable as
$$ select case p when 'Ferma' then 200 when 'Pro' then 50 else 10 end $$;

create or replace function app_state_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare j jsonb; n int := 0; r jsonb := '[]'::jsonb; pl text := 'Bepul'; old_n int := 0;
        client boolean := auth.uid() is not null;
begin
  if client and length(coalesce(new.json,'')) > 6000000 then raise exception 'state_too_large'; end if;
  begin j := new.json::jsonb; exception when others then j := null; end;
  if j is null then
    if client then raise exception 'bad_state'; end if;
    new.animals_n := 0; new.rem_n := 0; new.rem_json := '[]'::jsonb;
    return new;
  end if;
  -- Tarif faqat serverdagi `subscriptions` jadvalidan olinadi: brauzer yuborgan "plan" kaliti o‘chiriladi
  if j ? 'plan' then j := j - 'plan'; new.json := j::text; end if;
  n := case when jsonb_typeof(j->'animals')='array' then jsonb_array_length(j->'animals') else 0 end;
  r := case when jsonb_typeof(j->'rem')='array' then j->'rem' else '[]'::jsonb end;
  new.animals_n := n; new.rem_json := r; new.rem_n := jsonb_array_length(r);
  if client and not is_admin() then
    select s.plan into pl from subscriptions s
      where s.owner_id=new.user_id and s.status='active' and s.period_end>now()
      order by case s.plan when 'Ferma' then 3 when 'Pro' then 2 else 1 end desc limit 1;
    pl := coalesce(pl,'Bepul');
    -- upsert (INSERT ... ON CONFLICT) da ham avvalgi qiymat to‘g‘ri olinsin: tarif pasaygan foydalanuvchi eski ma’lumotini saqlay olsin
    select coalesce(a.animals_n,0) into old_n from app_state a where a.user_id=new.user_id;
    old_n := coalesce(old_n,0);
    if n > plan_animal_limit(pl) and n > old_n then raise exception 'animal_limit:%', plan_animal_limit(pl); end if;
  end if;
  return new;
end $$;
drop trigger if exists app_state_guard_trg on app_state;
create trigger app_state_guard_trg before insert or update on app_state for each row execute function app_state_guard();
update app_state set json=json; -- mavjud qatorlar uchun hisoblagichlarni to‘ldiradi

-- 3) Bozor: sotuvchi e’lonni to‘lovsiz/moderatsiyasiz faollashtira olmasin
--    (oldin pending_payment e’lonni "sold" qilib, bozorda ko‘rsatish mumkin edi)
create or replace function guard_listing_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is null or is_admin() then return new; end if;
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then raise exception 'listing_locked'; end if;
  if new.status is distinct from old.status and not (
       (old.status='active' and new.status in ('sold','removed'))
    or (old.status in ('pending_payment','pending_review','sold') and new.status='removed')) then
    raise exception 'listing_status_forbidden';
  end if;
  return new;
end $$;
drop trigger if exists guard_listing_update_trg on listings;
create trigger guard_listing_update_trg before update on listings for each row execute function guard_listing_update();

-- 4) Chat xabarlari: bo‘sh/juda uzun xabar bo‘lmasin (yangi qatorlar uchun)
alter table listing_messages drop constraint if exists msg_body_len;
alter table listing_messages add constraint msg_body_len check(body is not null and length(btrim(body)) between 1 and 1000) not valid;

-- 5) Tarif so‘rovlari (Pro / Ferma): foydalanuvchi so‘raydi, to‘lov tasdiqlangach admin faollashtiradi
create table if not exists plan_requests(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan text not null check(plan in('Pro','Ferma')),
  status text not null default 'pending' check(status in('pending','approved','rejected')),
  created_at timestamptz default now());
alter table plan_requests enable row level security;
drop policy if exists own_plan_requests on plan_requests;
create policy own_plan_requests on plan_requests for select using(user_id=auth.uid() or is_admin());
create index if not exists plan_requests_status_idx on plan_requests(status,created_at);

-- 6) Tezlik uchun indekslar
create index if not exists ai_usage_user_kind_at on ai_usage(user_id,kind,at);
create index if not exists subscriptions_owner_idx on subscriptions(owner_id);
create index if not exists listings_status_created_idx on listings(status,created_at desc);

-- =====================================================================
-- ADMIN tayinlash (o‘z EMAILingizni yozing), keyin saytdan chiqib qayta kiring:
--   update profiles set role='admin' where id=(select id from auth.users where email='SIZNING@EMAIL.COM');
-- O‘zingizga sinov uchun Ferma tarifini 1 yilga berish (ixtiyoriy):
--   insert into subscriptions(owner_id,plan,status,period_end)
--   select id,'Ferma','active',now()+interval '365 days' from auth.users where email='SIZNING@EMAIL.COM';
-- =====================================================================
