-- ═══════════════════════════════════════════════════════════════
-- MOVER MERCADERÍA ENTRE DEPÓSITOS, Y EL STOCK DE CADA UNO
--
-- Hasta hoy los depósitos se podían nombrar pero no usar: cada
-- movimiento del libro ya decía dónde había ocurrido, y el saldo seguía
-- siendo uno solo por producto. Con el segundo local en camino, eso deja
-- de alcanzar: «hay 12» no dice si están acá o en el otro local.
--
-- Lo que entra:
--   · El saldo de cada producto EN CADA depósito, derivado del libro
--     igual que el total.
--   · La transferencia: sale de un depósito y entra en otro, en el
--     mismo momento. Se anula con motivo, como un pago.
--   · Cada máquina pertenece a un depósito. Una venta en el segundo
--     local descuenta del segundo local.
--   · Lo que vuelve, vuelve adonde salió: la anulación de una venta
--     reingresa en el depósito del que salió la mercadería.
--   · La toma de inventario es de un depósito: contar el segundo local
--     no puede compararse contra el total de los dos.
--   · La recepción de mercadería dice en qué depósito entra.
--   · Un depósito con mercadería, o con máquinas, no se da de baja.
--
-- ─── QUÉ NO CAMBIA ───
--
-- El total. `stock_saldo`, `vista_stock` y todo lo que los lee —la
-- tienda web, Inicio, la caja— siguen viendo lo mismo: una transferencia
-- saca de un lado y pone en el otro, y la suma no se mueve. La tienda
-- sigue publicando el total menos el colchón, a propósito: qué depósito
-- abastece a la web es una decisión pendiente (la idea del depósito
-- «Online» del alcance, §13).
--
-- Y los dieciséis lugares que escriben en el libro siguen sin mandar el
-- depósito. El disparador que lo completa ahora sabe más, pero sigue
-- siendo el único lugar que decide.
--
-- ─── POR QUÉ LA TRANSFERENCIA ES DE UN SOLO PASO ───
--
-- Sale y entra en el mismo momento, como en OBTech, que es como lo hacen
-- hoy. Un envío con «en camino» y confirmación de llegada controla mejor
-- lo que se pierde en el viaje, pero pide que alguien en el destino
-- confirme cada envío. Si Gross lo quiere, se agrega arriba de esto sin
-- tocar el libro.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- El permiso
-- ───────────────────────────────────────────────────────────────
insert into public.permiso (clave, grupo, descripcion, orden) values
  ('stock.transferir', 'Stock', 'Mover mercadería entre depósitos', 125)
on conflict (clave) do nothing;

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, 'stock.transferir'
from public.rol r where r.nombre in ('Administrador', 'Encargado')
on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- El tipo de movimiento nuevo
--
-- Uno solo para las dos puntas: la salida es negativa en el origen y
-- la entrada positiva en el destino. Por eso no va en el control de
-- signo, igual que el ajuste.
-- ───────────────────────────────────────────────────────────────
alter table public.movimiento_stock
  drop constraint if exists movimiento_stock_tipo_check;
alter table public.movimiento_stock
  add constraint movimiento_stock_tipo_check check (tipo in (
    'carga_inicial', 'compra', 'venta', 'devolucion', 'ajuste', 'inventario',
    'apertura', 'merma', 'remito', 'retorno_remito',
    'transferencia'    -- de un depósito a otro: una punta en cada uno
  ));

alter table public.movimiento_stock
  drop constraint if exists movimiento_stock_referencia_tipo_check;
alter table public.movimiento_stock
  add constraint movimiento_stock_referencia_tipo_check
  check (referencia_tipo = any (array[
    'venta', 'compra', 'inventario', 'fraccionamiento', 'manual', 'remito', 'devolucion',
    'transferencia'
  ]));

-- ───────────────────────────────────────────────────────────────
-- El saldo de cada depósito
--
-- Igual que `stock_saldo`: una foto derivada del libro, que existe para
-- no sumar el histórico en cada consulta y que se reconstruye entera
-- con app.recalcular_saldo_stock(). Puede ser negativa por la misma
-- razón: una venta sin conexión de la última bolsa.
-- ───────────────────────────────────────────────────────────────
create table public.stock_deposito (
  producto_id    uuid not null references public.producto(id) on delete cascade,
  deposito_id    uuid not null references public.deposito(id),
  cantidad       numeric(14,4) not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (producto_id, deposito_id)
);

create index stock_deposito_deposito_idx on public.stock_deposito (deposito_id);

comment on table public.stock_deposito is
  'Saldo de cada producto en cada depósito. Derivado de movimiento_stock, como stock_saldo; la suma de los depósitos de un producto es su stock_saldo.';

insert into public.stock_deposito (producto_id, deposito_id, cantidad)
select m.producto_id, m.deposito_id, sum(m.cantidad)
from public.movimiento_stock m
group by m.producto_id, m.deposito_id;

alter table public.stock_deposito enable row level security;

-- Sólo lectura: lo escribe el disparador del libro, nunca una pantalla.
create policy stock_deposito_select on public.stock_deposito
  for select to authenticated using ((select app.tiene_permiso('stock.ver')));

grant select on public.stock_deposito to authenticated;

/*
  El mismo disparador que mantiene el total mantiene ahora el de cada
  depósito. Uno solo y no dos: si fueran dos disparadores, uno podría
  quedar apagado y el total y los depósitos empezarían a no sumar lo
  mismo sin que nada falle.
*/
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

  insert into public.stock_deposito (producto_id, deposito_id, cantidad, actualizado_en)
  values (new.producto_id, new.deposito_id, new.cantidad, now())
  on conflict (producto_id, deposito_id) do update
    set cantidad       = public.stock_deposito.cantidad + excluded.cantidad,
        actualizado_en = now();

  return new;
end;
$$;

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

  insert into public.stock_deposito (producto_id, deposito_id, cantidad, actualizado_en)
  select m.producto_id, m.deposito_id, sum(m.cantidad), now()
  from public.movimiento_stock m
  where p_producto_id is null or m.producto_id = p_producto_id
  group by m.producto_id, m.deposito_id
  on conflict (producto_id, deposito_id) do update
    set cantidad       = excluded.cantidad,
        actualizado_en = now();

  return v_afectados;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- Cada máquina pertenece a un depósito
--
-- Nulo es «el principal», y así quedan todas las que ya existen: hoy hay
-- un solo local y todas venden de ahí. Cuando abra el segundo, a sus
-- máquinas se les elige el depósito del segundo local.
-- ───────────────────────────────────────────────────────────────
alter table public.terminal
  add column if not exists deposito_id uuid references public.deposito(id);

comment on column public.terminal.deposito_id is
  'De qué depósito sale lo que se vende desde esta máquina. Nulo es el principal.';

create or replace function app.deposito_principal()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id from public.deposito d where d.es_principal and d.eliminado_en is null
$$;

create or replace function app.deposito_de_la_terminal(p_terminal_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(t.deposito_id, app.deposito_principal())
  from public.terminal t where t.id = p_terminal_id
$$;

/*
  De qué depósito salió la mercadería de una venta.

  Primero el libro: el primer movimiento que la sacó, por la venta o por
  uno de sus remitos. Si no sacó nada todavía, el depósito de la máquina
  donde se armó.
*/
create or replace function app.deposito_de_la_venta(p_venta_id uuid, p_producto_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.deposito_id
       from public.movimiento_stock m
      where m.producto_id = p_producto_id
        and m.cantidad < 0
        and ((m.referencia_tipo = 'venta' and m.referencia_id = p_venta_id)
          or (m.referencia_tipo = 'remito' and m.referencia_id in (
                select c.id from public.comprobante_no_fiscal c where c.venta_id = p_venta_id)))
      order by m.creado_en, m.id
      limit 1),
    (select app.deposito_de_la_terminal(v.terminal_origen_id)
       from public.venta v where v.id = p_venta_id)
  )
$$;

/*
  El depósito de cada movimiento, cuando nadie lo dice.

  Sigue siendo el único lugar que lo decide, y por eso ninguno de los
  que escriben en el libro tuvo que cambiar. El orden importa:

    1. Lo que vuelve, vuelve adonde salió. Si el mismo documento ya movió
       este producto —la venta que se anula, el remito que vuelve, la
       factura de compra que se da de baja— va al mismo depósito. Sin
       esto, anular una venta del segundo local le devolvería la bolsa
       al primero.
    2. La máquina que lo registró. Es el caso de toda venta y todo
       remito: la caja del segundo local descuenta del segundo local.
    3. Una devolución, en la máquina donde se recibió; y si no se sabe,
       en el depósito del que salió la venta.
    4. La anulación de una venta que salió sólo por remito: el depósito
       de la venta.
    5. El principal.

  Si ni siquiera hay principal, falla ruidoso como antes: un libro a
  medias es peor que una operación que no se completa.
*/
create or replace function app.completar_deposito_del_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta uuid;
begin
  if new.deposito_id is null and new.referencia_id is not null then
    select m.deposito_id into new.deposito_id
      from public.movimiento_stock m
     where m.referencia_tipo = new.referencia_tipo
       and m.referencia_id   = new.referencia_id
       and m.producto_id     = new.producto_id
     order by m.creado_en, m.id
     limit 1;
  end if;

  if new.deposito_id is null and new.terminal_id is not null then
    new.deposito_id := app.deposito_de_la_terminal(new.terminal_id);
  end if;

  if new.deposito_id is null and new.referencia_tipo = 'devolucion' and new.referencia_id is not null then
    select d.venta_id, app.deposito_de_la_terminal(d.terminal_id)
      into v_venta, new.deposito_id
      from public.devolucion d
     where d.id = new.referencia_id;

    if new.deposito_id is null and v_venta is not null then
      new.deposito_id := app.deposito_de_la_venta(v_venta, new.producto_id);
    end if;
  end if;

  if new.deposito_id is null and new.referencia_tipo = 'venta' and new.referencia_id is not null then
    new.deposito_id := app.deposito_de_la_venta(new.referencia_id, new.producto_id);
  end if;

  if new.deposito_id is null then
    new.deposito_id := app.deposito_principal();

    if new.deposito_id is null then
      raise exception
        'No hay un depósito principal definido: el movimiento de stock no sabría dónde ocurrió.';
    end if;
  end if;

  return new;
end;
$$;

/*
  Elegir el depósito de una máquina.

  Una función aparte y no un parámetro más de editar_terminal: cambiarle
  la firma a ésa obliga a que las PC que todavía tienen la versión
  anterior manden un dato que no conocen.
*/
create or replace function public.asignar_deposito_terminal(p_terminal_id uuid, p_deposito_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('configuracion.gestionar') then
    raise exception 'No tenés permiso para modificar cajas ni mostradores.';
  end if;

  if not exists (select 1 from public.terminal where id = p_terminal_id and eliminado_en is null) then
    raise exception 'Esa terminal no existe o está dada de baja.';
  end if;

  if p_deposito_id is not null and not exists (
    select 1 from public.deposito where id = p_deposito_id and activo and eliminado_en is null
  ) then
    raise exception 'Ese depósito no existe o está dado de baja.';
  end if;

  update public.terminal set deposito_id = p_deposito_id where id = p_terminal_id;
end;
$$;

comment on function public.asignar_deposito_terminal(uuid, uuid) is
  'Elige de qué depósito sale lo que se vende desde una máquina. Nulo es el principal.';

revoke all on function public.asignar_deposito_terminal(uuid, uuid) from public, anon;
grant execute on function public.asignar_deposito_terminal(uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Un depósito se da de baja vacío
--
-- Con mercadería adentro, la baja la haría invisible: seguiría sumando
-- al total y no aparecería en ningún depósito para ir a buscarla. Y con
-- una máquina que vende de ahí, la próxima venta descontaría de un
-- depósito que ya no existe para nadie.
--
-- Va después de `deposito_principal_protegido` (el nombre ordena los
-- disparadores), así el principal sigue diciendo primero lo suyo.
--
-- Definer: tiene que ver todo el stock aunque quien da de baja no tenga
-- permiso para mirarlo. Con los permisos de quien llama, un
-- administrador sin 'stock.ver' vería el depósito vacío y lo daría de
-- baja con mercadería adentro.
-- ───────────────────────────────────────────────────────────────
create or replace function app.el_deposito_se_vacia_antes_de_la_baja()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_productos  integer;
  v_terminales text;
begin
  if (old.activo and not new.activo) or (old.eliminado_en is null and new.eliminado_en is not null) then
    select count(*) into v_productos
      from public.stock_deposito s
      join public.producto p on p.id = s.producto_id and p.eliminado_en is null
     where s.deposito_id = old.id and s.cantidad <> 0;

    if v_productos > 0 then
      raise exception
        '«%» todavía tiene stock de % producto(s). Pasalo a otro depósito con una transferencia antes de darlo de baja.',
        old.nombre, v_productos;
    end if;

    select string_agg(t.nombre, ', ' order by t.nombre) into v_terminales
      from public.terminal t
     where t.deposito_id = old.id and t.eliminado_en is null;

    if v_terminales is not null then
      raise exception
        '«%» es el depósito de %. Cambiales el depósito en Cajas y mostradores antes de darlo de baja.',
        old.nombre, v_terminales;
    end if;
  end if;

  return new;
end;
$$;

create trigger deposito_vacio_para_la_baja
  before update on public.deposito
  for each row execute function app.el_deposito_se_vacia_antes_de_la_baja();

-- ───────────────────────────────────────────────────────────────
-- La transferencia
-- ───────────────────────────────────────────────────────────────
create table public.transferencia (
  -- Lo genera la pantalla: si el guardado se corta y se reintenta, no
  -- se mueve la mercadería dos veces.
  id                uuid primary key default gen_random_uuid(),
  -- El número con el que se la nombra: «la transferencia 12».
  numero            bigint generated always as identity unique,
  origen_id         uuid not null references public.deposito(id),
  destino_id        uuid not null references public.deposito(id),
  observacion       text,
  usuario_id        uuid references public.usuario(id) on delete set null,
  ocurrido_en       timestamptz not null default now(),
  anulada_en        timestamptz,
  anulada_por       uuid references public.usuario(id) on delete set null,
  motivo_anulacion  text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),

  constraint transferencia_a_otro_deposito check (origen_id <> destino_id)
);

create index transferencia_ocurrido_idx on public.transferencia (ocurrido_en desc);

create trigger transferencia_actualizado_en
  before update on public.transferencia
  for each row execute function app.set_actualizado_en();

create table public.transferencia_linea (
  id                uuid primary key default gen_random_uuid(),
  transferencia_id  uuid not null references public.transferencia(id) on delete restrict,
  producto_id       uuid not null references public.producto(id) on delete restrict,
  cantidad          numeric(14,4) not null check (cantidad > 0),

  constraint transferencia_linea_unica unique (transferencia_id, producto_id)
);

create index transferencia_linea_producto_idx on public.transferencia_linea (producto_id);

comment on table public.transferencia is
  'Mercadería que pasa de un depósito a otro. Sale y entra en el mismo momento. No se borra: se anula con motivo, y la anulación la devuelve al origen.';

alter table public.transferencia       enable row level security;
alter table public.transferencia_linea enable row level security;

-- Se lee con 'stock.ver'. Se escribe sólo por las funciones de abajo,
-- que controlan 'stock.transferir': por eso no hay políticas de alta.
create policy transferencia_select on public.transferencia
  for select to authenticated using ((select app.tiene_permiso('stock.ver')));
create policy transferencia_linea_select on public.transferencia_linea
  for select to authenticated using ((select app.tiene_permiso('stock.ver')));

grant select on public.transferencia, public.transferencia_linea to authenticated;

/*
  Registrar una transferencia.

  Todo en una transacción: la cabecera, las líneas y las dos puntas de
  cada producto. En varios viajes, un corte en el medio dejaría la
  mercadería fuera del origen y sin llegar al destino, y el total
  bajaría sin que nadie haya vendido nada.

  No controla que en el origen alcance. El stock puede estar negativo o
  desactualizado —sobre todo los primeros días—, y la pantalla ya muestra
  cuánto queda en el origen antes de confirmar. Frenarlo acá impediría
  mover mercadería que está físicamente en el estante.
*/
create or replace function public.registrar_transferencia(
  p_id          uuid,
  p_origen_id   uuid,
  p_destino_id  uuid,
  p_lineas      jsonb,
  p_observacion text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid := coalesce(p_id, gen_random_uuid());
  v_numero  bigint;
  v_origen  public.deposito;
  v_destino public.deposito;
  v_usuario uuid;
  v_linea   jsonb;
  v_producto uuid;
  v_cantidad numeric;
begin
  if not app.tiene_permiso('stock.transferir') then
    raise exception 'No tenés permiso para mover mercadería entre depósitos.';
  end if;

  -- Ya registrada: el mismo guardado que llega dos veces.
  select numero into v_numero from public.transferencia where id = v_id;
  if v_numero is not null then
    return v_numero;
  end if;

  select * into v_origen from public.deposito
   where id = p_origen_id and activo and eliminado_en is null;
  select * into v_destino from public.deposito
   where id = p_destino_id and activo and eliminado_en is null;

  if v_origen.id is null then
    raise exception 'El depósito de origen no existe o está dado de baja.';
  end if;
  if v_destino.id is null then
    raise exception 'El depósito de destino no existe o está dado de baja.';
  end if;
  if v_origen.id = v_destino.id then
    raise exception 'El origen y el destino son el mismo depósito.';
  end if;

  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'No hay nada para transferir.';
  end if;

  if (select count(*) <> count(distinct x->>'producto_id')
        from jsonb_array_elements(p_lineas) x) then
    raise exception 'Hay un producto repetido. Sumá las cantidades en un solo renglón.';
  end if;

  v_usuario := app.usuario_actual_id();

  insert into public.transferencia (id, origen_id, destino_id, observacion, usuario_id)
  values (v_id, v_origen.id, v_destino.id, nullif(btrim(coalesce(p_observacion, '')), ''), v_usuario)
  returning numero into v_numero;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_producto := (v_linea->>'producto_id')::uuid;
    v_cantidad := (v_linea->>'cantidad')::numeric;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cada renglón tiene que tener una cantidad mayor que cero.';
    end if;

    if not exists (select 1 from public.producto where id = v_producto and eliminado_en is null) then
      raise exception 'Uno de los productos no existe o está dado de baja.';
    end if;

    insert into public.transferencia_linea (transferencia_id, producto_id, cantidad)
    values (v_id, v_producto, v_cantidad);

    insert into public.movimiento_stock
      (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id,
       usuario_id, operador_id, deposito_id)
    values
      (v_producto, 'transferencia', -v_cantidad,
       'Transferencia ' || v_numero || ' a ' || v_destino.nombre,
       'transferencia', v_id, v_usuario, v_usuario, v_origen.id),
      (v_producto, 'transferencia', v_cantidad,
       'Transferencia ' || v_numero || ' desde ' || v_origen.nombre,
       'transferencia', v_id, v_usuario, v_usuario, v_destino.id);
  end loop;

  return v_numero;
end;
$$;

comment on function public.registrar_transferencia(uuid, uuid, uuid, jsonb, text) is
  'Mueve mercadería de un depósito a otro: cabecera, líneas y las dos puntas en el libro, en una transacción. Idempotente por el id.';

revoke all on function public.registrar_transferencia(uuid, uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.registrar_transferencia(uuid, uuid, uuid, jsonb, text) to authenticated;

/*
  Anular una transferencia.

  El libro no se edita: se escriben las dos puntas al revés, y la
  mercadería vuelve al origen. La transferencia queda a la vista, tachada
  y con el motivo.
*/
create or replace function public.anular_transferencia(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t       public.transferencia;
  v_usuario uuid;
begin
  if not app.tiene_permiso('stock.transferir') then
    raise exception 'No tenés permiso para anular transferencias.';
  end if;

  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Para anular una transferencia hay que decir por qué.';
  end if;

  select * into v_t from public.transferencia where id = p_id for update;
  if v_t.id is null then
    raise exception 'Esa transferencia no existe.';
  end if;
  if v_t.anulada_en is not null then
    raise exception 'La transferencia % ya estaba anulada.', v_t.numero;
  end if;

  v_usuario := app.usuario_actual_id();

  insert into public.movimiento_stock
    (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id,
     usuario_id, operador_id, deposito_id)
  select l.producto_id, 'transferencia', x.cantidad,
         'Anulación de la transferencia ' || v_t.numero,
         'transferencia', v_t.id, v_usuario, v_usuario, x.deposito_id
  from public.transferencia_linea l
  cross join lateral (values
    (v_t.destino_id, -l.cantidad),
    (v_t.origen_id,   l.cantidad)
  ) as x(deposito_id, cantidad)
  where l.transferencia_id = v_t.id;

  update public.transferencia
     set anulada_en = now(), anulada_por = v_usuario, motivo_anulacion = btrim(p_motivo)
   where id = v_t.id;
end;
$$;

comment on function public.anular_transferencia(uuid, text) is
  'Anula una transferencia con motivo: devuelve la mercadería al origen con dos movimientos al revés. No borra nada.';

revoke all on function public.anular_transferencia(uuid, text) from public, anon;
grant execute on function public.anular_transferencia(uuid, text) to authenticated;

-- Lo que muestra la lista de transferencias.
create view public.vista_transferencia
with (security_invoker = true) as
select
  t.id,
  t.numero,
  t.ocurrido_en,
  t.origen_id,
  o.nombre   as origen,
  t.destino_id,
  d.nombre   as destino,
  t.observacion,
  u.nombre   as usuario_nombre,
  t.anulada_en,
  ua.nombre  as anulada_por_nombre,
  t.motivo_anulacion,
  (select count(*) from public.transferencia_linea l where l.transferencia_id = t.id) as productos,
  (select coalesce(sum(l.cantidad), 0) from public.transferencia_linea l where l.transferencia_id = t.id) as unidades
from public.transferencia t
join public.deposito o on o.id = t.origen_id
join public.deposito d on d.id = t.destino_id
left join public.usuario u  on u.id  = t.usuario_id
left join public.usuario ua on ua.id = t.anulada_por;

create view public.vista_transferencia_linea
with (security_invoker = true) as
select
  l.id,
  l.transferencia_id,
  l.producto_id,
  p.codigo,
  p.nombre_interno,
  p.unidad_medida,
  l.cantidad
from public.transferencia_linea l
join public.producto p on p.id = l.producto_id;

grant select on public.vista_transferencia, public.vista_transferencia_linea to authenticated;

-- ───────────────────────────────────────────────────────────────
-- El stock de cada depósito, para mirar
--
-- Sobre `vista_stock`, para que el umbral y el estado se resuelvan con
-- la misma cascada (producto → categoría → general) y no haya dos
-- semáforos que den distinto. El umbral es el mismo en todos los
-- depósitos: uno por depósito es un pedido que no existe todavía.
-- ───────────────────────────────────────────────────────────────
create view public.vista_stock_por_deposito
with (security_invoker = true) as
select
  v.producto_id,
  v.codigo,
  v.nombre_interno,
  v.unidad_medida,
  v.activo,
  v.precio_venta,
  v.costo,
  d.id                          as deposito_id,
  d.nombre                      as deposito,
  coalesce(s.cantidad, 0)       as cantidad,
  v.umbral_bajo,
  v.umbral_critico,
  case
    when coalesce(s.cantidad, 0) < 0                  then 'sobrevendido'
    when coalesce(s.cantidad, 0) <= v.umbral_critico  then 'critico'
    when coalesce(s.cantidad, 0) <= v.umbral_bajo     then 'bajo'
    else 'ok'
  end as estado
from public.vista_stock v
cross join public.deposito d
left join public.stock_deposito s on s.producto_id = v.producto_id and s.deposito_id = d.id
where d.activo and d.eliminado_en is null;

comment on view public.vista_stock_por_deposito is
  'Un renglón por producto y depósito activo, con el estado calculado contra los mismos umbrales que vista_stock.';

grant select on public.vista_stock_por_deposito to authenticated;

/*
  Cuánto hay de cada producto en cada depósito, para una lista dada.

  Es una función y no un filtro sobre la vista porque la lista puede ser
  de quinientos productos, y quinientos identificadores no entran en una
  dirección web.
*/
create or replace function public.stock_por_deposito(p_producto_ids uuid[])
returns table (producto_id uuid, deposito_id uuid, cantidad numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.producto_id, s.deposito_id, s.cantidad
  from public.stock_deposito s
  join public.deposito d on d.id = s.deposito_id and d.activo and d.eliminado_en is null
  where s.producto_id = any (p_producto_ids)
$$;

revoke all on function public.stock_por_deposito(uuid[]) from public, anon;
grant execute on function public.stock_por_deposito(uuid[]) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- La toma de inventario es de un depósito
--
-- Lo que se cuenta es un estante, y un estante está en un lugar. Con dos
-- locales, comparar lo contado en uno contra el total de los dos da una
-- diferencia que no existe, y cerrar la toma la «corrige» borrando la
-- mercadería del otro local.
-- ───────────────────────────────────────────────────────────────
alter table public.inventario
  add column if not exists deposito_id uuid references public.deposito(id);

update public.inventario set deposito_id = app.deposito_principal() where deposito_id is null;

alter table public.inventario alter column deposito_id set not null;

create or replace function app.deposito_de_la_toma()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deposito_id is null then
    new.deposito_id := app.deposito_principal();
  end if;

  if tg_op = 'INSERT' and not exists (
    select 1 from public.deposito where id = new.deposito_id and activo and eliminado_en is null
  ) then
    raise exception 'Ese depósito no existe o está dado de baja.';
  end if;

  -- Cambiarle el depósito a una toma con conteos dejaría esos números
  -- comparados contra el saldo de otro lugar.
  if tg_op = 'UPDATE' and new.deposito_id <> old.deposito_id
     and exists (select 1 from public.inventario_linea l where l.inventario_id = new.id) then
    raise exception 'La toma ya tiene productos contados: no se le puede cambiar el depósito.';
  end if;

  return new;
end;
$$;

create trigger inventario_deposito
  before insert or update on public.inventario
  for each row execute function app.deposito_de_la_toma();

create or replace function public.registrar_conteo(
  p_inventario_id uuid,
  p_producto_id   uuid,
  p_cantidad      numeric
)
returns numeric   -- el saldo que el sistema tenía EN ESE DEPÓSITO
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sistema  numeric;
  v_usuario  uuid;
  v_deposito uuid;
begin
  select i.deposito_id into v_deposito
    from public.inventario i
   where i.id = p_inventario_id and i.estado = 'abierto';

  if v_deposito is null then
    raise exception 'La toma de inventario no está abierta.';
  end if;

  if p_cantidad is null or p_cantidad < 0 then
    raise exception 'La cantidad contada no puede ser negativa.';
  end if;

  select s.cantidad into v_sistema
    from public.stock_deposito s
   where s.producto_id = p_producto_id and s.deposito_id = v_deposito;
  v_sistema := coalesce(v_sistema, 0);

  select app.usuario_actual_id() into v_usuario;

  insert into public.inventario_linea
    (inventario_id, producto_id, cantidad_sistema, cantidad_contada, contado_por, contado_en)
  values
    (p_inventario_id, p_producto_id, v_sistema, p_cantidad, v_usuario, now())
  on conflict (inventario_id, producto_id) do update
    set cantidad_contada = excluded.cantidad_contada,
        -- La foto del sistema se refresca también: vale la del último
        -- conteo, que es contra la que se va a ajustar.
        cantidad_sistema = excluded.cantidad_sistema,
        contado_por      = excluded.contado_por,
        contado_en       = excluded.contado_en;

  return v_sistema;
end;
$$;

comment on function public.registrar_conteo(uuid, uuid, numeric) is
  'Registra o corrige el conteo de un producto en una toma abierta. Guarda el saldo del sistema EN EL DEPÓSITO DE LA TOMA al momento de contar, que es contra el que se calcula el ajuste al cerrar.';

create or replace function public.cerrar_inventario(p_inventario_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ajustes  integer := 0;
  v_usuario  uuid;
  v_deposito uuid;
begin
  select deposito_id into v_deposito
    from public.inventario
   where id = p_inventario_id and estado = 'abierto';

  if v_deposito is null then
    raise exception 'El inventario no existe o ya no está abierto.';
  end if;

  select app.usuario_actual_id() into v_usuario;

  insert into public.movimiento_stock
    (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id, operador_id, deposito_id)
  select
    l.producto_id,
    'inventario',
    -- La diferencia encontrada al contar, no contra el saldo de ahora.
    -- Así lo que se vendió mientras se contaba sigue descontado.
    l.cantidad_contada - l.cantidad_sistema,
    'Ajuste por toma de inventario',
    'inventario',
    p_inventario_id,
    v_usuario,
    l.contado_por,
    v_deposito
  from public.inventario_linea l
  where l.inventario_id = p_inventario_id
    and not l.aplicado
    and l.cantidad_contada <> l.cantidad_sistema;

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
  'Cierra una toma y ajusta, en su depósito, cada diferencia encontrada AL CONTAR (contada - cantidad_sistema). No usa el saldo del momento del cierre, para no borrar las ventas ocurridas mientras se contaba.';

-- Las columnas nuevas van al final: así la vista se reemplaza sin
-- tocar a quien ya la lee.
create or replace view public.vista_inventario
with (security_invoker = true) as
select
  i.id,
  i.nombre,
  i.sector,
  i.estado,
  i.abierto_en,
  i.cerrado_en,
  i.observaciones,
  ua.nombre as abierto_por_nombre,
  uc.nombre as cerrado_por_nombre,
  (select count(*) from public.inventario_linea l where l.inventario_id = i.id) as contados,
  (select count(*) from public.inventario_linea l
    where l.inventario_id = i.id and l.cantidad_contada <> l.cantidad_sistema) as con_diferencia,
  (select coalesce(sum(round((l.cantidad_contada - l.cantidad_sistema) * coalesce(p.costo, 0), 2)), 0)
     from public.inventario_linea l
     join public.producto p on p.id = l.producto_id
    where l.inventario_id = i.id) as diferencia_valorizada,
  i.deposito_id,
  d.nombre as deposito
from public.inventario i
left join public.usuario ua on ua.id = i.abierto_por
left join public.usuario uc on uc.id = i.cerrado_por
left join public.deposito d on d.id = i.deposito_id;

-- ───────────────────────────────────────────────────────────────
-- La recepción dice en qué depósito entra
--
-- Un proveedor puede descargar directo en el segundo local. Sin esto,
-- cada entrega de allá sería una recepción y una transferencia.
--
-- La función se reemplaza entera porque cambia su firma. El parámetro
-- nuevo tiene valor por omisión, así que las PC con la versión anterior
-- la siguen llamando igual y la mercadería entra en el principal, como
-- hasta hoy.
-- ───────────────────────────────────────────────────────────────
drop function if exists public.recibir_mercaderia(uuid, jsonb);

create or replace function public.recibir_mercaderia(
  p_compra_id   uuid,
  p_lineas      jsonb,
  p_deposito_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_compra   public.compra;
  v_clase    text;
  v_signo    smallint;
  v_usuario  uuid;
  v_linea    jsonb;
  v_producto public.producto;
  v_cantidad numeric;
  v_costo    numeric;
  v_con_iva  numeric;
  v_numero   text;
  v_deposito uuid;
  v_salida   jsonb := '[]'::jsonb;
begin
  if not (app.tiene_permiso('compras.registrar') and app.tiene_permiso('stock.ajustar')) then
    raise exception 'No tenés permiso para recibir mercadería.';
  end if;

  select * into v_compra from public.compra where id = p_compra_id for update;

  if v_compra.id is null or v_compra.eliminado_en is not null then
    raise exception 'Esa factura de compra no existe o está dada de baja.';
  end if;

  if v_compra.recibida_en is not null then
    raise exception 'La mercadería de esa factura ya se recibió. Si faltó algo, cargalo por Stock.';
  end if;

  v_deposito := coalesce(p_deposito_id, app.deposito_principal());
  if not exists (select 1 from public.deposito where id = v_deposito and activo and eliminado_en is null) then
    raise exception 'Ese depósito no existe o está dado de baja.';
  end if;

  select t.clase, t.signo into v_clase, v_signo
  from public.tipo_comprobante t where t.id = v_compra.tipo_comprobante_id;

  -- Una nota de crédito es mercadería que VUELVE al proveedor, no que
  -- entra. Recibirla sumaría stock que se fue.
  if v_signo < 0 then
    raise exception 'Una nota de crédito no trae mercadería: lo que se le devuelve al proveedor sale por Stock.';
  end if;

  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'No hay nada para recibir.';
  end if;

  -- El mismo producto dos veces es casi siempre un doble clic. Si de
  -- verdad vino en dos renglones, se suma antes de mandar.
  if (select count(*) <> count(distinct x->>'producto_id')
        from jsonb_array_elements(p_lineas) x) then
    raise exception 'Hay un producto repetido. Si vino en dos renglones, sumá las cantidades en uno.';
  end if;

  v_usuario := app.usuario_actual_id();
  v_numero  := lpad(v_compra.punto_venta::text, 4, '0') || '-' || lpad(v_compra.numero::text, 8, '0');

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_cantidad := (v_linea->>'cantidad')::numeric;
    v_costo    := (v_linea->>'costo_unitario')::numeric;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cada renglón tiene que tener una cantidad mayor que cero.';
    end if;
    if v_costo is null or v_costo < 0 then
      raise exception 'Cada renglón tiene que tener su costo.';
    end if;

    select * into v_producto from public.producto
    where id = (v_linea->>'producto_id')::uuid and eliminado_en is null
    for update;

    if v_producto.id is null then
      raise exception 'Uno de los productos no existe o está dado de baja.';
    end if;

    v_con_iva := app.costo_con_iva(v_costo, v_clase, v_producto.id);

    insert into public.compra_linea
      (compra_id, producto_id, cantidad, costo_unitario, costo_con_iva, costo_anterior)
    values
      (v_compra.id, v_producto.id, v_cantidad, v_costo, v_con_iva, v_producto.costo);

    insert into public.movimiento_stock
      (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id, operador_id, deposito_id)
    values
      (v_producto.id, 'compra', v_cantidad, 'Factura de compra ' || v_numero,
       'compra', v_compra.id, v_usuario, v_usuario, v_deposito);

    -- Decidido: el último costo pisa. Un costo en cero es un regalo o
    -- una bonificación, y no puede dejar al producto con margen infinito.
    if v_con_iva > 0 then
      update public.producto set costo = v_con_iva where id = v_producto.id;
    end if;

    v_salida := v_salida || jsonb_build_object(
      'producto_id',       v_producto.id,
      'codigo',            v_producto.codigo,
      'nombre',            v_producto.nombre_interno,
      'cantidad',          v_cantidad,
      'costo_anterior',    v_producto.costo,
      'costo_nuevo',       case when v_con_iva > 0 then v_con_iva else v_producto.costo end,
      'precio_actual',     v_producto.precio_venta,
      'margen_objetivo',   v_producto.margen_sobre_costo,
      'precio_sugerido',   case
                             when v_con_iva > 0 and v_producto.margen_sobre_costo is not null
                             then round(v_con_iva * (1 + v_producto.margen_sobre_costo / 100), 2)
                           end
    );
  end loop;

  update public.compra
     set recibida_en = now(), recibida_por = v_usuario
   where id = v_compra.id;

  return v_salida;
end;
$$;

comment on function public.recibir_mercaderia(uuid, jsonb, uuid) is
  'Recibe la mercadería de una factura de compra ya cargada: líneas, ingreso de stock en el depósito elegido (el principal si no se dice) y último costo, en una transacción. No toca precios: devuelve el sugerido para que alguien lo aplique.';

revoke all on function public.recibir_mercaderia(uuid, jsonb, uuid) from public, anon;
grant execute on function public.recibir_mercaderia(uuid, jsonb, uuid) to authenticated;

comment on table public.deposito is
  'Dónde está la mercadería. Cada movimiento del libro dice en cuál ocurrió, stock_deposito lleva el saldo de cada uno y las transferencias mueven entre ellos.';
