create table if not exists public.terms_acceptances(
 user_id uuid primary key references auth.users(id) on delete cascade,
 terms_version text not null,
 privacy_version text not null,
 accepted_at timestamptz not null default now()
);
alter table public.terms_acceptances enable row level security;
revoke all on public.terms_acceptances from anon,authenticated;
grant select on public.terms_acceptances to authenticated;
grant all on public.terms_acceptances to service_role;
drop policy if exists own_terms_acceptance on public.terms_acceptances;
create policy own_terms_acceptance on public.terms_acceptances for select to authenticated using(user_id=(select auth.uid()));
notify pgrst,'reload schema';
