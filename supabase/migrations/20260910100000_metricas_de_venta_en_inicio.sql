-- ═══════════════════════════════════════════════════════════════
-- LAS MÉTRICAS DE VENTA DE LA PANTALLA DE INICIO
--
-- Lo último visible que le falta a V1-A: cuánto se vendió hoy, en la
-- semana y en el mes; qué se vendió más; y quién vendió.
--
-- ─── POR QUÉ UNA SOLA FUNCIÓN Y NO CINCO CONSULTAS ───
--
-- Inicio es la primera pantalla que se abre, varias veces por día y en
-- cuatro máquinas. Cinco consultas son cinco viajes al servidor cada vez
-- que alguien entra, y con el enlace del local eso se siente. Acá sale
-- todo en uno.
--
-- ─── EL DÍA ES EL DE OBERÁ, NO EL DEL SERVIDOR ───
--
-- La base guarda los momentos en UTC y el servidor vive en UTC. Sin
-- convertir, todo lo que se cobra después de las 21:00 de Oberá contaría
-- como del día siguiente: el cajero cierra la caja y las ventas de la
-- última hora ya figuran en el total de mañana. Por eso cada momento se
-- pasa a la hora de Argentina ANTES de recortarlo en días.
--
-- ─── QUÉ CUENTA COMO VENTA ───
--
-- Sólo las cobradas, y por el momento en que se cobraron. Un borrador o
-- una venta esperando en la caja todavía no es plata, y una anulada dejó
-- de serlo. Es el mismo criterio con el que el mostrador contesta
-- "¿cuánto hicimos hoy?".
--
-- ─── CADA UNO VE LO SUYO ───
--
-- La función es security invoker, así que las mismas políticas que
-- gobiernan la tabla de ventas gobiernan estos números: quien no tiene
-- 'ventas.ver_todas' ve únicamente las suyas. Para que la pantalla no
-- presente un número propio como si fuera el del local entero, la
-- respuesta dice con qué alcance se calculó.
--
-- ─── EL PARÁMETRO DEL MOMENTO ───
--
-- `p_ahora` existe para poder probar los bordes del día sin esperar a
-- que sean las nueve de la noche. En el uso normal no se pasa nada.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.metricas_de_venta(p_ahora timestamptz default now())
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with ventana as (
  select
    (p_ahora at time zone 'America/Argentina/Buenos_Aires')::date as hoy,
    date_trunc('month', (p_ahora at time zone 'America/Argentina/Buenos_Aires'))::date
      as primero_del_mes,
    ((p_ahora at time zone 'America/Argentina/Buenos_Aires')::date - 6) as hace_una_semana,
    -- Los primeros días de cada mes, "los últimos 7 días" se meten en el
    -- mes anterior. Se trae desde el más viejo de los dos bordes para no
    -- tener que consultar la tabla dos veces.
    least(
      date_trunc('month', (p_ahora at time zone 'America/Argentina/Buenos_Aires'))::date,
      (p_ahora at time zone 'America/Argentina/Buenos_Aires')::date - 6
    ) as desde
),
cobradas as (
  select
    v.total,
    (v.cobrada_en at time zone 'America/Argentina/Buenos_Aires')::date as dia
  from public.venta v, ventana w
  where v.estado = 'cobrada'
    and v.cobrada_en >= (w.desde::timestamp at time zone 'America/Argentina/Buenos_Aires')
    and v.cobrada_en <  ((w.hoy + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
),
totales as (
  select
    (count(*) filter (where c.dia = w.hoy))::integer                        as ventas_hoy,
    coalesce(sum(c.total) filter (where c.dia = w.hoy), 0)                  as total_hoy,
    (count(*) filter (where c.dia >= w.hace_una_semana))::integer           as ventas_semana,
    coalesce(sum(c.total) filter (where c.dia >= w.hace_una_semana), 0)     as total_semana,
    (count(*) filter (where c.dia >= w.primero_del_mes))::integer           as ventas_mes,
    coalesce(sum(c.total) filter (where c.dia >= w.primero_del_mes), 0)     as total_mes
  -- El left join es lo que hace que un mes sin una sola venta devuelva
  -- ceros en vez de ninguna fila, y la pantalla muestre 0 y no un vacío.
  from ventana w left join cobradas c on true
),
mas_vendidos as (
  select coalesce(jsonb_agg(t), '[]'::jsonb) as lista
  from (
    select
      l.codigo_producto as codigo,
      l.descripcion,
      sum(l.cantidad) as cantidad,
      sum(l.importe)  as importe
    from public.venta_linea l
    join public.venta v on v.id = l.venta_id
    cross join ventana w
    where v.estado = 'cobrada'
      and v.cobrada_en >= (w.primero_del_mes::timestamp at time zone 'America/Argentina/Buenos_Aires')
      and v.cobrada_en <  ((w.hoy + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
    -- Se agrupa por la foto de texto de la línea y no por el producto:
    -- así también cuentan las líneas escritas a mano, que no tienen
    -- producto en el catálogo y son ventas igual.
    group by l.codigo_producto, l.descripcion
    order by sum(l.cantidad) desc, sum(l.importe) desc
    limit 5
  ) t
),
por_vendedor as (
  select coalesce(jsonb_agg(t), '[]'::jsonb) as lista
  from (
    select
      u.nombre,
      count(*)::integer as ventas,
      sum(v.total) as total
    from public.venta v
    join public.usuario u on u.id = v.vendedor_id
    cross join ventana w
    where v.estado = 'cobrada'
      and v.cobrada_en >= (w.primero_del_mes::timestamp at time zone 'America/Argentina/Buenos_Aires')
      and v.cobrada_en <  ((w.hoy + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
    group by u.nombre
    order by sum(v.total) desc
  ) t
)
select jsonb_build_object(
  'alcance',       case when app.tiene_permiso('ventas.ver_todas') then 'todo' else 'propio' end,
  'primero_del_mes', w.primero_del_mes,
  'hoy',           jsonb_build_object('ventas', t.ventas_hoy,    'total', t.total_hoy),
  'semana',        jsonb_build_object('ventas', t.ventas_semana, 'total', t.total_semana),
  'mes',           jsonb_build_object('ventas', t.ventas_mes,    'total', t.total_mes),
  'mas_vendidos',  mv.lista,
  -- Quién vendió qué sólo tiene sentido —y sólo se muestra— para quien
  -- ve todas las ventas. Para el resto, la lista viene vacía.
  'por_vendedor',  case when app.tiene_permiso('ventas.ver_todas') then pv.lista else '[]'::jsonb end
)
from ventana w, totales t, mas_vendidos mv, por_vendedor pv;
$$;

comment on function public.metricas_de_venta(timestamptz) is
  'Los números de venta de la pantalla de Inicio: hoy, últimos 7 días y mes en curso, más vendidos y por vendedor. Los días son los de Oberá, no los del servidor en UTC. Respeta las políticas de la tabla de ventas: quien no tiene ventas.ver_todas ve sólo las suyas, y la respuesta lo dice en "alcance".';

grant execute on function public.metricas_de_venta(timestamptz) to authenticated;
