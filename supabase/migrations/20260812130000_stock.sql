-- ═══════════════════════════════════════════════════════════════
-- 006 — STOCK
--
-- LA DECISIÓN CENTRAL DEL SISTEMA
--
-- El stock NO se guarda como un número que se pisa. Se guarda como una
-- lista de movimientos, y el saldo es la suma.
--
-- Por qué importa: si dos terminales están sin conexión y las dos
-- venden la última bolsa, con un número que se pisa una de las dos
-- ventas desaparece y nadie se entera. Con movimientos, al reconectar
-- entran los dos y el saldo queda en -1, que es una alerta visible y
-- corregible en vez de una venta perdida en silencio.
--
-- Por eso stock_saldo puede quedar NEGATIVO a propósito: no hay
-- restricción que lo impida. Un saldo negativo no es un error del
-- sistema, es el sistema avisando que hubo sobreventa.
--
-- Los movimientos son INMUTABLES. No se editan ni se borran: un error
-- se corrige con un movimiento que lo compensa. Es la misma disciplina
-- que un libro contable, y es lo que permite reconstruir el saldo desde
-- cero en cualquier momento.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Movimientos
-- ───────────────────────────────────────────────────────────────
create table public.movimiento_stock (
  -- El id lo genera el cliente, incluso sin conexión. Es la clave de la
  -- idempotencia: si la terminal reenvía el mismo movimiento porque no
  -- llegó a ver la confirmación, choca contra esta PK y no se duplica.
  id             uuid primary key default gen_random_uuid(),

  producto_id    uuid not null references public.producto(id) on delete restrict,

  tipo           text not null check (tipo in (
                   'carga_inicial',   -- alta del inventario inicial
                   'compra',          -- ingreso por compra a proveedor
                   'venta',           -- salida por venta
                   'devolucion',      -- reingreso por devolución del cliente
                   'ajuste',          -- corrección manual
                   'inventario',      -- diferencia detectada en una toma
                   'apertura',        -- se abre una bolsa para fraccionar
                   'merma'            -- rotura, vencimiento, pérdida
                 )),

  -- Con signo: positivo suma, negativo resta. El saldo es literalmente
  -- la suma de esta columna, sin lógica condicional por tipo.
  cantidad       numeric(14,4) not null,

  motivo         text,

  -- De dónde vino el movimiento (venta, compra, inventario...)
  referencia_tipo text check (referencia_tipo in
                    ('venta', 'compra', 'inventario', 'fraccionamiento', 'manual')),
  referencia_id   uuid,

  -- Trazabilidad (preparación SIGTRAZAVET, no obligatorio todavía)
  lote           text,
  vencimiento    date,

  -- Quién
  usuario_id     uuid references public.usuario(id) on delete set null,
  operador_id    uuid references public.usuario(id) on delete set null,
  terminal_id    uuid references public.terminal(id) on delete set null,

  -- Cuándo pasó de verdad, según el reloj de la terminal. Puede ser
  -- muy anterior a creado_en si la terminal estuvo horas sin conexión.
  ocurrido_en    timestamptz not null default now(),
  -- Cuándo llegó al servidor.
  creado_en      timestamptz not null default now(),
  registrado_offline boolean not null default false,

  constraint movimiento_cantidad_no_cero check (cantidad <> 0),
  constraint movimiento_signo_coherente check (
    case tipo
      when 'venta'      then cantidad < 0
      when 'apertura'   then cantidad < 0
      when 'merma'      then cantidad < 0
      when 'compra'     then cantidad > 0
      when 'devolucion' then cantidad > 0
      else true
    end
  )
);

create index movimiento_stock_producto_idx    on public.movimiento_stock (producto_id, ocurrido_en desc);
create index movimiento_stock_ocurrido_idx    on public.movimiento_stock (ocurrido_en desc);
create index movimiento_stock_creado_idx      on public.movimiento_stock (creado_en desc);
create index movimiento_stock_referencia_idx  on public.movimiento_stock (referencia_tipo, referencia_id);
create index movimiento_stock_operador_idx    on public.movimiento_stock (operador_id, ocurrido_en desc);
create index movimiento_stock_tipo_idx        on public.movimiento_stock (tipo, ocurrido_en desc);
create index movimiento_stock_terminal_idx    on public.movimiento_stock (terminal_id);
create index movimiento_stock_usuario_idx     on public.movimiento_stock (usuario_id);

comment on table public.movimiento_stock is
  'Libro de movimientos de stock. Inmutable: los errores se corrigen con movimientos que compensan, nunca editando.';
comment on column public.movimiento_stock.id is
  'Generado por el cliente, incluso offline. Es la clave de idempotencia de la sincronización.';
comment on column public.movimiento_stock.ocurrido_en is
  'Momento real de la operación según la terminal. Puede ser muy anterior a creado_en si estuvo sin conexión.';

-- ───────────────────────────────────────────────────────────────
-- Saldo
--
-- Es una foto derivada, no la verdad. La verdad son los movimientos.
-- Existe sólo porque sumar el histórico de 3.000 productos en cada
-- consulta del mostrador no escala. Se puede reconstruir entero.
-- ───────────────────────────────────────────────────────────────
create table public.stock_saldo (
  producto_id    uuid primary key references public.producto(id) on delete cascade,
  cantidad       numeric(14,4) not null default 0,
  actualizado_en timestamptz not null default now()
);

create index stock_saldo_negativo_idx on public.stock_saldo (producto_id) where cantidad < 0;

comment on table public.stock_saldo is
  'Saldo materializado. Derivado de movimiento_stock, reconstruible con app.recalcular_saldo_stock(). Puede ser negativo: eso indica sobreventa, no un error.';

create or replace function app.aplicar_movimiento_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_saldo (producto_id, cantidad, actualizado_en)
  values (new.producto_id, new.cantidad, now())
  on conflict (producto_id) do update
    set cantidad       = public.stock_saldo.cantidad + excluded.cantidad,
        actualizado_en = now();
  return new;
end;
$$;

create trigger movimiento_stock_aplicar
  after insert on public.movimiento_stock
  for each row execute function app.aplicar_movimiento_stock();

-- Los movimientos no se tocan. Si alguien lo intenta, que falle ruidoso.
create or replace function app.bloquear_modificacion_movimiento()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Los movimientos de stock son inmutables. Para corregir, registrá un movimiento de ajuste que compense.';
end;
$$;

create trigger movimiento_stock_inmutable
  before update or delete on public.movimiento_stock
  for each row execute function app.bloquear_modificacion_movimiento();

-- Reconstrucción del saldo desde el libro de movimientos.
-- Con p_producto_id nulo recalcula todo el catálogo.
create or replace function app.recalcular_saldo_stock(p_producto_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_afectados integer;
begin
  insert into public.stock_saldo (producto_id, cantidad, actualizado_en)
  select m.producto_id, sum(m.cantidad), now()
  from public.movimiento_stock m
  where p_producto_id is null or m.producto_id = p_producto_id
  group by m.producto_id
  on conflict (producto_id) do update
    set cantidad       = excluded.cantidad,
        actualizado_en = now();

  get diagnostics v_afectados = row_count;
  return v_afectados;
end;
$$;

revoke all on function app.recalcular_saldo_stock(uuid) from public, anon;
grant execute on function app.recalcular_saldo_stock(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Umbrales — tres niveles, gana el más específico
--   producto → categoría → general (en configuracion)
-- ───────────────────────────────────────────────────────────────
create table public.umbral_stock (
  id             uuid primary key default gen_random_uuid(),
  ambito         text not null check (ambito in ('producto', 'categoria')),
  producto_id    uuid references public.producto(id)  on delete cascade,
  categoria_id   uuid references public.categoria(id) on delete cascade,
  bajo           numeric(14,4) not null check (bajo >= 0),
  critico        numeric(14,4) not null check (critico >= 0),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint umbral_critico_menor_o_igual check (critico <= bajo),
  constraint umbral_ambito_coherente check (
    (ambito = 'producto'  and producto_id is not null and categoria_id is null) or
    (ambito = 'categoria' and categoria_id is not null and producto_id is null)
  )
);

create unique index umbral_producto_unico  on public.umbral_stock (producto_id)  where ambito = 'producto';
create unique index umbral_categoria_unico on public.umbral_stock (categoria_id) where ambito = 'categoria';

create trigger umbral_stock_actualizado_en
  before update on public.umbral_stock
  for each row execute function app.set_actualizado_en();

comment on table public.umbral_stock is
  'Umbrales de stock bajo y crítico. El de producto le gana al de categoría, y el de categoría al general de configuracion.';

-- ───────────────────────────────────────────────────────────────
-- Toma de inventario
--
-- Pensada para el conteo progresivo por sectores: no hace falta cerrar
-- el local ni contar los 3.000 productos de una vez.
-- ───────────────────────────────────────────────────────────────
create table public.inventario (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  sector         text,
  estado         text not null default 'abierto'
                   check (estado in ('abierto', 'cerrado', 'anulado')),
  abierto_por    uuid references public.usuario(id) on delete set null,
  abierto_en     timestamptz not null default now(),
  cerrado_por    uuid references public.usuario(id) on delete set null,
  cerrado_en     timestamptz,
  observaciones  text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index inventario_estado_idx on public.inventario (estado, abierto_en desc);

create trigger inventario_actualizado_en
  before update on public.inventario
  for each row execute function app.set_actualizado_en();

create table public.inventario_linea (
  id               uuid primary key default gen_random_uuid(),
  inventario_id    uuid not null references public.inventario(id) on delete cascade,
  producto_id      uuid not null references public.producto(id)   on delete restrict,
  -- foto del saldo en el momento de contar, para poder explicar la diferencia
  cantidad_sistema numeric(14,4) not null default 0,
  cantidad_contada numeric(14,4) not null check (cantidad_contada >= 0),
  contado_por      uuid references public.usuario(id) on delete set null,
  contado_en       timestamptz not null default now(),
  aplicado         boolean not null default false,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),

  constraint inventario_linea_unica unique (inventario_id, producto_id)
);

create index inventario_linea_inventario_idx on public.inventario_linea (inventario_id);
create index inventario_linea_producto_idx   on public.inventario_linea (producto_id);

create trigger inventario_linea_actualizado_en
  before update on public.inventario_linea
  for each row execute function app.set_actualizado_en();

-- Cierra la toma y genera un movimiento de ajuste por cada diferencia.
-- SECURITY INVOKER: corre con los permisos de quien la llama, así que
-- las políticas RLS siguen aplicando y sólo la usa quien puede ajustar.
create or replace function public.cerrar_inventario(p_inventario_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ajustes integer := 0;
  v_usuario uuid;
begin
  if not exists (select 1 from public.inventario
                 where id = p_inventario_id and estado = 'abierto') then
    raise exception 'El inventario no existe o ya no está abierto.';
  end if;

  select app.usuario_actual_id() into v_usuario;

  insert into public.movimiento_stock
    (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id, operador_id)
  select
    l.producto_id,
    'inventario',
    l.cantidad_contada - coalesce(s.cantidad, 0),
    'Ajuste por toma de inventario',
    'inventario',
    p_inventario_id,
    v_usuario,
    l.contado_por
  from public.inventario_linea l
  left join public.stock_saldo s on s.producto_id = l.producto_id
  where l.inventario_id = p_inventario_id
    and not l.aplicado
    and l.cantidad_contada <> coalesce(s.cantidad, 0);

  get diagnostics v_ajustes = row_count;

  update public.inventario_linea
    set aplicado = true
    where inventario_id = p_inventario_id and not aplicado;

  update public.inventario
    set estado = 'cerrado', cerrado_en = now(), cerrado_por = v_usuario
    where id = p_inventario_id;

  return v_ajustes;
end;
$$;

comment on function public.cerrar_inventario(uuid) is
  'Cierra una toma de inventario y genera un movimiento de ajuste por cada diferencia entre lo contado y el saldo.';

-- ───────────────────────────────────────────────────────────────
-- Vista de stock con estado resuelto
--
-- security_invoker: sin esto una vista ignora las políticas RLS de las
-- tablas que consulta y se convierte en una puerta lateral.
-- ───────────────────────────────────────────────────────────────
create view public.vista_stock
with (security_invoker = true) as
select
  p.id                        as producto_id,
  p.codigo,
  p.nombre_interno,
  p.categoria_id,
  p.marca_id,
  p.activo,
  coalesce(s.cantidad, 0)     as cantidad,
  s.actualizado_en            as stock_actualizado_en,
  coalesce(
    up.bajo, uc.bajo,
    (select (c.valor #>> '{}')::numeric from public.configuracion c
      where c.clave = 'stock.umbral_bajo_general')
  ) as umbral_bajo,
  coalesce(
    up.critico, uc.critico,
    (select (c.valor #>> '{}')::numeric from public.configuracion c
      where c.clave = 'stock.umbral_critico_general')
  ) as umbral_critico,
  case
    when coalesce(s.cantidad, 0) < 0 then 'sobrevendido'
    when coalesce(s.cantidad, 0) <= coalesce(
           up.critico, uc.critico,
           (select (c.valor #>> '{}')::numeric from public.configuracion c
             where c.clave = 'stock.umbral_critico_general')) then 'critico'
    when coalesce(s.cantidad, 0) <= coalesce(
           up.bajo, uc.bajo,
           (select (c.valor #>> '{}')::numeric from public.configuracion c
             where c.clave = 'stock.umbral_bajo_general')) then 'bajo'
    else 'ok'
  end as estado
from public.producto p
left join public.stock_saldo  s  on s.producto_id  = p.id
left join public.umbral_stock up on up.producto_id = p.id          and up.ambito = 'producto'
left join public.umbral_stock uc on uc.categoria_id = p.categoria_id and uc.ambito = 'categoria'
where p.eliminado_en is null;

comment on view public.vista_stock is
  'Stock con umbral resuelto en tres niveles (producto, categoría, general) y estado calculado. Estado sobrevendido = saldo negativo = hubo venta offline sin existencias.';

-- ───────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────
alter table public.movimiento_stock enable row level security;
alter table public.stock_saldo      enable row level security;
alter table public.umbral_stock     enable row level security;
alter table public.inventario       enable row level security;
alter table public.inventario_linea enable row level security;

create policy movimiento_stock_select on public.movimiento_stock
  for select to authenticated using ((select app.tiene_permiso('stock.ver')));
-- Sólo alta. Sin políticas de update ni delete: los movimientos no se tocan.
create policy movimiento_stock_insert on public.movimiento_stock
  for insert to authenticated
  with check (
    (select app.tiene_permiso('stock.ajustar'))
    or (select app.tiene_permiso('ventas.cobrar'))
    or (select app.tiene_permiso('stock.inventariar'))
  );

create policy stock_saldo_select on public.stock_saldo
  for select to authenticated using ((select app.tiene_permiso('stock.ver')));

create policy umbral_stock_select on public.umbral_stock
  for select to authenticated using ((select app.tiene_permiso('stock.ver')));
create policy umbral_stock_insert on public.umbral_stock
  for insert to authenticated with check ((select app.tiene_permiso('stock.configurar_umbrales')));
create policy umbral_stock_update on public.umbral_stock
  for update to authenticated
  using ((select app.tiene_permiso('stock.configurar_umbrales')))
  with check ((select app.tiene_permiso('stock.configurar_umbrales')));
create policy umbral_stock_delete on public.umbral_stock
  for delete to authenticated using ((select app.tiene_permiso('stock.configurar_umbrales')));

create policy inventario_select on public.inventario
  for select to authenticated using ((select app.tiene_permiso('stock.ver')));
create policy inventario_insert on public.inventario
  for insert to authenticated with check ((select app.tiene_permiso('stock.inventariar')));
create policy inventario_update on public.inventario
  for update to authenticated
  using ((select app.tiene_permiso('stock.inventariar')))
  with check ((select app.tiene_permiso('stock.inventariar')));

create policy inventario_linea_select on public.inventario_linea
  for select to authenticated using ((select app.tiene_permiso('stock.ver')));
create policy inventario_linea_insert on public.inventario_linea
  for insert to authenticated with check ((select app.tiene_permiso('stock.inventariar')));
create policy inventario_linea_update on public.inventario_linea
  for update to authenticated
  using ((select app.tiene_permiso('stock.inventariar')))
  with check ((select app.tiene_permiso('stock.inventariar')));
create policy inventario_linea_delete on public.inventario_linea
  for delete to authenticated using ((select app.tiene_permiso('stock.inventariar')));

-- ───────────────────────────────────────────────────────────────
-- Grants
-- ───────────────────────────────────────────────────────────────
grant select on public.movimiento_stock, public.stock_saldo, public.umbral_stock,
                 public.inventario, public.inventario_linea, public.vista_stock
  to authenticated;
grant insert on public.movimiento_stock to authenticated;
grant insert, update, delete on public.umbral_stock, public.inventario_linea to authenticated;
grant insert, update on public.inventario to authenticated;
grant execute on function public.cerrar_inventario(uuid) to authenticated;
