/*
  ─────────────────────────────────────────────────────────────
  Las estadísticas del mayorista

  Fase 03, punto 5.5. Lucas: «estadística de todo, no te preocupes
  ahora, lo vamos viendo». Va un tablero con los cortes que nombró —
  cliente, ciudad, ruta y zona— y, para cada uno: lo vendido, los
  pedidos, la deuda y lo vencido hoy, cuánto de lo cargado a cuenta ya
  se cobró, el último pedido y lo más vendido.

  La base devuelve cada cliente mayorista con sus números y lo vendido
  de cada producto a cada cliente; la pantalla los junta por el corte
  que se elija. Son decenas de clientes, no miles: sumar en la pantalla
  deja cambiar de corte sin volver a preguntar.

  ─── QUÉ ES CADA NÚMERO ───

  · Vendido: las ventas cobradas del período —en el mostrador o por
    pedido, a cuenta o al contado—, menos las devoluciones.
  · Cobrado: de lo que se le cargó a la cuenta en el período, cuánto ya
    está pagado. Los pagos van a lo más viejo primero, como en la cuenta
    corriente.
  · Deuda y vencido: hoy, los mismos de la cuenta corriente.
  ─────────────────────────────────────────────────────────────
*/
create or replace function public.mayorista_estadisticas(p_desde date, p_hasta date)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'America/Argentina/Buenos_Aires';
begin
  if not (app.tiene_permiso('mayorista.atender') or app.tiene_permiso('reportes.ver')) then
    raise exception 'No tenés permiso para ver las estadísticas del mayorista.';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período no se entiende.';
  end if;

  return json_build_object(
    'clientes', coalesce((
      with may as (
        select c.id, c.nombre, c.nombre_fantasia, c.localidad, c.ruta, c.zona
        from public.cliente c
        where c.mayorista and c.eliminado_en is null
      ),
      ventas as (
        select v.cliente_id, sum(v.total) as vendido, count(*) as ventas
        from public.venta v
        join may on may.id = v.cliente_id
        where v.estado = 'cobrada'
          and (coalesce(v.cobrada_en, v.ocurrido_en) at time zone v_tz)::date between p_desde and p_hasta
        group by v.cliente_id
      ),
      devuelto as (
        select v.cliente_id, sum(d.total) as devuelto
        from public.devolucion d
        join public.venta v on v.id = d.venta_id
        join may on may.id = v.cliente_id
        where (d.ocurrido_en at time zone v_tz)::date between p_desde and p_hasta
        group by v.cliente_id
      ),
      unidades as (
        select v.cliente_id, sum(l.cantidad) as unidades
        from public.venta v
        join may on may.id = v.cliente_id
        join public.venta_linea l on l.venta_id = v.id
        where v.estado = 'cobrada' and l.producto_id is not null
          and (coalesce(v.cobrada_en, v.ocurrido_en) at time zone v_tz)::date between p_desde and p_hasta
        group by v.cliente_id
      ),
      pedidos as (
        select pm.cliente_id, count(*) as pedidos
        from public.pedido_mayorista pm
        join may on may.id = pm.cliente_id
        where pm.estado <> 'cancelado'
          and (pm.recibido_en at time zone v_tz)::date between p_desde and p_hasta
        group by pm.cliente_id
      ),
      ultimo as (
        select distinct on (pm.cliente_id) pm.cliente_id, pm.recibido_en, pm.numero
        from public.pedido_mayorista pm
        join may on may.id = pm.cliente_id
        where pm.estado <> 'cancelado'
        order by pm.cliente_id, pm.recibido_en desc
      ),
      -- Lo cargado a la cuenta y cuánto queda de cada cargo: lo pagado va a lo más viejo.
      cargos as (
        select m.cliente_id, m.importe, m.ocurrido_en,
               sum(m.importe) over (partition by m.cliente_id order by m.vencimiento, m.creado_en
                                    rows between unbounded preceding and current row) as acumulado
        from public.movimiento_cuenta_corriente m
        join may on may.id = m.cliente_id
        where m.importe > 0 and m.vencimiento is not null
      ),
      pagado as (
        select m.cliente_id, -sum(m.importe) as total
        from public.movimiento_cuenta_corriente m
        join may on may.id = m.cliente_id
        where m.importe < 0
        group by m.cliente_id
      ),
      cuenta as (
        select c.cliente_id,
               sum(c.importe) as cargado,
               sum(greatest(0, least(c.importe, c.acumulado - coalesce(p.total, 0)))) as pendiente
        from cargos c
        left join pagado p on p.cliente_id = c.cliente_id
        where (c.ocurrido_en at time zone v_tz)::date between p_desde and p_hasta
        group by c.cliente_id
      )
      select json_agg(json_build_object(
               'cliente_id', may.id, 'nombre', may.nombre, 'nombre_fantasia', may.nombre_fantasia,
               'localidad', may.localidad, 'ruta', may.ruta, 'zona', may.zona,
               'vendido', coalesce(ve.vendido, 0) - coalesce(de.devuelto, 0),
               'ventas', coalesce(ve.ventas, 0),
               'unidades', coalesce(un.unidades, 0),
               'pedidos', coalesce(pe.pedidos, 0),
               'cargado', coalesce(cu.cargado, 0),
               'pendiente', coalesce(cu.pendiente, 0),
               'saldo', coalesce(d.saldo, 0),
               'vencido', coalesce(d.vencido_30 + d.vencido_60 + d.vencido_mas_60, 0),
               'vencido_desde', d.vencimiento_mas_antiguo,
               'ultimo_pedido_en', ul.recibido_en,
               'ultimo_pedido_numero', ul.numero)
             order by may.nombre)
      from may
      left join ventas ve on ve.cliente_id = may.id
      left join devuelto de on de.cliente_id = may.id
      left join unidades un on un.cliente_id = may.id
      left join pedidos pe on pe.cliente_id = may.id
      left join ultimo ul on ul.cliente_id = may.id
      left join cuenta cu on cu.cliente_id = may.id
      left join public.vista_deuda_antiguedad d on d.cliente_id = may.id
    ), '[]'::json),

    -- Lo vendido de cada producto a cada cliente: la pantalla arma «lo más vendido» del corte elegido.
    'productos', coalesce((
      select json_agg(json_build_object(
               'cliente_id', x.cliente_id, 'producto_id', x.producto_id,
               'codigo', x.codigo, 'nombre', x.nombre,
               'unidades', x.unidades, 'vendido', x.vendido))
      from (
        select v.cliente_id, l.producto_id, p.codigo, p.nombre_interno as nombre,
               sum(l.cantidad) as unidades, sum(l.importe) as vendido
        from public.venta v
        join public.cliente c on c.id = v.cliente_id and c.mayorista and c.eliminado_en is null
        join public.venta_linea l on l.venta_id = v.id
        join public.producto p on p.id = l.producto_id
        where v.estado = 'cobrada'
          and (coalesce(v.cobrada_en, v.ocurrido_en) at time zone v_tz)::date between p_desde and p_hasta
        group by v.cliente_id, l.producto_id, p.codigo, p.nombre_interno
      ) x
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.mayorista_estadisticas(date, date) from public, anon;
grant execute on function public.mayorista_estadisticas(date, date) to authenticated, service_role;
