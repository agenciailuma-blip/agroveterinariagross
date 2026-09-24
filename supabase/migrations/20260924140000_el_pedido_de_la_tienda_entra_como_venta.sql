-- ═══════════════════════════════════════════════════════════════
-- EL PEDIDO DE LA TIENDA ENTRA COMO UNA VENTA
--
-- Primer paso de los pedidos (diseño aprobado el 24/09). La tienda
-- avisa del pedido por la misma puerta y con la misma clave con la que
-- lee el catálogo, y el sistema lo convierte en una venta igual a la
-- que arma un vendedor en el mostrador.
--
-- Lo que NO hace, a propósito: facturar. Eso lo decide una persona
-- desde la pantalla de Pedidos, cuando ya revisó el pedido y armó el
-- paquete, así la factura dice lo que realmente se entrega. Es el paso
-- 3 de la etapa.
--
-- Dos caminos, como en el mostrador:
--   · Pagó en la web  → queda cobrada y descuenta stock, con el medio
--     de pago del canal, que no afecta el arqueo de caja.
--   · Paga en el local → queda en la cola de la caja, y el cajero la
--     cobra como cualquier venta.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- 1. Con qué medio de pago cobra la tienda
--
-- Se crea INACTIVO a propósito: no es una opción que el cajero pueda
-- elegir en el mostrador —ahí no se cobra por la web— pero sí es con lo
-- que queda registrado el cobro del pedido. Y no afecta caja: esa plata
-- está en la cuenta de cobros de la tienda, no en el cajón. Si entrara
-- al arqueo, el cierre de caja nunca cerraría.
-- ───────────────────────────────────────────────────────────────
alter table public.canal
  add column medio_pago_id uuid references public.medio_pago(id);

comment on column public.canal.medio_pago_id is
  'Con qué medio de pago se registra lo que este canal ya cobró. No afecta el arqueo de caja.';

insert into public.medio_pago (nombre, tipo, afecta_caja, activo, orden)
select 'Tienda online', 'otro', false, false, 90
where not exists (select 1 from public.medio_pago where lower(nombre) = 'tienda online');

update public.canal
set medio_pago_id = (select id from public.medio_pago where lower(nombre) = 'tienda online')
where tipo = 'tienda';

/*
  Un medio de pago que usa un canal no se puede dar de baja, por lo
  mismo que la lista de precios: los pedidos que ya entraron quedarían
  apuntando a algo que no existe, y los que entren después no tendrían
  con qué registrarse.
*/
create or replace function app.medio_en_uso_por_un_canal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.eliminado_en is not null and old.eliminado_en is null
     and exists (select 1 from public.canal c
                 where c.medio_pago_id = new.id and c.activo and c.eliminado_en is null)
  then
    raise exception 'El medio de pago "%" es con el que cobra la tienda online. Elegí otro para la tienda antes de darlo de baja.', new.nombre;
  end if;
  return new;
end;
$$;

create trigger medio_pago_en_uso_por_un_canal
  before update on public.medio_pago
  for each row execute function app.medio_en_uso_por_un_canal();


-- ───────────────────────────────────────────────────────────────
-- 2. El pedido
--
-- Vive aparte de la venta porque tiene cosas que una venta del
-- mostrador no tiene: el número que le puso la tienda, el estado de
-- preparación, a dónde se entrega, y las marcas de lo que hay que
-- mirar antes de facturar.
--
-- El número de la tienda es único por canal: es lo que hace que un
-- reintento de ellos no entre dos veces. Es la misma idea con la que
-- una venta del mostrador no se duplica cuando dos máquinas la suben.
-- ───────────────────────────────────────────────────────────────
create table public.pedido_tienda (
  id              uuid primary key default gen_random_uuid(),
  canal_id        uuid not null references public.canal(id),
  numero_externo  text not null check (btrim(numero_externo) <> ''),
  venta_id        uuid not null references public.venta(id),
  estado          text not null default 'recibido'
                    check (estado in ('recibido', 'preparado', 'entregado', 'cancelado')),
  pagado_en_la_web boolean not null,
  referencia_pago text,
  entrega         text not null check (entrega in ('retira', 'envio')),
  domicilio       text,
  localidad       text,
  contacto        text,
  email           text,
  -- Por qué hay que mirarlo antes de facturar. null = no hay nada raro.
  revisar         text,
  recibido_en     timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create unique index pedido_tienda_numero_unico on public.pedido_tienda (canal_id, numero_externo);
create index pedido_tienda_venta_idx  on public.pedido_tienda (venta_id);
create index pedido_tienda_estado_idx on public.pedido_tienda (estado, recibido_en desc);

comment on table public.pedido_tienda is
  'Pedidos que entraron desde un canal de venta online. La venta es la del sistema; acá va lo que la venta no tiene: número de la tienda, preparación y entrega.';

create trigger pedido_tienda_actualizado_en
  before update on public.pedido_tienda
  for each row execute function app.set_actualizado_en();

alter table public.pedido_tienda enable row level security;

-- Lo ve quien puede ver ventas. Escribir es sólo por las funciones.
create policy pedido_tienda_select on public.pedido_tienda
  for select to authenticated
  using ((select app.tiene_permiso('ventas.ver_todas')) or (select app.tiene_permiso('ventas.crear')));

grant select on public.pedido_tienda to authenticated;

-- Cuánto puede diferir el precio del pedido del precio del sistema
-- antes de que el pedido quede marcado para revisar.
insert into public.configuracion (clave, valor, descripcion, grupo) values
  ('tienda.tolerancia_precio_porcentaje', '5',
   'Cuánto puede diferir el precio que informa la tienda del precio del sistema antes de marcar el pedido para revisar.',
   'tienda')
on conflict (clave) do nothing;


-- ───────────────────────────────────────────────────────────────
-- 3. El pedido entra
--
-- Todo en una transacción: o entra el pedido entero con su venta, o no
-- entra nada. Un pedido a medias sería una venta sin pedido o un
-- pedido sin venta, y las dos cosas son peores que un error.
-- ───────────────────────────────────────────────────────────────
create or replace function app.registrar_pedido_de_la_tienda(p_canal_id uuid, p_pedido jsonb)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_numero     text := nullif(btrim(p_pedido ->> 'numero'), '');
  v_pagado     boolean := coalesce((p_pedido ->> 'pagado')::boolean, false);
  v_entrega    text := lower(coalesce(p_pedido #>> '{entrega,tipo}', 'retira'));
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
begin
  select * into v_canal from public.canal where id = p_canal_id;

  -- ─── Lo que no se puede aceptar ───
  if v_numero is null then
    raise exception using errcode = 'PT400', message = 'falta_numero';
  end if;
  if v_productos is null or jsonb_typeof(v_productos) <> 'array' or jsonb_array_length(v_productos) = 0 then
    raise exception using errcode = 'PT400', message = 'faltan_productos';
  end if;
  if v_entrega not in ('retira', 'envio') then
    raise exception using errcode = 'PT400', message = 'entrega_invalida';
  end if;
  if nullif(btrim(v_comprador ->> 'nombre'), '') is null then
    raise exception using errcode = 'PT400', message = 'falta_el_comprador';
  end if;
  if v_canal.medio_pago_id is null and v_pagado then
    raise exception using errcode = 'PT500', message = 'canal_sin_medio_de_pago';
  end if;

  /*
    ─── El mismo pedido dos veces ───

    Si a la tienda se le cortó la conexión y reintenta, contesta lo
    mismo que la primera vez en vez de crear otra venta. Devolver un
    error sería peor: los dejaría sin saber si el pedido entró.
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

  /*
    Una factura A no se factura sin hablar con el cliente: la percepción
    de IIBB que le puede corresponder no estaba en lo que pagó en la web.
    Igual entra: el encargado lo resuelve desde Pedidos.
  */
  if v_cond_iva = 1 then
    v_revisar := v_revisar || 'Pidió factura A: hay que hablarlo antes de facturar';
  end if;

  -- ─── La venta ───
  select coalesce(max(substring(v.codigo from 5)::bigint), 0) + 1
  into v_orden
  from public.venta v where v.codigo like 'WEB-%';
  v_codigo := 'WEB-' || lpad(v_orden::text, 6, '0');

  insert into public.venta (codigo, estado, cliente_id, lista_precio_id, documentacion,
                            observaciones, ocurrido_en, enviada_caja_en)
  values (v_codigo, 'en_caja', v_cliente_id, v_canal.lista_precio_id, 'fiscal',
          nullif(btrim(coalesce(p_pedido ->> 'observaciones', '')), ''), now(), now())
  returning id into v_venta_id;

  -- El catálogo del canal, una sola vez: la misma cuenta que ve la
  -- tienda, para comparar contra lo que informó.
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
    -- del del sistema más de lo tolerado, el pedido queda marcado: un
    -- error de la tienda no puede facturar cualquier cosa en silencio.
    if v_del_canal is not null and (v_del_canal ->> 'precio')::numeric > 0
       and abs(v_precio - (v_del_canal ->> 'precio')::numeric)
           / (v_del_canal ->> 'precio')::numeric * 100 > v_tolerancia then
      v_revisar := v_revisar || format('El precio de %s no coincide con el del sistema', v_producto.codigo);
    end if;

    if v_del_canal is not null and (v_del_canal ->> 'stock')::numeric < v_cantidad then
      v_revisar := v_revisar || format('No hay stock suficiente de %s', v_producto.codigo);
    end if;

    insert into public.venta_linea (venta_id, orden, producto_id, codigo_producto, descripcion,
                                    cantidad, precio_original, precio_unitario, precio_acordado,
                                    alicuota_iva_id, condicion_iva)
    values (v_venta_id, v_orden, v_producto.id, v_producto.codigo,
            coalesce(nullif(btrim(v_producto.nombre_publico), ''), v_producto.nombre_interno),
            v_cantidad,
            coalesce((v_del_canal ->> 'precio')::numeric, v_precio), v_precio, v_precio,
            v_producto.alicuota_iva_id, v_producto.condicion_iva);
  end loop;

  -- El total lo calcula el disparador de siempre a partir de las líneas.
  select total into v_total from public.venta where id = v_venta_id;

  /*
    Si la tienda mandó su total, tiene que coincidir con el nuestro. No
    frena el pedido —ya está pagado— pero se marca: una diferencia acá
    es plata que alguien va a tener que explicar.
  */
  if (p_pedido ? 'total') and abs((p_pedido ->> 'total')::numeric - v_total) > 0.01 then
    v_revisar := v_revisar || format('La tienda informó un total de %s y las líneas suman %s',
                                     p_pedido ->> 'total', v_total);
  end if;

  -- ─── El cobro, si ya pagó ───
  if v_pagado then
    insert into public.venta_pago (venta_id, medio_pago_id, importe, cuotas, referencia)
    values (v_venta_id, v_canal.medio_pago_id, v_total, 1,
            nullif(btrim(coalesce(p_pedido ->> 'referencia_pago', '')), ''));

    -- El mismo cobro que el del mostrador: descuenta stock y deja la
    -- venta cobrada. Sin caja ni cajero, porque no hubo ninguno.
    perform public.cobrar_venta(v_venta_id, null, null);
  end if;

  insert into public.pedido_tienda (canal_id, numero_externo, venta_id, pagado_en_la_web,
                                    referencia_pago, entrega, domicilio, localidad, contacto, email,
                                    revisar)
  values (p_canal_id, v_numero, v_venta_id, v_pagado,
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
  identificador. Si la tienda manda "dos" como cantidad, eso es un
  pedido mal armado —un 400— y no un error del sistema: contestar 500
  los mandaría a buscar el problema de nuestro lado.
*/
exception
  when sqlstate '22P02' or sqlstate '22003' then
    raise exception using errcode = 'PT400', message = 'pedido_invalido';
end;
$$;

comment on function app.registrar_pedido_de_la_tienda(uuid, jsonb) is
  'Convierte un pedido de la tienda en una venta del sistema. No factura: eso lo decide una persona desde Pedidos.';


-- ───────────────────────────────────────────────────────────────
-- 4. La puerta
-- ───────────────────────────────────────────────────────────────
create or replace function public.api_tienda_registrar_pedido(p_clave text, p_pedido jsonb)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_canal uuid;
begin
  v_canal := app.canal_de_la_clave(p_clave);
  return app.registrar_pedido_de_la_tienda(v_canal, p_pedido);
end;
$$;

comment on function public.api_tienda_registrar_pedido(text, jsonb) is
  'API de la tienda: informa un pedido. Ver docs/api-tienda.md.';

revoke all on function public.api_tienda_registrar_pedido(text, jsonb) from public, authenticated, service_role;
grant execute on function public.api_tienda_registrar_pedido(text, jsonb) to anon;

revoke all on function app.registrar_pedido_de_la_tienda(uuid, jsonb) from public;
revoke all on function app.medio_en_uso_por_un_canal() from public;
