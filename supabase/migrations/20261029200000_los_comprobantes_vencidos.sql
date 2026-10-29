/*
  ─────────────────────────────────────────────────────────────
  Qué comprobantes vencieron, y de quién

  Fase 03, punto 1, ⑤: la pestaña *Vencidos* en Clientes. La deuda por
  antigüedad ya dice cuánto debe cada uno en cada tramo; lo que no había
  era el detalle —qué factura, cuándo venció, cuánto le queda—, que es lo
  que se tiene a mano para llamar al cliente.

  ─── LA MISMA IMPUTACIÓN QUE EL RESTO ───

  Los pagos y las notas de crédito se descuentan de los cargos más
  viejos primero, igual que en vista_deuda_antiguedad y en
  app.pendientes_de(). Así la suma de esta lista, por cliente, da el
  vencido de la deuda por antigüedad y el que frena en la caja: tres
  pantallas que no pueden decir tres números distintos.

  ─── QUIÉN LA VE ───

  security_invoker: lee la cuenta corriente con los permisos de quien
  consulta, y sin cuentacorriente.ver vuelve vacía.
  ─────────────────────────────────────────────────────────────
*/

create or replace view public.vista_comprobantes_vencidos
with (security_invoker = true) as
with hoy as (
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date as dia
),
cargos as (
  select m.id, m.cliente_id, m.tipo, m.concepto, m.referencia_tipo, m.referencia_id,
         m.ocurrido_en, m.vencimiento, m.importe,
         sum(m.importe) over (partition by m.cliente_id order by m.vencimiento, m.creado_en
                              rows between unbounded preceding and current row) as acumulado
  from public.movimiento_cuenta_corriente m
  where m.importe > 0 and m.vencimiento is not null
),
pagado as (
  select cliente_id, -sum(importe) as total
  from public.movimiento_cuenta_corriente
  where importe < 0
  group by cliente_id
)
select c.id as movimiento_id,
       c.cliente_id,
       cl.nombre,
       cl.telefono,
       c.tipo,
       c.concepto,
       c.referencia_tipo,
       c.referencia_id,
       c.ocurrido_en,
       c.vencimiento,
       c.importe,
       greatest(0::numeric, least(c.importe, c.acumulado - coalesce(p.total, 0))) as pendiente,
       h.dia - c.vencimiento as dias
from cargos c
cross join hoy h
join public.cliente cl on cl.id = c.cliente_id
left join pagado p on p.cliente_id = c.cliente_id
where c.vencimiento < h.dia
  and cl.eliminado_en is null
  and cl.cuenta_corriente
  and c.acumulado - coalesce(p.total, 0) > 0;

comment on view public.vista_comprobantes_vencidos is
  'Cada cargo de cuenta corriente vencido con lo que le queda impago; los pagos se imputan a lo más viejo, como en vista_deuda_antiguedad.';

revoke all on public.vista_comprobantes_vencidos from public, anon;
grant select on public.vista_comprobantes_vencidos to authenticated;
