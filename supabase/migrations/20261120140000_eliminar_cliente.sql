-- Eliminar (suprimir) un cliente de la cartera.
--
-- Los clientes no se borran: se marca deleted_at para que los presupuestos emitidos
-- conserven su vínculo histórico. Hacerlo con un UPDATE directo fallaba siempre
-- («new row violates row-level security policy»): la política de lectura solo deja ver
-- clientes con deleted_at null y Postgres exige que la fila actualizada siga visible.
-- Esta función hace la supresión del lado del servidor y valida ella misma los permisos.

create or replace function public.delete_client(p_client_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión válida.';
  end if;
  if public.is_platform_owner() then
    raise exception 'El propietario de la plataforma no puede modificar clientes de una empresa.';
  end if;
  if not public.has_company_permission('clients.manage') then
    raise exception 'No tenés permiso para administrar clientes.';
  end if;

  update public.clients
    set deleted_at = now()
    where id = p_client_id
      and company_id = public.current_company_id()
      and deleted_at is null;

  if not found then
    raise exception 'El cliente no existe o ya fue eliminado.';
  end if;
end
$$;

revoke all on function public.delete_client(text) from public, anon;
grant execute on function public.delete_client(text) to authenticated;
