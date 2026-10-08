-- ═══════════════════════════════════════════════════════════════
-- La caja y la suelta — venta fraccionada (alcance V1-A, §3)
--
-- Pedido de Lucas del 07/10: «cargo la caja como me llega; si vendo
-- una pastilla, quiero ver nueve sueltas y ninguna caja, no una caja y
-- nueve pastillas». Y el 08/10: hay productos de tres niveles —caja,
-- tableta y pastilla—.
--
-- Se arma con productos atados, no con un producto de stock único en
-- la unidad más chica. Cada nivel sigue siendo un producto entero —su
-- precio, su código de barras, su línea en la factura—, así que la
-- venta, la factura, la copia sin internet, las devoluciones, los
-- remitos y la API de la tienda no se enteran de nada. Lo único nuevo
-- es que la suelta sabe de qué envase sale y cuántas trae.
--
-- Cuando se vende una suelta y no quedan sueltas, la base abre un
-- envase sola: el envase baja, las sueltas suben, y queda asentado en
-- el libro como dos movimientos más. Abrir es parte de la misma venta:
-- nunca se ve una caja que ya no existe.
--
-- Los campos `permite_fraccionamiento`, `contenido` y
-- `contenido_unidad` del 12/08 eran la reserva para esto y nadie los
-- usa. Quedan, sin uso: borrarlos obliga a tocar la sincronización y
-- la pantalla de productos, y no compra nada.
-- ═══════════════════════════════════════════════════════════════

alter table public.producto
  add column envase_id uuid references public.producto(id) on delete restrict,
  add column cantidad_por_envase numeric(14,4);

alter table public.producto
  add constraint producto_envase_completo
    check ((envase_id is null) = (cantidad_por_envase is null)),
  add constraint producto_cantidad_por_envase_positiva
    check (cantidad_por_envase is null or cantidad_por_envase > 0),
  add constraint producto_no_es_su_propio_envase
    check (envase_id is null or envase_id <> id);

/*
  Un envase se abre en una sola cosa. Si la caja se abriera en tabletas
  y también en pastillas sueltas, al vender una pastilla no habría
  forma de saber qué abrir. Tres niveles van en cadena: la pastilla
  sale de la tableta y la tableta de la caja.
*/
create unique index producto_una_suelta_por_envase
  on public.producto (envase_id)
  where envase_id is not null and eliminado_en is null;

create index producto_envase_idx on public.producto (envase_id) where envase_id is not null;

comment on column public.producto.envase_id is
  'De qué producto sale esta suelta: la pastilla sale de la tableta, la tableta de la caja. Al vender una suelta sin sueltas, la base abre uno solo.';
comment on column public.producto.cantidad_por_envase is
  'Cuántas de éstas trae un envase. En unidades de este producto: 10 pastillas, o 15 kg.';
comment on column public.producto.permite_fraccionamiento is
  'Sin uso desde el 08/10/2026: la venta suelta se arma con envase_id.';
comment on column public.producto.contenido is
  'Sin uso desde el 08/10/2026: la venta suelta se arma con cantidad_por_envase.';

-- ── El libro: la entrada de lo que sale de abrir un envase ──────
/*
  Abrir es una salida del envase (`apertura`, que existe desde el
  12/08) y una entrada de la suelta. La entrada necesita su propio
  tipo: `apertura` está atada a ser negativa, y un tipo que valga para
  los dos signos dejaría pasar una apertura de signo equivocado.
*/
alter table public.movimiento_stock drop constraint movimiento_stock_tipo_check;
alter table public.movimiento_stock add constraint movimiento_stock_tipo_check
  check (tipo = any (array[
    'carga_inicial', 'compra', 'venta', 'devolucion', 'ajuste', 'inventario',
    'apertura', 'fraccionamiento', 'merma', 'remito', 'retorno_remito', 'transferencia'
  ]));

alter table public.movimiento_stock drop constraint movimiento_signo_coherente;
alter table public.movimiento_stock add constraint movimiento_signo_coherente
  check (case tipo
    when 'venta'           then cantidad < 0
    when 'apertura'        then cantidad < 0
    when 'merma'           then cantidad < 0
    when 'remito'          then cantidad < 0
    when 'compra'          then cantidad > 0
    when 'devolucion'      then cantidad > 0
    when 'retorno_remito'  then cantidad > 0
    when 'fraccionamiento' then cantidad > 0
    else true
  end);

-- ── La cadena no puede dar vueltas ─────────────────────────────
/*
  La base ya impide que un producto sea su propio envase. Esto impide
  el caso largo: la caja sale de la pastilla que sale de la caja. Con
  una vuelta así, vender una pastilla abriría envases para siempre.

  Y cuando se ata, o cambia cuántas trae, la suelta toma el costo del
  envase dividido lo que trae: es lo único que se sabe de lo que cuesta
  una pastilla, y sin eso el margen de la suelta quedaría en blanco.
*/
create or replace function app.revisar_envase_del_producto()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actual uuid := new.envase_id;
  v_vueltas int := 0;
  v_costo numeric;
begin
  if new.envase_id is null then
    return new;
  end if;

  while v_actual is not null loop
    if v_actual = new.id then
      raise exception 'Ese producto ya sale de adentro de éste: la caja y la suelta quedarían una adentro de la otra.'
        using errcode = 'check_violation';
    end if;
    v_vueltas := v_vueltas + 1;
    if v_vueltas > 4 then
      raise exception 'Una suelta puede estar a lo sumo cuatro envases adentro.'
        using errcode = 'check_violation';
    end if;
    select p.envase_id into v_actual from public.producto p where p.id = v_actual;
  end loop;

  /*
    Con «trae 0» no se calcula nada: lo frena la restricción de la
    tabla, con su nombre, y no una división por cero que no dice qué
    estaba mal.
  */
  if coalesce(new.cantidad_por_envase, 0) > 0 and (
       tg_op = 'INSERT'
       or new.envase_id is distinct from old.envase_id
       or new.cantidad_por_envase is distinct from old.cantidad_por_envase) then
    select e.costo into v_costo from public.producto e where e.id = new.envase_id;
    if v_costo is not null then
      new.costo := round(v_costo / new.cantidad_por_envase, 4);
    end if;
  end if;

  return new;
end;
$$;

create trigger producto_revisar_envase
  before insert or update of envase_id, cantidad_por_envase on public.producto
  for each row execute function app.revisar_envase_del_producto();

/*
  El costo baja por la cadena. La recepción de mercadería le pone el
  costo a la caja —es lo que se compra—, y la tableta y la pastilla lo
  heredan solas. Cada una que cambia le cambia a la de abajo, por el
  mismo disparador.
*/
create or replace function app.el_costo_baja_a_la_suelta()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.producto h
     set costo = case when new.costo is null then null
                      else round(new.costo / h.cantidad_por_envase, 4) end
   where h.envase_id = new.id
     and h.eliminado_en is null
     and h.costo is distinct from
         case when new.costo is null then null
              else round(new.costo / h.cantidad_por_envase, 4) end;
  return null;
end;
$$;

create trigger producto_costo_a_la_suelta
  after update of costo on public.producto
  for each row
  when (old.costo is distinct from new.costo)
  execute function app.el_costo_baja_a_la_suelta();

-- ── Cuánto hay, contando lo que se puede abrir ──────────────────
/*
  Las sueltas que hay más las que salen de abrir todos los envases
  enteros de arriba. Con 1 caja de 10 tabletas de 10 pastillas, cero
  tabletas y cero pastillas sueltas: 100 pastillas.

  Sólo se cuentan envases enteros: media tableta no se abre. Y un
  envase en negativo —vendido de más— no resta: no se puede abrir lo
  que no hay, pero tampoco se descuenta de las sueltas que sí están.

  Sin depósito, el total; con depósito, lo de ese depósito: un envase
  del otro local no se puede abrir acá.
*/
create or replace function app.disponible_abriendo(p_producto uuid, p_deposito uuid default null)
returns numeric
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_saldo numeric;
  v_envase uuid;
  v_por numeric;
begin
  if p_deposito is null then
    select s.cantidad into v_saldo from public.stock_saldo s where s.producto_id = p_producto;
  else
    select s.cantidad into v_saldo from public.stock_deposito s
     where s.producto_id = p_producto and s.deposito_id = p_deposito;
  end if;
  v_saldo := coalesce(v_saldo, 0);

  -- Un envase dado de baja no se abre: la suelta queda sola.
  select p.envase_id, p.cantidad_por_envase into v_envase, v_por
    from public.producto p
    join public.producto e on e.id = p.envase_id and e.eliminado_en is null
   where p.id = p_producto;

  if v_envase is null then
    return v_saldo;
  end if;

  return v_saldo + v_por * greatest(0, floor(app.disponible_abriendo(v_envase, p_deposito)));
end;
$$;

grant execute on function app.disponible_abriendo(uuid, uuid) to authenticated;

-- ── Abrir el envase solo ────────────────────────────────────────
/*
  Corre después de que el movimiento ya se sumó al saldo —los AFTER se
  disparan en orden alfabético, y `movimiento_stock_aplicar` va antes
  que `movimiento_stock_sin_sueltas_abre_envase`—, así que el saldo
  que lee ya incluye la venta.

  Sólo reacciona a lo que sale por el mostrador: venta y remito. Una
  corrección de inventario o un ajuste en negativo dicen que el conteo
  dio menos, no que alguien abrió una caja; y una transferencia anulada
  deshace la que entró, no vende nada. Reacciona también a `apertura`,
  y por eso tres niveles funcionan solos: abrir una tableta que no hay
  deja la tableta en negativo, y eso abre una caja.

  Abre los envases que hagan falta para que la suelta deje de estar en
  negativo, y no más de los que hay: si no alcanza, la suelta queda
  vendida de más, como cualquier producto, y aparece en Stock.

  Los dos movimientos nuevos llevan la misma fecha, persona y terminal
  que la venta, y como referencia el movimiento de la venta: así el
  historial dice por qué se abrió. Nunca la venta como referencia: las
  devoluciones y la anulación leen «lo que salió por la venta», y una
  caja abierta no es algo que haya salido.
*/
create or replace function app.abrir_envase_si_no_alcanza()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_envase uuid;
  v_por numeric;
  v_nombre_envase text;
  v_saldo numeric;
  v_hacen_falta numeric;
  v_se_pueden numeric;
  v_abrir numeric;
  v_origen uuid;
begin
  select p.envase_id, p.cantidad_por_envase, e.nombre_interno
    into v_envase, v_por, v_nombre_envase
    from public.producto p
    join public.producto e on e.id = p.envase_id and e.eliminado_en is null
   where p.id = new.producto_id;

  if v_envase is null then
    return null;
  end if;

  select s.cantidad into v_saldo from public.stock_deposito s
   where s.producto_id = new.producto_id and s.deposito_id = new.deposito_id;

  if coalesce(v_saldo, 0) >= 0 then
    return null;
  end if;

  v_hacen_falta := ceil(-v_saldo / v_por);
  v_se_pueden := greatest(0, floor(app.disponible_abriendo(v_envase, new.deposito_id)));
  v_abrir := least(v_hacen_falta, v_se_pueden);

  if v_abrir <= 0 then
    return null;
  end if;

  v_origen := case when new.tipo = 'apertura' then new.referencia_id else new.id end;

  insert into public.movimiento_stock
    (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, deposito_id,
     usuario_id, operador_id, terminal_id, ocurrido_en, registrado_offline)
  values
    (v_envase, 'apertura', -v_abrir,
     case when v_abrir = 1 then 'Se abrió para vender suelto'
          else 'Se abrieron ' || v_abrir::int || ' para vender suelto' end,
     'fraccionamiento', v_origen, new.deposito_id,
     new.usuario_id, new.operador_id, new.terminal_id, new.ocurrido_en, new.registrado_offline);

  insert into public.movimiento_stock
    (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, deposito_id,
     usuario_id, operador_id, terminal_id, ocurrido_en, registrado_offline)
  values
    (new.producto_id, 'fraccionamiento', v_abrir * v_por,
     'Sale de abrir ' || v_abrir::int || ' ' || v_nombre_envase,
     'fraccionamiento', v_origen, new.deposito_id,
     new.usuario_id, new.operador_id, new.terminal_id, new.ocurrido_en, new.registrado_offline);

  return null;
end;
$$;

create trigger movimiento_stock_sin_sueltas_abre_envase
  after insert on public.movimiento_stock
  for each row
  when (new.cantidad < 0 and new.tipo in ('venta', 'remito', 'apertura'))
  execute function app.abrir_envase_si_no_alcanza();

-- ── Lo que ve la pantalla ───────────────────────────────────────
/*
  `vista_stock` suma tres columnas al final: de qué envase sale, cuántas
  trae, y cuánto hay contando lo que se puede abrir. El estado de una
  suelta se calcula con eso último: si no, con la caja llena, tres
  pastillas sueltas aparecerían en Crítico todos los días.

  Para el envase no cambia nada: su estado son sus cajas cerradas, que
  es lo que se le pide al proveedor.
*/
create or replace view public.vista_stock
with (security_invoker = true) as
select p.id as producto_id,
    p.codigo,
    p.nombre_interno,
    p.nombre_publico,
    p.precio_venta,
    p.costo,
    p.margen_sobre_costo,
    case
        when p.costo is null or p.costo <= 0::numeric then null::numeric
        else round((p.precio_venta / p.costo - 1::numeric) * 100::numeric, 2)
    end as margen_real,
    case
        when p.costo is null or p.costo <= 0::numeric or p.margen_sobre_costo is null then null::numeric
        else round((p.precio_venta / p.costo - 1::numeric) * 100::numeric - p.margen_sobre_costo, 2)
    end as desvio_margen,
    case
        when p.costo is null or p.margen_sobre_costo is null then null::numeric
        else round(p.costo * (1::numeric + p.margen_sobre_costo / 100::numeric), 2)
    end as precio_sugerido,
    p.unidad_medida,
    p.alicuota_iva_id,
    p.categoria_id,
    p.marca_id,
    p.activo,
    p.revisado_en,
    p.es_producto_veterinario,
    p.es_fitosanitario,
    coalesce(s.cantidad, 0::numeric) as cantidad,
    s.actualizado_en as stock_actualizado_en,
    u.bajo as umbral_bajo,
    u.critico as umbral_critico,
    case
        when d.disponible < 0::numeric then 'sobrevendido'::text
        when d.disponible <= u.critico then 'critico'::text
        when d.disponible <= u.bajo then 'bajo'::text
        else 'ok'::text
    end as estado,
    p.envase_id,
    p.cantidad_por_envase,
    d.disponible
   from producto p
     left join stock_saldo s on s.producto_id = p.id
     left join umbral_stock up on up.producto_id = p.id and up.ambito = 'producto'::text
     left join umbral_stock uc on uc.categoria_id = p.categoria_id and uc.ambito = 'categoria'::text
     cross join lateral (
       select coalesce(up.bajo, uc.bajo, (select (c.valor #>> '{}'::text[])::numeric
                                            from configuracion c
                                           where c.clave = 'stock.umbral_bajo_general'::text)) as bajo,
              coalesce(up.critico, uc.critico, (select (c.valor #>> '{}'::text[])::numeric
                                                  from configuracion c
                                                 where c.clave = 'stock.umbral_critico_general'::text)) as critico
     ) u
     cross join lateral (
       select case when p.envase_id is null then coalesce(s.cantidad, 0::numeric)
                   else app.disponible_abriendo(p.id) end as disponible
     ) d
  where p.eliminado_en is null;

create or replace view public.vista_stock_por_deposito
with (security_invoker = true) as
select v.producto_id,
    v.codigo,
    v.nombre_interno,
    v.unidad_medida,
    v.activo,
    v.precio_venta,
    v.costo,
    d.id as deposito_id,
    d.nombre as deposito,
    coalesce(s.cantidad, 0::numeric) as cantidad,
    v.umbral_bajo,
    v.umbral_critico,
    case
        when x.disponible < 0::numeric then 'sobrevendido'::text
        when x.disponible <= v.umbral_critico then 'critico'::text
        when x.disponible <= v.umbral_bajo then 'bajo'::text
        else 'ok'::text
    end as estado,
    v.envase_id,
    v.cantidad_por_envase,
    x.disponible
   from vista_stock v
     cross join deposito d
     left join stock_deposito s on s.producto_id = v.producto_id and s.deposito_id = d.id
     cross join lateral (
       select case when v.envase_id is null then coalesce(s.cantidad, 0::numeric)
                   else app.disponible_abriendo(v.producto_id, d.id) end as disponible
     ) x
  where d.activo and d.eliminado_en is null;

-- ── La cadena entera, para la ficha ─────────────────────────────
/*
  De un producto cualquiera de la cadena, la cadena entera: del envase
  más grande a la suelta más chica, con lo que hay de cada uno. Es lo
  que la ficha muestra como «1 caja · 3 tabletas · 7 pastillas».
*/
create or replace function public.cadena_de_envases(p_producto_id uuid)
returns table (
  producto_id uuid,
  codigo text,
  nombre_interno text,
  precio_venta numeric,
  cantidad numeric,
  cantidad_por_envase numeric,
  nivel int
)
language sql
stable
security invoker
set search_path to ''
as $$
  with recursive arriba as (
    select p.id, p.envase_id, 0 as paso
      from public.producto p
     where p.id = p_producto_id
    union all
    select e.id, e.envase_id, a.paso + 1
      from arriba a
      join public.producto e on e.id = a.envase_id and e.eliminado_en is null
     where a.paso < 5
  ),
  raiz as (
    select a.id from arriba a order by a.paso desc limit 1
  ),
  abajo as (
    select r.id, 0 as nivel from raiz r
    union all
    select h.id, b.nivel + 1
      from abajo b
      join public.producto h on h.envase_id = b.id and h.eliminado_en is null
     where b.nivel < 5
  )
  select p.id, p.codigo, p.nombre_interno, p.precio_venta,
         coalesce(s.cantidad, 0), p.cantidad_por_envase, b.nivel
    from abajo b
    join public.producto p on p.id = b.id
    left join public.stock_saldo s on s.producto_id = p.id
   order by b.nivel;
$$;

grant execute on function public.cadena_de_envases(uuid) to authenticated;
