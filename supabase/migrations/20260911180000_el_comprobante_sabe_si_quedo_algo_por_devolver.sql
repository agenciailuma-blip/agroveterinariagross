-- ═══════════════════════════════════════════════════════════════
-- EL COMPROBANTE SABE SI QUEDÓ ALGO POR DEVOLVER
--
-- `tiene_nota_credito` se prende en cuanto existe una nota asociada a la
-- factura, y una devolución parcial crea una. Sin distinguir, la pantalla
-- marcaría como «Devuelta» una venta de tres bolsas a la que volvió una,
-- y escondería el botón de seguir devolviendo las otras dos.
--
-- Se agregan dos datos y no se toca ninguno de los que ya salían: la
-- pantalla de Facturación los está leyendo.
-- ═══════════════════════════════════════════════════════════════

create or replace view public.vista_comprobante_estado
with (security_invoker = true) as
select
  c.id,
  c.venta_id,
  c.estado,
  c.modalidad,
  tc.descripcion as tipo,
  tc.familia,
  pv.numero as punto_venta,
  c.numero,
  (lpad(pv.numero::text, 5, '0') || '-') || lpad(c.numero::text, 8, '0') as comprobante,
  c.fecha,
  c.receptor_nombre,
  c.total,
  c.cae,
  c.cae_vencimiento,
  c.impresiones,
  current_date - c.fecha as dias_desde_emision,
  case
    when c.estado = 'autorizado' and c.impresiones > 0 then 'verde'
    when c.estado = 'autorizado' and c.impresiones = 0 then 'amarillo'
    when c.estado = 'pendiente' then 'naranja'
    when c.estado = 'rechazado' then 'rojo'
    when c.estado = 'contingencia' then 'violeta'
    when c.estado = 'informado' then 'verde'
    else 'gris'
  end as semaforo,
  case
    when c.estado <> all (array['pendiente', 'rechazado']) then null::text
    when (current_date - c.fecha) > 5 then 'vencido'
    when (current_date - c.fecha) >= 4 then 'urgente'
    when (current_date - c.fecha) >= 2 then 'atencion'
    else 'en_plazo'
  end as ventana_cae,
  (select count(*) from public.intento_arca i
    where i.comprobante_id = c.id and i.resultado <> 'ok') as intentos_fallidos,
  (select max(i.creado_en) from public.intento_arca i
    where i.comprobante_id = c.id) as ultimo_intento,
  (exists (select 1
      from public.comprobante_asociado ca
      join public.comprobante nc on nc.id = ca.comprobante_id
     where ca.asociado_id = c.id and nc.estado <> 'anulado')) as tiene_nota_credito,
  -- Si a esta venta ya le devolvieron algo por partes.
  (exists (select 1 from public.devolucion d
            where d.venta_id = c.venta_id)) as tiene_devoluciones_parciales,
  /*
    Si todavía queda mercadería sin devolver.

    Es lo que decide si se sigue ofreciendo devolver. Una venta sin
    líneas —no debería existir, pero la vista no puede suponerlo— da
    false y no ofrece nada, que es el lado seguro.
  */
  (exists (select 1 from public.vista_venta_devolvible vd
            where vd.venta_id = c.venta_id and vd.disponible > 0)) as queda_por_devolver
from public.comprobante c
join public.tipo_comprobante tc on tc.id = c.tipo_comprobante_id
join public.punto_venta pv on pv.id = c.punto_venta_id;

comment on view public.vista_comprobante_estado is
  'Los comprobantes con su semáforo, su ventana de CAE y qué se puede hacer con ellos. «queda_por_devolver» distingue una factura devuelta entera de una que tuvo una devolución parcial.';

grant select on public.vista_comprobante_estado to authenticated;
