-- ═══════════════════════════════════════════════════════════════
-- 012 — vista_stock con lo que necesita la pantalla
--
-- La vista original resolvia umbrales y estado, pero le faltaban precio
-- y nombre publico, asi que el listado de productos tenia que hacer dos
-- consultas y unirlas en memoria. Con 3.000 productos eso es trabajo
-- inutil en cada tecla del buscador.
--
-- Se agrega ademas revisado_en, que es lo que el personal de carga usa
-- para saber que producto ya reviso y cual falta.
-- ═══════════════════════════════════════════════════════════════

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
  'Producto con stock, umbral resuelto en tres niveles y estado calculado. Es la fuente del listado de productos de la interfaz. Estado sobrevendido = saldo negativo = hubo venta offline sin existencias.';

grant select on public.vista_stock to authenticated;
