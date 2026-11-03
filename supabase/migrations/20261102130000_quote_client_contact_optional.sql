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