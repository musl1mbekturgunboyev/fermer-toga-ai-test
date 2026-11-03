-- Existing installations: apply after production-fix.sql and feed-reminders.sql.
-- Repeat-safe. No user records, plans or listing content are deleted.
begin;
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

-- Harden legacy helpers if an older deployment installed them.
revoke create on schema public from public,anon,authenticated;
revoke insert,update,delete on public.app_state from public,anon,authenticated;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('plan_animal_limit','guard_listing_update') loop
  execute format('alter function %s set search_path=public',f);
 end loop;
end$$;
notify pgrst,'reload schema';
commit;
