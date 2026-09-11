-- ═══════════════════════════════════════════════════════════════
-- LA DEUDA VENCIDA TIENE QUE DESCONTAR LO QUE YA PAGARON
--
-- `vista_deuda_antiguedad` existía desde el principio y no la miraba
-- nadie: se construyó con la cuenta corriente y ninguna pantalla la
-- llegó a usar. Al ir a ponerla en Reportes aparecieron los números
-- mal.
--
-- QUÉ ESTABA MAL. Los tramos de vencido sumaban las facturas y no
-- restaban las cobranzas: el `join` traía sólo los movimientos con
-- `importe > 0`, y los pagos son negativos. Un cliente que debía
-- $281.600 y pagó los $281.600 seguía figurando con $281.600 vencidos,
-- con saldo cero en la misma fila. La pantalla habría mandado a Gross a
-- reclamarle plata a alguien que no debe nada.
--
-- CÓMO SE IMPUTA. Los pagos de esta cuenta corriente no se aplican a
-- una factura concreta —se cobra contra el saldo, que es como trabaja
-- el mostrador—, así que hay que decidir a qué deuda corresponden. Se
-- aplican a la más vieja primero, que es lo que hace cualquier cuenta
-- corriente y lo que espera un contador. El que paga, paga lo que debe
-- desde hace más tiempo.
--
-- EL DÍA ES EL DE OBERÁ y no el del servidor, que vive en UTC. Con
-- `current_date`, a partir de las nueve de la noche una factura que
-- vence mañana ya aparecía vencida.
-- ═══════════════════════════════════════════════════════════════

create or replace view public.vista_deuda_antiguedad
with (security_invoker = true) as
with hoy as (
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date as dia
),
cargos as (
  select
    m.cliente_id,
    m.vencimiento,
    m.importe,
    /*
      Cuánto se había facturado hasta este cargo, contando desde el más
      viejo. Es lo que permite saber, más abajo, si el dinero cobrado
      alcanzó a cubrirlo: si lo pagado supera este acumulado, este cargo
      ya está saldado entero.
    */
    sum(m.importe) over (
      partition by m.cliente_id
      order by m.vencimiento, m.creado_en
      rows between unbounded preceding and current row
    ) as acumulado
  from public.movimiento_cuenta_corriente m
  where m.importe > 0 and m.vencimiento is not null
),
pagado as (
  -- Todo lo que redujo la deuda: cobranzas y también notas de crédito,
  -- que para la cuenta del cliente son lo mismo.
  select cliente_id, -sum(importe) as total
  from public.movimiento_cuenta_corriente
  where importe < 0
  group by cliente_id
),
vivo as (
  select
    c.cliente_id,
    c.vencimiento,
    /*
      Lo que queda sin pagar de este cargo.

      Los dos extremos importan: `least` contra el importe evita que un
      cliente que pagó de más deje un cargo "más grande que él mismo", y
      `greatest` contra cero evita que un cargo ya saldado reste de los
      que vienen después y le baje la deuda a un vencimiento que sigue
      impago.
    */
    greatest(0::numeric, least(c.importe, c.acumulado - coalesce(p.total, 0))) as pendiente
  from cargos c
  left join pagado p on p.cliente_id = c.cliente_id
)
select
  cl.id as cliente_id,
  cl.nombre,
  cl.telefono,
  coalesce(s.saldo, 0::numeric) as saldo,
  cl.limite_credito,
  coalesce(sum(v.pendiente) filter (where v.vencimiento >= h.dia), 0::numeric) as por_vencer,
  coalesce(sum(v.pendiente) filter (
    where v.vencimiento < h.dia and v.vencimiento >= h.dia - 30), 0::numeric) as vencido_30,
  coalesce(sum(v.pendiente) filter (
    where v.vencimiento < h.dia - 30 and v.vencimiento >= h.dia - 60), 0::numeric) as vencido_60,
  coalesce(sum(v.pendiente) filter (
    where v.vencimiento < h.dia - 60), 0::numeric) as vencido_mas_60,
  -- Sólo cuenta como "lo más viejo que debe" algo que todavía debe:
  -- antes salía la fecha de una factura ya cobrada.
  min(v.vencimiento) filter (
    where v.vencimiento < h.dia and v.pendiente > 0) as vencimiento_mas_antiguo
from public.cliente cl
cross join hoy h
left join public.cuenta_corriente_saldo s on s.cliente_id = cl.id
left join vivo v on v.cliente_id = cl.id
where cl.eliminado_en is null and cl.cuenta_corriente
group by cl.id, cl.nombre, cl.telefono, s.saldo, cl.limite_credito;

comment on view public.vista_deuda_antiguedad is
  'Cuánto debe cada cliente y desde hace cuánto, con los pagos ya descontados de las facturas más viejas. La suma de los tramos da el saldo: si no da, hay un movimiento sin vencimiento.';
