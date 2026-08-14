-- ═══════════════════════════════════════════════════════════════
-- 021 — MARGEN SOBRE COSTO
--
-- EL PRECIO SIEMPRE MANDA
--
-- Es la preocupacion que planteo Lucas: hoy no tiene costos, solo
-- precios, y quiere estar seguro de que agregar margen no le va a
-- "desconfigurar" nada.
--
-- No lo hace, porque precio_venta sigue siendo el valor guardado y
-- autoritativo. El margen es una HERRAMIENTA para calcular un precio,
-- nunca una regla que lo recalcule sola. Cambiar el costo no cambia el
-- precio: marca que quedo desalineado y alguien decide.
--
-- Un producto sin costo y sin margen funciona exactamente igual que
-- antes. Los tres campos son independientes y ninguno es obligatorio.
--
-- SOBRE COSTO, NO SOBRE VENTA
--
-- "Margen" significa dos cosas distintas segun quien lo diga:
--   sobre costo (markup)  (precio - costo) / costo   → 100 a 140 es 40%
--   sobre venta (margen)  (precio - costo) / precio  → 100 a 140 es 28,6%
--
-- Confundirlas es un error clasico y caro. Se guarda el de SOBRE COSTO,
-- que es el que usa el mostrador cuando dice "le pongo cuarenta al
-- costo", y el nombre de la columna lo dice para que nadie tenga que
-- adivinar. La interfaz muestra los dos.
-- ═══════════════════════════════════════════════════════════════

alter table public.producto
  add column margen_sobre_costo numeric(7,2)
    check (margen_sobre_costo is null or margen_sobre_costo > -100);

comment on column public.producto.margen_sobre_costo is
  'Margen deseado sobre el costo, en porcentaje. Opcional. Es una herramienta para calcular el precio, no una regla que lo recalcule solo: precio_venta es siempre el valor autoritativo.';

comment on column public.producto.costo is
  'Costo de reposicion. Opcional: el sistema opera sin el. Sirve para calcular margen y para los reportes de rentabilidad.';

create index producto_margen_idx on public.producto (margen_sobre_costo)
  where margen_sobre_costo is not null and eliminado_en is null;

-- ───────────────────────────────────────────────────────────────
-- Margen real y desvio
--
-- El margen real se deriva de costo y precio. El objetivo es lo que
-- alguien definio. Cuando difieren, es porque cambio el costo y el
-- precio quedo atras — o al reves. Eso es informacion util, no un error
-- que haya que corregir automaticamente.
-- ───────────────────────────────────────────────────────────────
drop view if exists public.vista_stock;

create view public.vista_stock
with (security_invoker = true) as
select
  p.id                        as producto_id,
  p.codigo,
  p.nombre_interno,
  p.nombre_publico,
  p.precio_venta,
  p.costo,
  p.margen_sobre_costo,
  -- Margen efectivo que se esta obteniendo hoy
  case
    when p.costo is null or p.costo <= 0 then null
    else round(((p.precio_venta / p.costo) - 1) * 100, 2)
  end                         as margen_real,
  -- Cuanto se aparta del objetivo. Positivo: se gana mas de lo previsto.
  case
    when p.costo is null or p.costo <= 0 or p.margen_sobre_costo is null then null
    else round(((p.precio_venta / p.costo) - 1) * 100 - p.margen_sobre_costo, 2)
  end                         as desvio_margen,
  -- Lo que valdria el producto si se respetara el margen objetivo
  case
    when p.costo is null or p.margen_sobre_costo is null then null
    else round(p.costo * (1 + p.margen_sobre_costo / 100), 2)
  end                         as precio_sugerido,
  p.unidad_medida,
  p.alicuota_iva_id,
  p.categoria_id,
  p.marca_id,
  p.activo,
  p.revisado_en,
  p.es_producto_veterinario,
  p.es_fitosanitario,
  coalesce(s.cantidad, 0)     as cantidad,
  s.actualizado_en            as stock_actualizado_en,
  coalesce(
    up.bajo, uc.bajo,
    (select (c.valor #>> '{}')::numeric from public.configuracion c
      where c.clave = 'stock.umbral_bajo_general')
  ) as umbral_bajo,
  coalesce(
    up.critico, uc.critico,
    (select (c.valor #>> '{}')::numeric from public.configuracion c
      where c.clave = 'stock.umbral_critico_general')
  ) as umbral_critico,
  case
    when coalesce(s.cantidad, 0) < 0 then 'sobrevendido'
    when coalesce(s.cantidad, 0) <= coalesce(
           up.critico, uc.critico,
           (select (c.valor #>> '{}')::numeric from public.configuracion c
             where c.clave = 'stock.umbral_critico_general')) then 'critico'
    when coalesce(s.cantidad, 0) <= coalesce(
           up.bajo, uc.bajo,
           (select (c.valor #>> '{}')::numeric from public.configuracion c
             where c.clave = 'stock.umbral_bajo_general')) then 'bajo'
    else 'ok'
  end as estado
from public.producto p
left join public.stock_saldo  s  on s.producto_id  = p.id
left join public.umbral_stock up on up.producto_id = p.id            and up.ambito = 'producto'
left join public.umbral_stock uc on uc.categoria_id = p.categoria_id and uc.ambito = 'categoria'
where p.eliminado_en is null;

comment on view public.vista_stock is
  'Producto con stock, umbrales, estado y rentabilidad. margen_real se deriva de costo y precio; desvio_margen compara contra el objetivo; precio_sugerido es lo que valdria respetando ese objetivo.';

grant select on public.vista_stock to authenticated;

insert into public.configuracion (clave, valor, descripcion, grupo) values
  ('precios.margen_default', 'null',
   'Margen sobre costo que se propone al cargar un producto nuevo. Nulo es sin propuesta.', 'precios')
on conflict (clave) do nothing;
