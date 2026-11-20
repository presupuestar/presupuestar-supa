  -- «Puede ver las ganancias», por empleado.
  --
  -- La ganancia estimada deja de guardarse en public.quotes (que todo el equipo puede leer
  -- según su alcance) y pasa a public.quote_profits, que solo devuelve filas a quien tiene
  -- el permiso. Así no alcanza con ocultarla en la pantalla: la base no la entrega.
  --   · El administrador siempre ve las ganancias.
  --   · Cada empleado tiene profiles.can_view_profit. Los que ya existían quedan en true
  --     (siguen como hasta ahora); al crear uno nuevo, el administrador elige.
  --   · La ganancia se escribe con set_quote_profit(); quotes.profit queda siempre en 0.
  
  -- 1) Permiso por empleado.
  alter table public.profiles
    add column if not exists can_view_profit boolean not null default true;
  
  create or replace function public.can_view_profit()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
  as $$
    select coalesce((
      select p.company_id is not null and (p.role = 'admin' or p.can_view_profit)
      from public.profiles p
      where p.user_id = (select auth.uid())
    ), false)
    and not (select public.is_platform_owner())
  $$;
  
  revoke all on function public.can_view_profit() from public, anon;
  grant execute on function public.can_view_profit() to authenticated;
  
  -- El administrador cambia el permiso de un empleado de su empresa.
  create or replace function public.set_profit_access(p_user_id uuid, p_can_view boolean)
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    me public.profiles;
  begin
    select * into me from public.profiles where user_id = auth.uid();
    if me.user_id is null or me.role <> 'admin' or me.company_id is null then
      raise exception 'Solo el administrador puede cambiar quién ve las ganancias.';
    end if;
    update public.profiles
      set can_view_profit = coalesce(p_can_view, false)
      where user_id = p_user_id
        and company_id = me.company_id
        and role <> 'admin';
    if not found then
      raise exception 'El empleado no existe o no pertenece a tu empresa.';
    end if;
  end
  $$;
  
  revoke all on function public.set_profit_access(uuid, boolean) from public, anon;
  grant execute on function public.set_profit_access(uuid, boolean) to authenticated;
  
  -- 2) Ganancias en su propia tabla.
  create table if not exists public.quote_profits (
    quote_id text primary key references public.quotes(id) on delete cascade,
    company_id text not null references public.companies(id) on delete cascade,
    profit numeric not null default 0 check (profit >= 0),
    updated_at timestamptz not null default now()
  );
  
  alter table public.quote_profits enable row level security;
  
  drop policy if exists "profit readers read quote profits" on public.quote_profits;
  create policy "profit readers read quote profits"
    on public.quote_profits for select to authenticated
    using (
      company_id = (select public.current_company_id())
      and (select public.can_view_profit())
    );
  
  -- Nadie escribe directo: solo a través de set_quote_profit().
  revoke all on public.quote_profits from anon, authenticated;
  grant select on public.quote_profits to authenticated;
  
  create or replace function public.set_quote_profit(p_quote_id text, p_profit numeric)
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    q public.quotes;
  begin
    if auth.uid() is null then
      raise exception 'Se requiere una sesión válida.';
    end if;
    if not public.can_view_profit() then
      raise exception 'No tenés permiso para ver ni cargar ganancias.';
    end if;
    if p_profit is null or p_profit < 0 then
      raise exception 'La ganancia tiene que ser un importe igual o mayor a 0.';
    end if;
    select * into q from public.quotes
      where id = p_quote_id and company_id = public.current_company_id();
    if q.id is null then
      raise exception 'El presupuesto no existe o no pertenece a tu empresa.';
    end if;
    if public.current_company_role() <> 'admin' and q.seller_id <> auth.uid() then
      raise exception 'No se puede cargar la ganancia de un presupuesto de otro vendedor.';
    end if;
  
    insert into public.quote_profits (quote_id, company_id, profit, updated_at)
      values (q.id, q.company_id, round(p_profit, 2), now())
      on conflict (quote_id) do update
        set profit = excluded.profit, updated_at = excluded.updated_at;
  end
  $$;
  
  revoke all on function public.set_quote_profit(text, numeric) from public, anon;
  grant execute on function public.set_quote_profit(text, numeric) to authenticated;
  
  -- 3) Pasar las ganancias existentes a la tabla nueva y vaciar la columna vieja.
  insert into public.quote_profits (quote_id, company_id, profit)
    select id, company_id, coalesce(profit, 0)
    from public.quotes
    where coalesce(profit, 0) > 0
  on conflict (quote_id) do nothing;
  
  -- Sin pasar por prepare_quote: el trigger exige una sesión y el SQL Editor no tiene ninguna.
  alter table public.quotes disable trigger quotes_prepare_before_write;
  update public.quotes set profit = 0 where coalesce(profit, 0) <> 0;
  alter table public.quotes enable trigger quotes_prepare_before_write;
  
  -- 4) De acá en adelante quotes.profit nunca guarda un importe, aunque una versión
  --    vieja de la app lo siga enviando.
  create or replace function public.quotes_clear_profit()
  returns trigger
  language plpgsql
  set search_path = ''
  as $$
  begin
    new.profit := 0;
    return new;
  end
  $$;
  
  drop trigger if exists quotes_zz_clear_profit on public.quotes;
  create trigger quotes_zz_clear_profit
    before insert or update on public.quotes
    for each row execute function public.quotes_clear_profit();
