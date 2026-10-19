-- ═══════════════════════════════════════════════════════════════
-- La tienda dice cómo se paga, y el sistema dice qué es para consultar
--
-- Acordado en la reunión con Zubu y Lucas del 19/10:
--
-- 1. El pedido trae el MEDIO DE PAGO —Mercado Pago, transferencia,
--    efectivo—, además de si ya se pagó. La tienda manda el pedido de
--    Mercado Pago recién cuando Mercado Pago confirma el pago, así que
--    llega pagado. Una transferencia o un pago en efectivo llegan sin
--    pagar: quedan en la caja del local con ese medio ya previsto, y el
--    cajero los cobra cuando llega la plata.
--
-- 2. Los productos SÓLO PARA CONSULTAR —farmacia, lo restringido—
--    salen en la tienda pero no se compran: la tienda muestra «Consultar»
--    y manda a WhatsApp. Es un estado más de «Vender online»: se publica,
--    con una marca. Si igual llega un pedido con uno de esos, entra —puede
--    estar pagado— y queda marcado para revisar.
-- ═══════════════════════════════════════════════════════════════

-- ─── Los datos ───

alter table public.pedido_tienda
  add column medio_pago text
    check (medio_pago in ('mercado_pago', 'transferencia', 'efectivo', 'otro'));

comment on column public.pedido_tienda.medio_pago is
  'Cómo dijo la tienda que se paga: mercado_pago, transferencia, efectivo u otro. null en los pedidos anteriores al 19/10 o si la tienda no lo mandó.';

alter table public.canal_producto
  add column solo_consultar boolean not null default false;

comment on column public.canal_producto.solo_consultar is
  'Publicado, pero no se compra online: la tienda muestra «Consultar» y deriva a WhatsApp. Farmacia y productos restringidos.';

-- ─── El pedido ───

create or replace function app.registrar_pedido_de_la_tienda(p_canal_id uuid, p_pedido jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero     text := nullif(btrim(p_pedido ->> 'numero'), '');
  v_pagado     boolean := coalesce((p_pedido ->> 'pagado')::boolean, false);
  v_entrega    text := lower(coalesce(p_pedido #>> '{entrega,tipo}', 'retira'));
  v_medio      text := lower(nullif(btrim(coalesce(p_pedido ->> 'medio_pago', '')), ''));
  v_previsto   uuid;
  v_comprador  jsonb := coalesce(p_pedido -> 'comprador', '{}'::jsonb);
  v_productos  jsonb := p_pedido -> 'productos';
  v_existente  public.pedido_tienda;
  v_catalogo   jsonb;
  v_linea      jsonb;
  v_producto   public.producto;
  v_del_canal  jsonb;
  v_cliente_id uuid;
  v_venta_id   uuid;
  v_pedido_id  uuid;
  v_codigo     text;
  v_canal      public.canal;
  v_doc        text;
  v_tipo_doc   smallint;
  v_cond_iva   smallint;
  v_nombre     text;
  v_orden      integer := 0;
  v_cantidad   numeric;
  v_precio     numeric;
  v_tolerancia numeric;
  v_revisar    text[] := '{}';
  v_total      numeric;
  v_detalle    text;
begin
  select * into v_canal from public.canal where id = p_canal_id;

  if v_numero is null then
    raise exception using errcode = 'PT400', message = 'falta_numero';
  end if;
  if v_productos is null or jsonb_typeof(v_productos) <> 'array' or jsonb_array_length(v_productos) = 0 then
    raise exception using errcode = 'PT400', message = 'faltan_productos';
  end if;
  if v_entrega not in ('retira', 'envio') then
    raise exception using errcode = 'PT400', message = 'entrega_invalida';
  end if;
  /*
    Un medio que no se conoce se rechaza, igual que una entrega mal
    escrita: es un error de quien arma el pedido, y aceptarlo dejaría a
    la caja sin saber cómo llega la plata.
  */
  if v_medio is not null and v_medio not in ('mercado_pago', 'transferencia', 'efectivo', 'otro') then
    raise exception using errcode = 'PT400', message = 'medio_pago_invalido';
  end if;
  if nullif(btrim(v_comprador ->> 'nombre'), '') is null then
    raise exception using errcode = 'PT400', message = 'falta_el_comprador';
  end if;
  if v_canal.medio_pago_id is null and v_pagado then
    raise exception using errcode = 'PT500', message = 'canal_sin_medio_de_pago';
  end if;

  /*
    El mismo pedido dos veces: si a la tienda se le cortó la conexión y
    reintenta, contesta lo mismo que la primera vez en vez de crear otra
    venta. Un error los dejaría sin saber si el pedido entró.
  */
  select * into v_existente from public.pedido_tienda
  where canal_id = p_canal_id and numero_externo = v_numero;

  if v_existente.id is not null then
    return json_build_object(
      'repetido', true,
      'pedido', v_existente.numero_externo,
      'estado', v_existente.estado,
      'venta', (select v.codigo from public.venta v where v.id = v_existente.venta_id),
      'revisar', v_existente.revisar);
  end if;

  /*
    Mercado Pago sin pagar no debería llegar: lo acordado es que la
    tienda manda el pedido cuando Mercado Pago confirma. Si llega, entra
    —puede ser un pago que se acreditó tarde— y queda marcado: no se
    entrega hasta confirmarlo con la tienda.
  */
  if v_medio = 'mercado_pago' and not v_pagado then
    v_revisar := array_append(v_revisar, 'Dice Mercado Pago pero llegó sin pagar: confirmarlo con la tienda antes de entregar');
  end if;

  /*
    Lo que se paga en el local llega a la caja con su medio ya puesto:
    el cajero no tiene que preguntar si es una transferencia.
  */
  if not v_pagado and v_medio in ('transferencia', 'efectivo') then
    select mp.id into v_previsto from public.medio_pago mp
    where mp.tipo = v_medio and mp.activo and mp.eliminado_en is null
    order by mp.orden limit 1;
  end if;

  -- ─── El comprador ───
  v_nombre := btrim(v_comprador ->> 'nombre');
  v_doc := regexp_replace(coalesce(v_comprador ->> 'documento', ''), '[^0-9]', '', 'g');
  v_tipo_doc := case upper(coalesce(v_comprador ->> 'tipo_documento', ''))
                  when 'CUIT' then 80 when 'CUIL' then 86 when 'DNI' then 96
                  else case when length(v_doc) = 11 then 80
                            when length(v_doc) between 7 and 8 then 96
                            else 99 end
                end;
  v_cond_iva := case lower(coalesce(v_comprador ->> 'condicion_iva', ''))
                  when 'responsable_inscripto' then 1
                  when 'exento' then 4
                  when 'monotributo' then 6
                  else 5  -- consumidor final
                end;

  /*
    Responsable inscripto sin CUIT no existe para ARCA, y la base no lo
    deja entrar. Como el pedido ya está pagado, entra igual: se carga
    como consumidor final —que es lo que se puede facturar con un DNI—
    y queda marcado para hablarlo.
  */
  if v_cond_iva = 1 and (v_tipo_doc <> 80 or v_doc = '') then
    v_cond_iva := 5;
    v_revisar := array_append(v_revisar, 'Dijo ser responsable inscripto pero no mandó CUIT');
  elsif v_cond_iva = 1 then
    v_revisar := array_append(v_revisar, 'Pidió factura A: hay que hablarlo antes de facturar');
  end if;

  if v_doc <> '' then
    select id into v_cliente_id from public.cliente
    where numero_documento = v_doc and eliminado_en is null
    order by creado_en limit 1;
  end if;

  if v_cliente_id is null then
    insert into public.cliente (nombre, tipo_persona, condicion_iva_id, tipo_documento_id,
                                numero_documento, email, calle, localidad)
    values (v_nombre,
            case when v_tipo_doc = 80 and v_cond_iva = 1 then 'juridica' else 'fisica' end,
            v_cond_iva, v_tipo_doc, nullif(v_doc, ''),
            nullif(btrim(coalesce(v_comprador ->> 'email', '')), ''),
            nullif(btrim(coalesce(p_pedido #>> '{entrega,domicilio}', '')), ''),
            nullif(btrim(coalesce(p_pedido #>> '{entrega,localidad}', '')), ''))
    returning id into v_cliente_id;
  end if;

  -- ─── La venta ───
  select coalesce(max(substring(v.codigo from 5)::bigint), 0) + 1
  into v_orden
  from public.venta v where v.codigo like 'WEB-%';
  v_codigo := 'WEB-' || lpad(v_orden::text, 6, '0');

  insert into public.venta (codigo, estado, cliente_id, lista_precio_id, documentacion,
                            observaciones, ocurrido_en, enviada_caja_en, medio_pago_previsto_id)
  values (v_codigo, 'en_caja', v_cliente_id, v_canal.lista_precio_id, 'fiscal',
          nullif(btrim(coalesce(p_pedido ->> 'observaciones', '')), ''), now(), now(), v_previsto)
  returning id into v_venta_id;

  select jsonb_object_agg(pc.producto_id::text,
           jsonb_build_object('precio', pc.precio, 'stock', pc.stock, 'motivo', pc.motivo))
  into v_catalogo
  from app.productos_de_canal(p_canal_id) pc;

  select coalesce((select (c.valor #>> '{}')::numeric from public.configuracion c
                   where c.clave = 'tienda.tolerancia_precio_porcentaje'), 5)
  into v_tolerancia;

  v_orden := 0;
  for v_linea in select * from jsonb_array_elements(v_productos)
  loop
    v_orden := v_orden + 1;
    v_cantidad := (v_linea ->> 'cantidad')::numeric;
    v_precio := (v_linea ->> 'precio')::numeric;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception using errcode = 'PT400', message = 'cantidad_invalida';
    end if;
    if v_precio is null or v_precio < 0 then
      raise exception using errcode = 'PT400', message = 'precio_invalido';
    end if;

    select * into v_producto from public.producto
    where id = (v_linea ->> 'id')::uuid and eliminado_en is null;

    if v_producto.id is null then
      raise exception using errcode = 'PT400', message = 'producto_desconocido',
        detail = coalesce(v_linea ->> 'id', '');
    end if;

    v_del_canal := v_catalogo -> (v_producto.id::text);

    -- El precio que se factura es el que pagó el cliente. Si difiere
    -- del del sistema más de lo tolerado, queda marcado: un error de la
    -- tienda no puede facturar cualquier cosa en silencio.
    if v_del_canal is not null and (v_del_canal ->> 'precio')::numeric > 0
       and abs(v_precio - (v_del_canal ->> 'precio')::numeric)
           / (v_del_canal ->> 'precio')::numeric * 100 > v_tolerancia then
      v_revisar := array_append(v_revisar, format('El precio de %s no coincide con el del sistema', v_producto.codigo));
    end if;

    if v_del_canal is not null and (v_del_canal ->> 'stock')::numeric < v_cantidad then
      v_revisar := array_append(v_revisar, format('No hay stock suficiente de %s', v_producto.codigo));
    end if;

    if exists (select 1 from public.canal_producto cp
               where cp.canal_id = p_canal_id and cp.producto_id = v_producto.id and cp.solo_consultar) then
      v_revisar := array_append(v_revisar, format('%s es sólo para consultar: no se vende online', v_producto.codigo));
    end if;

    insert into public.venta_linea (venta_id, orden, producto_id, codigo_producto, descripcion,
                                    cantidad, precio_original, precio_unitario, precio_acordado,
                                    alicuota_iva_id, condicion_iva)
    values (v_venta_id, v_orden, v_producto.id, v_producto.codigo,
            coalesce(nullif(btrim(v_producto.nombre_publico), ''), v_producto.nombre_interno),
            v_cantidad,
            v_precio, v_precio, v_precio,
            v_producto.alicuota_iva_id, v_producto.condicion_iva);
  end loop;

  select total into v_total from public.venta where id = v_venta_id;

  if (p_pedido ? 'total') and abs((p_pedido ->> 'total')::numeric - v_total) > 0.01 then
    v_revisar := array_append(v_revisar,
      format('La tienda informó un total de %s y las líneas suman %s', p_pedido ->> 'total', v_total));
  end if;

  if v_pagado and v_total > 0 then
    insert into public.venta_pago (venta_id, medio_pago_id, importe, cuotas, referencia)
    values (v_venta_id, v_canal.medio_pago_id, v_total, 1,
            nullif(btrim(coalesce(p_pedido ->> 'referencia_pago', '')), ''));

    -- El mismo cobro que el del mostrador: descuenta stock y deja la
    -- venta cobrada. Sin caja ni cajero, porque no hubo ninguno.
    perform public.cobrar_venta(v_venta_id, null, null);
  end if;

  insert into public.pedido_tienda (canal_id, numero_externo, venta_id, pagado_en_la_web, medio_pago,
                                    referencia_pago, entrega, domicilio, localidad, contacto, email,
                                    revisar)
  values (p_canal_id, v_numero, v_venta_id, v_pagado, v_medio,
          nullif(btrim(coalesce(p_pedido ->> 'referencia_pago', '')), ''),
          v_entrega,
          nullif(btrim(coalesce(p_pedido #>> '{entrega,domicilio}', '')), ''),
          nullif(btrim(coalesce(p_pedido #>> '{entrega,localidad}', '')), ''),
          nullif(btrim(coalesce(p_pedido #>> '{entrega,contacto}', '')), ''),
          nullif(btrim(coalesce(v_comprador ->> 'email', '')), ''),
          nullif(array_to_string(v_revisar, ' · '), ''))
  returning id into v_pedido_id;

  return json_build_object(
    'repetido', false,
    'pedido', v_numero,
    'estado', 'recibido',
    'venta', v_codigo,
    'total', trim_scale(v_total),
    'revisar', nullif(array_to_string(v_revisar, ' · '), ''));

/*
  Un número donde va un número y un identificador donde va un
  identificador: eso es un pedido mal armado —un 400— y no un error del
  sistema. El mensaje original va en el detalle: la puerta no se lo pasa
  a la tienda, pero queda en los registros. Sin eso, el error del
  operador || habría sido invisible.
*/
exception
  when sqlstate '22P02' or sqlstate '22003' then
    get stacked diagnostics v_detalle = message_text;
    raise exception using errcode = 'PT400', message = 'pedido_invalido', detail = coalesce(v_detalle, '');
end;
$$;

-- ─── Lo que la tienda pregunta de un pedido: también cómo se paga ───

create or replace function public.api_tienda_estado_pedido(p_clave text, p_numero text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canal  uuid;
  v_pedido public.pedido_tienda;
  v_venta  public.venta;
  v_comp   record;
begin
  v_canal := app.canal_de_la_clave(p_clave);

  select * into v_pedido from public.pedido_tienda
  where canal_id = v_canal and numero_externo = btrim(coalesce(p_numero, ''));

  if v_pedido.id is null then
    raise exception using errcode = 'PT404', message = 'pedido_desconocido';
  end if;

  select * into v_venta from public.venta where id = v_pedido.venta_id;

  select c.tipo, c.punto_venta, c.numero, c.estado, c.actualizado_en into v_comp
  from (select tc.clase as tipo, pv.numero as punto_venta, co.numero, co.estado, co.actualizado_en, co.creado_en
        from public.comprobante co
        join public.tipo_comprobante tc on tc.id = co.tipo_comprobante_id
        join public.punto_venta pv on pv.id = co.punto_venta_id
        where co.venta_id = v_pedido.venta_id and tc.familia = 'factura' and co.estado <> 'anulado') c
  order by c.creado_en desc limit 1;

  return json_build_object(
    'numero', v_pedido.numero_externo,
    'estado', v_pedido.estado,
    'entrega', v_pedido.entrega,
    'pagado_en_la_web', v_pedido.pagado_en_la_web,
    'medio_pago', v_pedido.medio_pago,
    'cobrado', v_venta.estado = 'cobrada' or (v_venta.estado = 'anulada' and v_venta.cobrada_en is not null),
    'factura', case when v_comp.estado in ('autorizado', 'informado', 'contingencia') then
                 v_comp.tipo || ' ' || lpad(v_comp.punto_venta::text, 5, '0') || '-' || lpad(v_comp.numero::text, 8, '0')
               end,
    'reintegros', coalesce((
       select json_agg(json_build_object(
                'motivo', r.motivo,
                'importe', trim_scale(r.importe),
                'devuelto', r.hecho_en is not null,
                'devuelto_en', r.hecho_en) order by r.creado_en)
       from public.pedido_reintegro r where r.pedido_id = v_pedido.id), '[]'::json),
    'actualizado', greatest(
       v_pedido.actualizado_en,
       v_comp.actualizado_en,
       (select max(r.actualizado_en) from public.pedido_reintegro r where r.pedido_id = v_pedido.id)));
end;
$$;

-- ─── El catálogo: cada producto dice si es sólo para consultar ───

create or replace function app.catalogo_de_canal(p_canal_id uuid, p_desde text, p_limite integer, p_hasta timestamptz)
returns json
language plpgsql
stable
set search_path = ''
as $$
declare
  v_limite    integer := coalesce(p_limite, 500);
  v_desde_t   timestamptz;
  v_desde_i   uuid;
  v_completo  boolean := true;
  v_marca     json;
  v_canal_act timestamptz;
  v_lista_act timestamptz;
  v_cantidad  integer;
  v_filas     json;
  v_ultimo_t  timestamptz;
  v_ultimo_i  uuid;
begin
  if v_limite < 1 or v_limite > 1000 then
    raise exception using errcode = 'PT400', message = 'limite_invalido';
  end if;

  if p_desde is not null then
    begin
      v_marca := convert_from(decode(
        translate(p_desde, '-_', '+/') || repeat('=', (4 - length(p_desde) % 4) % 4),
        'base64'), 'UTF8')::json;
      v_desde_t  := (v_marca ->> 't')::timestamptz;
      v_desde_i  := (v_marca ->> 'i')::uuid;
      v_completo := coalesce((v_marca ->> 'c')::boolean, false);
    exception when others then
      v_desde_t := null;
    end;
    if v_desde_t is null or v_desde_i is null then
      raise exception using errcode = 'PT400', message = 'desde_invalido';
    end if;
  end if;

  select c.actualizado_en, coalesce(l.actualizado_en, c.actualizado_en)
  into v_canal_act, v_lista_act
  from public.canal c
  left join public.lista_precio l on l.id = c.lista_precio_id
  where c.id = p_canal_id;

  with candidatos as (
    select pc.*,
           case when pc.motivo is null
                then greatest(pc.cambio_producto, coalesce(pc.cambio_stock, pc.cambio_producto),
                              v_canal_act, v_lista_act)
                else pc.cambio_producto
           end as cambio
    from app.productos_de_canal(p_canal_id) pc
  ), pagina as (
    select *, row_number() over (order by cambio, producto_id) as n
    from candidatos
    where cambio < p_hasta
      and (v_desde_t is null or (cambio, producto_id) > (v_desde_t, v_desde_i))
      and (not v_completo or motivo is null)
    order by cambio, producto_id
    limit v_limite + 1
  )
  select
    count(*)::integer,
    coalesce(json_agg(
      case when x.motivo is null then json_build_object(
        'id',              p.id,
        'publicado',       true,
        'solo_consultar',  coalesce(cp.solo_consultar, false),
        'codigo',          p.codigo,
        'codigos_barra',   (select coalesce(json_agg(cb.codigo order by cb.es_principal desc, cb.codigo), '[]'::json)
                            from public.producto_codigo_barra cb
                            where cb.producto_id = p.id and cb.eliminado_en is null),
        'nombre',          btrim(p.nombre_publico),
        'descripcion',     nullif(btrim(p.descripcion), ''),
        'precio',          trim_scale(x.precio),
        'unidad',          p.unidad_medida,
        'stock',           trim_scale(x.stock),
        'requiere_receta', p.requiere_receta,
        'categoria',       case when cat.eliminado_en is null then cat.slug end,
        'marca',           case when m.eliminado_en is null then m.slug end,
        'presentacion',    case when pr.eliminado_en is null then pr.slug end,
        'animales',        (select coalesce(json_agg(a.slug order by a.orden, a.slug), '[]'::json)
                            from public.producto_animal pa
                            join public.animal a on a.id = pa.animal_id
                            where pa.producto_id = p.id and a.eliminado_en is null),
        'etapas_de_vida',  (select coalesce(json_agg(e.slug order by e.orden, e.slug), '[]'::json)
                            from public.producto_etapa_vida pe
                            join public.etapa_vida e on e.id = pe.etapa_vida_id
                            where pe.producto_id = p.id and e.eliminado_en is null),
        'actualizado_en',  app.iso_utc(x.cambio))
      else json_build_object(
        'id',             p.id,
        'publicado',      false,
        'actualizado_en', app.iso_utc(x.cambio))
      end
      order by x.n) filter (where x.n <= v_limite), '[]'::json),
    max(x.cambio) filter (where x.n = v_limite),
    (max(x.producto_id::text) filter (where x.n = v_limite))::uuid
  into v_cantidad, v_filas, v_ultimo_t, v_ultimo_i
  from pagina x
  join public.producto p           on p.id = x.producto_id
  left join public.canal_producto cp on cp.canal_id = p_canal_id and cp.producto_id = p.id
  left join public.categoria cat   on cat.id = p.categoria_id
  left join public.marca m         on m.id = p.marca_id
  left join public.presentacion pr on pr.id = p.presentacion_id;

  /*
    Si quedan más, la marca es la última fila entregada: la página
    siguiente arranca justo después. Si no quedan, la marca es la de
    agua, y ya no recorre el catálogo entero: desde ahí, sólo cambios.
  */
  return json_build_object(
    'canal',       (select c.nombre from public.canal c where c.id = p_canal_id),
    'generado_en', app.iso_utc(now()),
    'frescura',    app.frescura_de_canal(p_canal_id),
    'productos',   v_filas,
    'hay_mas',     v_cantidad > v_limite,
    'siguiente',   case when v_cantidad > v_limite
                        then app.marca_codificar(v_ultimo_t, v_ultimo_i, v_completo)
                        else app.marca_codificar(p_hasta, '00000000-0000-0000-0000-000000000000', false)
                   end);
end;
$$;

-- ─── Lo que ve la ficha ───

drop function public.estado_en_tienda(uuid[]);

create function public.estado_en_tienda(p_productos uuid[])
returns table (producto_id uuid, vender_online boolean, solo_consultar boolean, colchon_propio numeric,
               colchon_canal numeric, stock numeric, precio numeric, motivo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_canal uuid := app.canal_de_la_tienda();
begin
  if not app.tiene_permiso('productos.ver') then
    raise exception 'No tenés permiso para ver productos.';
  end if;
  if v_canal is null then
    return;
  end if;

  return query
    select pc.producto_id, pc.vender_online, coalesce(cp.solo_consultar, false), cp.colchon, c.colchon_default,
           pc.stock, pc.precio, pc.motivo
    from app.productos_de_canal(v_canal) pc
    join public.canal c on c.id = v_canal
    left join public.canal_producto cp on cp.canal_id = v_canal and cp.producto_id = pc.producto_id
    where pc.producto_id = any(p_productos);
end;
$$;

revoke all on function public.estado_en_tienda(uuid[]) from public, anon;
grant execute on function public.estado_en_tienda(uuid[]) to authenticated, service_role;

-- ─── Marcar sólo para consultar ───

/*
  Marcar no publica: un producto sólo para consultar sale en la tienda
  si además está prendido para vender online y tiene lo que pide la
  publicación —nombre público, precio—. La marca queda aunque se apague
  la venta online, porque es una propiedad del producto: farmacia sigue
  siendo farmacia la próxima vez que se prenda.
*/
create function public.definir_solo_consultar(p_productos uuid[], p_consultar boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canal     uuid := app.canal_de_la_tienda();
  v_cambiados integer;
begin
  if not app.tiene_permiso('productos.editar') then
    raise exception 'No tenés permiso para modificar productos.';
  end if;
  if v_canal is null then
    raise exception 'No hay un canal de tienda online activo.';
  end if;
  if p_consultar is null then
    raise exception 'Hay que decir si es sólo para consultar o no.';
  end if;

  with cambiados as (
    insert into public.canal_producto (canal_id, producto_id, publicar, solo_consultar)
    select v_canal, p.id, false, p_consultar
    from public.producto p
    where p.id = any(p_productos) and p.eliminado_en is null
    on conflict (canal_id, producto_id) do update set solo_consultar = excluded.solo_consultar
      where public.canal_producto.solo_consultar is distinct from excluded.solo_consultar
    returning 1
  )
  select count(*) into v_cambiados from cambiados;

  return v_cambiados;
end;
$$;

comment on function public.definir_solo_consultar(uuid[], boolean) is
  'Marca o desmarca productos como sólo para consultar en la tienda. Devuelve cuántos cambiaron.';

revoke all on function public.definir_solo_consultar(uuid[], boolean) from public, anon;
grant execute on function public.definir_solo_consultar(uuid[], boolean) to authenticated, service_role;

create function public.definir_solo_consultar_por_clasificacion(p_categoria_id uuid, p_marca_id uuid, p_consultar boolean)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_categoria_id is null and p_marca_id is null then
    raise exception 'Elegí una categoría o una marca: sin eso se marcarían todos los productos.';
  end if;

  -- Los mismos que muestra la lista con ese filtro, como al prender la venta online.
  v_ids := array(
    select p.id from public.producto p
    where p.eliminado_en is null
      and (p_categoria_id is null or p.categoria_id = p_categoria_id)
      and (p_marca_id is null or p.marca_id = p_marca_id));

  return json_build_object('cambiados', public.definir_solo_consultar(v_ids, p_consultar));
end;
$$;

revoke all on function public.definir_solo_consultar_por_clasificacion(uuid, uuid, boolean) from public, anon;
grant execute on function public.definir_solo_consultar_por_clasificacion(uuid, uuid, boolean) to authenticated, service_role;

-- ─── La pantalla Pedidos web: también cómo se paga ───

drop function public.pedidos_web(text);

create function public.pedidos_web(p_vista text)
returns table (id uuid, numero text, estado text, pagado_en_la_web boolean, medio_pago text, referencia_pago text,
               entrega text, domicilio text, localidad text, contacto text, email text, revisar text,
               revisado_en timestamptz, recibido_en timestamptz, preparado_en timestamptz,
               entregado_en timestamptz, cancelado_en timestamptz, motivo_cancelacion text,
               venta_id uuid, venta_codigo text, venta_estado text, total numeric, cobrada_en timestamptz,
               observaciones text, cliente_nombre text, cliente_documento text, comprobante_id uuid,
               comprobante_estado text, comprobante text, remito_id uuid, a_reintegrar numeric,
               devuelto numeric, lineas jsonb)
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
    p.id, p.numero_externo, p.estado, p.pagado_en_la_web, p.medio_pago, p.referencia_pago, p.entrega,
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
     or (p_vista = 'por_preparar' and exists (
           select 1 from public.pedido_reintegro pr
           where pr.pedido_id = p.id and pr.hecho_en is null))
  order by p.recibido_en desc
  limit 300;
end;
$$;

revoke all on function public.pedidos_web(text) from public, anon;
grant execute on function public.pedidos_web(text) to authenticated, service_role;
