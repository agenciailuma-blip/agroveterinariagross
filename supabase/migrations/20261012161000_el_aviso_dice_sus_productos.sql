-- ═══════════════════════════════════════════════════════════════
-- El aviso al cliente dice qué productos son suyos
--
-- Al recibir una factura de un pedido, la pantalla avisa a qué cliente
-- hay que llamar si una orden interna era para uno. Visto en pantalla el
-- 12/10: el aviso salía también en la segunda factura, que traía sólo
-- lo que faltaba de otro producto —nada de lo del cliente—. Con los
-- productos de cada aviso, la pantalla lo muestra sólo cuando llega
-- algo de lo que él pidió.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.pedido_a_proveedor(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_resultado jsonb;
begin
  if not app.tiene_permiso('compras.ver') then
    raise exception 'No tenés permiso para ver los pedidos a proveedores.';
  end if;

  select jsonb_build_object(
           'id', p.id, 'numero', p.numero, 'fecha', p.fecha,
           'proveedor_id', p.proveedor_id, 'proveedor', pr.nombre,
           'proveedor_cuit', pr.numero_documento, 'proveedor_contacto', pr.contacto,
           'proveedor_telefono', pr.telefono, 'proveedor_email', pr.email,
           'observacion', p.observacion, 'estado', p.estado,
           'minimo_tipo', p.minimo_tipo, 'minimo_valor', p.minimo_valor,
           'creado_por', u.nombre, 'creado_en', p.creado_en,
           'anulado_por', ua.nombre, 'anulado_en', p.anulado_en, 'motivo_anulacion', p.motivo_anulacion,
           'recibido_por', ur.nombre, 'recibido_en', p.recibido_en, 'motivo_cierre', p.motivo_cierre,
           'lineas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'renglon', l.renglon, 'producto_id', l.producto_id, 'codigo', l.codigo,
                      'descripcion', l.descripcion, 'cantidad', l.cantidad, 'costo', l.costo,
                      'peso_kg', l.peso_kg, 'unidades_por_bulto', l.unidades_por_bulto,
                      'recibido', f.recibido)
                    order by l.renglon)
               from public.pedido_proveedor_linea l
               left join app.falta_del_pedido(p.id) f on f.producto_id = l.producto_id
              where l.pedido_id = p.id), '[]'::jsonb),
           'ordenes', coalesce((
             select jsonb_agg(distinct o.numero)
               from public.orden_compra_interna_linea l
               join public.orden_compra_interna o on o.id = l.orden_id
              where l.pedido_id = p.id), '[]'::jsonb),
           'facturas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', c.id, 'fecha', c.fecha,
                      'numero', lpad(c.punto_venta::text, 4, '0') || '-' || lpad(c.numero::text, 8, '0'),
                      'recibida_en', c.recibida_en)
                    order by c.fecha, c.numero)
               from public.compra c
              where c.pedido_id = p.id and c.eliminado_en is null), '[]'::jsonb),
           -- Las órdenes que eran para un cliente: a quién avisarle cuando llega.
           'avisar', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'orden', a.numero, 'cliente', a.cliente, 'contacto', a.contacto, 'que', a.que,
                      'productos', a.productos)
                    order by a.numero)
               from (select o.numero, c.nombre as cliente, o.contacto,
                            string_agg(l.descripcion, ', ' order by l.renglon) as que,
                            coalesce(array_agg(l.producto_id) filter (where l.producto_id is not null), '{}') as productos
                       from public.orden_compra_interna_linea l
                       join public.orden_compra_interna o on o.id = l.orden_id
                       left join public.cliente c on c.id = o.cliente_id
                      where l.pedido_id = p.id
                        and (o.cliente_id is not null or nullif(btrim(coalesce(o.contacto, '')), '') is not null)
                      group by o.numero, c.nombre, o.contacto) a), '[]'::jsonb))
    into v_resultado
    from public.pedido_proveedor p
    join public.proveedor pr on pr.id = p.proveedor_id
    left join public.usuario u on u.id = p.creado_por
    left join public.usuario ua on ua.id = p.anulado_por
    left join public.usuario ur on ur.id = p.recibido_por
   where p.id = p_id;

  return v_resultado;
end;
$$;
