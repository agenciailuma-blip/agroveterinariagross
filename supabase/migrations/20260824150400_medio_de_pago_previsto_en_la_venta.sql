-- ═══════════════════════════════════════════════════════════════
-- 036 — LO QUE EL VENDEDOR YA PREGUNTO NO SE VUELVE A PREGUNTAR
--
-- El vendedor le pregunta al cliente como va a pagar —lo necesita para
-- decirle el precio correcto— pero a la caja solo le llegaba la lista
-- de precios, no el medio. Y varias formas de pago pueden compartir
-- lista: si Efectivo y Transferencia usan la lista Contado, desde la
-- lista no hay forma de saber cual dijo el cliente.
--
-- Resultado: el cajero volvia a preguntar lo que ya se habia
-- preguntado, con el cliente adelante.
--
-- Se guarda el medio y las cuotas que anticipo el vendedor. Es una
-- PREVISION, no el cobro: lo que se cobro de verdad vive en venta_pago,
-- y la caja puede cambiarlo (la tarjeta puede no pasar).
-- ═══════════════════════════════════════════════════════════════

alter table public.venta
  add column if not exists medio_pago_previsto_id uuid
    references public.medio_pago(id) on delete set null,
  add column if not exists cuotas_previstas integer;

comment on column public.venta.medio_pago_previsto_id is
  'Con que dijo el cliente que iba a pagar, segun le pregunto el vendedor. Es una prevision para que la caja no vuelva a preguntar: el cobro real esta en venta_pago y puede ser otro.';

comment on column public.venta.cuotas_previstas is
  'En cuantas cuotas dijo el cliente que iba a pagar. Misma logica que medio_pago_previsto_id.';

create index if not exists venta_medio_previsto_idx
  on public.venta (medio_pago_previsto_id) where medio_pago_previsto_id is not null;
