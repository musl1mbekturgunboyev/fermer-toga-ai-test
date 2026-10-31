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
