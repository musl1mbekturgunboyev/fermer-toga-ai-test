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
