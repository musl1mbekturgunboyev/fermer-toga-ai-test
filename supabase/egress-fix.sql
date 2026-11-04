begin;

-- Return reminders only, never the full photo/chat/application JSON.
create or replace function public.get_reminder_inputs()
returns table(user_id uuid,rem jsonb) language plpgsql security invoker set search_path='' as $$
declare item record;data jsonb;
begin
 for item in select a.user_id,a.json from public.app_state a
 where exists(select 1 from public.push_subs s where s.user_id=a.user_id) loop
  begin data:=item.json::jsonb;exception when others then continue;end;
  if jsonb_typeof(data->'rem')='array' and jsonb_array_length(data->'rem')>0 then
   user_id:=item.user_id;rem:=data->'rem';return next;
  end if;
 end loop;
end$$;
revoke all on function public.get_reminder_inputs() from public,anon,authenticated;
grant execute on function public.get_reminder_inputs() to service_role;

notify pgrst,'reload schema';
commit;
