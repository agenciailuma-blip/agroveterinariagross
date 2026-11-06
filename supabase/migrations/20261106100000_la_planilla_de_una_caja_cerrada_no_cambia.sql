-- ═══════════════════════════════════════════════════════════════
-- LA PLANILLA DE UNA CAJA CERRADA NO CAMBIA DESPUÉS
--
-- Visto el 05/11 al sumar las devoluciones: el resumen de una caja se
-- calculaba cada vez que se pedía. Si después de cerrarla se anulaba
-- una de sus ventas, o uno de sus recibos, la planilla impresa otro día
-- mostraba otras ventas y otro efectivo esperado, mientras que lo
-- contado y la diferencia habían quedado guardados. Un papel firmado no
-- puede decir otra cosa la segunda vez que se imprime.
--
-- Ahora, al cerrar, se guarda el resumen tal como quedó. La planilla de
-- una caja cerrada muestra eso, y aparte, lo que cambió después: las
-- ventas y los recibos de ese turno que se anularon más tarde. Así se
-- ve qué pasó sin que cambien los números del arqueo.
--
-- Las cajas cerradas antes de esto no tienen resumen guardado: se
-- calcula como antes, pero el efectivo esperado es el que se guardó al
-- cerrar, y lo que cambió después se lista igual.
-- ═══════════════════════════════════════════════════════════════

alter table public.caja add column if not exists resumen_al_cerrar jsonb;

comment on column public.caja.resumen_al_cerrar is
  'El resumen de la caja en el momento de cerrarla. La planilla de una caja cerrada sale de acá.';

-- ── El resumen, sin la puerta de los permisos ──────────────────────
--
-- Lo usan el resumen que se pide desde la app (que mira los permisos) y
-- el cierre, que lo guarda.

create or replace function app.armar_resumen_de_caja(p_caja_id uuid)
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

  return v_res;
end;
$$;

revoke all on function app.armar_resumen_de_caja(uuid) from public, anon;
grant execute on function app.armar_resumen_de_caja(uuid) to authenticated;

-- ── Lo que cambió después del cierre ───────────────────────────────

create or replace function app.cambios_despues_del_cierre(p_caja public.caja)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.ocurrido_en), '[]'::jsonb)
  from (
    select v.anulada_en ocurrido_en,
           'venta_anulada' tipo,
           v.codigo numero,
           cl.nombre cliente,
           v.total importe,
           (select coalesce(sum(vp.importe), 0)
              from public.venta_pago vp join public.medio_pago mp on mp.id = vp.medio_pago_id
             where vp.venta_id = v.id and mp.afecta_caja) efectivo,
           v.motivo_anulacion motivo
    from public.venta v
    left join public.cliente cl on cl.id = v.cliente_id
    where v.caja_id = p_caja.id
      and v.estado = 'anulada'
      and v.anulada_en > p_caja.cerrada_en

    union all

    select r.anulado_en, 'recibo_anulado',
           r.serie || '-' || lpad(r.numero::text, 8, '0'),
           coalesce(cl.nombre, fp.nombre),
           r.total,
           (select coalesce(sum(rp.importe), 0)
              from public.recibo_pago rp join public.medio_pago mp on mp.id = rp.medio_pago_id
             where rp.recibo_id = r.id and mp.afecta_caja),
           r.motivo_anulacion
    from public.recibo r
    left join public.cliente cl on cl.id = r.cliente_id
    left join public.fiado_persona fp on fp.id = r.fiado_persona_id
    where r.caja_id = p_caja.id
      and r.anulado_en > p_caja.cerrada_en
  ) x
  where p_caja.cerrada_en is not null;
$$;

revoke all on function app.cambios_despues_del_cierre(public.caja) from public, anon, authenticated;

-- ── El resumen que pide la app ─────────────────────────────────────

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

  if v_caja.estado = 'cerrada' and v_caja.resumen_al_cerrar is not null then
    v_res := v_caja.resumen_al_cerrar;
  else
    v_res := app.armar_resumen_de_caja(p_caja_id);
  end if;

  if v_caja.estado = 'abierta' then
    -- El arqueo es a ciegas, y este resumen también se ve antes de contar.
    v_res := jsonb_set(v_res, '{efectivo,esperado}', 'null'::jsonb);
  else
    -- Cerrada sin resumen guardado (de antes de esto): el esperado es el
    -- del arqueo, no uno recalculado.
    if v_caja.resumen_al_cerrar is null then
      v_res := jsonb_set(v_res, '{efectivo,esperado}', to_jsonb(v_caja.monto_esperado));
    end if;
    v_res := v_res || jsonb_build_object(
      'despues_del_cierre', app.cambios_despues_del_cierre(v_caja),
      'guardado_al_cerrar', v_caja.resumen_al_cerrar is not null);
  end if;

  return v_res;
end;
$$;

revoke all on function public.resumen_de_caja(uuid) from public, anon;
grant execute on function public.resumen_de_caja(uuid) to authenticated;

-- ── Cerrar guarda el resumen ───────────────────────────────────────

create or replace function public.cerrar_caja(p_caja_id uuid, p_monto_declarado numeric)
returns table(esperado numeric, declarado numeric, diferencia numeric)
language plpgsql
set search_path = ''
as $$
declare v_caja public.caja; v_esperado numeric;
begin
  select * into v_caja from public.caja where id = p_caja_id for update;
  if v_caja.id is null then raise exception 'La caja no existe.'; end if;
  if v_caja.estado = 'cerrada' then raise exception 'La caja ya esta cerrada.'; end if;

  v_esperado := app.efectivo_esperado(p_caja_id);

  update public.caja
  set estado = 'cerrada', cerrada_en = now(), monto_declarado = p_monto_declarado,
      monto_esperado = v_esperado, diferencia = p_monto_declarado - v_esperado
  where id = p_caja_id;

  -- Después de cerrarla: así el resumen guardado ya trae la hora del
  -- cierre, lo contado y la diferencia.
  update public.caja
  set resumen_al_cerrar = app.armar_resumen_de_caja(p_caja_id)
  where id = p_caja_id;

  esperado := v_esperado; declarado := p_monto_declarado;
  diferencia := p_monto_declarado - v_esperado;
  return next;
end;
$$;
