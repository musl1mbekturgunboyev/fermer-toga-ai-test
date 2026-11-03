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
