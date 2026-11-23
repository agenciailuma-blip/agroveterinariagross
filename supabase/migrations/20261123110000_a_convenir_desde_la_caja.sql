/*
  «A convenir» desde la caja (pedido de Lucas, 23/11).

  A un cliente con cuenta corriente, en la caja se puede elegir «a
  convenir», y a uno marcado «Precio a convenir» es lo único que se le
  ofrece: la factura va siempre con precio, así que a convenir sale sólo
  con proforma.

  La venta llegó a la caja, pero la proforma a convenir no tiene venta
  hasta que se define el precio (20261114100100). Así que la venta de la
  cola se convierte: sale la proforma a convenir con sus renglones —el
  mismo camino que en el mostrador, con su cargo a la cuenta y su
  descuento de stock—, sale el comprobante de entrega, y la venta queda
  anulada con el número de la proforma como motivo. Todo junto o nada.

  Los números los reserva la terminal, como en el mostrador: así no
  chocan con los que la PC numera sin conexión.
*/

create function public.venta_a_proforma_a_convenir(
  p_venta_id uuid,
  p_terminal_id uuid,
  p_serie text,
  p_numero_proforma bigint,
  p_numero_entrega bigint,
  p_vencido_autorizado_por uuid default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta   public.venta;
  v_cliente public.cliente;
  v_lineas  jsonb;
  v_pro     uuid;
  v_ent     uuid;
  v_numero  text;
begin
  if not app.tiene_permiso('facturacion.no_fiscal_emitir') then
    raise exception 'No tenés permiso para sacar una proforma a convenir.';
  end if;

  select * into v_venta from public.venta where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado <> 'en_caja' then
    raise exception 'La venta % ya no está en la caja.', v_venta.codigo;
  end if;

  select * into v_cliente from public.cliente where id = v_venta.cliente_id;
  if v_cliente.id is null or not v_cliente.cuenta_corriente then
    raise exception 'A convenir es sólo para clientes con cuenta corriente.';
  end if;

  select jsonb_agg(jsonb_build_object(
           'producto_id', l.producto_id,
           'codigo', l.codigo_producto,
           'descripcion', l.descripcion,
           'cantidad', l.cantidad,
           'precio_unitario', l.precio_unitario) order by l.orden)
    into v_lineas
  from public.venta_linea l where l.venta_id = p_venta_id;
  if v_lineas is null then
    raise exception 'La venta no tiene productos.';
  end if;

  -- Las validaciones del precio a convenir (líneas del catálogo, deuda
  -- vencida) las hace emitir_remito_directo(), igual que en el mostrador.
  v_pro := public.emitir_remito_directo(
    v_venta.cliente_id, v_lineas, true, p_terminal_id, app.leyenda_a_convenir(),
    null, null, null, null, gen_random_uuid(), p_serie, p_numero_proforma, now(),
    true, p_vencido_autorizado_por, 'comprobante_interno');

  v_numero := 'PRO ' || p_serie || '-' || lpad(p_numero_proforma::text, 8, '0');

  v_ent := public.emitir_remito_directo(
    v_venta.cliente_id, v_lineas, false, p_terminal_id, 'Corresponde a Proforma ' || v_numero || '.',
    null, null, null, null, gen_random_uuid(), p_serie, p_numero_entrega, now(),
    false, null, 'comprobante_entrega');

  -- La venta de la cola no se cobra: la reemplaza la proforma. No había
  -- movido stock ni deuda, así que anularla no devuelve nada.
  perform public.anular_venta(p_venta_id, 'Salió como proforma a convenir ' || v_numero);

  return json_build_object('proforma_id', v_pro, 'entrega_id', v_ent);
end;
$$;

revoke all on function public.venta_a_proforma_a_convenir(uuid, uuid, text, bigint, bigint, uuid) from public, anon;
grant execute on function public.venta_a_proforma_a_convenir(uuid, uuid, text, bigint, bigint, uuid) to authenticated;

comment on function public.venta_a_proforma_a_convenir is
  'Desde la caja: la venta en cola sale como proforma a convenir, con su comprobante de entrega, y queda anulada.';
