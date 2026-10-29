-- ═══════════════════════════════════════════════════════════════
-- EL MAIL DEL PEDIDO MAYORISTA
--
-- Fase 03, punto 5.3: «al cliente le llega por mail». Apenas el pedido
-- que armó Facundo llega al local, al cliente le llega el detalle:
-- productos, cantidades, precios y total. Lo manda la función
-- enviar-factura, como la factura y el recibo, y lo anota acá: a quién,
-- si salió y cuándo. Así en la ficha del pedido se ve, y si no salió se
-- vuelve a mandar desde ahí.
-- ═══════════════════════════════════════════════════════════════

alter table public.pedido_mayorista
  add column if not exists mail_destinatario text,
  add column if not exists mail_estado       text check (mail_estado in ('enviado', 'error')),
  add column if not exists mail_error        text,
  add column if not exists mail_en           timestamptz;

-- La lista de pedidos, con el mail. Cambia lo que devuelve: se rehace.
drop function if exists public.mayorista_pedidos(text);

create function public.mayorista_pedidos(p_vista text)
returns table (
  id                  uuid,
  numero              bigint,
  estado              text,
  cliente_id          uuid,
  cliente_nombre      text,
  cliente_localidad   text,
  cliente_ruta        text,
  cliente_domicilio   text,
  cliente_telefono    text,
  cliente_email       text,
  cliente_condicion_iva_id smallint,
  vendedor_nombre     text,
  observaciones       text,
  armado_en           timestamptz,
  recibido_en         timestamptz,
  confirmado_en       timestamptz,
  confirmado_por_nombre text,
  facturado_en        timestamptz,
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  total               numeric,
  lineas              jsonb,
  venta_id            uuid,
  venta_codigo        text,
  documentacion       text,
  comprobante_id      uuid,
  comprobante_numero  text,
  comprobante_cae     text,
  interno_id          uuid,
  interno_numero      text,
  remito_id           uuid,
  remito_numero       text,
  mail_destinatario   text,
  mail_estado         text,
  mail_error          text,
  mail_en             timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_todo boolean := app.tiene_permiso('mayorista.atender');
  v_yo   uuid := app.usuario_actual_id();
begin
  if not app.puede_ver_mayorista() then
    raise exception 'No tenés permiso para la venta mayorista.';
  end if;

  return query
  select pm.id, pm.numero, pm.estado, c.id, c.nombre, c.localidad, c.ruta,
         nullif(concat_ws(' ', c.calle, c.numero), ''), c.telefono, c.email, c.condicion_iva_id,
         vend.nombre, pm.observaciones, pm.armado_en, pm.recibido_en, pm.confirmado_en, conf.nombre,
         pm.facturado_en, pm.cancelado_en, pm.motivo_cancelacion,
         coalesce((select sum(round(l.cantidad * l.precio, 2)) from public.pedido_mayorista_linea l where l.pedido_id = pm.id), 0),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'producto_id', l.producto_id, 'codigo', p.codigo, 'nombre', p.nombre_interno,
                    'cantidad', l.cantidad, 'precio', l.precio, 'precio_lista', l.precio_lista,
                    'stock', case when v_todo or app.tiene_permiso('mayorista.ver_stock') then coalesce(s.cantidad, 0) end)
                  order by l.orden)
           from public.pedido_mayorista_linea l
           join public.producto p on p.id = l.producto_id
           left join public.stock_saldo s on s.producto_id = l.producto_id
           where l.pedido_id = pm.id), '[]'::jsonb),
         v.id, v.codigo, v.documentacion,
         comp.id, comp.numero_texto, comp.cae,
         interno.id, interno.numero_texto,
         rem.id, rem.numero_texto,
         pm.mail_destinatario, pm.mail_estado, pm.mail_error, pm.mail_en
  from public.pedido_mayorista pm
  join public.cliente c on c.id = pm.cliente_id
  left join public.usuario vend on vend.id = pm.vendedor_id
  left join public.usuario conf on conf.id = pm.confirmado_por
  left join public.venta v on v.id = pm.venta_id
  left join lateral (
    select co.id,
           lpad(pv.numero::text, 4, '0') || '-' || lpad(co.numero::text, 8, '0') as numero_texto,
           co.cae
    from public.comprobante co
    left join public.punto_venta pv on pv.id = co.punto_venta_id
    where co.venta_id = pm.venta_id and co.estado <> 'anulado'
    order by co.creado_en desc limit 1
  ) comp on true
  left join lateral (
    select n.id, n.serie || '-' || lpad(n.numero::text, 8, '0') as numero_texto
    from public.comprobante_no_fiscal n
    where n.venta_id = pm.venta_id and n.tipo_clave = 'comprobante_interno' and n.anulado_en is null
    order by n.creado_en desc limit 1
  ) interno on true
  left join lateral (
    select n.id, n.serie || '-' || lpad(n.numero::text, 8, '0') as numero_texto
    from public.comprobante_no_fiscal n
    where n.venta_id = pm.venta_id and n.tipo_clave = 'remito' and n.anulado_en is null
    order by n.creado_en desc limit 1
  ) rem on true
  where (v_todo or pm.vendedor_id = v_yo)
    and case p_vista
          when 'pendientes' then pm.estado in ('pendiente', 'confirmado')
          when 'facturados' then pm.estado = 'facturado' and pm.facturado_en > now() - interval '60 days'
          when 'cancelados' then pm.estado = 'cancelado' and pm.cancelado_en > now() - interval '60 days'
          else true
        end
  order by pm.recibido_en desc
  limit 300;
end;
$$;

revoke execute on function public.mayorista_pedidos(text) from public, anon;
grant execute on function public.mayorista_pedidos(text) to authenticated;
