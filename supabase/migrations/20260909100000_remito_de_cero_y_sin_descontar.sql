-- ═══════════════════════════════════════════════════════════════
-- EL REMITO QUE NO DESCUENTA, Y EL REMITO QUE NACE SOLO
--
-- Los dos pedidos de Lucas del 07/09 sobre remitos. Van juntos porque
-- el segundo no sirve sin el primero: el caso que motiva el remito de
-- cero es justamente el que NO puede descontar stock.
--
-- ─── EL CASO, EN LAS PALABRAS DE LUCAS ───
--
-- Gross emite remitos para la municipalidad —y para clientes por
-- pedido— de mercaderia QUE TODAVIA NO ENTRO AL LOCAL. Se pide
-- especialmente para ese cliente y se documenta antes de tenerla.
--
-- Un remito asi no puede descontar stock: descontaria algo que no esta.
-- Y no puede nacer de una venta, porque no hay venta todavia.
--
-- ─── COMO CONVIVE CON LA REGLA QUE YA ESTABA ───
--
-- La regla de la migracion 20260904100100 sigue intacta:
--
--     El stock sigue al hecho fisico, y sale UNA SOLA VEZ.
--
-- Esto no la contradice: la afina. Hay remitos que documentan una
-- SALIDA y hay remitos que documentan un COMPROMISO. La marca dice
-- cual es cual.
--
-- Y la reconciliacion de cobrar_venta() no se entera de nada, que es
-- la propiedad importante: lee el LIBRO DE MOVIMIENTOS, no las lineas
-- del remito. Un remito que no descuenta simplemente no deja
-- movimiento, y la cuenta le da igual sin saber que existe esta marca.
-- Lo mismo anular_comprobante_no_fiscal(): reingresa el neto de lo que
-- ese remito saco, que aca es cero.
--
-- ─── POR QUE LA MARCA SOLO PUEDE APAGAR, NUNCA ENCENDER ───
--
-- `p_descuenta_stock` en true no fuerza nada: sigue mandando la regla
-- de siempre —descuenta solo si la venta no lo hizo ya—. En false,
-- apaga. Si pudiera encender, alguien podria descontar dos veces la
-- misma mercaderia marcando la casilla, que es exactamente el error
-- que la migracion anterior existe para hacer imposible.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1 · La decision queda escrita en el comprobante
--
-- No alcanza con no dejar movimiento. Dentro de tres meses, mirando un
-- remito viejo sin movimientos asociados, no habria forma de
-- distinguir "se decidio que no descontara" de "algo fallo y no
-- descontó". Son dos cosas muy distintas y una es un bug.
-- ───────────────────────────────────────────────────────────────
alter table public.comprobante_no_fiscal
  add column if not exists descuenta_stock boolean not null default true;

comment on column public.comprobante_no_fiscal.descuenta_stock is
  'Solo el remito. En false documenta un compromiso —mercaderia que todavia no entro al local— y no toca el inventario. En true rige la regla de siempre: descuenta solo si la venta no lo hizo ya.';

-- Un presupuesto o un interno no mueven stock jamas, asi que la marca
-- ahi no significa nada. Dejarla variar seria guardar ruido que despues
-- alguien va a leer como si dijera algo.
alter table public.comprobante_no_fiscal
  drop constraint if exists no_fiscal_descuenta_solo_remito;
alter table public.comprobante_no_fiscal
  add constraint no_fiscal_descuenta_solo_remito
  check (descuenta_stock or tipo_clave = 'remito');

-- ───────────────────────────────────────────────────────────────
-- 2 · Emitir sobre una venta, ahora con la marca
--
-- Misma funcion de 20260907100000 mas un parametro. Se reemplaza
-- entera y no por partes para que quien lea esta migracion vea la
-- version que efectivamente corre.
-- ───────────────────────────────────────────────────────────────
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
  p_id           uuid    default null,
  p_serie        text    default null,
  p_numero       bigint  default null,
  p_ocurrido_en  timestamptz default null,
  -- La marca. Solo apaga; ver el encabezado.
  p_descuenta_stock boolean default true
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
  -- Si ya existe, no se toca nada. Lo primero de todo: la bandeja de
  -- salida reintenta, y un remito que vuelve a pasar por aca no puede
  -- volver a descontar stock.
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
  if not coalesce(p_descuenta_stock, true) and p_tipo_clave <> 'remito' then
    raise exception 'Solo el remito mueve stock: un % no puede pedir que no lo descuente.', lower(v_tipo.descripcion);
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

  v_serie := nullif(trim(coalesce(p_serie, '')), '');
  if v_serie is null then
    select coalesce(t.prefijo, 'T') into v_serie
    from public.terminal t
    where t.id = coalesce(p_terminal_id, v_venta.terminal_origen_id);
    v_serie := coalesce(v_serie, 'T');
  end if;

  v_numero := coalesce(p_numero, app.siguiente_numero_no_fiscal(p_tipo_clave, v_serie));

  insert into public.comprobante_no_fiscal (
    id, tipo_clave, serie, numero, terminal_id, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, observaciones, valido_hasta,
    entrega_domicilio, entrega_localidad, entrega_contacto, transportista,
    emitido_por, creado_en, registrado_offline, descuenta_stock
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
    case when p_tipo_clave = 'remito' then coalesce(
      p_entrega_domicilio,
      nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero, v_cliente.piso_depto)), '')) end,
    case when p_tipo_clave = 'remito' then coalesce(p_entrega_localidad, v_cliente.localidad) end,
    case when p_tipo_clave = 'remito' then coalesce(p_entrega_contacto, v_cliente.telefono) end,
    case when p_tipo_clave = 'remito' then p_transportista end,
    v_usuario, v_cuando, p_id is not null, coalesce(p_descuenta_stock, true)
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

  -- La salida de stock: la regla de siempre, mas la marca que la puede
  -- apagar. `producto_id is not null` deja afuera las lineas libres,
  -- que no son un producto del catalogo y no tienen stock que mover.
  if v_tipo.mueve_stock
     and coalesce(p_descuenta_stock, true)
     and v_venta.estado in ('borrador', 'en_caja') then
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
  uuid, text, uuid, jsonb, text, date, text, text, text, text, uuid, text, bigint, timestamptz, boolean) is
  'Emite un presupuesto, remito o comprobante interno a partir de una venta. La terminal puede traer id, serie y numero propios para haber emitido sin conexion. p_descuenta_stock en false documenta un compromiso sin tocar el inventario; solo apaga, nunca fuerza.';

grant execute on function public.emitir_comprobante_no_fiscal(
  uuid, text, uuid, jsonb, text, date, text, text, text, text, uuid, text, bigint, timestamptz, boolean)
  to authenticated;

-- La firma anterior deja de existir. Postgres las trata como funciones
-- distintas, asi que quedarian las dos y una llamada podria caer en la
-- que no lleva la marca — y descontar stock que no habia que descontar.
drop function if exists public.emitir_comprobante_no_fiscal(
  uuid, text, uuid, jsonb, text, date, text, text, text, text, uuid, text, bigint, timestamptz);

-- ───────────────────────────────────────────────────────────────
-- 3 · El remito que nace solo
--
-- POR QUE UNA FUNCION APARTE Y NO UN PARAMETRO MAS DE LA ANTERIOR.
-- Aquella empieza por "traeme la venta y sus lineas" y todo lo que
-- sigue se apoya en eso: el cliente sale de la venta, las lineas se
-- copian de la venta, el vendedor sale de la venta. Un `if` que saltee
-- todo eso serian dos funciones escritas una arriba de la otra, con la
-- mitad de las variables en null en cada camino. Separadas, cada una
-- se lee entera y se puede probar sola.
--
-- LAS LINEAS SE ESCRIBEN, NO SE COPIAN. Cada una es
--   {"producto_id": uuid | null, "codigo": text, "descripcion": text,
--    "cantidad": numeric, "precio_unitario": numeric}
-- Con producto_id se toma el codigo y el nombre del catalogo, para que
-- el papel diga lo mismo que el sistema. Sin el, es una LINEA LIBRE: se
-- escribe para la ocasion y NO mueve stock — no es un producto, no
-- tiene existencias.
-- ───────────────────────────────────────────────────────────────
create or replace function public.emitir_remito_directo(
  p_cliente_id   uuid,
  p_lineas       jsonb,
  p_descuenta_stock boolean default true,
  p_terminal_id  uuid    default null,
  p_observaciones text   default null,
  p_entrega_domicilio text default null,
  p_entrega_localidad text default null,
  p_entrega_contacto  text default null,
  p_transportista     text default null,
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
  v_cliente public.cliente;
  v_tipo    public.tipo_comprobante_no_fiscal;
  v_serie   text;
  v_numero  bigint;
  v_id      uuid;
  v_usuario uuid;
  v_total   numeric;
  v_cuando  timestamptz;
  v_orden   integer := 0;
  v_item    jsonb;
  v_prod    public.producto;
  v_cant    numeric;
  v_desc    text;
begin
  -- Idempotente por el id, igual que su hermana y por lo mismo.
  if p_id is not null then
    perform 1 from public.comprobante_no_fiscal where id = p_id;
    if found then
      return p_id;
    end if;
  end if;

  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El remito no tiene ninguna linea.';
  end if;

  select * into v_tipo from public.tipo_comprobante_no_fiscal
  where clave = 'remito' and activo;
  if v_tipo.clave is null then
    raise exception 'El tipo de comprobante "remito" no esta activo.';
  end if;

  select * into v_cliente from public.cliente
  where id = p_cliente_id and eliminado_en is null;
  if v_cliente.id is null then
    raise exception 'El cliente no existe.';
  end if;

  v_usuario := app.usuario_actual_id();
  v_cuando  := coalesce(p_ocurrido_en, now());

  v_serie := nullif(trim(coalesce(p_serie, '')), '');
  if v_serie is null then
    select coalesce(t.prefijo, 'T') into v_serie
    from public.terminal t where t.id = p_terminal_id;
    v_serie := coalesce(v_serie, 'T');
  end if;

  v_numero := coalesce(p_numero, app.siguiente_numero_no_fiscal('remito', v_serie));

  insert into public.comprobante_no_fiscal (
    id, tipo_clave, serie, numero, terminal_id, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, observaciones,
    entrega_domicilio, entrega_localidad, entrega_contacto, transportista,
    emitido_por, creado_en, registrado_offline, descuenta_stock
  ) values (
    coalesce(p_id, gen_random_uuid()),
    'remito', v_serie, v_numero, p_terminal_id,
    -- Sin venta. Es la diferencia de fondo con la otra funcion y la
    -- razon por la que `venta_id` siempre fue anulable.
    null, p_cliente_id,
    v_cliente.nombre, v_cliente.tipo_documento_id, v_cliente.numero_documento,
    v_cliente.condicion_iva_id,
    nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero,
                          v_cliente.piso_depto, v_cliente.localidad)), ''),
    v_cuando::date, p_observaciones,
    coalesce(p_entrega_domicilio,
             nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero, v_cliente.piso_depto)), '')),
    coalesce(p_entrega_localidad, v_cliente.localidad),
    coalesce(p_entrega_contacto, v_cliente.telefono),
    p_transportista,
    v_usuario, v_cuando, p_id is not null, coalesce(p_descuenta_stock, true)
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_lineas)
  loop
    v_orden := v_orden + 1;
    v_cant  := (v_item->>'cantidad')::numeric;
    if v_cant is null or v_cant <= 0 then
      raise exception 'Una cantidad tiene que ser mayor que cero.';
    end if;

    v_prod := null;
    if v_item->>'producto_id' is not null then
      select * into v_prod from public.producto
      where id = (v_item->>'producto_id')::uuid and eliminado_en is null;
      if v_prod.id is null then
        raise exception 'Uno de los productos del remito no existe o esta dado de baja.';
      end if;
    end if;

    -- Sin producto, la descripcion es lo unico que identifica la linea:
    -- si viene vacia el papel sale con un renglon en blanco y una
    -- cantidad, que no le sirve a nadie.
    v_desc := coalesce(v_prod.nombre_interno, nullif(trim(v_item->>'descripcion'), ''));
    if v_desc is null then
      raise exception 'Una linea escrita a mano necesita decir que es.';
    end if;

    insert into public.comprobante_no_fiscal_linea
      (comprobante_no_fiscal_id, orden, producto_id, codigo_producto,
       descripcion, cantidad, precio_unitario)
    values (
      v_id, v_orden, v_prod.id,
      coalesce(v_prod.codigo, nullif(trim(v_item->>'codigo'), ''), 'LIBRE'),
      v_desc, v_cant,
      -- El precio no va impreso en el remito, pero se guarda: es lo que
      -- permite valorizar despues lo que salio sin cobrarse.
      coalesce((v_item->>'precio_unitario')::numeric, v_prod.precio_venta, 0)
    );
  end loop;

  select coalesce(sum(importe), 0) into v_total
  from public.comprobante_no_fiscal_linea where comprobante_no_fiscal_id = v_id;
  update public.comprobante_no_fiscal set total = round(v_total, 2) where id = v_id;

  /*
    La salida de stock.

    Sin venta de por medio no hay nada con que reconciliar: si sale del
    local, sale ahora. Y si el remito documenta mercaderia que todavia
    no entro —el caso de la municipalidad—, la marca lo apaga.

    Las lineas libres quedan afuera por `producto_id is not null`: no
    son productos del catalogo y no tienen existencias que mover.
  */
  if coalesce(p_descuenta_stock, true) then
    insert into public.movimiento_stock
      (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id,
       usuario_id, terminal_id, ocurrido_en, registrado_offline)
    select cl.producto_id, 'remito', -sum(cl.cantidad),
           'Remito ' || v_tipo.sigla || ' ' || v_serie || '-' || lpad(v_numero::text, 8, '0'),
           'remito', v_id, v_usuario, p_terminal_id, v_cuando, p_id is not null
    from public.comprobante_no_fiscal_linea cl
    where cl.comprobante_no_fiscal_id = v_id and cl.producto_id is not null
    group by cl.producto_id;
  end if;

  return v_id;
end;
$$;

comment on function public.emitir_remito_directo is
  'Emite un remito que no sale de ninguna venta, con lineas escritas: productos del catalogo o lineas libres. Con p_descuenta_stock en false documenta mercaderia que todavia no entro al local.';

grant execute on function public.emitir_remito_directo(
  uuid, jsonb, boolean, uuid, text, text, text, text, text, uuid, text, bigint, timestamptz)
  to authenticated;
