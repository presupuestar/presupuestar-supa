-- El administrador de la empresa puede editar, cambiar de estado y eliminar cualquier
-- presupuesto de su empresa, no solo los que emitió. El resto del equipo sigue limitado
-- a los propios (y solo si su rol tiene el permiso correspondiente).
--
-- El trigger de validación ya lo permitía para el administrador (role = 'admin'); lo que
-- lo bloqueaba eran estas dos políticas, que exigían seller_id = auth.uid() para todos.
-- El vendedor original del presupuesto no cambia: el trigger impide modificar seller_*.

drop policy if exists "company users update allowed quotes" on public.quotes;
create policy "company users update allowed quotes"
  on public.quotes for update to authenticated
  using (
    company_id = (select public.current_company_id())
    and not (select public.is_platform_owner())
    and (
      (select public.current_company_role()) = 'admin'
      or (
        seller_id = (select auth.uid())
        and (select public.has_company_permission('quotes.update_own'))
      )
    )
  )
  with check (
    company_id = (select public.current_company_id())
    and not (select public.is_platform_owner())
    and (
      (select public.current_company_role()) = 'admin'
      or (
        seller_id = (select auth.uid())
        and (select public.has_company_permission('quotes.update_own'))
      )
    )
  );

drop policy if exists "company users delete allowed quotes" on public.quotes;
create policy "company users delete allowed quotes"
  on public.quotes for delete to authenticated
  using (
    company_id = (select public.current_company_id())
    and not (select public.is_platform_owner())
    and (
      (select public.current_company_role()) = 'admin'
      or (
        seller_id = (select auth.uid())
        and (select public.has_company_permission('quotes.delete_own'))
      )
    )
  );
