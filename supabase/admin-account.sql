-- Apply AFTER schema.sql (new database only) and production-fix.sql.
-- Grants admin only after the exact account email has been verified.
begin;
create or replace function public.assign_fermer_owner_admin()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if lower(new.email)='muslimbekturgunboyev08@gmail.com' and new.email_confirmed_at is not null then
  insert into public.profiles(id,full_name,role)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name','Muslimbek'),'admin')
  on conflict(id) do update set role='admin';
 end if;
 return new;
end $$;
revoke all on function public.assign_fermer_owner_admin() from public,anon,authenticated;
drop trigger if exists zz_fermer_owner_admin on auth.users;
create trigger zz_fermer_owner_admin after insert or update of email,email_confirmed_at on auth.users
for each row execute function public.assign_fermer_owner_admin();
update public.profiles p set role='admin' from auth.users u
where p.id=u.id and lower(u.email)='muslimbekturgunboyev08@gmail.com'
and u.email_confirmed_at is not null;
commit;
