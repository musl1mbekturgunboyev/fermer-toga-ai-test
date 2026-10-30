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
