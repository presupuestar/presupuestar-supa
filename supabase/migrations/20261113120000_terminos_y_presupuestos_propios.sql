-- Aceptación de términos en el primer ingreso y visibilidad estricta de presupuestos:
-- solo el administrador ve los presupuestos de toda la empresa; el resto del equipo
-- ve únicamente los que emitió con su propio usuario.

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

grant update (terms_accepted_at) on public.profiles to authenticated;

drop policy if exists "company users read allowed quotes" on public.quotes;
create policy "company users read allowed quotes"
  on public.quotes for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and not (select public.is_platform_owner())
    and (
      (select public.current_company_role()) = 'admin'
      or (
        seller_id = (select auth.uid())
        and (select public.has_company_permission('quotes.view_own'))
      )
    )
  );
