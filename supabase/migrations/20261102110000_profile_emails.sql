alter table public.profiles
  add column if not exists email text not null default '';

update public.profiles p
set email = coalesce(u.email, '')
from auth.users u
where u.id = p.user_id;

update public.companies c
set next_quote_number = coalesce((
  select max(q.number) + 1
  from public.quotes q
  where q.company_id = c.id
), 1);

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := new.raw_app_meta_data ->> 'role';
begin
  insert into public.profiles (user_id, company_id, role, name, email)
  values (
    new.id,
    nullif(new.raw_app_meta_data ->> 'company_id', ''),
    case when requested_role = 'admin' then 'admin' else 'member' end,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, '')
  );
  return new;
end
$$;

create policy "users update their first access choice"
  on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and company_id is not distinct from (select public.current_company_id())
    and role = (select public.current_company_role())
  );
