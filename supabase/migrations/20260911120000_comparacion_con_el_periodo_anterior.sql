-- ═══════════════════════════════════════════════════════════════
-- LA COMPARACIÓN CONTRA EL PERÍODO ANTERIOR
--
-- Punto 9 del alcance: «ventas del día, semana y mes, con comparación
-- contra el período anterior». Los importes ya estaban; faltaba contra
-- qué compararlos. Un número solo no dice nada: $400.000 en el día es
-- una buena noticia o una mala según cuánto se vendió ayer.
--
-- EL MES SE COMPARA POR TRAMO, no contra el mes anterior entero. Si hoy
-- es 11, el mes en curso lleva once días y el anterior tuvo treinta y
-- uno. Contra el mes completo, el mes en curso aparecería en baja todos
-- los meses hasta el día 30. Se compara del 1 al 11 contra el 1 al 11,
-- que es la única lectura que significa algo a mitad de mes.
--
-- LOS DÍAS SIGUEN SIENDO LOS DE OBERÁ, por la misma razón que ya estaba:
-- el servidor vive en UTC y lo cobrado después de las nueve de la noche
-- caería en el día siguiente.
--
-- Se agregan campos y no se toca ninguno de los que ya salían: la
-- pantalla de Inicio los está leyendo en las cuatro máquinas.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.metricas_de_venta(p_ahora timestamp with time zone default now())
returns jsonb
language sql
stable
set search_path to ''
as $function$
with ventana as (
  select
    (p_ahora at time zone 'America/Argentina/Buenos_Aires')::date as hoy,
    (p_ahora at time zone 'America/Argentina/Buenos_Aires')::date - 1 as ayer,
    (p_ahora at time zone 'America/Argentina/Buenos_Aires')::date - 6 as hace_una_semana,
    (p_ahora at time zone 'America/Argentina/Buenos_Aires')::date - 13 as hace_dos_semanas,
    (p_ahora at time zone 'America/Argentina/Buenos_Aires')::date - 7 as fin_semana_anterior,
    date_trunc('month', (p_ahora at time zone 'America/Argentina/Buenos_Aires'))::date
      as primero_del_mes,
    (date_trunc('month', (p_ahora at time zone 'America/Argentina/Buenos_Aires'))
      - interval '1 month')::date as primero_del_mes_anterior
),
tramo as (
  select
    w.*,
    /*
      Hasta qué día del mes anterior se cuenta.

      El `least` está por los días 29, 30 y 31: el 31 de marzo, sumarle
      treinta días al 1 de febrero cae en marzo, y el «mes anterior»
      terminaría incluyendo días del mes en curso. Cuando el mes anterior
      es más corto, se cuenta entero y no más.
    */
    least(
      w.primero_del_mes_anterior + (w.hoy - w.primero_del_mes),
      w.primero_del_mes - 1
    ) as fin_del_tramo_anterior
  from ventana w
),
cobradas as (
  select
    v.total,
    (v.cobrada_en at time zone 'America/Argentina/Buenos_Aires')::date as dia
  from public.venta v, tramo w
  where v.estado = 'cobrada'
    and v.cobrada_en >= (least(w.primero_del_mes_anterior, w.hace_dos_semanas)::timestamp
                          at time zone 'America/Argentina/Buenos_Aires')
    and v.cobrada_en <  ((w.hoy + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
),
totales as (
  select
    (count(*) filter (where c.dia = w.hoy))::integer                    as ventas_hoy,
    coalesce(sum(c.total) filter (where c.dia = w.hoy), 0)              as total_hoy,
    (count(*) filter (where c.dia = w.ayer))::integer                   as ventas_ayer,
    coalesce(sum(c.total) filter (where c.dia = w.ayer), 0)             as total_ayer,

    (count(*) filter (where c.dia >= w.hace_una_semana))::integer       as ventas_semana,
    coalesce(sum(c.total) filter (where c.dia >= w.hace_una_semana), 0) as total_semana,
    (count(*) filter (where c.dia between w.hace_dos_semanas
                                      and w.fin_semana_anterior))::integer
                                                                        as ventas_semana_anterior,
    coalesce(sum(c.total) filter (where c.dia between w.hace_dos_semanas
                                                 and w.fin_semana_anterior), 0)
                                                                        as total_semana_anterior,

    (count(*) filter (where c.dia >= w.primero_del_mes))::integer       as ventas_mes,
    coalesce(sum(c.total) filter (where c.dia >= w.primero_del_mes), 0) as total_mes,
    (count(*) filter (where c.dia between w.primero_del_mes_anterior
                                      and w.fin_del_tramo_anterior))::integer
                                                                        as ventas_mes_anterior,
    coalesce(sum(c.total) filter (where c.dia between w.primero_del_mes_anterior
                                                 and w.fin_del_tramo_anterior), 0)
                                                                        as total_mes_anterior
  from tramo w left join cobradas c on true
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
  'hoy_anterior',    jsonb_build_object('ventas', t.ventas_ayer,
                                        'total', t.total_ayer),
  'semana_anterior', jsonb_build_object('ventas', t.ventas_semana_anterior,
                                        'total', t.total_semana_anterior),
  'mes_anterior',    jsonb_build_object('ventas', t.ventas_mes_anterior,
                                        'total', t.total_mes_anterior),
  -- Contra qué se comparó el mes, para poder escribirlo en la pantalla:
  -- «−12%» sin decir contra qué doce días no se puede discutir con nadie.
  'tramo_del_mes_anterior', jsonb_build_object(
                              'desde', w.primero_del_mes_anterior,
                              'hasta', w.fin_del_tramo_anterior),
  'mas_vendidos',  mv.lista,
  'por_vendedor',  case when app.tiene_permiso('ventas.ver_todas') then pv.lista else '[]'::jsonb end
)
from tramo w, totales t, mas_vendidos mv, por_vendedor pv;
$function$;

comment on function public.metricas_de_venta is
  'Los números de venta de Inicio y Reportes, con su comparación contra el período anterior. El mes se compara por tramo —del 1 al día de hoy— porque contra el mes anterior completo el mes en curso siempre aparecería en baja.';
