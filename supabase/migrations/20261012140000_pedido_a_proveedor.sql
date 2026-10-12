-- ═══════════════════════════════════════════════════════════════
-- El pedido a proveedor
--
-- Pedido de Lucas del 07/10 (docs/pedidos-lucas-2026-10-07.md, punto
-- 3): «umbrales de stock por proveedor» no era un aviso distinto por
-- proveedor, sino armar el pedido mirando todo lo que se le compra a
-- uno. El de depósito pide cinco bolsas; a ese proveedor no se le puede
-- pedir sólo eso, y Lucas suma un poco de cada cosa al mismo envío.
--
-- Tres piezas:
--
--   · El mínimo de cada proveedor, en su ficha. Es variado (respuesta
--     del 12/10): unos piden un monto, otros bultos, otros kilos. Se
--     guarda la unidad y el número, y el pedido dice cuánto falta.
--
--   · El pedido: numerado, con sus renglones, el costo al que se
--     calculó el total y el mínimo como estaba al pedir. Se anula con
--     motivo; no se corrige —ya salió hacia el proveedor—.
--
--   · Cada renglón de una orden interna sabe en qué pedido entró. Una
--     orden puede tener renglones de varios proveedores: queda «pedida»
--     recién cuando se pidió todo, y vuelve a pendiente si se anula el
--     pedido que la cerró.
--
-- No mueve stock ni plata, y nada de esto baja a las PC del local: el
-- pedido se arma con internet. Recibir la mercadería desde el pedido
-- es un paso aparte.
-- ═══════════════════════════════════════════════════════════════

-- ── El mínimo de cada proveedor ─────────────────────────────────
alter table public.proveedor
  add column minimo_tipo text check (minimo_tipo in ('monto', 'bultos', 'kilos')),
  add column minimo_valor numeric(14,4) check (minimo_valor is null or minimo_valor > 0);

alter table public.proveedor
  add constraint proveedor_minimo_completo check ((minimo_tipo is null) = (minimo_valor is null));

comment on column public.proveedor.minimo_tipo is
  'En qué pide el mínimo este proveedor: monto (pesos, con IVA, como los costos), bultos o kilos. Vacío: no pide mínimo.';
comment on column public.proveedor.minimo_valor is
  'El mínimo que acepta este proveedor, en la unidad de minimo_tipo.';

-- ── El pedido ───────────────────────────────────────────────────
create table public.pedido_proveedor (
  -- Lo genera la pantalla: un pedido que se corta y se reintenta no
  -- sale dos veces.
  id               uuid primary key default gen_random_uuid(),
  numero           bigint generated always as identity unique,
  fecha            date not null default current_date,
  proveedor_id     uuid not null references public.proveedor(id),
  observacion      text,
  /*
    pedido  — salió hacia el proveedor.
    anulado — no va; con motivo. Las órdenes internas que había
              cerrado vuelven a pendiente.
  */
  estado           text not null default 'pedido' check (estado in ('pedido', 'anulado')),
  -- El mínimo como estaba al pedir: el papel dice contra qué se armó,
  -- aunque después cambie la ficha del proveedor.
  minimo_tipo      text,
  minimo_valor     numeric(14,4),
  creado_por       uuid references public.usuario(id) on delete set null,
  anulado_en       timestamptz,
  anulado_por      uuid references public.usuario(id) on delete set null,
  motivo_anulacion text,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

create index pedido_proveedor_fecha_idx on public.pedido_proveedor (fecha desc, numero desc);
create index pedido_proveedor_proveedor_idx on public.pedido_proveedor (proveedor_id);

create trigger pedido_proveedor_actualizado_en
  before update on public.pedido_proveedor
  for each row execute function app.set_actualizado_en();

/*
  Como el renglón de la orden interna: código y descripción como
  estaban, y sin producto lo que no está en el catálogo. El costo es al
  que se calculó el total —con IVA, como todos los costos—; el peso y el
  bulto, los de ese momento, para que el papel no cambie solo.
*/
create table public.pedido_proveedor_linea (
  id                 uuid primary key default gen_random_uuid(),
  pedido_id          uuid not null references public.pedido_proveedor(id) on delete cascade,
  renglon            int  not null,
  producto_id        uuid references public.producto(id) on delete set null,
  codigo             text,
  descripcion        text not null check (btrim(descripcion) <> ''),
  cantidad           numeric(14,4) not null check (cantidad > 0),
  costo              numeric(14,4) check (costo is null or costo >= 0),
  peso_kg            numeric(14,4),
  unidades_por_bulto numeric(14,4)
);

create index pedido_proveedor_linea_pedido_idx on public.pedido_proveedor_linea (pedido_id, renglon);

-- ── El renglón de la orden interna sabe en qué pedido entró ─────
alter table public.orden_compra_interna_linea
  add column pedido_id uuid references public.pedido_proveedor(id) on delete set null;

create index orden_compra_interna_linea_pedido_idx
  on public.orden_compra_interna_linea (pedido_id) where pedido_id is not null;

comment on column public.orden_compra_interna_linea.pedido_id is
  'El pedido a proveedor en que entró este renglón. La orden queda pedida cuando entraron todos.';

alter table public.pedido_proveedor enable row level security;
alter table public.pedido_proveedor_linea enable row level security;

-- Se escriben sólo por las funciones de abajo; los lee quien compra.
create policy pedido_proveedor_select on public.pedido_proveedor
  for select to authenticated using ((select app.tiene_permiso('compras.ver')));
create policy pedido_proveedor_linea_select on public.pedido_proveedor_linea
  for select to authenticated using ((select app.tiene_permiso('compras.ver')));

comment on table public.pedido_proveedor is
  'Pedido a un proveedor: lo que se le pide en un envío, armado mirando todos sus productos y las órdenes internas. No mueve stock ni plata.';

-- ── Lo que se le puede pedir a un proveedor ─────────────────────
/*
  Todos sus productos, con lo que hace falta para decidir: cuánto hay,
  con cuánto avisa, el costo, el peso y el bulto, y lo que pidieron las
  órdenes internas pendientes. Más los renglones de esas órdenes que no
  están en el catálogo («lo de Casa Burgo»), uno por renglón.

  Las sueltas no aparecen: no se compran, se compra la caja. Un producto
  de otro proveedor sí, si una orden se lo pidió a éste.

  El costo es el de la última compra a este proveedor, y si nunca se le
  compró, el de la ficha. Con permiso de dueño para leer el stock y las
  órdenes sin depender de otros permisos; controla `compras.ver` a mano.
*/
create or replace function public.productos_para_pedido(p_proveedor_id uuid)
returns table (
  producto_id        uuid,
  codigo             text,
  descripcion        text,
  unidad_medida      text,
  stock              numeric,
  umbral_bajo        numeric,
  umbral_critico     numeric,
  estado             text,
  costo              numeric,
  costo_de_este      boolean,
  peso_kg            numeric,
  unidades_por_bulto numeric,
  es_del_proveedor   boolean,
  en_ordenes         numeric,
  lineas_orden       uuid[],
  ordenes            bigint[]
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not app.tiene_permiso('compras.ver') then
    raise exception 'No tenés permiso para armar pedidos a proveedores.';
  end if;

  return query
  with pendientes as (
    select l.id, l.producto_id, l.descripcion, l.cantidad, o.numero
      from public.orden_compra_interna_linea l
      join public.orden_compra_interna o on o.id = l.orden_id
     where o.estado = 'pendiente'
       and l.pedido_id is null
       and l.proveedor_id = p_proveedor_id
  ),
  por_producto as (
    select pe.producto_id, sum(pe.cantidad) as cantidad,
           array_agg(pe.id order by pe.numero) as lineas,
           array_agg(distinct pe.numero) as numeros
      from pendientes pe
     where pe.producto_id is not null
     group by pe.producto_id
  ),
  elegidos as (
    select p.id from public.producto p
     where p.proveedor_id = p_proveedor_id
       and p.eliminado_en is null
       and p.activo
       and p.envase_id is null
    union
    select pp.producto_id from por_producto pp
  )
  select t.* from (
    select p.id as prod, p.codigo as cod, p.nombre_interno as descr, p.unidad_medida as um,
           coalesce(v.cantidad, 0) as cant, v.umbral_bajo as bajo, v.umbral_critico as critico,
           coalesce(v.estado, 'ok') as est,
           coalesce(cp.ultimo_costo, p.costo) as cos, cp.ultimo_costo is not null as de_este,
           p.peso_kg as peso, p.unidades_por_bulto as bulto,
           p.proveedor_id is not distinct from p_proveedor_id as del_prov,
           coalesce(pp.cantidad, 0) as pedido, coalesce(pp.lineas, '{}'::uuid[]) as lineas,
           coalesce(pp.numeros, '{}'::bigint[]) as numeros
      from elegidos e
      join public.producto p on p.id = e.id
      left join public.vista_stock v on v.producto_id = p.id
      left join public.vista_costo_por_proveedor cp
             on cp.producto_id = p.id and cp.proveedor_id = p_proveedor_id
      left join por_producto pp on pp.producto_id = p.id
    union all
    select null::uuid, null::text, pe.descripcion, null::text, null::numeric, null::numeric,
           null::numeric, 'ok', null::numeric, false, null::numeric, null::numeric,
           false, pe.cantidad, array[pe.id], array[pe.numero]
      from pendientes pe
     where pe.producto_id is null
  ) t
  -- Primero lo que no está en el catálogo; después lo urgente, y entre
  -- iguales, lo que pidieron las órdenes.
  order by t.prod is null desc,
           case t.est when 'sobrevendido' then 0 when 'critico' then 1 when 'bajo' then 2 else 3 end,
           t.pedido desc, t.descr;
end;
$$;

revoke all on function public.productos_para_pedido(uuid) from public;
grant execute on function public.productos_para_pedido(uuid) to authenticated;

-- ── Hacer el pedido ─────────────────────────────────────────────
/*
  Cada renglón: `producto_id` (o nada, si no está en el catálogo),
  `descripcion`, `cantidad`, `costo` y `lineas_orden`: los renglones de
  órdenes internas que cubre. Esos renglones tienen que seguir
  pendientes, ser de este proveedor y del mismo producto; si alguien los
  tocó mientras se armaba el pedido, no sale nada y hay que volver a
  cargar.

  Reintentar con el mismo id devuelve el número que ya tenía.
*/
create or replace function public.hacer_pedido_proveedor(
  p_id           uuid,
  p_proveedor_id uuid,
  p_lineas       jsonb,
  p_observacion  text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_numero    bigint;
  v_prov      public.proveedor;
  v_linea     jsonb;
  v_renglon   int := 0;
  v_prod      public.producto;
  v_desc      text;
  v_cant      numeric;
  v_costo     numeric;
  v_orden_lin text;
  v_tocadas   int;
  v_ordenes   uuid[] := '{}';
  v_orden_id  uuid;
begin
  if not app.tiene_permiso('compras.registrar') then
    raise exception 'No tenés permiso para hacer pedidos a proveedores.';
  end if;

  select numero into v_numero from public.pedido_proveedor where id = p_id;
  if v_numero is not null then
    return v_numero;
  end if;

  select * into v_prov from public.proveedor where id = p_proveedor_id and eliminado_en is null;
  if v_prov.id is null then
    raise exception 'Falta elegir a qué proveedor se le pide.';
  end if;
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El pedido no tiene nada para pedir.';
  end if;

  insert into public.pedido_proveedor
    (id, proveedor_id, observacion, minimo_tipo, minimo_valor, creado_por)
  values
    (coalesce(p_id, gen_random_uuid()), p_proveedor_id,
     nullif(btrim(coalesce(p_observacion, '')), ''),
     v_prov.minimo_tipo, v_prov.minimo_valor, app.usuario_actual_id())
  returning id, numero into p_id, v_numero;

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
      raise exception 'Al renglón % le falta qué se pide.', v_renglon;
    end if;

    v_cant := nullif(v_linea->>'cantidad', '')::numeric;
    if v_cant is null or v_cant <= 0 then
      raise exception 'Al renglón % («%») le falta la cantidad.', v_renglon, v_desc;
    end if;

    v_costo := nullif(v_linea->>'costo', '')::numeric;
    if v_costo < 0 then
      raise exception 'El costo del renglón % («%») no puede ser negativo.', v_renglon, v_desc;
    end if;

    insert into public.pedido_proveedor_linea
      (pedido_id, renglon, producto_id, codigo, descripcion, cantidad, costo, peso_kg, unidades_por_bulto)
    values
      (p_id, v_renglon, v_prod.id, v_prod.codigo, v_desc, v_cant, v_costo, v_prod.peso_kg, v_prod.unidades_por_bulto);

    -- Los renglones de órdenes internas que cubre.
    for v_orden_lin in
      select * from jsonb_array_elements_text(coalesce(v_linea->'lineas_orden', '[]'::jsonb))
    loop
      update public.orden_compra_interna_linea l
         set pedido_id = p_id
        from public.orden_compra_interna o
       where l.id = v_orden_lin::uuid
         and o.id = l.orden_id
         and o.estado = 'pendiente'
         and l.pedido_id is null
         and l.proveedor_id = p_proveedor_id
         and l.producto_id is not distinct from v_prod.id
      returning l.orden_id into v_orden_id;
      get diagnostics v_tocadas = row_count;
      if v_tocadas = 0 then
        raise exception 'Una orden interna cambió mientras se armaba el pedido («%»): volvé a elegir el proveedor para ver cómo quedó.', v_desc;
      end if;
      v_ordenes := array_append(v_ordenes, v_orden_id);
    end loop;
  end loop;

  -- La orden queda pedida cuando entraron todos sus renglones.
  update public.orden_compra_interna o
     set estado = 'pedida', pedida_en = now(), pedida_por = app.usuario_actual_id()
   where o.id = any (v_ordenes)
     and o.estado = 'pendiente'
     and not exists (select 1 from public.orden_compra_interna_linea l
                      where l.orden_id = o.id and l.pedido_id is null);

  return v_numero;
end;
$$;

revoke all on function public.hacer_pedido_proveedor(uuid, uuid, jsonb, text) from public;
grant execute on function public.hacer_pedido_proveedor(uuid, uuid, jsonb, text) to authenticated;

-- ── Anular el pedido ────────────────────────────────────────────
/*
  Con motivo. Los renglones de órdenes internas que había cubierto
  quedan libres para el próximo pedido, y las órdenes que este pedido
  había dado por pedidas vuelven a pendiente.
*/
create or replace function public.anular_pedido_proveedor(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_pedido  public.pedido_proveedor;
  v_ordenes uuid[];
begin
  if not app.tiene_permiso('compras.registrar') then
    raise exception 'No tenés permiso para anular pedidos a proveedores.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Para anular un pedido hay que decir por qué.';
  end if;

  select * into v_pedido from public.pedido_proveedor where id = p_id for update;
  if v_pedido.id is null then
    raise exception 'Ese pedido no existe.';
  end if;
  if v_pedido.estado = 'anulado' then
    raise exception 'El pedido % ya estaba anulado.', v_pedido.numero;
  end if;

  select coalesce(array_agg(distinct l.orden_id), '{}') into v_ordenes
    from public.orden_compra_interna_linea l where l.pedido_id = p_id;

  update public.orden_compra_interna_linea set pedido_id = null where pedido_id = p_id;

  update public.orden_compra_interna
     set estado = 'pendiente', pedida_en = null, pedida_por = null
   where id = any (v_ordenes) and estado = 'pedida';

  update public.pedido_proveedor
     set estado = 'anulado', anulado_en = now(), anulado_por = app.usuario_actual_id(),
         motivo_anulacion = btrim(p_motivo)
   where id = p_id;
end;
$$;

revoke all on function public.anular_pedido_proveedor(uuid, text) from public;
grant execute on function public.anular_pedido_proveedor(uuid, text) to authenticated;

-- ── Lo que ve la pantalla ───────────────────────────────────────
create or replace function public.pedidos_a_proveedores(p_estado text default null, p_limite int default 100)
returns table (
  id          uuid,
  numero      bigint,
  fecha       date,
  proveedor   text,
  estado      text,
  renglones   bigint,
  total       numeric,
  observacion text,
  creado_por  text
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not app.tiene_permiso('compras.ver') then
    raise exception 'No tenés permiso para ver los pedidos a proveedores.';
  end if;

  return query
  select p.id, p.numero, p.fecha, pr.nombre, p.estado,
         (select count(*) from public.pedido_proveedor_linea l where l.pedido_id = p.id),
         (select round(sum(l.cantidad * l.costo), 2) from public.pedido_proveedor_linea l where l.pedido_id = p.id),
         p.observacion, u.nombre
    from public.pedido_proveedor p
    join public.proveedor pr on pr.id = p.proveedor_id
    left join public.usuario u on u.id = p.creado_por
   where p_estado is null or p.estado = p_estado
   order by p.fecha desc, p.numero desc
   limit greatest(1, least(coalesce(p_limite, 100), 500));
end;
$$;

revoke all on function public.pedidos_a_proveedores(text, int) from public;
grant execute on function public.pedidos_a_proveedores(text, int) to authenticated;

/*
  Un pedido entero, para verlo, imprimirlo o mandarlo por WhatsApp: con
  los datos del proveedor que van en el papel y las órdenes internas que
  cubrió.
*/
create or replace function public.pedido_a_proveedor(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_resultado jsonb;
begin
  if not app.tiene_permiso('compras.ver') then
    raise exception 'No tenés permiso para ver los pedidos a proveedores.';
  end if;

  select jsonb_build_object(
           'id', p.id, 'numero', p.numero, 'fecha', p.fecha,
           'proveedor_id', p.proveedor_id, 'proveedor', pr.nombre,
           'proveedor_cuit', pr.numero_documento, 'proveedor_contacto', pr.contacto,
           'proveedor_telefono', pr.telefono, 'proveedor_email', pr.email,
           'observacion', p.observacion, 'estado', p.estado,
           'minimo_tipo', p.minimo_tipo, 'minimo_valor', p.minimo_valor,
           'creado_por', u.nombre, 'creado_en', p.creado_en,
           'anulado_por', ua.nombre, 'anulado_en', p.anulado_en, 'motivo_anulacion', p.motivo_anulacion,
           'lineas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'renglon', l.renglon, 'producto_id', l.producto_id, 'codigo', l.codigo,
                      'descripcion', l.descripcion, 'cantidad', l.cantidad, 'costo', l.costo,
                      'peso_kg', l.peso_kg, 'unidades_por_bulto', l.unidades_por_bulto)
                    order by l.renglon)
               from public.pedido_proveedor_linea l
              where l.pedido_id = p.id), '[]'::jsonb),
           'ordenes', coalesce((
             select jsonb_agg(distinct o.numero)
               from public.orden_compra_interna_linea l
               join public.orden_compra_interna o on o.id = l.orden_id
              where l.pedido_id = p.id), '[]'::jsonb))
    into v_resultado
    from public.pedido_proveedor p
    join public.proveedor pr on pr.id = p.proveedor_id
    left join public.usuario u on u.id = p.creado_por
    left join public.usuario ua on ua.id = p.anulado_por
   where p.id = p_id;

  return v_resultado;
end;
$$;

revoke all on function public.pedido_a_proveedor(uuid) from public;
grant execute on function public.pedido_a_proveedor(uuid) to authenticated;

-- ── La orden interna dice en qué pedido entró cada renglón ──────
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
                      'proveedor', pr.nombre, 'cantidad', l.cantidad,
                      'pedido_numero', pe.numero)
                    order by pr.nombre nulls last, l.renglon)
               from public.orden_compra_interna_linea l
               left join public.proveedor pr on pr.id = l.proveedor_id
               left join public.pedido_proveedor pe on pe.id = l.pedido_id
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
