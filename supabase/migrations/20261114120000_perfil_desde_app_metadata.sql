-- Supabase Auth (admin.createUser) inserta el usuario y DESPUÉS le agrega app_metadata
-- (company_id, role). El trigger de alta corre antes, así que el perfil quedaba sin
-- empresa y como 'member'. Esta migración:
--   1) sincroniza empresa y rol del perfil cuando cambia app_metadata;
--   2) repara los perfiles ya creados sin empresa.

create or replace function public.sync_profile_from_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_company text := nullif(new.raw_app_meta_data ->> 'company_id', '');
  requested_role text := nullif(new.raw_app_meta_data ->> 'role', '');
  valid_role text;
begin
  if requested_company is null then
    return new;
  end if;
  if not exists (select 1 from public.companies c where c.id = requested_company) then
    return new;
  end if;

  if requested_role in ('admin', 'member') then
    valid_role := requested_role;
  elsif requested_role is not null and exists (
    select 1 from public.company_roles r
    where r.id = requested_role and r.company_id = requested_company
  ) then
    valid_role := requested_role;
  end if;

  update public.profiles p
  set company_id = requested_company,
      role = coalesce(valid_role, p.role),
      name = coalesce(nullif(p.name, ''), new.raw_user_meta_data ->> 'name', ''),
      email = coalesce(nullif(p.email, ''), new.email, '')
  where p.user_id = new.id
    and (p.company_id is distinct from requested_company
      or (valid_role is not null and p.role is distinct from valid_role));
  return new;
end
$$;

revoke all on function public.sync_profile_from_app_metadata() from public, anon, authenticated;

drop trigger if exists on_auth_user_app_metadata_profile on auth.users;
create trigger on_auth_user_app_metadata_profile
  after update of raw_app_meta_data on auth.users
  for each row
  when (old.raw_app_meta_data is distinct from new.raw_app_meta_data)
  execute function public.sync_profile_from_app_metadata();

-- Reparar perfiles creados sin empresa por las funciones de administración.
update public.profiles p
set company_id = u.raw_app_meta_data ->> 'company_id',
    role = case
      when u.raw_app_meta_data ->> 'role' in ('admin', 'member') then u.raw_app_meta_data ->> 'role'
      when exists (
        select 1 from public.company_roles r
        where r.id = u.raw_app_meta_data ->> 'role'
          and r.company_id = u.raw_app_meta_data ->> 'company_id'
      ) then u.raw_app_meta_data ->> 'role'
      else p.role
    end,
    email = coalesce(nullif(p.email, ''), u.email, '')
from auth.users u
where u.id = p.user_id
  and p.company_id is null
  and nullif(u.raw_app_meta_data ->> 'company_id', '') is not null
  and exists (select 1 from public.companies c where c.id = u.raw_app_meta_data ->> 'company_id')
  and not exists (select 1 from public.platform_owners o where o.user_id = p.user_id);
