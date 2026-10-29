/*
  ─────────────────────────────────────────────────────────────
  El remito interno y *Pendientes de facturar*

  Fase 03, punto 2. Las municipalidades, los clientes de muchos años:
  los precios los pone después el hijo de Lucas, cada vez distintos. El
  circuito:

  1. Sale la mercadería con un remito interno. Descuenta stock y lleva
     cliente, productos y cantidades; el precio queda para después. Se
     imprime y el cliente firma.
  2. Queda en *Pendientes de facturar*: se ve que el cliente se llevó
     eso, todavía sin importe.
  3. Se ponen los precios y se aprieta *Facturar*: sale la factura o el
     comprobante interno a la cuenta corriente, con su vencimiento. Uno
     o varios remitos del mismo cliente juntos. No vuelve a descontar
     stock, y cada remito queda asociado a su venta.

  ─── CÓMO SE ARMA ───

  El remito interno es el remito sin venta que ya existía (el «de cero»,
  07/09), con la marca facturar_despues. Al facturar, la base arma la
  venta con los precios, le asocia los remitos y la cobra a cuenta
  corriente como el pedido mayorista. cobrar_venta() ya resta del stock
  lo que salió con los remitos de la venta (04/09): la diferencia da
  cero y no descuenta dos veces.

  ─── EL VENCIDO ───

  Respuesta 7 de Lucas: al que debe vencido no se le lleva mercadería a
  cuenta sin que un encargado lo autorice. El freno va al sacar el
  remito, que es cuando la mercadería sale; queda anotado quién lo
  autorizó y esa autorización pasa a la venta al facturar.
  ─────────────────────────────────────────────────────────────
*/

alter table public.comprobante_no_fiscal
  add column facturar_despues boolean not null default false,
  add column vencido_autorizado_por uuid references public.usuario(id) on delete set null;

comment on column public.comprobante_no_fiscal.facturar_despues is
  'Remito interno: salió sin precio y se factura después, desde Pendientes de facturar. Facturado cuando tiene venta.';

-- ─── Sacar el remito interno ───

drop function public.emitir_remito_directo(uuid, jsonb, boolean, uuid, text, text, text, text, text, uuid, text, bigint, timestamptz);

create function public.emitir_remito_directo(
  p_cliente_id uuid,
  p_lineas jsonb,
  p_descuenta_stock boolean default true,
  p_terminal_id uuid default null,
  p_observaciones text default null,
  p_entrega_domicilio text default null,
  p_entrega_localidad text default null,
  p_entrega_contacto text default null,
  p_transportista text default null,
  p_id uuid default null,
  p_serie text default null,
  p_numero bigint default null,
  p_ocurrido_en timestamptz default null,
  p_facturar_despues boolean default false,
  p_vencido_autorizado_por uuid default null
)
returns uuid
language plpgsql
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

  /*
    El remito interno termina en la cuenta corriente: sin ella no hay
    dónde facturarlo. Y las líneas son del catálogo, que es de donde sale
    el IVA de cada una al facturar.
  */
  if coalesce(p_facturar_despues, false) then
    if not v_cliente.cuenta_corriente then
      raise exception '% no tiene cuenta corriente: habilitala en su ficha para sacarle un remito interno.', v_cliente.nombre;
    end if;
    if exists (select 1 from jsonb_array_elements(p_lineas) e where e->>'producto_id' is null) then
      raise exception 'El remito interno lleva sólo productos del catálogo: una línea escrita a mano no se puede facturar después.';
    end if;
    if app.vencido_de(v_cliente.id, (v_cuando at time zone 'America/Argentina/Buenos_Aires')::date) > 0 then
      if p_vencido_autorizado_por is null then
        raise exception '% tiene deuda vencida: para sacarle un remito interno, lo tiene que autorizar un encargado con su PIN.', v_cliente.nombre;
      end if;
      if not app.usuario_tiene_permiso(p_vencido_autorizado_por, 'cuentacorriente.autorizar_vencido') then
        raise exception 'Quien autorizó el remito a % no puede autorizar a un cliente con deuda vencida.', v_cliente.nombre;
      end if;
    end if;
  end if;

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
    emitido_por, creado_en, registrado_offline, descuenta_stock,
    facturar_despues, vencido_autorizado_por
  ) values (
    coalesce(p_id, gen_random_uuid()),
    'remito', v_serie, v_numero, p_terminal_id,
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
    v_usuario, v_cuando, p_id is not null,
    -- El remito interno siempre descuenta: la mercadería salió.
    coalesce(p_descuenta_stock, true) or coalesce(p_facturar_despues, false),
    coalesce(p_facturar_despues, false),
    case when coalesce(p_facturar_despues, false) then p_vencido_autorizado_por end
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
      coalesce((v_item->>'precio_unitario')::numeric, v_prod.precio_venta, 0)
    );
  end loop;

  select coalesce(sum(importe), 0) into v_total
  from public.comprobante_no_fiscal_linea where comprobante_no_fiscal_id = v_id;
  update public.comprobante_no_fiscal set total = round(v_total, 2) where id = v_id;

  if coalesce(p_descuenta_stock, true) or coalesce(p_facturar_despues, false) then
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

-- ─── Pendientes de facturar ───

create view public.vista_remito_por_facturar
with (security_invoker = true) as
select r.id,
       r.serie,
       r.numero,
       r.fecha,
       r.cliente_id,
       coalesce(c.nombre, r.receptor_nombre) as cliente,
       r.observaciones,
       r.total as total_sugerido,
       (select coalesce(sum(l.cantidad), 0) from public.comprobante_no_fiscal_linea l
         where l.comprobante_no_fiscal_id = r.id) as unidades,
       (now() at time zone 'America/Argentina/Buenos_Aires')::date - r.fecha as dias
from public.comprobante_no_fiscal r
left join public.cliente c on c.id = r.cliente_id
where r.tipo_clave = 'remito'
  and r.facturar_despues
  and r.venta_id is null
  and r.estado <> 'anulado';

comment on view public.vista_remito_por_facturar is
  'Los remitos internos que salieron sin precio y esperan su factura o comprobante interno.';

revoke all on public.vista_remito_por_facturar from public, anon;
grant select on public.vista_remito_por_facturar to authenticated;

-- ─── Facturar: los precios, la venta y la cuenta corriente ───

/*
  p_precios: el precio de cada producto, con IVA, como en el mostrador:
  {"<producto_id>": 1234.50, ...}. Uno por producto aunque venga en
  varios remitos: es la misma mercadería al mismo precio.

  Devuelve la venta y, si es con factura, el comprobante armado: el CAE
  lo pide la app, como en la caja.
*/
create function public.facturar_remitos_internos(
  p_remito_ids uuid[],
  p_precios jsonb,
  p_documentacion text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id uuid;
  v_cliente    public.cliente;
  v_primero    public.comprobante_no_fiscal;
  v_venta_id   uuid;
  v_total      numeric;
  v_medio      uuid;
  v_comp       uuid;
  v_autoriza   uuid;
  v_usuario    uuid := app.usuario_actual_id();
  v_numeros    text;
  v_falta      text;
begin
  if p_documentacion not in ('fiscal', 'no_fiscal') then
    raise exception 'Se factura o sale con comprobante interno.';
  end if;
  if p_documentacion = 'fiscal' and not app.tiene_permiso('facturacion.emitir') then
    raise exception 'No tenés permiso para facturar.';
  end if;
  if p_documentacion = 'no_fiscal' and not app.tiene_permiso('facturacion.vender_sin_factura') then
    raise exception 'No tenés permiso para cobrar una venta sin factura.';
  end if;
  if p_remito_ids is null or cardinality(p_remito_ids) = 0 then
    raise exception 'Elegí al menos un remito.';
  end if;

  -- Bloqueados: dos personas facturando el mismo remito a la vez.
  perform 1 from public.comprobante_no_fiscal where id = any(p_remito_ids) for update;

  if (select count(*) from public.comprobante_no_fiscal where id = any(p_remito_ids)) <> cardinality(p_remito_ids) then
    raise exception 'Alguno de los remitos no existe.';
  end if;
  if exists (select 1 from public.comprobante_no_fiscal
             where id = any(p_remito_ids)
               and (tipo_clave <> 'remito' or not facturar_despues)) then
    raise exception 'Sólo se facturan acá los remitos internos.';
  end if;
  if exists (select 1 from public.comprobante_no_fiscal where id = any(p_remito_ids) and venta_id is not null) then
    raise exception 'Alguno de los remitos ya está facturado.';
  end if;
  if exists (select 1 from public.comprobante_no_fiscal where id = any(p_remito_ids) and estado = 'anulado') then
    raise exception 'Alguno de los remitos está anulado.';
  end if;
  if (select count(distinct cliente_id) from public.comprobante_no_fiscal where id = any(p_remito_ids)) <> 1 then
    raise exception 'Se juntan en un comprobante sólo remitos del mismo cliente.';
  end if;

  select cliente_id into v_cliente_id from public.comprobante_no_fiscal where id = p_remito_ids[1];
  select * into v_cliente from public.cliente where id = v_cliente_id;
  if not v_cliente.cuenta_corriente then
    raise exception '% no tiene cuenta corriente: habilitala en su ficha para facturarle los remitos.', v_cliente.nombre;
  end if;

  -- Un precio por cada producto, y ninguno negativo.
  select string_agg(distinct l.descripcion, ', ') into v_falta
  from public.comprobante_no_fiscal_linea l
  where l.comprobante_no_fiscal_id = any(p_remito_ids)
    and (p_precios->>(l.producto_id::text)) is null;
  if v_falta is not null then
    raise exception 'Falta el precio de: %.', v_falta;
  end if;
  if exists (select 1 from jsonb_each_text(p_precios) e where e.value::numeric < 0) then
    raise exception 'Un precio no puede ser negativo.';
  end if;

  select * into v_primero from public.comprobante_no_fiscal
  where id = any(p_remito_ids) order by fecha, numero limit 1;
  select string_agg(serie || '-' || lpad(numero::text, 8, '0'), ', ' order by fecha, numero) into v_numeros
  from public.comprobante_no_fiscal where id = any(p_remito_ids);

  select mp.id into v_medio from public.medio_pago mp
  where mp.tipo = 'cuenta_corriente' and mp.activo and mp.eliminado_en is null
  order by mp.orden limit 1;
  if v_medio is null then
    raise exception 'No hay un medio de pago de cuenta corriente activo.';
  end if;

  insert into public.venta (codigo, estado, cliente_id, vendedor_id, lista_precio_id, documentacion,
                            observaciones, ocurrido_en, enviada_caja_en, medio_pago_previsto_id)
  values ('RI-' || v_primero.serie || '-' || lpad(v_primero.numero::text, 6, '0'), 'en_caja', v_cliente_id,
          v_primero.emitido_por, v_cliente.lista_precio_id, p_documentacion,
          'Remito interno ' || v_numeros, now(), now(), v_medio)
  returning id into v_venta_id;

  /*
    Una línea por producto. El precio sugerido es el de lista con el que
    salió el remito más nuevo; si el precio que se pone es otro, queda
    anotado quién lo puso y por qué, como cualquier precio cambiado.
  */
  insert into public.venta_linea (venta_id, orden, producto_id, codigo_producto, descripcion,
                                  cantidad, precio_original, precio_unitario, precio_acordado,
                                  motivo_modificacion, modificado_por, alicuota_iva_id, condicion_iva)
  select v_venta_id,
         row_number() over (order by min(l.orden), p.nombre_interno),
         p.id, p.codigo, p.nombre_interno,
         sum(l.cantidad),
         sugerido.precio,
         (p_precios->>(p.id::text))::numeric,
         (p_precios->>(p.id::text))::numeric,
         case when (p_precios->>(p.id::text))::numeric <> sugerido.precio then 'Precio a convenir' end,
         case when (p_precios->>(p.id::text))::numeric <> sugerido.precio then v_usuario end,
         p.alicuota_iva_id, p.condicion_iva
  from public.comprobante_no_fiscal_linea l
  join public.comprobante_no_fiscal r on r.id = l.comprobante_no_fiscal_id
  join public.producto p on p.id = l.producto_id
  cross join lateral (
    select l2.precio_unitario as precio
    from public.comprobante_no_fiscal_linea l2
    join public.comprobante_no_fiscal r2 on r2.id = l2.comprobante_no_fiscal_id
    where l2.producto_id = p.id and r2.id = any(p_remito_ids)
    order by r2.fecha desc, r2.numero desc
    limit 1
  ) sugerido
  where r.id = any(p_remito_ids)
  group by p.id, p.codigo, p.nombre_interno, p.alicuota_iva_id, p.condicion_iva, sugerido.precio;

  -- Los remitos pasan a ser de esta venta ANTES de cobrarla: así
  -- cobrar_venta() ve que la mercadería ya salió y no la descuenta otra vez.
  update public.comprobante_no_fiscal set venta_id = v_venta_id where id = any(p_remito_ids);

  select v.total + public.percepcion_de_venta(v.id) into v_total
  from public.venta v where v.id = v_venta_id;

  insert into public.venta_pago (venta_id, medio_pago_id, importe, cuotas, referencia)
  values (v_venta_id, v_medio, v_total, 1, 'Remito interno ' || v_numeros);

  /*
    El vencido: vale la autorización con la que salió el remito; si no
    hubo —no debía nada entonces—, la de quien factura, si puede darla.
    cobrar_venta() lo vuelve a mirar con el día de hoy.
  */
  select vencido_autorizado_por into v_autoriza from public.comprobante_no_fiscal
  where id = any(p_remito_ids) and vencido_autorizado_por is not null limit 1;
  if v_autoriza is null and app.tiene_permiso('cuentacorriente.autorizar_vencido') then
    v_autoriza := v_usuario;
  end if;

  perform public.cobrar_venta(v_venta_id, null, null, v_autoriza);

  if p_documentacion = 'fiscal' then
    v_comp := public.preparar_comprobante(v_venta_id);
  end if;

  return json_build_object('venta_id', v_venta_id, 'comprobante_id', v_comp);
end;
$$;

comment on function public.facturar_remitos_internos(uuid[], jsonb, text) is
  'Pone precio a uno o varios remitos internos del mismo cliente y los factura a cuenta corriente, sin volver a descontar stock.';

revoke all on function public.facturar_remitos_internos(uuid[], jsonb, text) from public, anon;
grant execute on function public.facturar_remitos_internos(uuid[], jsonb, text) to authenticated;
