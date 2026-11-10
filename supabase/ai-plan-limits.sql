-- Existing project: run once. Preserves current usage; monthly UTC limits.
begin;
create or replace function public.consume_ai_quota(p_user uuid,p_kind text) returns boolean language plpgsql security definer set search_path=public as $$
declare p text;lim integer;n integer;
begin
 if p_kind not in ('scan','agro','chat') then raise exception 'Invalid kind';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select plan into p from subscriptions where owner_id=p_user and status='active' and period_end>now() and plan in ('Pro','Ferma') order by case plan when 'Ferma' then 2 else 1 end desc limit 1;
 lim:=case when p='Ferma' then case p_kind when 'scan' then 1000 when 'agro' then 1000 else 5000 end when p='Pro' then case p_kind when 'scan' then 100 when 'agro' then 100 else 500 end else case p_kind when 'scan' then 2 when 'agro' then 2 else 5 end end;
 select count(*) into n from ai_usage where user_id=p_user and kind=p_kind and at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 if n>=lim then return false;end if;
 insert into ai_usage(user_id,kind)values(p_user,p_kind);return true;
end$$;
revoke all on function public.consume_ai_quota(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_ai_quota(uuid,text) to service_role;
create index if not exists ai_usage_user_kind_at on public.ai_usage(user_id,kind,at);
commit;
