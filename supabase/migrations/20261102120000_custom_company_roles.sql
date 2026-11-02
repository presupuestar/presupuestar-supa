create table public.company_roles (
  id text primary key default extensions.gen_random_uuid()::text,
  company_id text not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 40),
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (company_id, name),
  check (permissions <@ array[
    'catalog.view',
    'catalog.manage',
    'clients.manage',
    'quotes.create',
    'quotes.view_own',
    'quotes.view_all',
    'quotes.update_own',
    'quotes.delete_own'
  ]::text[])
);

alter table public.profiles drop constraint profiles_role_check;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := new.raw_app_meta_data ->> 'role';
  requested_company text := nullif(new.raw_app_meta_data ->> 'company_id', '');
begin
  if requested_role not in ('admin', 'member') and not exists (
    select 1
    from public.company_roles r
    where r.id = requested_role and r.company_id = requested_company
  ) then
    raise exception 'El rol solicitado no existe para esta empresa.';
  end if;

  insert into public.profiles (user_id, company_id, role, name, email)
  values (
    new.id,
    requested_company,
    coalesce(nullif(requested_role, ''), 'member'),
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, '')
  );
  return new;
end
$$;

alter table public.company_roles enable row level security;
revoke all on public.company_roles from anon, authenticated;
grant select, insert, update, delete on public.company_roles to authenticated;

create policy "company members read company roles"
  on public.company_roles for select to authenticated
  using (company_id = (select public.current_company_id()));
create policy "company admins manage company roles"
  on public.company_roles for all to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.current_company_role()) = 'admin'
  )
  with check (
    company_id = (select public.current_company_id())
    and (select public.current_company_role()) = 'admin'
  );

create or replace function public.prevent_deleting_assigned_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.profiles p
    where p.company_id = old.company_id and p.role = old.id
  ) then
    raise exception 'No se puede eliminar un rol asignado a integrantes del equipo.';
  end if;
  return old;
end
$$;

create trigger company_roles_prevent_assigned_delete
  before delete on public.company_roles
  for each row execute function public.prevent_deleting_assigned_role();

create or replace function public.has_company_permission(permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (
      select 1 from public.profiles p where p.user_id = (select auth.uid())
    ) then false
    when (select public.current_company_role()) = 'admin' then true
    when (select public.current_company_role()) = 'member' then permission = any(array[
      'catalog.view', 'catalog.manage', 'clients.manage', 'quotes.create',
      'quotes.view_own', 'quotes.update_own', 'quotes.delete_own'
    ]::text[])
    else exists (
      select 1
      from public.company_roles r
      where r.company_id = (select public.current_company_id())
        and r.id = (select public.current_company_role())
        and (
          permission = any(r.permissions)
          or (
            permission = 'quotes.view_own'
            and 'quotes.create' = any(r.permissions)
          )
        )
    )
  end
$$;

revoke all on function public.has_company_permission(text) from public, anon;
grant execute on function public.has_company_permission(text) to authenticated;

drop policy "users and company admins read profiles" on public.profiles;
create policy "users and company admins read profiles"
  on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      company_id = (select public.current_company_id())
      and (select public.current_company_role()) = 'admin'
    )
    or (select public.is_platform_owner())
  );

drop policy "company users read items" on public.items;
drop policy "company users insert items" on public.items;
drop policy "company users update items" on public.items;
drop policy "company users delete items" on public.items;
create policy "company users read items"
  on public.items for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.has_company_permission('catalog.view')))
    or (select public.is_platform_owner())
  );
create policy "company users insert items"
  on public.items for insert to authenticated
  with check (
    company_id = (select public.current_company_id())
    and (select public.has_company_permission('catalog.manage'))
  );
create policy "company users update items"
  on public.items for update to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.has_company_permission('catalog.manage')))
    or (select public.is_platform_owner())
  )
  with check (
    (company_id = (select public.current_company_id())
      and (select public.has_company_permission('catalog.manage')))
    or (select public.is_platform_owner())
  );
create policy "company users delete items"
  on public.items for delete to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.has_company_permission('catalog.manage')))
    or (select public.is_platform_owner())
  );

drop policy "company users read clients" on public.clients;
drop policy "company users insert clients" on public.clients;
drop policy "company users update clients" on public.clients;
drop policy "company users delete clients" on public.clients;
create policy "company users read clients"
  on public.clients for select to authenticated
  using (company_id = (select public.current_company_id()) or (select public.is_platform_owner()));
create policy "company users insert clients"
  on public.clients for insert to authenticated
  with check (
    company_id = (select public.current_company_id())
    and (select public.has_company_permission('clients.manage'))
  );
create policy "company users update clients"
  on public.clients for update to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.has_company_permission('clients.manage')))
    or (select public.is_platform_owner())
  )
  with check (
    (company_id = (select public.current_company_id())
      and (select public.has_company_permission('clients.manage')))
    or (select public.is_platform_owner())
  );
create policy "company users delete clients"
  on public.clients for delete to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.has_company_permission('clients.manage')))
    or (select public.is_platform_owner())
  );

drop policy "company users read allowed quotes" on public.quotes;
drop policy "company users insert quotes" on public.quotes;
drop policy "company users update allowed quotes" on public.quotes;
drop policy "company users delete allowed quotes" on public.quotes;
create policy "company users read allowed quotes"
  on public.quotes for select to authenticated
  using (
    (
      company_id = (select public.current_company_id())
      and (
        (seller_id = (select auth.uid())
          and (select public.has_company_permission('quotes.view_own')))
        or (select public.has_company_permission('quotes.view_all'))
      )
    )
    or (select public.is_platform_owner())
  );
create policy "company users insert quotes"
  on public.quotes for insert to authenticated
  with check (
    company_id = (select public.current_company_id())
    and (select public.has_company_permission('quotes.create'))
  );
create policy "company users update allowed quotes"
  on public.quotes for update to authenticated
  using (
    (
      company_id = (select public.current_company_id())
      and seller_id = (select auth.uid())
      and (select public.has_company_permission('quotes.update_own'))
    )
    or (select public.is_platform_owner())
  )
  with check (
    (
      company_id = (select public.current_company_id())
      and seller_id = (select auth.uid())
      and (select public.has_company_permission('quotes.update_own'))
    )
    or (select public.is_platform_owner())
  );
create policy "company users delete allowed quotes"
  on public.quotes for delete to authenticated
  using (
    (
      company_id = (select public.current_company_id())
      and seller_id = (select auth.uid())
      and (select public.has_company_permission('quotes.delete_own'))
    )
    or (select public.is_platform_owner())
  );
