/*
  La marca «Precio a convenir»

  Fase 03, punto 2. Lucas: «cómo los separo». Una marca en la ficha del
  cliente de cuenta corriente: el mostrador le ofrece primero el remito
  interno en vez de mandar a la caja. No cambia lo que se puede hacer:
  con cualquier cliente de cuenta corriente se puede hacer el remito, y
  con este se puede mandar a la caja igual.
*/
alter table public.cliente
  add column if not exists precio_a_convenir boolean not null default false;

comment on column public.cliente.precio_a_convenir is
  'Los precios se arreglan después: el mostrador le ofrece primero el remito interno en vez de mandar a la caja.';
