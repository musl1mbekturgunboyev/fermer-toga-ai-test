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
create table push_subs(endpoint text primary key,user_id uuid references auth.users on delete cascade,sub jsonb);
alter table push_subs enable row level security;
create policy own_push on push_subs for all using(user_id=auth.uid()) with check(user_id=auth.uid());
-- ===== Hayvon bozori =====
create table listings(id uuid primary key default gen_random_uuid(),seller_id uuid references auth.users on delete cascade not null,title text not null,species text,breed text,age text,weight text,price bigint not null,region text,phone text not null,description text,photo_path text,status text default 'pending_payment' check(status in('pending_payment','active','sold','removed')),created_at timestamptz default now());
alter table listings enable row level security;
create policy read_listings on listings for select using((status='active' and auth.uid() is not null) or seller_id=auth.uid() or is_admin());
create policy mark_listing on listings for update using(seller_id=auth.uid()) with check(seller_id=auth.uid() and status in('sold','removed'));
create table listing_messages(id bigserial primary key,listing_id uuid references listings on delete cascade,from_id uuid references auth.users on delete cascade,to_id uuid references auth.users on delete cascade,body text check(length(body)<=1000),at timestamptz default now());
alter table listing_messages enable row level security;
create policy read_msgs on listing_messages for select using(from_id=auth.uid() or to_id=auth.uid());
create policy send_msg on listing_messages for insert with check(from_id=auth.uid() and exists(select 1 from listings l where l.id=listing_id and (l.seller_id=to_id or l.seller_id=from_id)));
-- E’lon rasmlari ochiq (xaridorlar ko‘rishi uchun); yuklash faqat o‘z papkasiga
insert into storage.buckets(id,name,public) values('listing-photos','listing-photos',true) on conflict do nothing;
create policy lp_up on storage.objects for insert with check(bucket_id='listing-photos' and (storage.foldername(name))[1]=auth.uid()::text);
-- Pro berish (qo‘lda): insert into subscriptions(owner_id,plan,status,period_end) values('<user id>','Pro','active',now()+interval '30 days');
