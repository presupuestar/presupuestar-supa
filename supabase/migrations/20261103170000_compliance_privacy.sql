-- Cumplimiento: vigencia comercial, cotización con fuente, supresión lógica
-- de clientes y aislamiento del propietario respecto de datos de negocio.

alter table public.companies
  add column if not exists plan_tier text not null default 'inicial',
  add column if not exists status text not null default 'activa',
  add column if not exists storage_usage_bytes bigint not null default 0;

alter table public.companies
  drop constraint if exists companies_plan_tier_check,
  drop constraint if exists companies_status_check;

alter table public.companies
  add constraint companies_plan_tier_check check (plan_tier in ('inicial', 'profesional', 'empresa')),
  add constraint companies_status_check check (status in ('activa', 'suspendida', 'cancelada')),
  add constraint companies_storage_usage_check check (storage_usage_bytes >= 0);

alter table public.clients
  add column if not exists deleted_at timestamptz;

create index if not exists clients_company_active_idx
  on public.clients (company_id, name)
  where deleted_at is null;

alter table public.quotes
  add column if not exists valid_until_date date,
  add column if not exists exchange_rate_source text not null default '';

update public.quotes
set exchange_rate_source = 'dolarapi.com · dólar blue venta'
where exchange_rate > 0 and btrim(exchange_rate_source) = '';

update public.quotes
set valid_until_date = issue_date + (greatest(coalesce(validity_days, 15), 1) - 1)
where valid_until_date is null and issue_date is not null;

update public.quotes
set valid_until_date = (created_at at time zone 'America/Argentina/Buenos_Aires')::date + 14
where valid_until_date is null;

alter table public.quotes
  alter column valid_until_date set not null;

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
    if public.is_platform_owner() then
      raise exception 'El propietario de la plataforma no puede crear ni modificar presupuestos de una empresa.';
    end if;
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
    where c.id = new.client_id
      and c.company_id = new.company_id
      and (
        c.deleted_at is null
        or (tg_op = 'UPDATE' and new.client_id is not distinct from old.client_id)
      )
  ) then
    raise exception 'El cliente del presupuesto no pertenece a la misma empresa o fue suprimido.';
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
  new.exchange_rate := coalesce(new.exchange_rate, 0);
  new.exchange_rate_date := coalesce(new.exchange_rate_date, '');
  new.exchange_rate_source := btrim(coalesce(new.exchange_rate_source, ''));
  if new.exchange_rate > 0 and new.exchange_rate_date = '' then
    raise exception 'La cotización aplicada requiere fecha y hora.';
  end if;
  if new.exchange_rate > 0 and new.exchange_rate_source = '' then
    raise exception 'La cotización aplicada requiere la fuente de la que proviene.';
  end if;
  if new.currency <> 'ARS' and (
    new.exchange_rate <= 0
    or new.exchange_rate_date = ''
    or new.exchange_rate_source = ''
  ) then
    raise exception 'Un presupuesto en moneda extranjera debe registrar el tipo de cambio, la fuente y la fecha y hora de la cotización.';
  end if;

  if new.valid_until_date is null and new.issue_date is not null then
    new.valid_until_date := new.issue_date + (greatest(coalesce(new.validity_days, 15), 1) - 1);
  end if;
  if new.valid_until_date is null then
    raise exception 'El presupuesto debe indicar la fecha de vigencia.';
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
  if customer ->> 'nombre' = '' then
    raise exception 'Falta el nombre completo del cliente.';
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

-- El propietario administra la cuenta (empresa, plan, usuarios). No lee ni escribe
-- catálogo, clientes ni presupuestos.
drop policy if exists "company users read items" on public.items;
drop policy if exists "company users update items" on public.items;
drop policy if exists "company users delete items" on public.items;
create policy "company users read items"
  on public.items for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.has_company_permission('catalog.view'))
    and not (select public.is_platform_owner())
  );
create policy "company users update items"
  on public.items for update to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.has_company_permission('catalog.manage'))
  )
  with check (
    company_id = (select public.current_company_id())
    and (select public.has_company_permission('catalog.manage'))
  );
create policy "company users delete items"
  on public.items for delete to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.has_company_permission('catalog.manage'))
  );

drop policy if exists "company users read clients" on public.clients;
drop policy if exists "company users update clients" on public.clients;
drop policy if exists "company users delete clients" on public.clients;
create policy "company users read clients"
  on public.clients for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and deleted_at is null
    and not (select public.is_platform_owner())
  );
create policy "company users update clients"
  on public.clients for update to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.has_company_permission('clients.manage'))
  )
  with check (
    company_id = (select public.current_company_id())
    and (select public.has_company_permission('clients.manage'))
  );

revoke delete on public.clients from authenticated;

drop policy if exists "company users read allowed quotes" on public.quotes;
drop policy if exists "company users update allowed quotes" on public.quotes;
drop policy if exists "company users delete allowed quotes" on public.quotes;
create policy "company users read allowed quotes"
  on public.quotes for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and not (select public.is_platform_owner())
    and (
      (seller_id = (select auth.uid())
        and (select public.has_company_permission('quotes.view_own')))
      or (select public.has_company_permission('quotes.view_all'))
    )
  );
create policy "company users update allowed quotes"
  on public.quotes for update to authenticated
  using (
    company_id = (select public.current_company_id())
    and seller_id = (select auth.uid())
    and (select public.has_company_permission('quotes.update_own'))
  )
  with check (
    company_id = (select public.current_company_id())
    and seller_id = (select auth.uid())
    and (select public.has_company_permission('quotes.update_own'))
  );
create policy "company users delete allowed quotes"
  on public.quotes for delete to authenticated
  using (
    company_id = (select public.current_company_id())
    and seller_id = (select auth.uid())
    and (select public.has_company_permission('quotes.delete_own'))
  );

-- Directorio operativo del propietario: plan, estado y almacenamiento.
-- No incluye clientes, presupuestos, ítems ni montos.
create or replace function public.platform_company_directory()
returns table (
  id text,
  name text,
  email text,
  primary_color text,
  plan_tier text,
  status text,
  storage_usage_bytes bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Acceso exclusivo del propietario de la plataforma.';
  end if;
  return query
  select
    c.id,
    c.name,
    c.email,
    c.primary_color,
    c.plan_tier,
    c.status,
    coalesce((
      select sum(coalesce((o.metadata ->> 'size')::bigint, 0))
      from storage.objects o
      where o.bucket_id = 'company-assets'
        and o.name like c.id || '/%'
    ), c.storage_usage_bytes),
    c.created_at
  from public.companies c
  order by c.name;
end
$$;

revoke all on function public.platform_company_directory() from public, anon;
grant execute on function public.platform_company_directory() to authenticated;
