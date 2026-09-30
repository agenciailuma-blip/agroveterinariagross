-- ═══════════════════════════════════════════════════════════════
-- EL HISTORIAL DE COSTOS
--
-- Pedido de Lucas el 14/08: «cuando se compra el mismo producto a varios
-- proveedores, el costo se pisa sin dejar rastro». No sabe si la última
-- compra vino más cara o más barata que la anterior, ni de quién.
--
-- Los datos existen desde el 28/09: cada renglón de mercadería recibida
-- (compra_linea) guarda el costo, la factura y —por la factura— el
-- proveedor. Esto no guarda nada nuevo: lo ordena.
--
-- · vista_historial_costo: cada compra de cada producto, con cuánto
--   cambió contra la compra anterior de ese producto y contra la
--   anterior al mismo proveedor. Es el desplegable de la ficha.
-- · vista_costo_por_proveedor: lo último que se le compró a cada
--   proveedor, producto por producto, con cuánto aumentó y si otro
--   proveedor lo vendió más barato. Es el reporte.
--
-- El costo que se compara es el que quedó en el producto: siempre con
-- IVA. El de una factura A viene sin IVA en el papel; compararlo contra
-- el de una B daría un 21% de «aumento» que no existe.
--
-- Una factura dada de baja no cuenta: su mercadería salió del stock y
-- su costo no es un precio que se haya pagado.
-- ═══════════════════════════════════════════════════════════════

create view public.vista_historial_costo
with (security_invoker = true) as
select
  l.id,
  l.producto_id,
  c.proveedor_id,
  pr.nombre                                   as proveedor,
  c.id                                        as compra_id,
  c.fecha,
  t.descripcion || ' ' || lpad(c.punto_venta::text, 4, '0') || '-' || lpad(c.numero::text, 8, '0') as factura,
  l.cantidad,
  l.costo_unitario,
  l.costo_con_iva                             as costo,
  -- Contra la compra anterior de este producto, a quien sea.
  lag(l.costo_con_iva) over por_producto      as costo_previo,
  lag(pr.nombre) over por_producto            as proveedor_previo,
  -- Contra la compra anterior a este mismo proveedor.
  lag(l.costo_con_iva) over por_proveedor     as costo_previo_proveedor
from public.compra_linea l
join public.compra c           on c.id = l.compra_id and c.eliminado_en is null
join public.proveedor pr       on pr.id = c.proveedor_id
join public.tipo_comprobante t on t.id = c.tipo_comprobante_id
window
  por_producto  as (partition by l.producto_id order by c.fecha, l.creado_en, l.id),
  por_proveedor as (partition by l.producto_id, c.proveedor_id order by c.fecha, l.creado_en, l.id);

comment on view public.vista_historial_costo is
  'Cada compra de cada producto, con el costo con IVA y el de la compra anterior —en general y al mismo proveedor—.';

/*
  Lo último que se le compró a cada proveedor, producto por producto.

  «Otro más barato» mira la última compra de ese producto a cada uno de
  los demás proveedores, y se queda con la más barata. Es la pregunta
  que queda después de ver un aumento: ¿lo tiene otro a menos?
*/
create view public.vista_costo_por_proveedor
with (security_invoker = true) as
with ultima as (
  select distinct on (h.proveedor_id, h.producto_id) h.*
  from public.vista_historial_costo h
  order by h.proveedor_id, h.producto_id, h.fecha desc, h.id desc
),
compras as (
  select proveedor_id, producto_id, count(*) as compras
  from public.vista_historial_costo
  group by proveedor_id, producto_id
)
select
  u.proveedor_id,
  u.proveedor,
  u.producto_id,
  p.codigo,
  p.nombre_interno                           as producto,
  u.fecha                                    as ultima_fecha,
  u.factura                                  as ultima_factura,
  u.costo                                    as ultimo_costo,
  u.costo_previo_proveedor                   as costo_anterior,
  case when u.costo_previo_proveedor > 0
       then round((u.costo / u.costo_previo_proveedor - 1) * 100, 2) end as variacion,
  k.compras,
  o.costo                                    as otro_costo,
  o.proveedor                                as otro_proveedor,
  o.fecha                                    as otro_fecha
from ultima u
join public.producto p on p.id = u.producto_id
join compras k on k.proveedor_id = u.proveedor_id and k.producto_id = u.producto_id
left join lateral (
  select x.costo, x.proveedor, x.fecha
  from ultima x
  where x.producto_id = u.producto_id and x.proveedor_id <> u.proveedor_id and x.costo < u.costo
  order by x.costo, x.fecha desc
  limit 1
) o on true;

comment on view public.vista_costo_por_proveedor is
  'La última compra de cada producto a cada proveedor, cuánto cambió contra la anterior al mismo proveedor, y el otro proveedor que lo vendió más barato.';

grant select on public.vista_historial_costo, public.vista_costo_por_proveedor to authenticated;
