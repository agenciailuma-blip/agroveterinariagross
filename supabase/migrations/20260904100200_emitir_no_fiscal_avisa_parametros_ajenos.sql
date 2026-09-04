-- ═══════════════════════════════════════════════════════════════
-- EMITIR AVISA CUANDO LE PASAN UN PARAMETRO AJENO AL TIPO
--
-- Descubierto probando los limites contra la base: la funcion
-- DESCARTABA EN SILENCIO los parametros que no corresponden al tipo.
-- Pasarle una fecha de validez a un remito, o un domicilio de entrega a
-- un presupuesto, no daba error: el dato simplemente se perdia.
--
-- Las restricciones de la tabla si los rechazan —verificado con inserts
-- directos— pero la funcion nunca llegaba a violarlas porque limpiaba
-- antes. O sea que el dato se perdia sin que nadie se enterara.
--
-- Es la clase de cosa que aparece meses despues: una pantalla manda mal
-- un campo, nadie ve un error, y el presupuesto sale sin fecha de
-- vencimiento. Preferimos fallar en el mostrador, ahora, con un mensaje
-- que dice que pasa.
--
-- Lo unico que cambia es el bloque de validacion del principio.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.emitir_comprobante_no_fiscal(
  p_venta_id     uuid,
  p_tipo_clave   text,
  p_terminal_id  uuid    default null,
  p_lineas       jsonb   default null,
  p_observaciones text   default null,
  p_valido_hasta date    default null,
  p_entrega_domicilio text default null,
  p_entrega_localidad text default null,
  p_entrega_contacto  text default null,
  p_transportista     text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta    public.venta;
  v_cliente  public.cliente;
  v_tipo     public.tipo_comprobante_no_fiscal;
  v_serie    text;
  v_numero   bigint;
  v_id       uuid;
  v_usuario  uuid;
  v_total    numeric;
begin
  select * into v_tipo from public.tipo_comprobante_no_fiscal
  where clave = p_tipo_clave and activo;
  if v_tipo.clave is null then
    raise exception 'No existe el tipo de comprobante no fiscal "%".', p_tipo_clave;
  end if;

  -- Un parametro que no le corresponde al tipo es un error de quien
  -- llama, no un dato para descartar.
  if p_valido_hasta is not null and p_tipo_clave <> 'presupuesto' then
    raise exception 'La fecha de validez es del presupuesto: un % no la lleva.', lower(v_tipo.descripcion);
  end if;
  if p_tipo_clave <> 'remito'
     and coalesce(p_entrega_domicilio, p_entrega_localidad,
                  p_entrega_contacto, p_transportista) is not null then
    raise exception 'Los datos de entrega son del remito: un % no los lleva.', lower(v_tipo.descripcion);
  end if;

  -- El bloqueo de fila serializa contra cobrar_venta(), que toma el
  -- mismo. Sin eso, un remito y un cobro simultaneos podrian no verse
  -- las salidas entre si y descontar dos veces.
  select * into v_venta from public.venta where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'La venta esta anulada: no se puede emitir documentacion sobre ella.';
  end if;
  if not exists (select 1 from public.venta_linea where venta_id = p_venta_id) then
    raise exception 'La venta no tiene productos.';
  end if;

  select * into v_cliente from public.cliente where id = v_venta.cliente_id;
  v_usuario := app.usuario_actual_id();

  select coalesce(t.prefijo, 'T') into v_serie
  from public.terminal t
  where t.id = coalesce(p_terminal_id, v_venta.terminal_origen_id);
  v_serie := coalesce(v_serie, 'T');

  v_numero := app.siguiente_numero_no_fiscal(p_tipo_clave, v_serie);

  insert into public.comprobante_no_fiscal (
    tipo_clave, serie, numero, terminal_id, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, observaciones, valido_hasta,
    entrega_domicilio, entrega_localidad, entrega_contacto, transportista,
    emitido_por
  ) values (
    p_tipo_clave, v_serie, v_numero,
    coalesce(p_terminal_id, v_venta.terminal_origen_id),
    p_venta_id, v_venta.cliente_id,
    v_cliente.nombre, v_cliente.tipo_documento_id, v_cliente.numero_documento,
    v_cliente.condicion_iva_id,
    nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero,
                          v_cliente.piso_depto, v_cliente.localidad)), ''),
    current_date, p_observaciones,
    p_valido_hasta,
    -- El "case" sigue haciendo falta: sin el, un presupuesto heredaria
    -- el domicilio del cliente aunque nadie lo haya pedido.
    case when p_tipo_clave = 'remito' then coalesce(
      p_entrega_domicilio,
      nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero, v_cliente.piso_depto)), '')) end,
    case when p_tipo_clave = 'remito' then coalesce(p_entrega_localidad, v_cliente.localidad) end,
    case when p_tipo_clave = 'remito' then coalesce(p_entrega_contacto, v_cliente.telefono) end,
    case when p_tipo_clave = 'remito' then p_transportista end,
    v_usuario
  )
  returning id into v_id;

  if p_lineas is null then
    insert into public.comprobante_no_fiscal_linea
      (comprobante_no_fiscal_id, orden, producto_id, codigo_producto,
       descripcion, cantidad, precio_unitario, venta_linea_id)
    select v_id, l.orden, l.producto_id, l.codigo_producto,
           l.descripcion, l.cantidad, l.precio_unitario, l.id
    from public.venta_linea l
    where l.venta_id = p_venta_id;
  else
    insert into public.comprobante_no_fiscal_linea
      (comprobante_no_fiscal_id, orden, producto_id, codigo_producto,
       descripcion, cantidad, precio_unitario, venta_linea_id)
    select v_id, l.orden, l.producto_id, l.codigo_producto,
           l.descripcion, (e->>'cantidad')::numeric, l.precio_unitario, l.id
    from jsonb_array_elements(p_lineas) e
    join public.venta_linea l on l.id = (e->>'venta_linea_id')::uuid
    where l.venta_id = p_venta_id
      and (e->>'cantidad')::numeric > 0;

    if not exists (select 1 from public.comprobante_no_fiscal_linea
                   where comprobante_no_fiscal_id = v_id) then
      raise exception 'Ninguna de las lineas indicadas pertenece a esta venta.';
    end if;
  end if;

  select coalesce(sum(importe), 0) into v_total
  from public.comprobante_no_fiscal_linea where comprobante_no_fiscal_id = v_id;

  update public.comprobante_no_fiscal set total = round(v_total, 2) where id = v_id;

  /*
    La salida de stock del remito.

    Solo si la venta todavia no lo descargo. El caso de todos los dias
    en Gross —cobran y despues reparten— entra por aca sin mover nada:
    el stock ya salio al cobrar y este remito solamente documenta que
    la mercaderia viajo.
  */
  if v_tipo.mueve_stock and v_venta.estado in ('borrador', 'en_caja') then
    insert into public.movimiento_stock
      (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id,
       usuario_id, operador_id, terminal_id, ocurrido_en)
    select cl.producto_id, 'remito', -sum(cl.cantidad),
           'Remito ' || v_tipo.sigla || ' ' || v_serie || '-' || lpad(v_numero::text, 8, '0'),
           'remito', v_id,
           v_usuario, v_venta.vendedor_id,
           coalesce(p_terminal_id, v_venta.terminal_origen_id), now()
    from public.comprobante_no_fiscal_linea cl
    where cl.comprobante_no_fiscal_id = v_id and cl.producto_id is not null
    group by cl.producto_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.emitir_comprobante_no_fiscal(
  uuid, text, uuid, jsonb, text, date, text, text, text, text) to authenticated;
