-- ═══════════════════════════════════════════════════════════════
-- La orden de compra interna
--
-- Pedido de Lucas del 07/10, con su modelo dibujado el 08/10
-- (docs/pedidos-lucas-2026-10-07.md, punto 2). Un sector le pide a
-- otro —casi siempre a Compras— lo que hay que comprar, en un papel y
-- no de palabra: «el de depósito me presenta una hoja que dice esto es
-- lo que hay que pedir, porque la semana que viene nos quedamos sin
-- stock». También sirve para mandar a un empleado a comprar algo a un
-- comercio, o a sacarlo a cuenta corriente.
--
-- Es interna: no va al proveedor ni mueve stock ni plata. Por eso no
-- toca nada de lo que anda: tablas nuevas y funciones nuevas.
--
-- Lo que dice, como en el dibujo: el número y la fecha arriba; quién
-- la emite y quién la recibe, de una lista de sectores; los renglones
-- con código, descripción, proveedor y cantidad; una observación; el
-- contacto del cliente si es para uno; y la firma de quien la emite,
-- en el papel.
-- ═══════════════════════════════════════════════════════════════

-- ── Permiso ─────────────────────────────────────────────────────
/*
  Hacerla y verlas es un permiso aparte de `compras.ver`: el de depósito
  tiene que poder pedir sin ver costos, facturas ni lo que se le debe a
  cada proveedor. Lo tienen todos los puestos.
*/
insert into public.permiso (clave, grupo, descripcion, orden) values
  ('compras.solicitar', 'Compras', 'Hacer órdenes de compra internas y ver las de todos', 705)
on conflict (clave) do nothing;

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, 'compras.solicitar' from public.rol r
on conflict do nothing;

-- ── Los sectores ────────────────────────────────────────────────
/*
  Una lista corta —«no va a salir de esos cuatro o cinco»— que sirve
  para los dos lados: emite y recibe. Se suman desde la misma pantalla
  de la orden, como las marcas desde la ficha del producto.
*/
create table public.sector (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (btrim(nombre) <> ''),
  orden          int  not null default 100,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz
);

create unique index sector_nombre_unico on public.sector (lower(btrim(nombre))) where eliminado_en is null;

create trigger sector_actualizado_en
  before update on public.sector
  for each row execute function app.set_actualizado_en();

insert into public.sector (nombre, orden) values
  ('Depósito', 10), ('Ventas', 20), ('Venta mostrador', 30),
  ('Administración', 40), ('Consultorio', 50), ('Compras', 60);

alter table public.sector enable row level security;

create policy sector_select on public.sector
  for select to authenticated using ((select app.es_usuario_activo()));

comment on table public.sector is
  'Los sectores del local que emiten y reciben órdenes de compra internas: Depósito, Ventas, Compras…';

-- ── La orden ────────────────────────────────────────────────────
create table public.orden_compra_interna (
  -- Lo genera la pantalla: un guardado que se corta y se reintenta no
  -- crea dos órdenes.
  id               uuid primary key default gen_random_uuid(),
  -- «La orden 12». Lo pone la base, en orden.
  numero           bigint generated always as identity unique,
  fecha            date not null default current_date,
  emite_id         uuid not null references public.sector(id),
  recibe_id        uuid not null references public.sector(id),
  observacion      text,
  -- Si es para un cliente: cuando llega, ya se sabe a quién avisarle.
  cliente_id       uuid references public.cliente(id) on delete set null,
  contacto         text,
  /*
    pendiente — la hizo el sector y espera.
    pedida    — Compras ya la pidió (o la compró).
    anulada   — no va; con motivo.
  */
  estado           text not null default 'pendiente'
                     check (estado in ('pendiente', 'pedida', 'anulada')),
  creada_por       uuid references public.usuario(id) on delete set null,
  pedida_en        timestamptz,
  pedida_por       uuid references public.usuario(id) on delete set null,
  anulada_en       timestamptz,
  anulada_por      uuid references public.usuario(id) on delete set null,
  motivo_anulacion text,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

create index orden_compra_interna_fecha_idx on public.orden_compra_interna (fecha desc, numero desc);
create index orden_compra_interna_estado_idx on public.orden_compra_interna (estado) where estado = 'pendiente';

create trigger orden_compra_interna_actualizado_en
  before update on public.orden_compra_interna
  for each row execute function app.set_actualizado_en();

/*
  El renglón guarda el código y la descripción como estaban, como la
  línea de una venta: el papel dice lo que se pidió aunque después
  cambie el nombre del producto. Y un renglón sin producto es lo que no
  está en el catálogo —lo de Casa Burgo—.
*/
create table public.orden_compra_interna_linea (
  id            uuid primary key default gen_random_uuid(),
  orden_id      uuid not null references public.orden_compra_interna(id) on delete cascade,
  renglon       int  not null,
  producto_id   uuid references public.producto(id) on delete set null,
  codigo        text,
  descripcion   text not null check (btrim(descripcion) <> ''),
  proveedor_id  uuid references public.proveedor(id) on delete set null,
  cantidad      numeric(14,4) not null check (cantidad > 0)
);

create index orden_compra_interna_linea_orden_idx on public.orden_compra_interna_linea (orden_id, renglon);
create index orden_compra_interna_linea_proveedor_idx on public.orden_compra_interna_linea (proveedor_id);

alter table public.orden_compra_interna enable row level security;
alter table public.orden_compra_interna_linea enable row level security;

-- Se escriben sólo por las funciones de abajo; leer, quien las hace o quien compra.
create policy orden_compra_interna_select on public.orden_compra_interna
  for select to authenticated
  using ((select app.tiene_permiso('compras.solicitar')) or (select app.tiene_permiso('compras.ver')));
create policy orden_compra_interna_linea_select on public.orden_compra_interna_linea
  for select to authenticated
  using ((select app.tiene_permiso('compras.solicitar')) or (select app.tiene_permiso('compras.ver')));

comment on table public.orden_compra_interna is
  'Orden de compra interna: un sector le pide a otro (casi siempre a Compras) lo que hay que comprar. No mueve stock ni plata.';

-- ── Sumar un sector ─────────────────────────────────────────────
create or replace function public.crear_sector(p_nombre text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_id uuid;
begin
  if not app.tiene_permiso('compras.solicitar') then
    raise exception 'No tenés permiso para hacer órdenes de compra internas.';
  end if;
  if v_nombre = '' then
    raise exception 'El sector necesita un nombre.';
  end if;

  select id into v_id from public.sector
   where lower(btrim(nombre)) = lower(v_nombre) and eliminado_en is null;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.sector (nombre) values (v_nombre) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.crear_sector(text) from public;
grant execute on function public.crear_sector(text) to authenticated;

-- ── Guardar la orden ────────────────────────────────────────────
/*
  Crea la orden, o la reemplaza entera mientras siga pendiente: un error
  de tipeo se corrige sin anularla y hacer otra. Una vez pedida o
  anulada, ya no se toca —el papel ya circuló—.

  Cada renglón: `producto_id` (o nada, si no está en el catálogo),
  `descripcion`, `proveedor_id` y `cantidad`. El código lo toma del
  producto; la descripción, si viene vacía, también.
*/
create or replace function public.guardar_orden_interna(
  p_id          uuid,
  p_emite_id    uuid,
  p_recibe_id   uuid,
  p_lineas      jsonb,
  p_fecha       date default null,
  p_observacion text default null,
  p_cliente_id  uuid default null,
  p_contacto    text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id      uuid := coalesce(p_id, gen_random_uuid());
  v_actual  public.orden_compra_interna;
  v_numero  bigint;
  v_linea   jsonb;
  v_renglon int := 0;
  v_prod    public.producto;
  v_desc    text;
  v_cant    numeric;
begin
  if not app.tiene_permiso('compras.solicitar') then
    raise exception 'No tenés permiso para hacer órdenes de compra internas.';
  end if;

  if not exists (select 1 from public.sector where id = p_emite_id and eliminado_en is null) then
    raise exception 'Falta elegir qué sector la emite.';
  end if;
  if not exists (select 1 from public.sector where id = p_recibe_id and eliminado_en is null) then
    raise exception 'Falta elegir qué sector la recibe.';
  end if;
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La orden no tiene nada para pedir.';
  end if;

  select * into v_actual from public.orden_compra_interna where id = v_id for update;

  if v_actual.id is not null and v_actual.estado <> 'pendiente' then
    raise exception 'La orden % ya está %: no se puede cambiar.', v_actual.numero, v_actual.estado;
  end if;

  if v_actual.id is null then
    insert into public.orden_compra_interna
      (id, fecha, emite_id, recibe_id, observacion, cliente_id, contacto, creada_por)
    values
      (v_id, coalesce(p_fecha, current_date), p_emite_id, p_recibe_id,
       nullif(btrim(coalesce(p_observacion, '')), ''), p_cliente_id,
       nullif(btrim(coalesce(p_contacto, '')), ''), app.usuario_actual_id())
    returning numero into v_numero;
  else
    update public.orden_compra_interna
       set fecha = coalesce(p_fecha, fecha),
           emite_id = p_emite_id,
           recibe_id = p_recibe_id,
           observacion = nullif(btrim(coalesce(p_observacion, '')), ''),
           cliente_id = p_cliente_id,
           contacto = nullif(btrim(coalesce(p_contacto, '')), '')
     where id = v_id;
    v_numero := v_actual.numero;
    delete from public.orden_compra_interna_linea where orden_id = v_id;
  end if;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_renglon := v_renglon + 1;
    v_prod := null;
    if nullif(v_linea->>'producto_id', '') is not null then
      select * into v_prod from public.producto where id = (v_linea->>'producto_id')::uuid;
      if v_prod.id is null then
        raise exception 'El renglón % es de un producto que no existe.', v_renglon;
      end if;
    end if;

    v_desc := coalesce(nullif(btrim(coalesce(v_linea->>'descripcion', '')), ''), v_prod.nombre_interno);
    if v_desc is null then
      raise exception 'Al renglón % le falta qué hay que comprar.', v_renglon;
    end if;

    v_cant := nullif(v_linea->>'cantidad', '')::numeric;
    if v_cant is null or v_cant <= 0 then
      raise exception 'Al renglón % («%») le falta la cantidad.', v_renglon, v_desc;
    end if;

    insert into public.orden_compra_interna_linea
      (orden_id, renglon, producto_id, codigo, descripcion, proveedor_id, cantidad)
    values
      (v_id, v_renglon, v_prod.id, v_prod.codigo, v_desc,
       nullif(v_linea->>'proveedor_id', '')::uuid, v_cant);
  end loop;

  return v_numero;
end;
$$;

revoke all on function public.guardar_orden_interna(uuid, uuid, uuid, jsonb, date, text, uuid, text) from public;
grant execute on function public.guardar_orden_interna(uuid, uuid, uuid, jsonb, date, text, uuid, text) to authenticated;

-- ── Pedida, de vuelta a pendiente, o anulada ────────────────────
/*
  Marcarla pedida es de quien compra (`compras.ver`): es Compras el que
  dice «esto ya lo pedí». Volver a pendiente deshace un clic de más.
  Anular la puede quien la hace, con motivo, mientras no esté pedida.
*/
create or replace function public.marcar_orden_interna(p_id uuid, p_pedida boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_orden public.orden_compra_interna;
begin
  if not app.tiene_permiso('compras.ver') then
    raise exception 'Marcar una orden como pedida es de quien compra.';
  end if;

  select * into v_orden from public.orden_compra_interna where id = p_id for update;
  if v_orden.id is null then
    raise exception 'Esa orden no existe.';
  end if;
  if v_orden.estado = 'anulada' then
    raise exception 'La orden % está anulada.', v_orden.numero;
  end if;

  update public.orden_compra_interna
     set estado     = case when p_pedida then 'pedida' else 'pendiente' end,
         pedida_en  = case when p_pedida then now() end,
         pedida_por = case when p_pedida then app.usuario_actual_id() end
   where id = p_id;
end;
$$;

revoke all on function public.marcar_orden_interna(uuid, boolean) from public;
grant execute on function public.marcar_orden_interna(uuid, boolean) to authenticated;

create or replace function public.anular_orden_interna(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_orden public.orden_compra_interna;
begin
  if not app.tiene_permiso('compras.solicitar') then
    raise exception 'No tenés permiso para anular órdenes de compra internas.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Para anular una orden hay que decir por qué.';
  end if;

  select * into v_orden from public.orden_compra_interna where id = p_id for update;
  if v_orden.id is null then
    raise exception 'Esa orden no existe.';
  end if;
  if v_orden.estado = 'anulada' then
    raise exception 'La orden % ya estaba anulada.', v_orden.numero;
  end if;
  if v_orden.estado = 'pedida' then
    raise exception 'La orden % ya se pidió: primero hay que volverla a pendiente.', v_orden.numero;
  end if;

  update public.orden_compra_interna
     set estado = 'anulada', anulada_en = now(), anulada_por = app.usuario_actual_id(),
         motivo_anulacion = btrim(p_motivo)
   where id = p_id;
end;
$$;

revoke all on function public.anular_orden_interna(uuid, text) from public;
grant execute on function public.anular_orden_interna(uuid, text) to authenticated;

-- ── Lo que ve la pantalla ───────────────────────────────────────
/*
  La lista, con los nombres ya puestos: los sectores, quién la hizo y
  cuántos renglones tiene. Con permiso de dueño para poder nombrar a
  las personas, y por eso controla el permiso a mano.
*/
create or replace function public.ordenes_internas(p_estado text default null, p_limite int default 100)
returns table (
  id          uuid,
  numero      bigint,
  fecha       date,
  emite       text,
  recibe      text,
  estado      text,
  renglones   bigint,
  observacion text,
  cliente     text,
  creada_por  text,
  creado_en   timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not (app.tiene_permiso('compras.solicitar') or app.tiene_permiso('compras.ver')) then
    raise exception 'No tenés permiso para ver las órdenes de compra internas.';
  end if;

  return query
  select o.id, o.numero, o.fecha, se.nombre, sr.nombre, o.estado,
         (select count(*) from public.orden_compra_interna_linea l where l.orden_id = o.id),
         o.observacion, c.nombre, u.nombre, o.creado_en
    from public.orden_compra_interna o
    join public.sector se on se.id = o.emite_id
    join public.sector sr on sr.id = o.recibe_id
    left join public.cliente c on c.id = o.cliente_id
    left join public.usuario u on u.id = o.creada_por
   where p_estado is null or o.estado = p_estado
   order by o.fecha desc, o.numero desc
   limit greatest(1, least(coalesce(p_limite, 100), 500));
end;
$$;

revoke all on function public.ordenes_internas(text, int) from public;
grant execute on function public.ordenes_internas(text, int) to authenticated;

/*
  Una orden entera, para verla, editarla o imprimirla: la cabecera con
  los nombres y los renglones con su proveedor, ordenados por proveedor
  —«tanto de éste, tanto del otro», que es como la lee Lucas—.
*/
create or replace function public.orden_interna(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_resultado jsonb;
begin
  if not (app.tiene_permiso('compras.solicitar') or app.tiene_permiso('compras.ver')) then
    raise exception 'No tenés permiso para ver las órdenes de compra internas.';
  end if;

  select jsonb_build_object(
           'id', o.id, 'numero', o.numero, 'fecha', o.fecha,
           'emite_id', o.emite_id, 'emite', se.nombre,
           'recibe_id', o.recibe_id, 'recibe', sr.nombre,
           'observacion', o.observacion,
           'cliente_id', o.cliente_id, 'cliente', c.nombre, 'contacto', o.contacto,
           'estado', o.estado, 'motivo_anulacion', o.motivo_anulacion,
           'creada_por', u.nombre, 'creado_en', o.creado_en,
           'pedida_en', o.pedida_en, 'pedida_por', up.nombre,
           'lineas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'renglon', l.renglon, 'producto_id', l.producto_id, 'codigo', l.codigo,
                      'descripcion', l.descripcion, 'proveedor_id', l.proveedor_id,
                      'proveedor', pr.nombre, 'cantidad', l.cantidad)
                    order by pr.nombre nulls last, l.renglon)
               from public.orden_compra_interna_linea l
               left join public.proveedor pr on pr.id = l.proveedor_id
              where l.orden_id = o.id), '[]'::jsonb))
    into v_resultado
    from public.orden_compra_interna o
    join public.sector se on se.id = o.emite_id
    join public.sector sr on sr.id = o.recibe_id
    left join public.cliente c on c.id = o.cliente_id
    left join public.usuario u on u.id = o.creada_por
    left join public.usuario up on up.id = o.pedida_por
   where o.id = p_id;

  return v_resultado;
end;
$$;

revoke all on function public.orden_interna(uuid) from public;
grant execute on function public.orden_interna(uuid) to authenticated;
