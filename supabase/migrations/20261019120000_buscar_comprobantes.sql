-- ═══════════════════════════════════════════════════════════════
-- Buscar comprobantes: por número, por cliente y por fecha
--
-- Pedido de Lucas el 19/10, con la pantalla de Proformas de OBTech como
-- ejemplo: ver todas las facturas por número, por cliente y por fecha,
-- reimprimirlas y bajarlas; y las percepciones igual, con el neto, el
-- IVA y lo percibido de cada factura y el total al pie.
--
-- Es una vista aparte y no más columnas en vista_comprobante_estado
-- porque aquella calcula, renglón por renglón, los intentos a ARCA y lo
-- que queda por devolver: sirve para una lista corta de lo que necesita
-- atención, no para recorrer un mes entero. Ésta es la tabla con su tipo
-- y su punto de venta, nada más.
--
-- Los importes van como están en el comprobante, siempre positivos; el
-- signo del tipo (−1 en una nota de crédito) va en su columna y lo
-- aplica la pantalla al sumar. Es la misma regla que el archivo del
-- contador.
-- ═══════════════════════════════════════════════════════════════

create or replace view public.vista_comprobante_busqueda
with (security_invoker = true) as
select
  c.id,
  c.venta_id,
  c.cliente_id,
  c.estado,
  c.modalidad,
  tc.descripcion as tipo,
  tc.familia,
  tc.clase,
  tc.signo,
  pv.numero as punto_venta,
  c.numero,
  (lpad(pv.numero::text, 5, '0') || '-') || lpad(c.numero::text, 8, '0') as comprobante,
  c.fecha,
  c.receptor_nombre,
  c.receptor_documento,
  c.neto_gravado,
  c.neto_no_gravado,
  c.exento,
  c.iva_total,
  c.tributos_total,
  c.total,
  c.cae,
  c.cae_vencimiento,
  c.impresiones
from public.comprobante c
join public.tipo_comprobante tc on tc.id = c.tipo_comprobante_id
join public.punto_venta pv on pv.id = c.punto_venta_id;

comment on view public.vista_comprobante_busqueda is
  'Comprobantes para buscar por número, cliente y fecha, con neto, IVA y percepciones. Los importes van positivos; el signo del tipo va aparte.';

-- Sin sesión no hay nada que buscar. Con sesión, las políticas de
-- comprobante deciden qué se ve (la vista corre como quien consulta).
revoke all on public.vista_comprobante_busqueda from anon;
grant select on public.vista_comprobante_busqueda to authenticated;
