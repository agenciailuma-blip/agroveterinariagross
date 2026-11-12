/*
  ─────────────────────────────────────────────────────────────
  Entradas y salidas de stock

  Pedido de Lucas del 12/11. La transferencia mueve mercadería entre
  depósitos y el total no cambia; lo que faltaba es que aparezca o
  desaparezca, con su motivo:

  - Sale: se rompió o se mojó una bolsa, venció, se usó en el local, se
    abrió una bolsa para fraccionar a mano.
  - Entra: un cliente devuelve una bolsa en un cambio, aparece mercadería
    que no estaba cargada.

  Es lo que OBTech tiene en Almacén → Stock → Entradas y Salidas, con el
  «código de observación». Antes, la única forma era abrir una toma de
  inventario entera para corregir una bolsa, y el motivo no quedaba.

  Mismo armado que las transferencias: un comprobante numerado con sus
  renglones, todo en una transacción, idempotente por el id, y no se
  borra: se anula con motivo y la anulación escribe los movimientos al
  revés. Cada renglón deja en el libro un movimiento de tipo «entrada» o
  «salida», con el motivo a la vista en el historial del producto.
  ─────────────────────────────────────────────────────────────
*/

insert into public.permiso (clave, grupo, descripcion, orden) values
  ('stock.ajustar', 'Stock', 'Registrar entradas y salidas de stock (roturas, uso interno, cambios)', 126)
on conflict (clave) do nothing;

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, 'stock.ajustar'
from public.rol r where r.nombre in ('Administrador', 'Encargado')
on conflict do nothing;

alter table public.movimiento_stock drop constraint if exists movimiento_stock_tipo_check;
alter table public.movimiento_stock
  add constraint movimiento_stock_tipo_check check (tipo in (
    'carga_inicial', 'compra', 'venta', 'devolucion', 'ajuste', 'inventario',
    'apertura', 'fraccionamiento', 'merma', 'remito', 'retorno_remito', 'transferencia',
    'entrada',   -- entra sin compra: un cambio, un sobrante
    'salida'     -- sale sin venta: rotura, vencimiento, uso interno, fraccionamiento a mano
  ));

/*
  El signo lo fija el tipo, salvo cuando se anula: la anulación de una
  salida es una «salida» positiva (vuelve lo que salió), como la de una
  transferencia. Por eso entrada y salida quedan libres de signo, igual
  que transferencia y ajuste.
*/

alter table public.movimiento_stock drop constraint if exists movimiento_stock_referencia_tipo_check;
alter table public.movimiento_stock
  add constraint movimiento_stock_referencia_tipo_check
  check (referencia_tipo = any (array[
    'venta', 'compra', 'inventario', 'fraccionamiento', 'manual', 'remito', 'devolucion',
    'transferencia', 'entrada_salida'
  ]));

/*
  Los motivos, fijos. Son los que dijo Lucas más «Otro», que pide la
  observación. El nombre en pantalla vive acá, para que el libro y la
  lista digan lo mismo.
*/
create or replace function app.nombre_motivo_stock(p_motivo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_motivo
    when 'rotura'          then 'Rotura o pérdida'
    when 'vencimiento'     then 'Vencimiento'
    when 'uso_interno'     then 'Uso interno'
    when 'fraccionamiento' then 'Se abrió para fraccionar'
    when 'cambio'          then 'Cambio de un cliente'
    when 'sobrante'        then 'Sobrante'
    when 'otro'            then 'Otro'
  end
$$;

create table public.entrada_salida (
  id                uuid primary key default gen_random_uuid(),
  numero            bigint generated always as identity unique,
  sentido           text not null check (sentido in ('entrada', 'salida')),
  motivo            text not null check (motivo in ('rotura', 'vencimiento', 'uso_interno', 'fraccionamiento', 'cambio', 'sobrante', 'otro')),
  deposito_id       uuid not null references public.deposito(id),
  observacion       text,
  usuario_id        uuid references public.usuario(id) on delete set null,
  ocurrido_en       timestamptz not null default now(),
  anulada_en        timestamptz,
  anulada_por       uuid references public.usuario(id) on delete set null,
  motivo_anulacion  text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),

  -- Rotura, vencimiento, uso interno y fraccionar sólo sacan; un cambio y un sobrante sólo entran.
  constraint entrada_salida_motivo_del_sentido check (
    motivo = 'otro'
    or (sentido = 'salida'  and motivo in ('rotura', 'vencimiento', 'uso_interno', 'fraccionamiento'))
    or (sentido = 'entrada' and motivo in ('cambio', 'sobrante'))
  ),
  -- «Otro» tiene que decir qué fue.
  constraint entrada_salida_otro_con_observacion check (
    motivo <> 'otro' or btrim(coalesce(observacion, '')) <> ''
  )
);

create index entrada_salida_ocurrido_idx on public.entrada_salida (ocurrido_en desc);

create trigger entrada_salida_actualizado_en
  before update on public.entrada_salida
  for each row execute function app.set_actualizado_en();

create table public.entrada_salida_linea (
  id                uuid primary key default gen_random_uuid(),
  entrada_salida_id uuid not null references public.entrada_salida(id) on delete restrict,
  producto_id       uuid not null references public.producto(id) on delete restrict,
  cantidad          numeric(14,4) not null check (cantidad > 0),

  constraint entrada_salida_linea_unica unique (entrada_salida_id, producto_id)
);

create index entrada_salida_linea_producto_idx on public.entrada_salida_linea (producto_id);

comment on table public.entrada_salida is
  'Mercadería que entra o sale sin compra ni venta (rotura, uso interno, un cambio), con su motivo. No se borra: se anula con motivo y la anulación escribe los movimientos al revés.';

alter table public.entrada_salida       enable row level security;
alter table public.entrada_salida_linea enable row level security;

create policy entrada_salida_select on public.entrada_salida
  for select to authenticated using ((select app.tiene_permiso('stock.ver')));
create policy entrada_salida_linea_select on public.entrada_salida_linea
  for select to authenticated using ((select app.tiene_permiso('stock.ver')));

grant select on public.entrada_salida, public.entrada_salida_linea to authenticated;

/*
  Registrar una entrada o salida.

  Sin depósito, el principal: con un solo depósito la pantalla no lo
  pregunta. Como la transferencia, no frena una salida que deja el stock
  en negativo —la bolsa rota está en la mano aunque el sistema diga que
  no hay—; la pantalla lo avisa antes.
*/
create or replace function public.registrar_entrada_salida(
  p_id          uuid,
  p_sentido     text,
  p_motivo      text,
  p_deposito_id uuid,
  p_lineas      jsonb,
  p_observacion text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid := coalesce(p_id, gen_random_uuid());
  v_numero   bigint;
  v_deposito public.deposito;
  v_usuario  uuid;
  v_linea    jsonb;
  v_producto uuid;
  v_cantidad numeric;
  v_obs      text := nullif(btrim(coalesce(p_observacion, '')), '');
  v_texto    text;
begin
  if not app.tiene_permiso('stock.ajustar') then
    raise exception 'No tenés permiso para registrar entradas y salidas de stock.';
  end if;

  select numero into v_numero from public.entrada_salida where id = v_id;
  if v_numero is not null then
    return v_numero;
  end if;

  if p_sentido not in ('entrada', 'salida') then
    raise exception 'Elegí si entra o sale.';
  end if;
  if app.nombre_motivo_stock(p_motivo) is null then
    raise exception 'Elegí el motivo.';
  end if;
  if p_motivo = 'otro' and v_obs is null then
    raise exception 'Con el motivo «Otro», escribí en la observación qué pasó.';
  end if;

  select * into v_deposito from public.deposito
   where id = coalesce(p_deposito_id, app.deposito_principal()) and activo and eliminado_en is null;
  if v_deposito.id is null then
    raise exception 'El depósito no existe o está dado de baja.';
  end if;

  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'No agregaste ningún producto.';
  end if;
  if (select count(*) <> count(distinct x->>'producto_id') from jsonb_array_elements(p_lineas) x) then
    raise exception 'Hay un producto repetido. Sumá las cantidades en un solo renglón.';
  end if;

  v_usuario := app.usuario_actual_id();

  insert into public.entrada_salida (id, sentido, motivo, deposito_id, observacion, usuario_id)
  values (v_id, p_sentido, p_motivo, v_deposito.id, v_obs, v_usuario)
  returning numero into v_numero;

  -- «Salida 12 · Rotura o pérdida: se mojó»
  v_texto := initcap(p_sentido) || ' ' || v_numero || ' · ' || app.nombre_motivo_stock(p_motivo)
             || coalesce(': ' || v_obs, '');

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_producto := (v_linea->>'producto_id')::uuid;
    v_cantidad := (v_linea->>'cantidad')::numeric;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cada renglón tiene que tener una cantidad mayor que cero.';
    end if;
    if not exists (select 1 from public.producto where id = v_producto and eliminado_en is null) then
      raise exception 'Uno de los productos no existe o está dado de baja.';
    end if;

    insert into public.entrada_salida_linea (entrada_salida_id, producto_id, cantidad)
    values (v_id, v_producto, v_cantidad);

    insert into public.movimiento_stock
      (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id,
       usuario_id, operador_id, deposito_id)
    values
      (v_producto, p_sentido,
       case when p_sentido = 'salida' then -v_cantidad else v_cantidad end,
       v_texto, 'entrada_salida', v_id, v_usuario, v_usuario, v_deposito.id);
  end loop;

  return v_numero;
end;
$$;

comment on function public.registrar_entrada_salida(uuid, text, text, uuid, jsonb, text) is
  'Registra mercadería que entra o sale sin compra ni venta, con su motivo: cabecera, renglones y movimientos en una transacción. Idempotente por el id.';

revoke all on function public.registrar_entrada_salida(uuid, text, text, uuid, jsonb, text) from public, anon;
grant execute on function public.registrar_entrada_salida(uuid, text, text, uuid, jsonb, text) to authenticated;

create or replace function public.anular_entrada_salida(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e       public.entrada_salida;
  v_usuario uuid;
begin
  if not app.tiene_permiso('stock.ajustar') then
    raise exception 'No tenés permiso para anular entradas y salidas de stock.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Para anular hay que decir por qué.';
  end if;

  select * into v_e from public.entrada_salida where id = p_id for update;
  if v_e.id is null then
    raise exception 'Esa entrada o salida no existe.';
  end if;
  if v_e.anulada_en is not null then
    raise exception 'La % % ya estaba anulada.', v_e.sentido, v_e.numero;
  end if;

  v_usuario := app.usuario_actual_id();

  insert into public.movimiento_stock
    (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id,
     usuario_id, operador_id, deposito_id)
  select l.producto_id, v_e.sentido,
         case when v_e.sentido = 'salida' then l.cantidad else -l.cantidad end,
         'Anulación de la ' || v_e.sentido || ' ' || v_e.numero,
         'entrada_salida', v_e.id, v_usuario, v_usuario, v_e.deposito_id
  from public.entrada_salida_linea l
  where l.entrada_salida_id = v_e.id;

  update public.entrada_salida
     set anulada_en = now(), anulada_por = v_usuario, motivo_anulacion = btrim(p_motivo)
   where id = v_e.id;
end;
$$;

comment on function public.anular_entrada_salida(uuid, text) is
  'Anula una entrada o salida con motivo: escribe los movimientos al revés. No borra nada.';

revoke all on function public.anular_entrada_salida(uuid, text) from public, anon;
grant execute on function public.anular_entrada_salida(uuid, text) to authenticated;

create view public.vista_entrada_salida
with (security_invoker = true) as
select
  e.id,
  e.numero,
  e.sentido,
  e.motivo,
  app.nombre_motivo_stock(e.motivo) as motivo_nombre,
  e.ocurrido_en,
  e.deposito_id,
  d.nombre   as deposito,
  e.observacion,
  u.nombre   as usuario_nombre,
  e.anulada_en,
  ua.nombre  as anulada_por_nombre,
  e.motivo_anulacion,
  (select count(*) from public.entrada_salida_linea l where l.entrada_salida_id = e.id) as productos,
  (select coalesce(sum(l.cantidad), 0) from public.entrada_salida_linea l where l.entrada_salida_id = e.id) as unidades
from public.entrada_salida e
join public.deposito d on d.id = e.deposito_id
left join public.usuario u  on u.id  = e.usuario_id
left join public.usuario ua on ua.id = e.anulada_por;

create view public.vista_entrada_salida_linea
with (security_invoker = true) as
select
  l.id,
  l.entrada_salida_id,
  l.producto_id,
  p.codigo,
  p.nombre_interno,
  p.unidad_medida,
  l.cantidad
from public.entrada_salida_linea l
join public.producto p on p.id = l.producto_id;

grant select on public.vista_entrada_salida, public.vista_entrada_salida_linea to authenticated;
