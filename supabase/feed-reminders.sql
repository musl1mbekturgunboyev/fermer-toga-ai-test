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
