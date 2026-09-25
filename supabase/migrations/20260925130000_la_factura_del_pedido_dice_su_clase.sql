-- ═══════════════════════════════════════════════════════════════
-- LA FACTURA DEL PEDIDO DICE QUÉ CLASE DE COMPROBANTE ES
--
-- Apareció al verificar la pantalla Pedidos web contra la base: la
-- factura figuraba como «00001-00000024», sin decir que es una
-- Factura B. Con una A y una B del mismo número en el mismo punto de
-- venta —que ARCA numera por separado— el número solo no alcanza para
-- saber de cuál se habla.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.pedidos_web(p_vista text)
returns table (
  id                 uuid,
  numero             text,
  estado             text,
  pagado_en_la_web   boolean,
  referencia_pago    text,
  entrega            text,
  domicilio          text,
  localidad          text,
  contacto           text,
  email              text,
  revisar            text,
  revisado_en        timestamptz,
  recibido_en        timestamptz,
  preparado_en       timestamptz,
  entregado_en       timestamptz,
  cancelado_en       timestamptz,
  motivo_cancelacion text,
  venta_id           uuid,
  venta_codigo       text,
  venta_estado       text,
  total              numeric,
  cobrada_en         timestamptz,
  observaciones      text,
  cliente_nombre     text,
  cliente_documento  text,
  comprobante_id     uuid,
  comprobante_estado text,
  comprobante        text,
  remito_id          uuid,
  a_reintegrar       numeric,
  devuelto           numeric,
  lineas             jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('tienda.pedidos') then
    raise exception 'No tenés permiso para atender los pedidos de la tienda.';
  end if;
  if p_vista not in ('por_preparar', 'entregados', 'cancelados') then
    raise exception 'Vista desconocida: %.', p_vista;
  end if;

  return query
  select
    p.id, p.numero_externo, p.estado, p.pagado_en_la_web, p.referencia_pago, p.entrega,
    p.domicilio, p.localidad, p.contacto, p.email, p.revisar, p.revisado_en,
    p.recibido_en, p.preparado_en, p.entregado_en, p.cancelado_en, p.motivo_cancelacion,
    v.id, v.codigo, v.estado, v.total, v.cobrada_en, v.observaciones,
    cl.nombre, cl.numero_documento,
    f.id, f.estado, f.comprobante,
    r.id,
    coalesce((select sum(pr.importe) from public.pedido_reintegro pr
              where pr.pedido_id = p.id and pr.hecho_en is null), 0),
    coalesce((select sum(d.total) from public.devolucion d where d.venta_id = v.id), 0),
    (select coalesce(jsonb_agg(jsonb_build_object(
              'codigo', l.codigo_producto, 'descripcion', l.descripcion,
              'cantidad', l.cantidad, 'precio', l.precio_unitario, 'importe', l.importe)
              order by l.orden), '[]'::jsonb)
     from public.venta_linea l where l.venta_id = v.id)
  from public.pedido_tienda p
  join public.venta v on v.id = p.venta_id
  left join public.cliente cl on cl.id = v.cliente_id
  left join lateral (
    select c.id, c.estado, c.tipo || ' ' || c.comprobante as comprobante
    from public.vista_comprobante_estado c
    where c.venta_id = v.id and c.familia = 'factura' and c.estado <> 'anulado'
    order by c.fecha desc, c.numero desc limit 1
  ) f on true
  left join lateral (
    select n.id from public.comprobante_no_fiscal n
    where n.venta_id = v.id and n.tipo_clave = 'remito' and n.estado <> 'anulado'
    order by n.creado_en desc limit 1
  ) r on true
  where case p_vista
          when 'por_preparar' then p.estado in ('recibido', 'preparado')
          when 'entregados'   then p.estado = 'entregado'
          else p.estado = 'cancelado'
        end
     -- Un cancelado con plata por devolver sigue a la vista en la
     -- primera pestaña: el trabajo no terminó.
     or (p_vista = 'por_preparar' and exists (
           select 1 from public.pedido_reintegro pr
           where pr.pedido_id = p.id and pr.hecho_en is null))
  order by p.recibido_en desc
  limit 300;
end;
$$;

