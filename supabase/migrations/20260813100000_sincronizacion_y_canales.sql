-- ═══════════════════════════════════════════════════════════════
-- 011 — MOTOR DE SINCRONIZACION Y CANALES DE VENTA
--
-- COMO SINCRONIZA EL SISTEMA
--
-- No hay un solo mecanismo, hay dos, porque los datos son de dos tipos
-- distintos y mezclarlos es de donde salen los problemas:
--
--   HECHOS (movimientos de stock, ventas, movimientos de cuenta
--   corriente, comprobantes). Son inmutables y se agregan. Nunca hay
--   conflicto: la sincronizacion los une. El id lo genera el cliente, y
--   si reenvia algo por las dudas, choca contra la clave primaria y no
--   se duplica.
--
--   DATOS MAESTROS (productos, precios, clientes, configuracion). Son
--   mutables, pero se editan desde la oficina, no desde el mostrador.
--   Manda el servidor: la terminal los baja, no los discute.
--
-- Esa division es lo que evita tener que resolver conflictos complejos.
-- Cada tipo de dato viaja en la direccion en que naturalmente se genera.
--
-- El cursor de bajada es actualizado_en, y la baja logica viaja como
-- dato (eliminado_en), por eso ninguna tabla borra fisicamente.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Estado de sincronizacion de cada terminal
-- ───────────────────────────────────────────────────────────────
alter table public.terminal add column ultima_sincronizacion timestamptz;
alter table public.terminal add column version_app           text;
alter table public.terminal add column ultimo_error_sync     text;

create index terminal_sync_idx on public.terminal (ultima_sincronizacion)
  where activo and eliminado_en is null;

comment on column public.terminal.ultima_sincronizacion is
  'Ultimo momento en que esta terminal completo una sincronizacion. De aca sale la frescura del stock publicado.';

-- ───────────────────────────────────────────────────────────────
-- Bitacora de sincronizaciones
--
-- Sirve para dos cosas: diagnosticar por que una terminal esta
-- desfasada, y demostrar que el modo sin conexion se usa para cortes
-- reales y no como forma habitual de trabajo.
-- ───────────────────────────────────────────────────────────────
create table public.sincronizacion (
  id                  uuid primary key default gen_random_uuid(),
  terminal_id         uuid references public.terminal(id) on delete set null,
  direccion           text not null check (direccion in ('subida', 'bajada', 'completa')),
  -- ventana de tiempo que cubrio esta sincronizacion
  desde_cursor        timestamptz,
  hasta_cursor        timestamptz,
  registros_enviados  integer not null default 0,
  registros_recibidos integer not null default 0,
  duplicados_ignorados integer not null default 0,
  duracion_ms         integer,
  resultado           text not null default 'ok' check (resultado in ('ok', 'parcial', 'error')),
  error_mensaje       text,
  creado_en           timestamptz not null default now()
);

create index sincronizacion_terminal_idx  on public.sincronizacion (terminal_id, creado_en desc);
create index sincronizacion_creado_idx    on public.sincronizacion (creado_en desc);
create index sincronizacion_resultado_idx on public.sincronizacion (resultado, creado_en desc)
  where resultado <> 'ok';

comment on table public.sincronizacion is
  'Bitacora de cada sincronizacion. Permite diagnosticar terminales desfasadas y documentar el uso real del modo sin conexion.';

-- Registra la sincronizacion y actualiza el estado de la terminal
create or replace function public.registrar_sincronizacion(
  p_terminal_id          uuid,
  p_direccion            text,
  p_desde_cursor         timestamptz default null,
  p_registros_enviados   integer default 0,
  p_registros_recibidos  integer default 0,
  p_duplicados_ignorados integer default 0,
  p_duracion_ms          integer default null,
  p_resultado            text default 'ok',
  p_error_mensaje        text default null
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ahora timestamptz := now();
begin
  insert into public.sincronizacion (
    terminal_id, direccion, desde_cursor, hasta_cursor,
    registros_enviados, registros_recibidos, duplicados_ignorados,
    duracion_ms, resultado, error_mensaje
  ) values (
    p_terminal_id, p_direccion, p_desde_cursor, v_ahora,
    p_registros_enviados, p_registros_recibidos, p_duplicados_ignorados,
    p_duracion_ms, p_resultado, p_error_mensaje
  );

  -- Solo avanza el reloj de la terminal si la sincronizacion salio bien.
  -- Si fallo, el proximo intento tiene que volver a traer lo mismo.
  if p_resultado = 'ok' then
    update public.terminal
    set ultima_sincronizacion = v_ahora,
        ultimo_error_sync     = null
    where id = p_terminal_id;
  else
    update public.terminal
    set ultimo_error_sync = p_error_mensaje
    where id = p_terminal_id;
  end if;

  return v_ahora;
end;
$$;

comment on function public.registrar_sincronizacion is
  'Asienta una sincronizacion y devuelve el cursor del servidor. Solo avanza el reloj de la terminal si el resultado fue ok.';

grant execute on function public.registrar_sincronizacion(
  uuid, text, timestamptz, integer, integer, integer, integer, text, text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Salud de la sincronizacion
-- ───────────────────────────────────────────────────────────────
create view public.vista_salud_sincronizacion
with (security_invoker = true) as
select
  t.id                as terminal_id,
  t.nombre,
  t.tipo,
  t.prefijo,
  t.version_app,
  t.ultima_sincronizacion,
  t.ultimo_error_sync,
  case
    when t.ultima_sincronizacion is null then null
    else floor(extract(epoch from (now() - t.ultima_sincronizacion)) / 60)::integer
  end                 as minutos_sin_sincronizar,
  case
    when t.ultima_sincronizacion is null                            then 'nunca'
    when now() - t.ultima_sincronizacion < interval '5 minutes'     then 'al_dia'
    when now() - t.ultima_sincronizacion < interval '30 minutes'    then 'atrasada'
    when now() - t.ultima_sincronizacion < interval '1 day'         then 'desconectada'
    else 'inactiva'
  end                 as estado_sync,
  (select count(*) from public.sincronizacion s
    where s.terminal_id = t.id and s.resultado <> 'ok'
      and s.creado_en > now() - interval '24 hours') as errores_24h
from public.terminal t
where t.activo and t.eliminado_en is null;

comment on view public.vista_salud_sincronizacion is
  'Estado de sincronizacion de cada terminal. Es el semaforo que ve el encargado y la fuente de la frescura del stock.';

-- ───────────────────────────────────────────────────────────────
-- Frescura del stock
--
-- Responde una sola pregunta, que es la que importa para publicar
-- stock afuera: que tan viejo es el dato mas viejo del mostrador.
--
-- Si una terminal de mostrador lleva rato sin sincronizar, hubo ventas
-- que el servidor todavia no vio, asi que el stock que publicamos a la
-- tienda no es confiable. Esto es lo que la tienda consulta para saber
-- si puede vender a ciegas o tiene que pasar a "consultar disponibilidad".
-- ───────────────────────────────────────────────────────────────
create or replace function public.frescura_stock()
returns table (
  terminales_activas   integer,
  terminales_atrasadas integer,
  sincronizado_hasta   timestamptz,
  minutos_de_atraso    integer,
  confiable            boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (count(*) filter (where t.tipo in ('caja', 'mostrador')))::integer,
    (count(*) filter (
      where t.tipo in ('caja', 'mostrador')
        and (t.ultima_sincronizacion is null
             or t.ultima_sincronizacion < now() - interval '15 minutes')))::integer,
    min(t.ultima_sincronizacion) filter (where t.tipo in ('caja', 'mostrador')),
    coalesce(
      floor(extract(epoch from (
        now() - min(t.ultima_sincronizacion) filter (where t.tipo in ('caja','mostrador'))
      )) / 60)::integer,
      999999),
    coalesce(
      min(t.ultima_sincronizacion) filter (where t.tipo in ('caja', 'mostrador'))
        > now() - interval '15 minutes',
      false)
  from public.terminal t
  where t.activo and t.eliminado_en is null;
$$;

comment on function public.frescura_stock() is
  'Que tan actualizado esta el stock del servidor respecto del mostrador. Lo consulta la tienda online para decidir si puede vender a ciegas.';

grant execute on function public.frescura_stock() to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- CANALES DE VENTA
--
-- El stock fisico es uno solo, pero se vende por varias bocas:
-- mostrador, tienda propia y en algun momento MercadoLibre.
--
-- Cada canal publica menos de lo que hay fisicamente. Ese colchon es
-- lo que absorbe la ventana entre que el canal consulta y alguien
-- compra en el mostrador. Sin colchon, la tienda sobrevende.
--
-- Se modela ahora aunque la integracion sea de V1-B: si se hardcodea a
-- un solo canal, sumar MercadoLibre despues obliga a rehacerlo.
-- ═══════════════════════════════════════════════════════════════
create table public.canal (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  tipo               text not null check (tipo in ('mostrador', 'tienda', 'marketplace')),
  -- unidades que NO se publican, para absorber la venta concurrente
  colchon_default    numeric(14,4) not null default 0 check (colchon_default >= 0),
  -- minutos de atraso tolerados antes de dejar de confiar en el stock
  tolerancia_minutos integer not null default 15 check (tolerancia_minutos > 0),
  activo             boolean not null default true,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  eliminado_en       timestamptz
);

create unique index canal_nombre_unico on public.canal (lower(nombre)) where eliminado_en is null;

create trigger canal_actualizado_en before update on public.canal
  for each row execute function app.set_actualizado_en();

-- Excepciones por producto: el que rota rapido lleva mas colchon
create table public.canal_producto (
  canal_id    uuid not null references public.canal(id)    on delete cascade,
  producto_id uuid not null references public.producto(id) on delete cascade,
  publicar    boolean not null default true,
  colchon     numeric(14,4) check (colchon >= 0),
  creado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  primary key (canal_id, producto_id)
);

create index canal_producto_producto_idx on public.canal_producto (producto_id);

create trigger canal_producto_actualizado_en before update on public.canal_producto
  for each row execute function app.set_actualizado_en();

comment on table public.canal_producto is
  'Excepciones por producto y canal. Si no hay fila, se aplica el colchon por defecto del canal.';

-- Lo que cada canal puede publicar, ya con el colchon aplicado
create view public.vista_stock_canal
with (security_invoker = true) as
select
  c.id                          as canal_id,
  c.nombre                      as canal,
  p.id                          as producto_id,
  p.codigo,
  coalesce(p.nombre_publico, p.nombre_interno) as nombre,
  p.precio_venta,
  coalesce(s.cantidad, 0)       as stock_fisico,
  coalesce(cp.colchon, c.colchon_default) as colchon,
  greatest(0, coalesce(s.cantidad, 0) - coalesce(cp.colchon, c.colchon_default))
                                as stock_publicable,
  coalesce(cp.publicar, true) and p.activo and p.eliminado_en is null
                                as publicar,
  s.actualizado_en              as stock_actualizado_en
from public.canal c
cross join public.producto p
left join public.stock_saldo   s  on s.producto_id  = p.id
left join public.canal_producto cp on cp.canal_id   = c.id and cp.producto_id = p.id
where c.activo and c.eliminado_en is null
  and p.eliminado_en is null;

comment on view public.vista_stock_canal is
  'Stock publicable por canal, con el colchon ya descontado. Nunca devuelve negativo: si hay sobreventa, publica cero.';

-- ───────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────
alter table public.sincronizacion  enable row level security;
alter table public.canal           enable row level security;
alter table public.canal_producto  enable row level security;

create policy sincronizacion_select on public.sincronizacion
  for select to authenticated using ((select app.es_usuario_activo()));
create policy sincronizacion_insert on public.sincronizacion
  for insert to authenticated with check ((select app.es_usuario_activo()));

create policy canal_select on public.canal
  for select to authenticated using ((select app.es_usuario_activo()));
create policy canal_insert on public.canal
  for insert to authenticated with check ((select app.tiene_permiso('configuracion.gestionar')));
create policy canal_update on public.canal
  for update to authenticated
  using ((select app.tiene_permiso('configuracion.gestionar')))
  with check ((select app.tiene_permiso('configuracion.gestionar')));

create policy canal_producto_select on public.canal_producto
  for select to authenticated using ((select app.es_usuario_activo()));
create policy canal_producto_insert on public.canal_producto
  for insert to authenticated with check ((select app.tiene_permiso('stock.configurar_umbrales')));
create policy canal_producto_update on public.canal_producto
  for update to authenticated
  using ((select app.tiene_permiso('stock.configurar_umbrales')))
  with check ((select app.tiene_permiso('stock.configurar_umbrales')));
create policy canal_producto_delete on public.canal_producto
  for delete to authenticated using ((select app.tiene_permiso('stock.configurar_umbrales')));

grant select on public.sincronizacion, public.canal, public.canal_producto,
                 public.vista_salud_sincronizacion, public.vista_stock_canal
  to authenticated;
grant insert on public.sincronizacion to authenticated;
grant insert, update on public.canal to authenticated;
grant insert, update, delete on public.canal_producto to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Semilla
-- ───────────────────────────────────────────────────────────────
insert into public.canal (nombre, tipo, colchon_default, tolerancia_minutos) values
  ('Mostrador',     'mostrador', 0, 15),
  ('Tienda online', 'tienda',    2, 15);

insert into public.configuracion (clave, valor, descripcion, grupo) values
  ('sync.intervalo_segundos', '60',
   'Cada cuanto intenta sincronizar una terminal cuando hay conexion.', 'sincronizacion'),
  ('sync.lote_maximo', '500',
   'Cantidad maxima de registros por tanda de sincronizacion.', 'sincronizacion'),
  ('sync.tolerancia_minutos', '15',
   'Minutos sin sincronizar tras los cuales el stock deja de considerarse confiable.', 'sincronizacion');
