-- Registrar el cobro de un presupuesto aceptado sin necesitar «Editar presupuestos propios».
--
-- Hasta ahora el cobro se guardaba con un UPDATE común, así que exigía el permiso de edición:
-- un empleado cuyo rol no podía editar tampoco podía marcar que el cliente pagó.
-- Registrar un cobro no cambia el presupuesto, así que ahora alcanza con:
--   · ser el administrador de la empresa (cualquier presupuesto), o
--   · ser quien emitió el presupuesto.
-- Solo se toca payment_status; el resto del presupuesto queda como estaba.

create or replace function public.set_quote_payment(p_quote_id text, p_status text)
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
  if public.is_platform_owner() then
    raise exception 'El propietario de la plataforma no puede modificar presupuestos de una empresa.';
  end if;
  if p_status is null or p_status not in ('por_cobrar', 'sena', 'cobrado') then
    raise exception 'El estado de cobro no es válido.';
  end if;

  select * into q from public.quotes
    where id = p_quote_id and company_id = public.current_company_id();
  if q.id is null then
    raise exception 'El presupuesto no existe o no pertenece a tu empresa.';
  end if;
  if public.current_company_role() <> 'admin' and q.seller_id <> auth.uid() then
    raise exception 'Solo quien emitió el presupuesto o el administrador pueden registrar el cobro.';
  end if;
  if q.status <> 'aceptado' then
    raise exception 'Solo se registra el cobro de presupuestos aceptados.';
  end if;

  update public.quotes set payment_status = p_status where id = q.id;
end
$$;

revoke all on function public.set_quote_payment(text, text) from public, anon;
grant execute on function public.set_quote_payment(text, text) to authenticated;
