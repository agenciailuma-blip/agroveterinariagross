-- ═══════════════════════════════════════════════════════════════
-- LAS NOTAS DE CRÉDITO Y DEVOLUCIONES DEL TURNO, EN EL CIERRE
--
-- Pedido el 05/11: el cierre del sistema anterior muestra las notas de
-- crédito junto con las facturas y los recibos. Desde la 0.21.0 la
-- planilla tenía las ventas, las cobranzas y los movimientos; faltaba
-- lo que se devolvió.
--
-- Una devolución no queda atada a la caja —se hace desde Facturación,
-- muchas veces de una venta de otro día—, así que se toma lo que pasó
-- mientras la caja estuvo abierta: entre que se abrió y que se cerró.
-- Tres casos:
--   · las notas de crédito, de una devolución parcial o entera;
--   · la devolución parcial de una venta sin factura, que no lleva nota;
--   · la venta cobrada sin factura que se anuló entera.
--
-- Es para mirar: esta lista no suma ni resta en el efectivo. Una venta
-- anulada deja de contar en las ventas de su caja —si era de este
-- turno, el cierre ya no la espera—; en los demás casos, si se le
-- devolvió plata al cliente, sale del cajón como un egreso.
-- ═══════════════════════════════════════════════════════════════

create or replace function app.devoluciones_del_turno(p_caja public.caja)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.ocurrido_en), '[]'::jsonb)
  from (
    select c.creado_en ocurrido_en,
           'nota_credito' tipo,
           tc.descripcion || ' ' || lpad(pv.numero::text, 4, '0') || '-' || lpad(c.numero::text, 8, '0') comprobante,
           c.estado,
           coalesce(cl.nombre, c.receptor_nombre) cliente,
           v.codigo venta,
           c.total importe,
           coalesce(d.motivo, v.motivo_anulacion) motivo,
           d.id is null entera
    from public.comprobante c
    join public.tipo_comprobante tc on tc.id = c.tipo_comprobante_id and tc.familia = 'nota_credito'
    left join public.punto_venta pv on pv.id = c.punto_venta_id
    left join public.cliente cl on cl.id = c.cliente_id
    left join public.venta v on v.id = c.venta_id
    left join public.devolucion d on d.comprobante_id = c.id
    where c.creado_en >= p_caja.abierta_en
      and (p_caja.cerrada_en is null or c.creado_en <= p_caja.cerrada_en)

    union all

    select d.ocurrido_en, 'devolucion', null, null, cl.nombre, v.codigo, d.total, d.motivo, false
    from public.devolucion d
    join public.venta v on v.id = d.venta_id
    left join public.cliente cl on cl.id = v.cliente_id
    where d.comprobante_id is null
      and d.ocurrido_en >= p_caja.abierta_en
      and (p_caja.cerrada_en is null or d.ocurrido_en <= p_caja.cerrada_en)

    union all

    -- Cobrada: tiene pagos. Una venta anulada en la cola nunca se cobró.
    select v.anulada_en, 'anulacion', null, null, cl.nombre, v.codigo, v.total, v.motivo_anulacion, true
    from public.venta v
    left join public.cliente cl on cl.id = v.cliente_id
    where v.estado = 'anulada'
      and v.anulada_en >= p_caja.abierta_en
      and (p_caja.cerrada_en is null or v.anulada_en <= p_caja.cerrada_en)
      and exists (select 1 from public.venta_pago vp where vp.venta_id = v.id)
      and not exists (
        select 1 from public.comprobante c
        join public.tipo_comprobante tc on tc.id = c.tipo_comprobante_id and tc.familia = 'nota_credito'
        where c.venta_id = v.id)
  ) x;
$$;

revoke all on function app.devoluciones_del_turno(public.caja) from public, anon, authenticated;

create or replace function public.resumen_de_caja(p_caja_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caja public.caja;
  v_res  jsonb;
begin
  if not (app.tiene_permiso('caja.cerrar') or app.tiene_permiso('caja.movimientos')) then
    raise exception 'No tenés permiso para ver el cierre de caja.';
  end if;

  select * into v_caja from public.caja where id = p_caja_id;
  if v_caja.id is null then
    raise exception 'La caja no existe.';
  end if;

  select jsonb_build_object(
    'caja', jsonb_build_object(
      'id', v_caja.id,
      'terminal', (select nombre from public.terminal where id = v_caja.terminal_id),
      'cajero', (select nombre from public.usuario where id = v_caja.cajero_id),
      'estado', v_caja.estado,
      'abierta_en', v_caja.abierta_en,
      'cerrada_en', v_caja.cerrada_en,
      'monto_inicial', v_caja.monto_inicial,
      'monto_declarado', v_caja.monto_declarado,
      'monto_esperado', v_caja.monto_esperado,
      'diferencia', v_caja.diferencia),

    'ventas', jsonb_build_object(
      'cantidad', (select count(*) from public.venta where caja_id = p_caja_id and estado = 'cobrada'),
      'total', (select coalesce(sum(total), 0) from public.venta where caja_id = p_caja_id and estado = 'cobrada'),
      'anuladas', (select count(*) from public.venta where caja_id = p_caja_id and estado = 'anulada'),
      'por_medio', coalesce((
        select jsonb_agg(x order by x.orden, x.medio)
        from (
          select mp.nombre medio, mp.orden, mp.afecta_caja, count(distinct v.id) cantidad, sum(vp.importe) importe
          from public.venta v
          join public.venta_pago vp on vp.venta_id = v.id
          join public.medio_pago mp on mp.id = vp.medio_pago_id
          where v.caja_id = p_caja_id and v.estado = 'cobrada'
          group by mp.id, mp.nombre, mp.orden, mp.afecta_caja) x), '[]'::jsonb),
      'por_documentacion', coalesce((
        select jsonb_agg(x order by x.documentacion)
        from (
          select documentacion, count(*) cantidad, sum(total) total
          from public.venta where caja_id = p_caja_id and estado = 'cobrada'
          group by documentacion) x), '[]'::jsonb)),

    'cobranzas', jsonb_build_object(
      'por_medio', coalesce((
        select jsonb_agg(x order by x.orden, x.medio)
        from (
          select mp.nombre medio, mp.orden, count(distinct r.id) cantidad, sum(rp.importe) importe
          from public.recibo r
          join public.recibo_pago rp on rp.recibo_id = r.id
          join public.medio_pago mp on mp.id = rp.medio_pago_id
          where r.caja_id = p_caja_id and r.anulado_en is null
          group by mp.id, mp.nombre, mp.orden) x), '[]'::jsonb),
      'detalle', coalesce((
        select jsonb_agg(x order by x.emitido_en)
        from (
          select r.serie || '-' || lpad(r.numero::text, 8, '0') numero, r.emitido_en, r.total,
                 coalesce(cl.nombre, fp.nombre) cliente, r.anulado_en is not null anulado,
                 (select string_agg(distinct mp.nombre, ', ')
                    from public.recibo_pago rp join public.medio_pago mp on mp.id = rp.medio_pago_id
                   where rp.recibo_id = r.id) medios
          from public.recibo r
          left join public.cliente cl on cl.id = r.cliente_id
          left join public.fiado_persona fp on fp.id = r.fiado_persona_id
          where r.caja_id = p_caja_id) x), '[]'::jsonb)),

    'movimientos', coalesce((
      select jsonb_agg(x order by x.creado_en)
      from (
        select m.id, m.tipo, m.categoria, m.forma, m.importe, m.concepto, m.excluir_del_cierre,
               m.creado_en, m.anulado_en, m.motivo_anulacion,
               u.nombre usuario, e.nombre empleado, pr.nombre proveedor,
               (select coalesce(jsonb_agg(jsonb_build_object(
                         'nombre', app.nombre_del_cheque(c), 'importe', c.importe, 'fecha_pago', c.fecha_pago)
                         order by c.fecha_pago), '[]'::jsonb)
                  from public.pago_proveedor_medio pm join public.cheque c on c.id = pm.cheque_id
                 where pm.pago_id = m.pago_proveedor_id) cheques
        from public.caja_movimiento m
        left join public.usuario u on u.id = m.usuario_id
        left join public.usuario e on e.id = m.empleado_id
        left join public.proveedor pr on pr.id = m.proveedor_id
        where m.caja_id = p_caja_id and m.categoria <> 'sistema') x), '[]'::jsonb),

    'cheques_recibidos', coalesce((
      select jsonb_agg(x order by x.fecha_pago)
      from (
        select app.nombre_del_cheque(c) nombre, c.importe, c.fecha_pago, cl.nombre cliente
        from public.cheque c
        left join public.cliente cl on cl.id = c.cliente_id
        where c.caja_id = p_caja_id
           or c.id in (select rp.cheque_id from public.recibo_pago rp join public.recibo r on r.id = rp.recibo_id
                        where r.caja_id = p_caja_id and r.anulado_en is null)) x), '[]'::jsonb),

    'devoluciones', app.devoluciones_del_turno(v_caja),

    'efectivo', jsonb_build_object(
      'inicial', v_caja.monto_inicial,
      'ventas', (
        select coalesce(sum(vp.importe), 0)
        from public.venta v
        join public.venta_pago vp on vp.venta_id = v.id
        join public.medio_pago mp on mp.id = vp.medio_pago_id
        where v.caja_id = p_caja_id and v.estado = 'cobrada' and mp.afecta_caja),
      'cobranzas', (
        select coalesce(sum(importe), 0) from public.caja_movimiento
        where caja_id = p_caja_id and categoria = 'sistema'),
      'ingresos', (
        select coalesce(sum(importe), 0) from public.caja_movimiento
        where caja_id = p_caja_id and categoria <> 'sistema' and tipo = 'ingreso'
          and forma = 'efectivo' and not excluir_del_cierre and anulado_en is null),
      'egresos', (
        select coalesce(sum(importe), 0) from public.caja_movimiento
        where caja_id = p_caja_id and categoria <> 'sistema' and tipo = 'egreso'
          and forma = 'efectivo' and not excluir_del_cierre and anulado_en is null),
      'esperado', app.efectivo_esperado(p_caja_id))
  ) into v_res;

  -- Mientras está abierta no se muestra lo que espera el sistema: el
  -- arqueo es a ciegas, y este resumen también se ve antes de contar.
  if v_caja.estado = 'abierta' then
    v_res := jsonb_set(v_res, '{efectivo,esperado}', 'null'::jsonb);
  end if;

  return v_res;
end;
$$;

revoke all on function public.resumen_de_caja(uuid) from public, anon;
grant execute on function public.resumen_de_caja(uuid) to authenticated;
