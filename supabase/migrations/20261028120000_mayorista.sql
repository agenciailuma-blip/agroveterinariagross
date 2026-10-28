-- ═══════════════════════════════════════════════════════════════
-- Mayorista: el vendedor de calle
--
-- Pedido de Lucas del 26/10 (docs/fase-03.md, punto 5), urgente:
-- Facundo sale a vender por las rutas la semana del 2/11. Arma los
-- pedidos en el teléfono; en el local se confirman, se facturan —o
-- salen con comprobante interno— y se remiten desde la misma pantalla.
--
-- No es un sistema aparte. Los clientes son los mismos, con una marca;
-- los precios salen de una lista más; y facturar un pedido es la venta
-- de siempre, cobrada a cuenta corriente con `cobrar_venta()`: el stock,
-- la cuenta, el vencimiento y la factura salen del mismo código que usa
-- la caja. No hay una segunda manera de vender.
--
-- Lo que hace Facundo pasa por funciones y no por las tablas: no tiene
-- (ni tiene que tener) permiso para ver todos los clientes ni el
-- catálogo con costos. Cada función mira el permiso que le toca.
-- ═══════════════════════════════════════════════════════════════

-- ── Permisos ────────────────────────────────────────────────────
/*
  Separados para que Lucas decida desde Usuarios qué ve y qué hace el
  vendedor de calle (respuesta 5 del 26/10). Arranca con un punto medio:
  ve el stock y la deuda, carga clientes, y pide al precio de la lista.
*/
insert into public.permiso (clave, grupo, descripcion, orden) values
  ('mayorista.vender',         'Mayorista', 'Armar pedidos mayoristas y ver los clientes mayoristas', 270),
  ('mayorista.clientes',       'Mayorista', 'Dar de alta clientes mayoristas y cargarles contacto y ubicación', 271),
  ('mayorista.ver_stock',      'Mayorista', 'Ver el stock en el catálogo mayorista', 272),
  ('mayorista.ver_deuda',      'Mayorista', 'Ver el saldo y lo vencido de los clientes mayoristas', 273),
  ('mayorista.cambiar_precio', 'Mayorista', 'Pedir a otro precio que el de la lista mayorista', 274),
  ('mayorista.atender',        'Mayorista', 'Confirmar, facturar, remitir y cancelar los pedidos mayoristas', 275)
on conflict (clave) do nothing;

insert into public.rol (nombre, descripcion, es_sistema)
select 'Vendedor de calle',
       'Vende a los mayoristas por las rutas, desde el teléfono. Sólo ve la sección Mayorista.',
       true
where not exists (select 1 from public.rol where lower(nombre) = 'vendedor de calle' and eliminado_en is null);

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r
cross join (values ('mayorista.vender'), ('mayorista.clientes'),
                   ('mayorista.ver_stock'), ('mayorista.ver_deuda')) as p(clave)
where r.nombre = 'Vendedor de calle' and r.eliminado_en is null
on conflict do nothing;

-- El local atiende los pedidos y puede hacer todo lo del vendedor.
insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r
cross join (select clave from public.permiso where grupo = 'Mayorista') as p
where r.nombre in ('Administrador', 'Encargado') and r.eliminado_en is null
on conflict do nothing;

-- ── El cliente mayorista ────────────────────────────────────────
/*
  Una marca en la misma ficha, no otra lista de clientes. Lucas dio el
  ejemplo en contra de partirla: el de la empresa de fumigación que a la
  vez compra Livra. Con dos listas serían dos clientes con dos deudas que
  nadie suma.

  La localidad ya estaba; zona y ruta son texto libre a propósito: «ruta
  14», «ruta 12», «zona centro» los escribe Lucas como los nombra él, y
  la pantalla sugiere los que ya se usaron.
*/
alter table public.cliente
  add column if not exists mayorista boolean not null default false,
  add column if not exists zona      text,
  add column if not exists ruta      text,
  add column if not exists latitud   numeric(9,6) check (latitud between -90 and 90),
  add column if not exists longitud  numeric(9,6) check (longitud between -180 and 180);

alter table public.cliente
  drop constraint if exists cliente_ubicacion_completa;
alter table public.cliente
  add constraint cliente_ubicacion_completa check ((latitud is null) = (longitud is null));

comment on column public.cliente.mayorista is
  'Lo atiende el vendedor de calle. El mismo cliente puede comprar también en el mostrador.';
comment on column public.cliente.ruta is
  'Por dónde pasa el vendedor de calle: «ruta 14», «ruta 12». Texto libre.';

create index if not exists cliente_mayorista_idx
  on public.cliente (ruta, localidad) where mayorista and eliminado_en is null;

-- ── La lista de precios mayorista ───────────────────────────────
/*
  Una lista más, con precio fijo por producto (`producto_precio_lista`,
  que existe desde agosto). Sólo los productos con precio en esta lista
  salen en el catálogo del vendedor: «él no va a poder elegir cualquier
  producto». Cuál es la lista lo dice la configuración, así se puede
  cambiar de lista sin tocar nada.
*/
insert into public.lista_precio (nombre, descripcion, ajuste_porcentaje, es_predeterminada, orden)
select 'Mayorista', 'Los precios del vendedor de calle. Sólo vale el precio cargado por producto.', 0, false, 30
where not exists (select 1 from public.lista_precio where lower(nombre) = 'mayorista' and eliminado_en is null);

insert into public.configuracion (clave, valor, descripcion, grupo)
select 'mayorista.lista_precio_id', to_jsonb(l.id::text),
       'La lista de precios de los pedidos mayoristas', 'mayorista'
from public.lista_precio l
where lower(l.nombre) = 'mayorista' and l.eliminado_en is null
on conflict (clave) do nothing;

create or replace function app.lista_mayorista()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(c.valor #>> '{}', '')::uuid
  from public.configuracion c
  where c.clave = 'mayorista.lista_precio_id'
$$;

-- ── El pedido ───────────────────────────────────────────────────
create sequence if not exists public.pedido_mayorista_numero_seq;

create table public.pedido_mayorista (
  id                 uuid primary key,
  numero             bigint not null unique default nextval('public.pedido_mayorista_numero_seq'),
  cliente_id         uuid not null references public.cliente(id) on delete restrict,
  vendedor_id        uuid references public.usuario(id) on delete set null,
  estado             text not null default 'pendiente'
                     check (estado in ('pendiente', 'confirmado', 'facturado', 'cancelado')),
  observaciones      text,
  -- Cuándo lo armó el vendedor: en la ruta puede no haber señal, y
  -- llegar al servidor una hora después.
  armado_en          timestamptz not null default now(),
  recibido_en        timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  confirmado_en      timestamptz,
  confirmado_por     uuid references public.usuario(id) on delete set null,
  venta_id           uuid unique references public.venta(id) on delete restrict,
  facturado_en       timestamptz,
  facturado_por      uuid references public.usuario(id) on delete set null,
  cancelado_en       timestamptz,
  cancelado_por      uuid references public.usuario(id) on delete set null,
  motivo_cancelacion text,
  constraint pedido_mayorista_facturado_tiene_venta check ((estado = 'facturado') = (venta_id is not null))
);

alter sequence public.pedido_mayorista_numero_seq owned by public.pedido_mayorista.numero;

create index pedido_mayorista_estado_idx on public.pedido_mayorista (estado, recibido_en desc);
create index pedido_mayorista_cliente_idx on public.pedido_mayorista (cliente_id, recibido_en desc);

create trigger pedido_mayorista_actualizado_en
  before update on public.pedido_mayorista
  for each row execute function app.set_actualizado_en();

create table public.pedido_mayorista_linea (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references public.pedido_mayorista(id) on delete cascade,
  orden        int not null,
  producto_id  uuid not null references public.producto(id) on delete restrict,
  cantidad     numeric(14,4) not null check (cantidad > 0),
  -- El de la lista cuando se armó, y el que se pidió: si son distintos,
  -- en el local se ve.
  precio_lista numeric(14,4) not null check (precio_lista >= 0),
  precio       numeric(14,4) not null check (precio >= 0),
  unique (pedido_id, producto_id)
);

alter table public.pedido_mayorista enable row level security;
alter table public.pedido_mayorista_linea enable row level security;

/*
  Se lee y se escribe por las funciones de abajo. Las políticas de
  lectura quedan por si alguna pantalla consulta directo: el local ve
  todo, el vendedor ve lo suyo.
*/
create policy pedido_mayorista_select on public.pedido_mayorista
  for select to authenticated
  using ((select app.tiene_permiso('mayorista.atender'))
         or ((select app.tiene_permiso('mayorista.vender')) and vendedor_id = (select app.usuario_actual_id())));

create policy pedido_mayorista_linea_select on public.pedido_mayorista_linea
  for select to authenticated
  using (exists (select 1 from public.pedido_mayorista p where p.id = pedido_id));

grant select on public.pedido_mayorista, public.pedido_mayorista_linea to authenticated;

-- ── Lo que ve el vendedor ───────────────────────────────────────
create or replace function app.puede_ver_mayorista()
returns boolean
language sql
stable
set search_path = ''
as $$
  select app.tiene_permiso('mayorista.vender') or app.tiene_permiso('mayorista.atender')
$$;

/*
  El catálogo: lo que tiene precio en la lista mayorista. El stock sólo
  si el permiso lo deja: sin él vuelve vacío, no cero, para que la
  pantalla no diga «sin stock» de algo que hay.
*/
create or replace function public.mayorista_catalogo()
returns table (
  producto_id        uuid,
  codigo             text,
  nombre             text,
  precio             numeric,
  stock              numeric,
  unidades_por_bulto numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ve_stock boolean := app.tiene_permiso('mayorista.ver_stock') or app.tiene_permiso('mayorista.atender');
begin
  if not app.puede_ver_mayorista() then
    raise exception 'No tenés permiso para la venta mayorista.';
  end if;

  return query
  select p.id, p.codigo, p.nombre_interno, ppl.precio,
         case when v_ve_stock then coalesce(s.cantidad, 0) end,
         p.unidades_por_bulto::numeric
  from public.producto_precio_lista ppl
  join public.producto p on p.id = ppl.producto_id
  left join public.stock_saldo s on s.producto_id = p.id
  where ppl.lista_precio_id = app.lista_mayorista()
    and p.eliminado_en is null and p.activo
  order by p.nombre_interno;
end;
$$;

grant execute on function public.mayorista_catalogo() to authenticated;

/*
  Los clientes mayoristas, con lo que el vendedor necesita antes de salir
  a la ruta: si debe, cuánto está vencido, cuándo fue el último pedido.
  La deuda, sólo con su permiso.
*/
create or replace function public.mayorista_clientes()
returns table (
  id                      uuid,
  nombre                  text,
  nombre_fantasia         text,
  tipo_documento_id       smallint,
  numero_documento        text,
  condicion_iva_id        smallint,
  calle                   text,
  numero                  text,
  localidad               text,
  zona                    text,
  ruta                    text,
  telefono                text,
  email                   text,
  latitud                 numeric,
  longitud                numeric,
  cuenta_corriente        boolean,
  saldo                   numeric,
  vencido                 numeric,
  vencimiento_mas_antiguo date,
  ultimo_pedido_en        timestamptz,
  ultimo_pedido_numero    bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
         u.recibido_en, u.numero
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
$$;

grant execute on function public.mayorista_clientes() to authenticated;

/*
  Alta y contacto del cliente, desde el teléfono.

  Un cliente nuevo nace con cuenta corriente a 30 días y la lista
  mayorista: es como se le vende a un mayorista. Si el documento ya está
  —un cliente del mostrador que ahora también compra por mayor—, no se
  duplica: se le pone la marca y se le completa lo que mandó el vendedor.

  De un cliente que ya existe, el vendedor toca contacto y ubicación,
  nunca los datos fiscales: el mismo cliente se factura en el mostrador,
  y un cambio de condición frente al IVA hecho en la ruta cambiaría sus
  facturas sin que nadie en el local lo sepa. Eso se corrige en su ficha.
*/
create or replace function public.mayorista_guardar_cliente(p_id uuid, p_datos jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
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
      longitud   = coalesce(v_lng, longitud)
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
                              mayorista, zona, ruta, latitud, longitud)
  values (v_nombre, nullif(btrim(p_datos ->> 'nombre_fantasia'), ''),
          case when v_tipo_doc = 80 and v_cond = 1 then 'juridica' else 'fisica' end,
          v_cond, v_tipo_doc, nullif(v_doc, ''),
          nullif(btrim(p_datos ->> 'calle'), ''), nullif(btrim(p_datos ->> 'numero'), ''),
          nullif(btrim(p_datos ->> 'localidad'), ''),
          nullif(btrim(p_datos ->> 'telefono'), ''), nullif(btrim(p_datos ->> 'email'), ''),
          true, 30, app.lista_mayorista(),
          true, nullif(btrim(p_datos ->> 'zona'), ''), nullif(btrim(p_datos ->> 'ruta'), ''),
          v_lat, v_lng)
  returning id into v_id;

  return json_build_object('id', v_id, 'existia', false, 'nombre', v_nombre);
end;
$$;

grant execute on function public.mayorista_guardar_cliente(uuid, jsonb) to authenticated;

/*
  El pedido llega del teléfono. El identificador lo pone el teléfono:
  si se cortó la señal a mitad del envío y lo vuelve a mandar, contesta
  lo mismo en vez de crear otro pedido.

  El precio es el de la lista. Otro precio, sólo con su permiso; y queda
  el de la lista al lado, para que en el local se vea la diferencia.
*/
create or replace function public.mayorista_enviar_pedido(
  p_id            uuid,
  p_cliente_id    uuid,
  p_lineas        jsonb,
  p_observaciones text default null,
  p_armado_en     timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existente  public.pedido_mayorista;
  v_cliente    public.cliente;
  v_lista      uuid := app.lista_mayorista();
  v_puede_precio boolean := app.tiene_permiso('mayorista.cambiar_precio');
  v_linea      jsonb;
  v_producto   uuid;
  v_cantidad   numeric;
  v_precio     numeric;
  v_de_lista   numeric;
  v_orden      int := 0;
  v_numero     bigint;
begin
  if not app.tiene_permiso('mayorista.vender') then
    raise exception 'No tenés permiso para armar pedidos mayoristas.';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador del pedido.';
  end if;

  select * into v_existente from public.pedido_mayorista where id = p_id;
  if v_existente.id is not null then
    return json_build_object('id', v_existente.id, 'numero', v_existente.numero, 'repetido', true);
  end if;

  select * into v_cliente from public.cliente where id = p_cliente_id and eliminado_en is null;
  if v_cliente.id is null or not v_cliente.mayorista then
    raise exception 'Ese cliente no es mayorista.';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El pedido no tiene productos.';
  end if;

  insert into public.pedido_mayorista (id, cliente_id, vendedor_id, observaciones, armado_en)
  values (p_id, p_cliente_id, app.usuario_actual_id(),
          nullif(btrim(coalesce(p_observaciones, '')), ''),
          least(coalesce(p_armado_en, now()), now()))
  returning numero into v_numero;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_producto := (v_linea ->> 'producto_id')::uuid;
    v_cantidad := (v_linea ->> 'cantidad')::numeric;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Hay una cantidad que no es válida.';
    end if;

    select ppl.precio into v_de_lista from public.producto_precio_lista ppl
    join public.producto p on p.id = ppl.producto_id and p.eliminado_en is null
    where ppl.producto_id = v_producto and ppl.lista_precio_id = v_lista;
    if v_de_lista is null then
      raise exception 'Un producto del pedido ya no está en la lista mayorista. Actualizá el catálogo y armalo de nuevo.';
    end if;

    v_precio := v_de_lista;
    if v_puede_precio and (v_linea ? 'precio') and (v_linea ->> 'precio')::numeric >= 0 then
      v_precio := (v_linea ->> 'precio')::numeric;
    end if;

    v_orden := v_orden + 1;
    insert into public.pedido_mayorista_linea (pedido_id, orden, producto_id, cantidad, precio_lista, precio)
    values (p_id, v_orden, v_producto, v_cantidad, v_de_lista, v_precio)
    on conflict (pedido_id, producto_id)
    do update set cantidad = public.pedido_mayorista_linea.cantidad + excluded.cantidad;
  end loop;

  return json_build_object('id', p_id, 'numero', v_numero, 'repetido', false);
end;
$$;

grant execute on function public.mayorista_enviar_pedido(uuid, uuid, jsonb, text, timestamptz) to authenticated;

/*
  Los pedidos, con todo lo que la pantalla necesita para atenderlos sin
  ir a otra: cliente, renglones con el stock de hoy, la venta, la
  factura o el comprobante interno, y el remito. El vendedor ve sólo
  los suyos.
*/
create or replace function public.mayorista_pedidos(p_vista text)
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
  remito_numero       text
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
         rem.id, rem.numero_texto
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

grant execute on function public.mayorista_pedidos(text) to authenticated;

create or replace function public.mayorista_pedidos_pendientes()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when app.tiene_permiso('mayorista.atender')
              then (select count(*)::int from public.pedido_mayorista where estado = 'pendiente')
              else 0 end
$$;

grant execute on function public.mayorista_pedidos_pendientes() to authenticated;

-- ── Lo que hace el local ────────────────────────────────────────
/*
  El depósito lo corrobora: «Agustín corrobora que esté todo». Si falta
  algo, corrige la cantidad ahí mismo —cero lo saca— y recién entonces
  se factura. Se puede corregir hasta facturar.
*/
create or replace function public.mayorista_confirmar_pedido(p_id uuid, p_cantidades jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedido_mayorista;
  v_item   jsonb;
  v_cant   numeric;
begin
  if not app.tiene_permiso('mayorista.atender') then
    raise exception 'No tenés permiso para atender los pedidos mayoristas.';
  end if;

  select * into v_pedido from public.pedido_mayorista where id = p_id for update;
  if v_pedido.id is null then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.estado not in ('pendiente', 'confirmado') then
    raise exception 'El pedido está % y ya no se puede corregir.', v_pedido.estado;
  end if;

  if p_cantidades is not null then
    for v_item in select * from jsonb_array_elements(p_cantidades)
    loop
      v_cant := (v_item ->> 'cantidad')::numeric;
      if v_cant is null or v_cant < 0 then
        raise exception 'Hay una cantidad que no es válida.';
      end if;
      if v_cant = 0 then
        delete from public.pedido_mayorista_linea
        where pedido_id = p_id and producto_id = (v_item ->> 'producto_id')::uuid;
      else
        update public.pedido_mayorista_linea set cantidad = v_cant
        where pedido_id = p_id and producto_id = (v_item ->> 'producto_id')::uuid;
      end if;
    end loop;

    if not exists (select 1 from public.pedido_mayorista_linea where pedido_id = p_id) then
      raise exception 'El pedido quedaría sin productos: si no se manda nada, cancelalo.';
    end if;
  end if;

  update public.pedido_mayorista
  set estado = 'confirmado',
      confirmado_en = coalesce(confirmado_en, now()),
      confirmado_por = coalesce(confirmado_por, app.usuario_actual_id())
  where id = p_id;
end;
$$;

grant execute on function public.mayorista_confirmar_pedido(uuid, jsonb) to authenticated;

/*
  Facturar: la venta de siempre, a cuenta corriente.

  Se arma la venta con los renglones del pedido, se le pone el pago a
  cuenta corriente por el total —con la percepción de IIBB si le toca,
  porque va con la factura a donde vaya la plata— y se cobra con
  `cobrar_venta()`. Eso descuenta el stock (o no, si un remito ya lo
  hizo), anota la deuda con su vencimiento y controla el límite de
  crédito. Con factura, se prepara el comprobante y el CAE se pide
  después, como en la caja. Sin factura, la pantalla emite el
  comprobante interno.

  El candado de «sin factura» es el mismo de la caja: el permiso de
  vender sin factura.
*/
create or replace function public.mayorista_facturar_pedido(p_id uuid, p_documentacion text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido   public.pedido_mayorista;
  v_cliente  public.cliente;
  v_venta_id uuid;
  v_total    numeric;
  v_medio    uuid;
  v_comp     uuid;
begin
  if not app.tiene_permiso('mayorista.atender') then
    raise exception 'No tenés permiso para atender los pedidos mayoristas.';
  end if;
  if p_documentacion not in ('fiscal', 'no_fiscal') then
    raise exception 'Se factura o sale con comprobante interno.';
  end if;
  if p_documentacion = 'fiscal' and not app.tiene_permiso('facturacion.emitir') then
    raise exception 'No tenés permiso para facturar.';
  end if;
  if p_documentacion = 'no_fiscal' and not app.tiene_permiso('facturacion.vender_sin_factura') then
    raise exception 'No tenés permiso para cobrar una venta sin factura.';
  end if;

  select * into v_pedido from public.pedido_mayorista where id = p_id for update;
  if v_pedido.id is null then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.estado = 'facturado' then
    raise exception 'El pedido ya está facturado.';
  end if;
  if v_pedido.estado <> 'confirmado' then
    raise exception 'Primero hay que confirmar el pedido: que el depósito diga que está todo.';
  end if;

  select * into v_cliente from public.cliente where id = v_pedido.cliente_id;
  if not v_cliente.cuenta_corriente then
    raise exception '% no tiene cuenta corriente: habilitala en su ficha para facturarle el pedido.', v_cliente.nombre;
  end if;

  select mp.id into v_medio from public.medio_pago mp
  where mp.tipo = 'cuenta_corriente' and mp.activo and mp.eliminado_en is null
  order by mp.orden limit 1;
  if v_medio is null then
    raise exception 'No hay un medio de pago de cuenta corriente activo.';
  end if;

  insert into public.venta (codigo, estado, cliente_id, vendedor_id, lista_precio_id, documentacion,
                            observaciones, ocurrido_en, enviada_caja_en, medio_pago_previsto_id)
  values ('MAY-' || lpad(v_pedido.numero::text, 6, '0'), 'en_caja', v_pedido.cliente_id, v_pedido.vendedor_id,
          app.lista_mayorista(), p_documentacion,
          'Pedido mayorista ' || v_pedido.numero || coalesce(' · ' || v_pedido.observaciones, ''),
          now(), now(), v_medio)
  returning id into v_venta_id;

  insert into public.venta_linea (venta_id, orden, producto_id, codigo_producto, descripcion,
                                  cantidad, precio_original, precio_unitario, precio_acordado,
                                  motivo_modificacion, modificado_por, alicuota_iva_id, condicion_iva)
  select v_venta_id, l.orden, p.id, p.codigo, p.nombre_interno,
         l.cantidad, l.precio_lista, l.precio, l.precio,
         case when l.precio <> l.precio_lista then 'Precio del pedido mayorista' end,
         case when l.precio <> l.precio_lista then coalesce(v_pedido.vendedor_id, app.usuario_actual_id()) end,
         p.alicuota_iva_id, p.condicion_iva
  from public.pedido_mayorista_linea l
  join public.producto p on p.id = l.producto_id
  where l.pedido_id = p_id;

  select v.total + public.percepcion_de_venta(v.id) into v_total
  from public.venta v where v.id = v_venta_id;

  insert into public.venta_pago (venta_id, medio_pago_id, importe, cuotas, referencia)
  values (v_venta_id, v_medio, v_total, 1, 'Pedido mayorista ' || v_pedido.numero);

  perform public.cobrar_venta(v_venta_id, null, null);

  if p_documentacion = 'fiscal' then
    v_comp := public.preparar_comprobante(v_venta_id);
  end if;

  update public.pedido_mayorista
  set estado = 'facturado', venta_id = v_venta_id,
      facturado_en = now(), facturado_por = app.usuario_actual_id()
  where id = p_id;

  return json_build_object('venta_id', v_venta_id, 'comprobante_id', v_comp);
end;
$$;

grant execute on function public.mayorista_facturar_pedido(uuid, text) to authenticated;

/*
  Cancelar, antes de facturar. El vendedor puede cancelar uno suyo
  mientras el local no lo confirmó —se equivocó de cliente—; después, el
  local. Uno facturado ya es una venta: se anula como cualquier venta,
  con su nota de crédito.
*/
create or replace function public.mayorista_cancelar_pedido(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedido_mayorista;
begin
  select * into v_pedido from public.pedido_mayorista where id = p_id for update;
  if v_pedido.id is null then
    raise exception 'El pedido no existe.';
  end if;

  if not (app.tiene_permiso('mayorista.atender')
          or (app.tiene_permiso('mayorista.vender') and v_pedido.vendedor_id = app.usuario_actual_id()
              and v_pedido.estado = 'pendiente')) then
    raise exception 'No podés cancelar este pedido.';
  end if;
  if v_pedido.estado = 'facturado' then
    raise exception 'El pedido ya está facturado: se anula la venta, con su nota de crédito.';
  end if;
  if v_pedido.estado = 'cancelado' then
    return;
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'Escribí por qué se cancela.';
  end if;

  update public.pedido_mayorista
  set estado = 'cancelado', cancelado_en = now(), cancelado_por = app.usuario_actual_id(),
      motivo_cancelacion = btrim(p_motivo)
  where id = p_id;
end;
$$;

grant execute on function public.mayorista_cancelar_pedido(uuid, text) to authenticated;

-- ── La lista mayorista, desde el local ──────────────────────────
create or replace function public.mayorista_lista()
returns table (
  producto_id  uuid,
  codigo       text,
  nombre       text,
  precio       numeric,
  precio_venta numeric,
  stock        numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('productos.editar_precio') then
    raise exception 'No tenés permiso para cambiar precios.';
  end if;

  return query
  select p.id, p.codigo, p.nombre_interno, ppl.precio, p.precio_venta, coalesce(s.cantidad, 0)
  from public.producto_precio_lista ppl
  join public.producto p on p.id = ppl.producto_id and p.eliminado_en is null
  left join public.stock_saldo s on s.producto_id = p.id
  where ppl.lista_precio_id = app.lista_mayorista()
  order by p.nombre_interno;
end;
$$;

grant execute on function public.mayorista_lista() to authenticated;

/* Un precio vacío saca el producto de la lista. */
create or replace function public.mayorista_guardar_precio(p_producto_id uuid, p_precio numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista uuid := app.lista_mayorista();
begin
  if not app.tiene_permiso('productos.editar_precio') then
    raise exception 'No tenés permiso para cambiar precios.';
  end if;
  if v_lista is null then
    raise exception 'No hay una lista mayorista configurada.';
  end if;

  if p_precio is null then
    delete from public.producto_precio_lista
    where producto_id = p_producto_id and lista_precio_id = v_lista;
    return;
  end if;
  if p_precio < 0 then
    raise exception 'El precio no puede ser negativo.';
  end if;

  insert into public.producto_precio_lista (producto_id, lista_precio_id, precio)
  values (p_producto_id, v_lista, round(p_precio, 2))
  on conflict (producto_id, lista_precio_id) do update set precio = excluded.precio;
end;
$$;

grant execute on function public.mayorista_guardar_precio(uuid, numeric) to authenticated;

-- Ninguna de estas funciones es para quien no inició sesión.
revoke execute on function
  public.mayorista_catalogo(),
  public.mayorista_clientes(),
  public.mayorista_guardar_cliente(uuid, jsonb),
  public.mayorista_enviar_pedido(uuid, uuid, jsonb, text, timestamptz),
  public.mayorista_pedidos(text),
  public.mayorista_pedidos_pendientes(),
  public.mayorista_confirmar_pedido(uuid, jsonb),
  public.mayorista_facturar_pedido(uuid, text),
  public.mayorista_cancelar_pedido(uuid, text),
  public.mayorista_lista(),
  public.mayorista_guardar_precio(uuid, numeric)
from public, anon;
