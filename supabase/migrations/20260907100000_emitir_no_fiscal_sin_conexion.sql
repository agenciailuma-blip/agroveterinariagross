-- ═══════════════════════════════════════════════════════════════
-- EMITIR UN NO FISCAL SIN CONEXION
--
-- Punto 8 del bloque. Hasta ahora el presupuesto y el remito se armaban
-- en el servidor: la terminal pedia y el servidor decidia el id y el
-- numero. Sin internet eso no existe, y el remito es justamente el papel
-- que sale a la calle — el reparto no espera a que vuelva el wifi.
--
-- ─── EL CAMBIO: LA TERMINAL PUEDE TRAER SU ID Y SU NUMERO ───
--
-- Es el mismo criterio que ya usan las ventas y los movimientos de
-- stock: el id lo genera la terminal, incluso sin conexion, y por eso
-- reenviar la operacion choca contra la clave primaria en vez de
-- duplicar.
--
-- El numero no puede chocar entre terminales porque la SERIE es el
-- prefijo de la terminal. Cada una numera su propia serie y nadie mas
-- escribe ahi. El indice unico queda igual como ultima red.
--
-- ─── IDEMPOTENTE POR EL ID ───
--
-- La bandeja de salida reintenta lo que no llego a confirmarse. Si el
-- comprobante ya existe, la funcion lo devuelve y NO HACE NADA MAS:
-- ni vuelve a copiar las lineas ni vuelve a descontar stock.
--
-- Ese "ni vuelve a descontar stock" es la parte que importa. Un remito
-- reintentado que descuenta dos veces deja el inventario mintiendo, y
-- se descubre recien en la proxima toma.
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
  p_transportista     text default null,
  -- Lo que trae una terminal que emitio sin conexion. En null, el
  -- servidor los decide como siempre.
  p_id           uuid    default null,
  p_serie        text    default null,
  p_numero       bigint  default null,
  p_ocurrido_en  timestamptz default null
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
  v_cuando   timestamptz;
begin
  /*
    Si ya existe, no se toca nada.

    Es lo primero de todo a proposito: la bandeja de salida reintenta, y
    un remito que vuelve a pasar por aca no puede volver a descontar
    stock.
  */
  if p_id is not null then
    perform 1 from public.comprobante_no_fiscal where id = p_id;
    if found then
      return p_id;
    end if;
  end if;

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
  v_cuando  := coalesce(p_ocurrido_en, now());

  -- La serie la puede traer la terminal. Si no, sale de su prefijo.
  v_serie := nullif(trim(coalesce(p_serie, '')), '');
  if v_serie is null then
    select coalesce(t.prefijo, 'T') into v_serie
    from public.terminal t
    where t.id = coalesce(p_terminal_id, v_venta.terminal_origen_id);
    v_serie := coalesce(v_serie, 'T');
  end if;

  /*
    El numero tambien lo puede traer la terminal.

    No pueden chocar entre terminales porque la serie es el prefijo de
    cada una: nadie mas escribe en esa serie. Y si por lo que sea
    llegara repetido, el indice unico lo rechaza — que es exactamente lo
    que tiene que pasar, en vez de dejar dos papeles con el mismo numero
    circulando.
  */
  v_numero := coalesce(p_numero, app.siguiente_numero_no_fiscal(p_tipo_clave, v_serie));

  insert into public.comprobante_no_fiscal (
    id, tipo_clave, serie, numero, terminal_id, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, observaciones, valido_hasta,
    entrega_domicilio, entrega_localidad, entrega_contacto, transportista,
    emitido_por, creado_en, registrado_offline
  ) values (
    coalesce(p_id, gen_random_uuid()),
    p_tipo_clave, v_serie, v_numero,
    coalesce(p_terminal_id, v_venta.terminal_origen_id),
    p_venta_id, v_venta.cliente_id,
    v_cliente.nombre, v_cliente.tipo_documento_id, v_cliente.numero_documento,
    v_cliente.condicion_iva_id,
    nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero,
                          v_cliente.piso_depto, v_cliente.localidad)), ''),
    v_cuando::date, p_observaciones,
    p_valido_hasta,
    -- El "case" sigue haciendo falta: sin el, un presupuesto heredaria
    -- el domicilio del cliente aunque nadie lo haya pedido.
    case when p_tipo_clave = 'remito' then coalesce(
      p_entrega_domicilio,
      nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero, v_cliente.piso_depto)), '')) end,
    case when p_tipo_clave = 'remito' then coalesce(p_entrega_localidad, v_cliente.localidad) end,
    case when p_tipo_clave = 'remito' then coalesce(p_entrega_contacto, v_cliente.telefono) end,
    case when p_tipo_clave = 'remito' then p_transportista end,
    v_usuario, v_cuando, p_id is not null
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

  -- La salida de stock del remito, solo si la venta todavia no la hizo.
  if v_tipo.mueve_stock and v_venta.estado in ('borrador', 'en_caja') then
    insert into public.movimiento_stock
      (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id,
       usuario_id, operador_id, terminal_id, ocurrido_en, registrado_offline)
    select cl.producto_id, 'remito', -sum(cl.cantidad),
           'Remito ' || v_tipo.sigla || ' ' || v_serie || '-' || lpad(v_numero::text, 8, '0'),
           'remito', v_id,
           v_usuario, v_venta.vendedor_id,
           coalesce(p_terminal_id, v_venta.terminal_origen_id), v_cuando,
           p_id is not null
    from public.comprobante_no_fiscal_linea cl
    where cl.comprobante_no_fiscal_id = v_id and cl.producto_id is not null
    group by cl.producto_id;
  end if;

  return v_id;
end;
$$;

comment on function public.emitir_comprobante_no_fiscal(
  uuid, text, uuid, jsonb, text, date, text, text, text, text, uuid, text, bigint, timestamptz) is
  'Emite un presupuesto, remito o comprobante interno. La terminal puede traer su propio id, serie y numero para haber emitido sin conexion; con el id ya existente no hace nada, para que reintentar desde la bandeja de salida sea inofensivo.';

grant execute on function public.emitir_comprobante_no_fiscal(
  uuid, text, uuid, jsonb, text, date, text, text, text, text, uuid, text, bigint, timestamptz)
  to authenticated;

/*
  La version vieja, con diez parametros, deja de existir.

  Postgres las trata como funciones distintas por su firma, asi que
  quedarian las dos y una llamada podria caer en la que no lleva id. Con
  una sola no hay forma de equivocarse.
*/
drop function if exists public.emitir_comprobante_no_fiscal(
  uuid, text, uuid, jsonb, text, date, text, text, text, text);
