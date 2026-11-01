-- Bir marta Supabase SQL Editor orqali; maxfiy token Vault ichida yaratiladi.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ declare token text; begin
 select decrypted_secret into token from vault.decrypted_secrets where name='ft_reminders_token' limit 1;
 if token is null then token:=encode(extensions.gen_random_bytes(32),'hex');
 perform vault.create_secret(token,'ft_reminders_token','Fermer Toga reminder scheduler'); end if;
 update public.push_config set cron_hash=encode(extensions.digest(token,'sha256'),'hex') where id='main';
end $$;
select cron.schedule('fermer-reminders-every-minute','* * * * *',
$job$select net.http_post(
 url:='https://fermertoga.uz/api/send-reminders',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='ft_reminders_token' limit 1)),
 body:='{"mode":"scheduled"}'::jsonb, timeout_milliseconds:=55000);$job$);
