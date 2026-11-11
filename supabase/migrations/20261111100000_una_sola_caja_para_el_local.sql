-- ═══════════════════════════════════════════════════════════════
-- UNA SOLA CAJA PARA TODO EL LOCAL
--
-- Aprobado por Lucas el 11/11: se vende y se cobra desde cualquier
-- puesto, en la misma pantalla. La plata está en un solo cajón, así que
-- hay una sola caja abierta para todo el local y todos los puestos
-- cobran contra ella. El encargado la abre y la cierra con su PIN.
--
-- Hasta acá había una caja abierta por terminal. Ahora:
--
-- · Una sola caja abierta a la vez. `terminal_id` queda como la PC
--   donde se abrió: de ahí sale el punto de venta con que se factura
--   (ver generar_comprobante), igual que antes.
--
-- · Abrir y cerrar se hacen con el PIN de quien tiene permiso, no con
--   el usuario con que está abierta la sesión: el local entra con un
--   solo usuario para vender y cobrar, y quién hizo cada cosa lo dice
--   el PIN. Queda anotado quién abrió (cajero_id) y quién cerró
--   (cerrada_por).
--
-- · El resumen de la caja abierta lo puede ver quien cobra. Con la caja
--   abierta no dice el efectivo esperado, así que no rompe el conteo a
--   ciegas del cierre.
--
-- Cuando abra el segundo local, la regla pasa a ser una caja abierta por
-- local; hoy hay uno.
-- ═══════════════════════════════════════════════════════════════

-- La regla de una sola caja abierta va aparte, en
-- 20261111100100_una_sola_caja_abierta.sql: se aplica el día que se
-- publica la versión, porque con la versión anterior cada caja abre la
-- suya y la Caja 2 no podría abrir.

alter table public.caja
  add column if not exists cerrada_por uuid references public.usuario(id) on delete set null;

comment on column public.caja.terminal_id is
  'La PC donde se abrió la caja. De su punto de venta salen las facturas. La caja es una sola para todo el local.';
comment on column public.caja.cajero_id is 'Quien abrió la caja, identificado con su PIN.';
comment on column public.caja.cerrada_por is 'Quien cerró la caja, identificado con su PIN.';

-- ── El resumen: quién cerró y lo cobrado por cada uno ──────────────

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
      'cerro', (select nombre from public.usuario where id = v_caja.cerrada_por),
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
      -- Una caja para todos los puestos: quién cobró cada cosa, y cuánto
      -- de eso fue efectivo, que es lo que tiene que estar en el cajón.
      'por_cajero', coalesce((
        select jsonb_agg(x order by x.total desc)
        from (
          select coalesce(u.nombre, 'Sin nombre') cajero, count(*) cantidad, sum(v.total) total,
                 coalesce(sum((select sum(vp.importe)
                                 from public.venta_pago vp join public.medio_pago mp on mp.id = vp.medio_pago_id
                                where vp.venta_id = v.id and mp.afecta_caja)), 0) efectivo
          from public.venta v
          left join public.usuario u on u.id = v.cajero_id
          where v.caja_id = p_caja_id and v.estado = 'cobrada'
          group by u.nombre) x), '[]'::jsonb),
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

-- ── El resumen que pide la app, también para quien cobra ───────────

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
  -- Quien cobra también lo ve: el local entra con un solo usuario y el
  -- cierre lo hace el encargado con su PIN. Con la caja abierta no dice
  -- el efectivo esperado.
  if not (app.tiene_permiso('caja.cerrar') or app.tiene_permiso('caja.movimientos')
          or app.tiene_permiso('ventas.cobrar')) then
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

-- ── Abrir, con el PIN del encargado ────────────────────────────────

create or replace function public.abrir_caja(
  p_terminal_id   uuid,
  p_monto_inicial numeric,
  p_pin           text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op      record;
  v_abierta public.caja;
  v_caja    public.caja;
begin
  if not app.tiene_permiso('ventas.cobrar') then
    return json_build_object('ok', false, 'error', 'Este usuario no puede cobrar, y por eso no puede abrir la caja.');
  end if;

  select o.usuario_id, o.nombre into v_op from public.verificar_pin(btrim(coalesce(p_pin, ''))) o;
  if v_op.usuario_id is null then
    return json_build_object('ok', false, 'error', 'El PIN no es correcto.');
  end if;
  if not app.usuario_tiene_permiso(v_op.usuario_id, 'caja.abrir') then
    return json_build_object('ok', false, 'error', 'Ese PIN es de alguien que no puede abrir la caja.');
  end if;
  if coalesce(p_monto_inicial, 0) < 0 then
    return json_build_object('ok', false, 'error', 'El monto inicial no puede ser negativo.');
  end if;

  select * into v_abierta from public.caja where estado = 'abierta' limit 1;
  if v_abierta.id is not null then
    return json_build_object('ok', false, 'error',
      format('La caja ya está abierta: la abrió %s el %s.',
        coalesce((select nombre from public.usuario where id = v_abierta.cajero_id), 'alguien'),
        to_char(v_abierta.abierta_en at time zone 'America/Argentina/Buenos_Aires', 'DD/MM "a las" HH24:MI')));
  end if;

  insert into public.caja (terminal_id, cajero_id, monto_inicial)
  values (p_terminal_id, v_op.usuario_id, coalesce(p_monto_inicial, 0))
  returning * into v_caja;

  return json_build_object('ok', true, 'caja', json_build_object(
    'id', v_caja.id, 'terminal_id', v_caja.terminal_id, 'cajero_id', v_caja.cajero_id,
    'estado', v_caja.estado, 'monto_inicial', v_caja.monto_inicial, 'abierta_en', v_caja.abierta_en));
exception
  when unique_violation then
    return json_build_object('ok', false, 'error', 'La caja ya está abierta: la acaba de abrir otro puesto.');
end;
$$;

-- ── Cerrar, con el PIN del encargado ───────────────────────────────

create or replace function public.cerrar_caja_con_pin(
  p_caja_id          uuid,
  p_monto_declarado  numeric,
  p_pin              text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op  record;
  v_res record;
begin
  if not app.tiene_permiso('ventas.cobrar') then
    return json_build_object('ok', false, 'error', 'Este usuario no puede cobrar, y por eso no puede cerrar la caja.');
  end if;

  select o.usuario_id, o.nombre into v_op from public.verificar_pin(btrim(coalesce(p_pin, ''))) o;
  if v_op.usuario_id is null then
    return json_build_object('ok', false, 'error', 'El PIN no es correcto.');
  end if;
  if not app.usuario_tiene_permiso(v_op.usuario_id, 'caja.cerrar') then
    return json_build_object('ok', false, 'error', 'Ese PIN es de alguien que no puede cerrar la caja.');
  end if;

  -- El cierre de siempre: lo esperado, la diferencia y el resumen guardado.
  select * into v_res from public.cerrar_caja(p_caja_id, p_monto_declarado);

  update public.caja set cerrada_por = v_op.usuario_id where id = p_caja_id;
  -- El resumen se guardó antes de anotar quién cerró: se vuelve a guardar con el nombre.
  update public.caja set resumen_al_cerrar = app.armar_resumen_de_caja(p_caja_id) where id = p_caja_id;

  return json_build_object('ok', true, 'esperado', v_res.esperado, 'declarado', v_res.declarado,
    'diferencia', v_res.diferencia, 'cerro', v_op.nombre);
end;
$$;

revoke all on function public.abrir_caja(uuid, numeric, text) from public, anon;
revoke all on function public.cerrar_caja_con_pin(uuid, numeric, text) from public, anon;
grant execute on function public.abrir_caja(uuid, numeric, text) to authenticated;
grant execute on function public.cerrar_caja_con_pin(uuid, numeric, text) to authenticated;
