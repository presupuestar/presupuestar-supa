-- Seguimiento de cobro de los presupuestos aceptados.
-- Es independiente del estado: el estado dice si el cliente aceptó; el cobro, cuánto pagó.
--   por_cobrar → todavía no pagó nada (null se interpreta igual: los aceptados viejos
--                aparecen como «por cobrar» hasta que alguien lo indique).
--   sena       → pagó la seña (forma de pago «50% al aceptar y 50% a la entrega»).
--   cobrado    → pagó todo.
-- Lo modifica quien puede modificar el presupuesto (mismas políticas de update).

alter table public.quotes
  add column if not exists payment_status text
    check (payment_status in ('por_cobrar', 'sena', 'cobrado'));
