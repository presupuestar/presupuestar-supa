create extension if not exists pgcrypto with schema extensions;

create table public.companies (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  document text,
  email text,
  phone text,
  logo_path text,
  title_font_path text,
  text_font_path text,
  primary_color text not null default '#0B2545' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#5BB5F0' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  title_font text,
  text_font text,
  validity_days integer check (validity_days is null or validity_days > 0),
  terms text,
  show_seal boolean not null default true,
  next_quote_number integer not null default 1 check (next_quote_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id text references public.companies(id) on delete set null,
  role text not null check (role in ('admin', 'member')),
  name text not null default '',
  first_access_password_answered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.items (
  id text primary key default gen_random_uuid()::text,
  company_id text not null references public.companies(id) on delete cascade,
  name text not null,
  description text not null default '',
  supplier text not null default '',
  unit text not null default '',
  price numeric not null check (price >= 0),
  currency text not null default 'ARS',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_company_name_idx on public.items (company_id, name);
create index items_company_supplier_idx on public.items (company_id, supplier);

create table public.clients (
  id text primary key default gen_random_uuid()::text,
  company_id text not null references public.companies(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null,
  document text not null default '',
  address text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_company_name_idx on public.clients (company_id, name);

create table public.quotes (
  id text primary key default gen_random_uuid()::text,
  company_id text not null references public.companies(id) on delete cascade,
  number integer not null check (number > 0),
  status text not null check (status in ('borrador', 'pendiente', 'aceptado', 'rechazado')),
  issue_date date,
  validity_days integer check (validity_days is null or validity_days > 0),
  delivery_time text not null default '',
  payment_terms text not null default '',
  notes text not null default '',
  client_id text references public.clients(id) on delete set null,
  client_snapshot jsonb not null default '{}'::jsonb,
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  total numeric not null default 0 check (total >= 0),
  answered_at timestamptz,
  profit numeric not null default 0 check (profit >= 0),
  currency text not null default 'ARS',
  exchange_rate numeric not null default 0 check (exchange_rate >= 0),
  exchange_rate_date text not null default '',
  seller_id uuid references auth.users(id) on delete set null,
  seller_name text not null default '',
  seller_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, number)
);

create index quotes_company_number_idx on public.quotes (company_id, number desc);
create index quotes_company_seller_idx on public.quotes (company_id, seller_id);

create or replace function public.current_company_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.company_id
  from public.profiles p
  where p.user_id = (select auth.uid())
$$;

create or replace function public.current_company_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.user_id = (select auth.uid())
$$;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_owners o
    where o.user_id = (select auth.uid())
  )
$$;

revoke all on function public.current_company_id() from public, anon;
revoke all on function public.current_company_role() from public, anon;
revoke all on function public.is_platform_owner() from public, anon;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.current_company_role() to authenticated;
grant execute on function public.is_platform_owner() to authenticated;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := new.raw_app_meta_data ->> 'role';
begin
  insert into public.profiles (user_id, company_id, role, name)
  values (
    new.id,
    nullif(new.raw_app_meta_data ->> 'company_id', ''),
    case when requested_role = 'admin' then 'admin' else 'member' end,
    coalesce(new.raw_user_meta_data ->> 'name', '')
  );
  return new;
end
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger items_set_updated_at before update on public.items
  for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger quotes_set_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();

create or replace function public.prepare_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.profiles%rowtype;
  line jsonb;
  line_index integer := 0;
  line_currency text;
  quote_currency text := '';
  computed_total numeric := 0;
  customer jsonb;
  assigned_number integer;
begin
  if auth.uid() is not null then
    select * into profile
    from public.profiles
    where user_id = auth.uid();
    if profile.user_id is null or profile.company_id is null then
      raise exception 'El usuario no tiene una empresa asignada.';
    end if;

    if tg_op = 'INSERT' then
      new.company_id := profile.company_id;
      new.seller_id := auth.uid();
      select coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), u.email, '')
      into new.seller_name
      from auth.users u where u.id = auth.uid();
      select coalesce(email, '') into new.seller_email
      from auth.users where id = auth.uid();
      update public.companies
        set next_quote_number = next_quote_number + 1
        where id = profile.company_id
        returning next_quote_number - 1 into assigned_number;
      if assigned_number is null then
        raise exception 'No se encontró la empresa del usuario.';
      end if;
      new.number := assigned_number;
    else
      if new.company_id is distinct from old.company_id
        or new.number is distinct from old.number
        or new.seller_id is distinct from old.seller_id
        or new.seller_name is distinct from old.seller_name
        or new.seller_email is distinct from old.seller_email then
        raise exception 'No se pueden cambiar la empresa, numeración ni vendedor del presupuesto.';
      end if;
    end if;

    if profile.role <> 'admin' and new.seller_id <> auth.uid() then
      raise exception 'No se puede modificar un presupuesto de otro vendedor.';
    end if;
  elsif coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Se requiere una sesión válida.';
  end if;

  if new.client_id is not null and not exists (
    select 1 from public.clients c
    where c.id = new.client_id and c.company_id = new.company_id
  ) then
    raise exception 'El cliente del presupuesto no pertenece a la misma empresa.';
  end if;

  if jsonb_typeof(new.lines) <> 'array' then
    raise exception 'Las líneas del presupuesto deben ser una lista.';
  end if;
  for line in select value from jsonb_array_elements(new.lines)
  loop
    line_currency := upper(coalesce(nullif(trim(line ->> 'moneda'), ''), 'ARS'));
    if quote_currency = '' then quote_currency := line_currency;
    elsif quote_currency <> line_currency then
      raise exception 'Un presupuesto no puede mezclar precios de distintas monedas.';
    end if;
    computed_total := computed_total
      + coalesce((line ->> 'cantidad')::numeric, 0)
      * coalesce((line ->> 'precioUnitario')::numeric, 0);
    line := jsonb_set(line, '{moneda}', to_jsonb(line_currency), true);
    new.lines := jsonb_set(new.lines, array[line_index::text], line, false);
    line_index := line_index + 1;
  end loop;

  new.currency := upper(coalesce(nullif(trim(new.currency), ''), nullif(quote_currency, ''), 'ARS'));
  if quote_currency <> '' and quote_currency <> new.currency then
    raise exception 'La moneda del presupuesto no coincide con sus líneas.';
  end if;
  if new.exchange_rate > 0 and (new.exchange_rate_date = '' or new.currency <> 'ARS') then
    raise exception 'La cotización blue requiere una fecha y un presupuesto en ARS.';
  end if;
  new.total := round(computed_total, 2);
  new.profit := coalesce(new.profit, 0);

  customer := jsonb_build_object(
    'nombre', trim(coalesce(new.client_snapshot ->> 'nombre', '')),
    'email', trim(coalesce(new.client_snapshot ->> 'email', '')),
    'telefono', trim(coalesce(new.client_snapshot ->> 'telefono', '')),
    'documento', trim(coalesce(new.client_snapshot ->> 'documento', '')),
    'direccion', trim(coalesce(new.client_snapshot ->> 'direccion', ''))
  );
  if new.status <> 'borrador'
    and (customer ->> 'nombre' = '' or customer ->> 'email' = '' or customer ->> 'telefono' = '') then
    raise exception 'Faltan datos del cliente: nombre completo, correo electrónico o teléfono.';
  end if;
  new.client_snapshot := customer;

  if tg_op = 'UPDATE' then
    if new.status in ('aceptado', 'rechazado') then
      new.answered_at := coalesce(old.answered_at, now());
    else
      new.answered_at := null;
    end if;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    update public.companies
      set next_quote_number = greatest(next_quote_number, new.number + 1)
      where id = new.company_id;
  end if;
  return new;
end
$$;

create trigger quotes_prepare_before_write
  before insert or update on public.quotes
  for each row execute function public.prepare_quote();

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_owners enable row level security;
alter table public.items enable row level security;
alter table public.clients enable row level security;
alter table public.quotes enable row level security;

revoke all on public.companies, public.profiles, public.platform_owners,
  public.items, public.clients, public.quotes from anon, authenticated;
grant select, insert, update, delete on public.companies to authenticated;
grant select on public.profiles to authenticated;
grant update (name, first_access_password_answered) on public.profiles to authenticated;
grant select on public.platform_owners to authenticated;
grant select, insert, update, delete on public.items, public.clients, public.quotes to authenticated;

create policy "company members and platform owner read companies"
  on public.companies for select to authenticated
  using (id = (select public.current_company_id()) or (select public.is_platform_owner()));
create policy "platform owner manages companies"
  on public.companies for all to authenticated
  using ((select public.is_platform_owner()))
  with check ((select public.is_platform_owner()));

create policy "users and company admins read profiles"
  on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (company_id = (select public.current_company_id())
      and (select public.current_company_role()) = 'admin')
    or (select public.is_platform_owner())
  );
create policy "platform owner manages profiles"
  on public.profiles for all to authenticated
  using ((select public.is_platform_owner()))
  with check ((select public.is_platform_owner()));

create policy "platform owners manage owner registry"
  on public.platform_owners for all to authenticated
  using ((select public.is_platform_owner()))
  with check ((select public.is_platform_owner()));


create policy "company users read items"
  on public.items for select to authenticated
  using (company_id = (select public.current_company_id()) or (select public.is_platform_owner()));
create policy "company users insert items"
  on public.items for insert to authenticated
  with check (company_id = (select public.current_company_id()));
create policy "company users update items"
  on public.items for update to authenticated
  using (company_id = (select public.current_company_id()) or (select public.is_platform_owner()))
  with check (company_id = (select public.current_company_id()) or (select public.is_platform_owner()));
create policy "company users delete items"
  on public.items for delete to authenticated
  using (company_id = (select public.current_company_id()) or (select public.is_platform_owner()));

create policy "company users read clients"
  on public.clients for select to authenticated
  using (company_id = (select public.current_company_id()) or (select public.is_platform_owner()));
create policy "company users insert clients"
  on public.clients for insert to authenticated
  with check (company_id = (select public.current_company_id()));
create policy "company users update clients"
  on public.clients for update to authenticated
  using (company_id = (select public.current_company_id()) or (select public.is_platform_owner()))
  with check (company_id = (select public.current_company_id()) or (select public.is_platform_owner()));
create policy "company users delete clients"
  on public.clients for delete to authenticated
  using (company_id = (select public.current_company_id()) or (select public.is_platform_owner()));

create policy "company users read allowed quotes"
  on public.quotes for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (
        seller_id = (select auth.uid())
        or (select public.current_company_role()) = 'admin'
      ))
    or (select public.is_platform_owner())
  );
create policy "company users insert quotes"
  on public.quotes for insert to authenticated
  with check (company_id = (select public.current_company_id()));
create policy "company users update allowed quotes"
  on public.quotes for update to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (
        seller_id = (select auth.uid())
        or (select public.current_company_role()) = 'admin'
      ))
    or (select public.is_platform_owner())
  )
  with check (
    (company_id = (select public.current_company_id())
      and (
        seller_id = (select auth.uid())
        or (select public.current_company_role()) = 'admin'
      ))
    or (select public.is_platform_owner())
  );
create policy "company users delete allowed quotes"
  on public.quotes for delete to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (
        seller_id = (select auth.uid())
        or exists (
          select 1 from public.profiles me
          where me.user_id = (select auth.uid()) and me.role = 'admin'
        )
      ))
    or (select public.is_platform_owner())
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-assets',
  'company-assets',
  true,
  5242880,
  array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'font/ttf', 'font/woff2', 'application/octet-stream']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "company assets are publicly readable"
  on storage.objects for select to public
  using (bucket_id = 'company-assets');
create policy "platform owners upload company assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'company-assets' and (select public.is_platform_owner()));
create policy "platform owners update company assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'company-assets' and (select public.is_platform_owner()))
  with check (bucket_id = 'company-assets' and (select public.is_platform_owner()));
create policy "platform owners delete company assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'company-assets' and (select public.is_platform_owner()));
