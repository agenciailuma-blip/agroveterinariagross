/*
  ─────────────────────────────────────────────────────────────
  El mayorista que pide proforma

  Pedido de Lucas del 29/10: hay clientes mayoristas que no quieren
  factura, quieren la proforma. El pedido ya podía salir con comprobante
  interno —el botón «Sin factura»—, pero había que acordarse en cada
  pedido, y el botón principal seguía siendo «Facturar».

  Ahora es una marca en la ficha del cliente. Con la marca, el pedido lo
  dice y «Proforma» pasa a ser el botón principal; «Facturar» sigue ahí
  para el día que pida factura.
  ─────────────────────────────────────────────────────────────
*/

alter table public.cliente
  add column if not exists pide_proforma boolean not null default false;

comment on column public.cliente.pide_proforma is
  'El mayorista no quiere factura: su pedido sale con comprobante interno salvo que se elija facturar.';

-- ── Guardar la ficha ────────────────────────────────────────────
create or replace function public.mayorista_guardar_cliente(p_id uuid, p_datos jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_doc      text := regexp_replace(coalesce(p_datos ->> 'numero_documento', ''), '[^0-9]', '', 'g');
  v_nombre   text := nullif(btrim(coalesce(p_datos ->> 'nombre', '')), '');
  v_cond     smallint := coalesce((p_datos ->> 'condicion_iva_id')::smallint, 5);
  v_tipo_doc smallint;
  v_lat      numeric := (p_datos ->> 'latitud')::numeric;
  v_lng      numeric := (p_datos ->> 'longitud')::numeric;
  v_cliente  public.cliente;
  v_id       uuid;
  v_existia  boolean := false;
begin
  if not app.tiene_permiso('mayorista.clientes') then
    raise exception 'No tenés permiso para cargar clientes mayoristas.';
  end if;
  if (v_lat is null) <> (v_lng is null) then
    raise exception 'La ubicación necesita latitud y longitud.';
  end if;

  if p_id is not null then
    select * into v_cliente from public.cliente where id = p_id and eliminado_en is null for update;
    if v_cliente.id is null or not v_cliente.mayorista then
      raise exception 'Ese cliente no es mayorista.';
    end if;
  elsif v_doc <> '' then
    select * into v_cliente from public.cliente
    where numero_documento = v_doc and eliminado_en is null
    order by creado_en limit 1
    for update;
    v_existia := v_cliente.id is not null;
  end if;

  if v_cliente.id is not null then
    update public.cliente set
      mayorista  = true,
      telefono   = coalesce(nullif(btrim(p_datos ->> 'telefono'), ''), telefono),
      email      = coalesce(nullif(btrim(p_datos ->> 'email'), ''), email),
      calle      = coalesce(nullif(btrim(p_datos ->> 'calle'), ''), calle),
      numero     = coalesce(nullif(btrim(p_datos ->> 'numero'), ''), numero),
      localidad  = coalesce(nullif(btrim(p_datos ->> 'localidad'), ''), localidad),
      zona       = case when p_datos ? 'zona' then nullif(btrim(p_datos ->> 'zona'), '') else zona end,
      ruta       = case when p_datos ? 'ruta' then nullif(btrim(p_datos ->> 'ruta'), '') else ruta end,
      latitud    = coalesce(v_lat, latitud),
      longitud   = coalesce(v_lng, longitud),
      pide_proforma = case when p_datos ? 'pide_proforma'
                           then coalesce((p_datos ->> 'pide_proforma')::boolean, false)
                           else pide_proforma end
    where id = v_cliente.id;
    return json_build_object('id', v_cliente.id, 'existia', v_existia, 'nombre', v_cliente.nombre);
  end if;

  if v_nombre is null then
    raise exception 'Falta el nombre del cliente.';
  end if;

  v_tipo_doc := case when length(v_doc) = 11 then 80
                     when length(v_doc) between 7 and 8 then 96
                     else 99 end;
  if v_cond = 1 and v_tipo_doc <> 80 then
    raise exception 'Para factura A hace falta el CUIT.';
  end if;

  insert into public.cliente (nombre, nombre_fantasia, tipo_persona, condicion_iva_id, tipo_documento_id,
                              numero_documento, calle, numero, localidad, telefono, email,
                              cuenta_corriente, dias_vencimiento, lista_precio_id,
                              mayorista, zona, ruta, latitud, longitud, pide_proforma)
  values (v_nombre, nullif(btrim(p_datos ->> 'nombre_fantasia'), ''),
          case when v_tipo_doc = 80 and v_cond = 1 then 'juridica' else 'fisica' end,
          v_cond, v_tipo_doc, nullif(v_doc, ''),
          nullif(btrim(p_datos ->> 'calle'), ''), nullif(btrim(p_datos ->> 'numero'), ''),
          nullif(btrim(p_datos ->> 'localidad'), ''),
          nullif(btrim(p_datos ->> 'telefono'), ''), nullif(btrim(p_datos ->> 'email'), ''),
          true, 30, app.lista_mayorista(),
          true, nullif(btrim(p_datos ->> 'zona'), ''), nullif(btrim(p_datos ->> 'ruta'), ''),
          v_lat, v_lng, coalesce((p_datos ->> 'pide_proforma')::boolean, false))
  returning id into v_id;

  return json_build_object('id', v_id, 'existia', false, 'nombre', v_nombre);
end;
$function$;

-- ── Los clientes, con la marca ──────────────────────────────────
-- Cambia lo que devuelve: hay que borrarla y volver a crearla.
drop function public.mayorista_clientes();

create function public.mayorista_clientes()
returns table(id uuid, nombre text, nombre_fantasia text, tipo_documento_id smallint, numero_documento text,
              condicion_iva_id smallint, calle text, numero text, localidad text, zona text, ruta text,
              telefono text, email text, latitud numeric, longitud numeric, cuenta_corriente boolean,
              saldo numeric, vencido numeric, vencimiento_mas_antiguo date,
              ultimo_pedido_en timestamp with time zone, ultimo_pedido_numero bigint, pide_proforma boolean)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_ve_deuda boolean := app.tiene_permiso('mayorista.ver_deuda') or app.tiene_permiso('mayorista.atender');
begin
  if not app.puede_ver_mayorista() then
    raise exception 'No tenés permiso para la venta mayorista.';
  end if;

  return query
  select c.id, c.nombre, c.nombre_fantasia, c.tipo_documento_id, c.numero_documento, c.condicion_iva_id,
         c.calle, c.numero, c.localidad, c.zona, c.ruta, c.telefono, c.email, c.latitud, c.longitud,
         c.cuenta_corriente,
         case when v_ve_deuda then coalesce(d.saldo, 0) end,
         case when v_ve_deuda then coalesce(d.vencido_30 + d.vencido_60 + d.vencido_mas_60, 0) end,
         case when v_ve_deuda then d.vencimiento_mas_antiguo end,
         u.recibido_en, u.numero,
         c.pide_proforma
  from public.cliente c
  left join public.vista_deuda_antiguedad d on d.cliente_id = c.id
  left join lateral (
    select pm.recibido_en, pm.numero from public.pedido_mayorista pm
    where pm.cliente_id = c.id and pm.estado <> 'cancelado'
    order by pm.recibido_en desc limit 1
  ) u on true
  where c.mayorista and c.eliminado_en is null and c.activo
  order by c.ruta nulls last, c.localidad nulls last, c.nombre;
end;
$function$;

-- ── Los pedidos, con la marca del cliente ───────────────────────
drop function public.mayorista_pedidos(text);

create function public.mayorista_pedidos(p_vista text)
returns table(id uuid, numero bigint, estado text, cliente_id uuid, cliente_nombre text, cliente_localidad text,
              cliente_ruta text, cliente_domicilio text, cliente_telefono text, cliente_email text,
              cliente_condicion_iva_id smallint, vendedor_nombre text, observaciones text,
              armado_en timestamp with time zone, recibido_en timestamp with time zone,
              confirmado_en timestamp with time zone, confirmado_por_nombre text,
              facturado_en timestamp with time zone, cancelado_en timestamp with time zone,
              motivo_cancelacion text, total numeric, lineas jsonb, venta_id uuid, venta_codigo text,
              documentacion text, comprobante_id uuid, comprobante_numero text, comprobante_cae text,
              interno_id uuid, interno_numero text, remito_id uuid, remito_numero text,
              mail_destinatario text, mail_estado text, mail_error text, mail_en timestamp with time zone,
              cliente_vencido numeric, cliente_vencido_desde date,
              vencido_autorizado_en timestamp with time zone, vencido_autorizado_por_nombre text,
              cliente_pide_proforma boolean)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_todo boolean := app.tiene_permiso('mayorista.atender');
  v_yo   uuid := app.usuario_actual_id();
  v_ve_deuda boolean := v_todo or app.tiene_permiso('mayorista.ver_deuda');
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
         pm.mail_destinatario, pm.mail_estado, pm.mail_error, pm.mail_en,
         case when v_ve_deuda then coalesce(d.vencido_30 + d.vencido_60 + d.vencido_mas_60, 0) end,
         case when v_ve_deuda then d.vencimiento_mas_antiguo end,
         pm.vencido_autorizado_en, aut.nombre,
         c.pide_proforma
  from public.pedido_mayorista pm
  join public.cliente c on c.id = pm.cliente_id
  left join public.usuario vend on vend.id = pm.vendedor_id
  left join public.usuario conf on conf.id = pm.confirmado_por
  left join public.usuario aut on aut.id = pm.vencido_autorizado_por
  left join public.vista_deuda_antiguedad d on d.cliente_id = c.id
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
$function$;

revoke all on function public.mayorista_clientes(), public.mayorista_pedidos(text) from public, anon;
grant execute on function public.mayorista_clientes(), public.mayorista_pedidos(text) to authenticated, service_role;
