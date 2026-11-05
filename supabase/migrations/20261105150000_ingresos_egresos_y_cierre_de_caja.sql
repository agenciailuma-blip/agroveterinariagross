-- ═══════════════════════════════════════════════════════════════
-- INGRESOS, EGRESOS Y EL CIERRE DE CAJA
--
-- Pedido en la reunión del 05/11, con las pantallas del sistema
-- anterior a la vista:
--
-- · Ingreso a caja: plata que entra al cajón sin ser una venta. Puede
--   ser el saldo de la caja anterior.
-- · Egreso de caja: gastos autorizados, anticipos de haberes (a un
--   empleado), pagos a proveedores o acreedores, y retiros de los
--   socios. En efectivo, o con cheques de la cartera.
-- · "No incluir en el cierre": el movimiento queda anotado pero no
--   cuenta para el efectivo que tiene que haber en el cajón.
-- · El cierre, abierto por cada medio de pago, y la planilla impresa.
--
-- Un pago a un proveedor hecho desde la caja también queda en la cuenta
-- del proveedor: es el mismo pago que se carga en Proveedores, a cuenta,
-- y desde ahí se imputa a las facturas. Si no, la deuda seguiría
-- figurando aunque la plata ya salió del cajón. Sin proveedor elegido es
-- un acreedor cualquiera, y sólo sale de la caja.
--
-- Los cheques salen sólo en un pago a un proveedor: es el único destino
-- que la cartera sabe registrar (endosado, con a quién). Un cheque que
-- se lleva un socio se deposita o se endosa desde Cheques.
-- ═══════════════════════════════════════════════════════════════

insert into public.permiso (clave, grupo, descripcion, orden) values
  ('caja.movimientos', 'Caja', 'Registrar ingresos y egresos de caja', 315)
on conflict (clave) do nothing;

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, 'caja.movimientos'
from public.rol r
where r.nombre in ('Administrador', 'Encargado', 'Cajero') and r.eliminado_en is null
on conflict do nothing;

-- ── Los movimientos, con categoría ──────────────────────────────
--
-- Los que ya existían los deja el sistema: la cobranza en efectivo, el
-- cobro de un fiado, la anulación de un recibo. Esos quedan como
-- 'sistema' y no se cargan ni se anulan a mano.

alter table public.caja_movimiento
  add column categoria          text not null default 'sistema',
  add column forma              text not null default 'efectivo',
  add column excluir_del_cierre boolean not null default false,
  add column empleado_id        uuid references public.usuario(id),
  add column proveedor_id       uuid references public.proveedor(id),
  add column pago_proveedor_id  uuid references public.pago_proveedor(id),
  add column anulado_en         timestamptz,
  add column anulado_por        uuid references public.usuario(id),
  add column motivo_anulacion   text,
  add constraint caja_movimiento_categoria check (
    categoria = 'sistema'
    or (tipo = 'ingreso' and categoria in ('ingreso', 'saldo_anterior'))
    or (tipo = 'egreso' and categoria in ('gasto', 'anticipo_haberes', 'pago_proveedor', 'retiro_socios'))),
  add constraint caja_movimiento_forma check (forma in ('efectivo', 'cheques')),
  add constraint caja_movimiento_cheques_a_proveedor check (forma = 'efectivo' or pago_proveedor_id is not null),
  add constraint caja_movimiento_anticipo_con_empleado check (categoria <> 'anticipo_haberes' or empleado_id is not null),
  add constraint caja_movimiento_anulado_con_motivo check (anulado_en is null or motivo_anulacion is not null);

-- ── El recibo sabe en qué caja se cobró ─────────────────────────
--
-- Hasta ahora sólo el efectivo dejaba rastro en la caja. Para que el
-- cierre muestre también lo cobrado con transferencia o con cheques, el
-- recibo guarda la caja abierta de la terminal que lo emitió.

alter table public.recibo add column caja_id uuid references public.caja(id);
create index if not exists recibo_caja_idx on public.recibo (caja_id) where caja_id is not null;
create index if not exists caja_movimiento_caja_idx on public.caja_movimiento (caja_id);

-- Los anteriores, hasta donde se puede saber: el fiado guardaba la caja,
-- y la cobranza en efectivo la nombra en el concepto del movimiento.
update public.recibo r set caja_id = fp.caja_id
from public.recibo_pago rp
join public.fiado_pago fp on fp.id = rp.fiado_pago_id
where rp.recibo_id = r.id and fp.caja_id is not null and r.caja_id is null;

update public.recibo r set caja_id = m.caja_id
from public.caja_movimiento m
where r.caja_id is null
  and m.tipo = 'ingreso'
  and m.concepto like '%Recibo ' || r.serie || '-' || lpad(r.numero::text, 8, '0') || '%';

-- ── El efectivo que tiene que haber ─────────────────────────────
--
-- Una sola cuenta para el cierre y para la planilla: si fueran dos,
-- tarde o temprano dirían números distintos.

create or replace function app.efectivo_esperado(p_caja_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select c.monto_inicial
    + coalesce((
        select sum(vp.importe)
        from public.venta v
        join public.venta_pago vp on vp.venta_id = v.id
        join public.medio_pago mp on mp.id = vp.medio_pago_id
        where v.caja_id = c.id and v.estado = 'cobrada' and mp.afecta_caja), 0)
    + coalesce((
        select sum(m.importe)
        from public.caja_movimiento m
        where m.caja_id = c.id
          and m.forma = 'efectivo'
          and not m.excluir_del_cierre
          and m.anulado_en is null), 0)
  from public.caja c
  where c.id = p_caja_id
$$;

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

  esperado := v_esperado; declarado := p_monto_declarado;
  diferencia := p_monto_declarado - v_esperado;
  return next;
end;
$$;

-- ── Registrar un ingreso o un egreso ────────────────────────────

create or replace function public.registrar_movimiento_caja(
  p_id           uuid,
  p_caja_id      uuid,
  p_categoria    text,
  p_importe      numeric,
  p_concepto     text default null,
  p_excluir      boolean default false,
  p_empleado_id  uuid default null,
  p_proveedor_id uuid default null,
  p_cheques      uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo      text;
  v_estado    text;
  v_importe   numeric(14, 2);
  v_concepto  text := nullif(btrim(coalesce(p_concepto, '')), '');
  v_empleado  text;
  v_proveedor text;
  v_pago      uuid;
  v_medios    jsonb;
  v_cheques   uuid[] := coalesce(p_cheques, '{}');
begin
  if not app.tiene_permiso('caja.movimientos') then
    raise exception 'No tenés permiso para registrar ingresos y egresos de caja.';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador del movimiento.';
  end if;

  -- Si la respuesta se perdió y se vuelve a mandar, no se carga dos veces.
  if exists (select 1 from public.caja_movimiento where id = p_id) then
    return p_id;
  end if;

  v_tipo := case
    when p_categoria in ('ingreso', 'saldo_anterior') then 'ingreso'
    when p_categoria in ('gasto', 'anticipo_haberes', 'pago_proveedor', 'retiro_socios') then 'egreso'
  end;
  if v_tipo is null then
    raise exception 'No se reconoce el tipo de movimiento.';
  end if;

  select estado into v_estado from public.caja where id = p_caja_id for update;
  if v_estado is null then
    raise exception 'La caja no existe.';
  end if;
  if v_estado <> 'abierta' then
    raise exception 'La caja está cerrada.';
  end if;

  if array_length(v_cheques, 1) > 0 then
    if p_categoria <> 'pago_proveedor' or p_proveedor_id is null then
      raise exception 'Con cheques sólo se paga a un proveedor: elegí cuál.';
    end if;
    select sum(importe) into v_importe from public.cheque where id = any(v_cheques);
  else
    v_importe := round(p_importe, 2);
  end if;
  if v_importe is null or v_importe <= 0 then
    raise exception 'El importe tiene que ser mayor que cero.';
  end if;

  if p_categoria = 'anticipo_haberes' then
    select nombre into v_empleado from public.usuario where id = p_empleado_id and eliminado_en is null;
    if v_empleado is null then
      raise exception 'Un anticipo de haberes es para un empleado: elegí a quién.';
    end if;
  end if;

  if p_categoria in ('ingreso', 'gasto') and coalesce(length(v_concepto), 0) < 3 then
    raise exception 'Escribí de qué es: queda en la planilla y alguien lo va a leer.';
  end if;

  -- El pago al proveedor, igual que si se cargara en Proveedores: a
  -- cuenta, y los cheques de la cartera endosados.
  if p_categoria = 'pago_proveedor' and p_proveedor_id is not null then
    select nombre into v_proveedor from public.proveedor where id = p_proveedor_id and eliminado_en is null;
    if array_length(v_cheques, 1) > 0 then
      select jsonb_agg(jsonb_build_object('medio', 'cheque_tercero', 'cheque_id', c.id, 'importe', c.importe))
      into v_medios
      from public.cheque c where c.id = any(v_cheques);
    else
      v_medios := jsonb_build_array(jsonb_build_object('medio', 'efectivo', 'importe', v_importe));
    end if;
    v_pago := public.registrar_pago_proveedor(
      p_proveedor_id, app.hoy_en_obera(), v_medios, '[]'::jsonb,
      'Pagado desde la caja' || coalesce(' — ' || v_concepto, ''));
  end if;

  v_concepto := coalesce(
    case p_categoria
      when 'anticipo_haberes' then 'Anticipo de haberes — ' || v_empleado || coalesce(' · ' || v_concepto, '')
      when 'pago_proveedor' then
        case when v_proveedor is not null then 'Pago a ' || v_proveedor || coalesce(' · ' || v_concepto, '') end
      else v_concepto
    end,
    v_concepto,
    case p_categoria
      when 'saldo_anterior' then 'Saldo de caja anterior'
      when 'retiro_socios' then 'Retiro de socios'
      when 'pago_proveedor' then 'Pago a acreedor'
    end);

  insert into public.caja_movimiento (
    id, caja_id, tipo, importe, concepto, usuario_id,
    categoria, forma, excluir_del_cierre, empleado_id, proveedor_id, pago_proveedor_id)
  values (
    p_id, p_caja_id, v_tipo, case when v_tipo = 'egreso' then -v_importe else v_importe end,
    v_concepto, app.usuario_actual_id(),
    p_categoria, case when array_length(v_cheques, 1) > 0 then 'cheques' else 'efectivo' end,
    coalesce(p_excluir, false),
    case when p_categoria = 'anticipo_haberes' then p_empleado_id end,
    case when p_categoria = 'pago_proveedor' then p_proveedor_id end,
    v_pago);

  return p_id;
end;
$$;

revoke all on function public.registrar_movimiento_caja(uuid, uuid, text, numeric, text, boolean, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.registrar_movimiento_caja(uuid, uuid, text, numeric, text, boolean, uuid, uuid, uuid[]) to authenticated;

-- ── Anular uno ──────────────────────────────────────────────────
--
-- Sólo con la caja abierta: el cierre de una caja cerrada ya está
-- contado y firmado. Si era un pago a un proveedor, también se anula el
-- pago y los cheques vuelven a la cartera.

create or replace function public.anular_movimiento_caja(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov    public.caja_movimiento;
  v_estado text;
begin
  if not app.tiene_permiso('caja.movimientos') then
    raise exception 'No tenés permiso para anular ingresos y egresos de caja.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Para anular un movimiento hay que decir por qué.';
  end if;

  select * into v_mov from public.caja_movimiento where id = p_id for update;
  if v_mov.id is null or v_mov.anulado_en is not null then
    raise exception 'Ese movimiento no existe o ya estaba anulado.';
  end if;
  if v_mov.categoria = 'sistema' then
    raise exception 'Ese movimiento lo dejó una cobranza: se anula anulando el recibo.';
  end if;

  select estado into v_estado from public.caja where id = v_mov.caja_id;
  if v_estado <> 'abierta' then
    raise exception 'La caja de ese movimiento ya se cerró.';
  end if;

  update public.caja_movimiento
     set anulado_en = now(), anulado_por = app.usuario_actual_id(), motivo_anulacion = btrim(p_motivo)
   where id = p_id;

  if v_mov.pago_proveedor_id is not null
     and exists (select 1 from public.pago_proveedor where id = v_mov.pago_proveedor_id and anulado_en is null) then
    perform public.anular_pago_proveedor(v_mov.pago_proveedor_id, btrim(p_motivo));
  end if;
end;
$$;

revoke all on function public.anular_movimiento_caja(uuid, text) from public, anon;
grant execute on function public.anular_movimiento_caja(uuid, text) to authenticated;

/*
  Si el pago se anula desde Proveedores y la caja sigue abierta, la plata
  vuelve al cajón: el egreso también se anula. Con la caja ya cerrada el
  egreso queda como estaba, porque ese día la plata sí salió.
*/
create or replace function app.al_anular_pago_proveedor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.caja_movimiento m
     set anulado_en = now(), anulado_por = new.anulado_por,
         motivo_anulacion = coalesce(new.motivo_anulacion, 'Se anuló el pago al proveedor')
   where m.pago_proveedor_id = new.id
     and m.anulado_en is null
     and exists (select 1 from public.caja c where c.id = m.caja_id and c.estado = 'abierta');
  return new;
end;
$$;

create trigger pago_proveedor_anulado
after update of anulado_en on public.pago_proveedor
for each row when (old.anulado_en is null and new.anulado_en is not null)
execute function app.al_anular_pago_proveedor();

-- ── El resumen de una caja: para el cierre y la planilla ────────

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

-- ── El recibo guarda la caja ────────────────────────────────────
--
-- Sólo si está abierta: un recibo no puede aparecer después en el
-- cierre de una caja que ya se contó.

create or replace function public.emitir_recibo(p_id uuid, p_cliente_id uuid, p_medio_pago_id uuid, p_importe numeric DEFAULT NULL::numeric, p_cheques jsonb DEFAULT NULL::jsonb, p_caja_id uuid DEFAULT NULL::uuid, p_concepto text DEFAULT NULL::text, p_orden_id uuid DEFAULT NULL::uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existente public.recibo;
  v_orden     public.orden_recibo;
  v_medio     public.medio_pago;
  v_usuario   uuid := app.usuario_actual_id();
  v_serie     text := '0001';
  v_numero    bigint;
  v_texto     text;
  v_concepto  text;
  v_mov       uuid;
  v_cheques   uuid[];
  v_total     numeric(14, 2);
  v_orden_n   smallint := 0;
  v_cheque    public.cheque;
begin
  if not app.tiene_permiso('cuentacorriente.cobrar') then
    raise exception 'No tenés permiso para registrar cobranzas.';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador del recibo.';
  end if;

  select * into v_existente from public.recibo where id = p_id;
  if v_existente.id is not null then
    return json_build_object('id', v_existente.id, 'serie', v_existente.serie,
                             'numero', v_existente.numero, 'total', v_existente.total, 'repetido', true);
  end if;

  select * into v_medio from public.medio_pago
  where id = p_medio_pago_id and eliminado_en is null and activo;
  if v_medio.id is null then
    raise exception 'El medio de pago no existe o está inactivo.';
  end if;

  if p_orden_id is not null then
    select * into v_orden from public.orden_recibo where id = p_orden_id for update;
    if v_orden.id is null then
      raise exception 'La orden de recibo no existe.';
    end if;
    if v_orden.estado <> 'pendiente' then
      raise exception 'La orden de recibo % ya está %.', v_orden.numero, v_orden.estado;
    end if;
    if v_orden.cliente_id <> p_cliente_id then
      raise exception 'La orden de recibo es de otro cliente.';
    end if;
  end if;

  v_numero := app.siguiente_numero_recibo(v_serie);
  v_texto := 'Recibo ' || v_serie || '-' || lpad(v_numero::text, 8, '0');
  v_concepto := v_texto || coalesce(' — ' || nullif(btrim(p_concepto), ''), '');

  -- El total todavía no se sabe con cheques: se completa al final.
  insert into public.recibo (id, serie, numero, cliente_id, fecha, total, concepto, orden_id, emitido_por, caja_id)
  values (p_id, v_serie, v_numero, p_cliente_id, app.hoy_en_obera(), 0.01,
          nullif(btrim(coalesce(p_concepto, '')), ''), p_orden_id, v_usuario,
          (select id from public.caja where id = p_caja_id and estado = 'abierta'));

  if v_medio.tipo = 'cheque' then
    v_cheques := public.registrar_cobranza_con_cheques(p_cliente_id, p_cheques, v_texto || coalesce(' · ' || nullif(btrim(p_concepto), ''), ''), v_usuario);
    for v_cheque in
      select * from public.cheque where id = any(v_cheques) order by array_position(v_cheques, id)
    loop
      v_orden_n := v_orden_n + 1;
      insert into public.recibo_pago (recibo_id, orden, medio_pago_id, importe, cheque_id, movimiento_id)
      values (p_id, v_orden_n, v_medio.id, v_cheque.importe, v_cheque.id, v_cheque.cobranza_id);
    end loop;
    select sum(importe) into v_total from public.recibo_pago where recibo_id = p_id;
  else
    -- El movimiento no se toca después: es inmutable. Qué recibo lo
    -- dejó se lee de recibo_pago.
    v_mov := public.registrar_cobranza(p_cliente_id, round(p_importe, 2), v_medio.id, p_caja_id, v_concepto, v_usuario);
    insert into public.recibo_pago (recibo_id, orden, medio_pago_id, importe, movimiento_id)
    values (p_id, 1, v_medio.id, round(p_importe, 2), v_mov);
    v_total := round(p_importe, 2);
  end if;

  update public.recibo set total = v_total where id = p_id;

  if p_orden_id is not null then
    update public.orden_recibo
    set estado = 'aceptada', recibo_id = p_id, resuelto_por = v_usuario, resuelto_en = now()
    where id = p_orden_id;
  end if;

  return json_build_object('id', p_id, 'serie', v_serie, 'numero', v_numero, 'total', v_total, 'repetido', false);
end;
$$;

create or replace function public.cobrar_fiado(p_id uuid, p_persona_id uuid, p_medio_pago_id uuid, p_importe numeric, p_caja_id uuid DEFAULT NULL::uuid, p_fiado_id uuid DEFAULT NULL::uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existente public.recibo;
  v_persona   public.fiado_persona;
  v_medio     public.medio_pago;
  v_usuario   uuid := app.usuario_actual_id();
  v_importe   numeric(14, 2) := round(p_importe, 2);
  v_debe      numeric;
  v_resta     numeric;
  v_pago      uuid := gen_random_uuid();
  v_serie     text := '0001';
  v_numero    bigint;
  v_estado    text;
  v_f         record;
  v_parte     numeric;
  v_concepto  text;
begin
  if not app.tiene_permiso('fiados.cobrar') then
    raise exception 'No tenés permiso para cobrar fiados.';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador del recibo.';
  end if;

  select * into v_existente from public.recibo where id = p_id;
  if v_existente.id is not null then
    return json_build_object('id', v_existente.id, 'serie', v_existente.serie,
                             'numero', v_existente.numero, 'total', v_existente.total, 'repetido', true);
  end if;

  select * into v_persona from public.fiado_persona where id = p_persona_id for update;
  if v_persona.id is null then
    raise exception 'No se encontró el fiado.';
  end if;
  if v_importe is null or v_importe <= 0 then
    raise exception 'El importe tiene que ser mayor que cero.';
  end if;

  select * into v_medio from public.medio_pago where id = p_medio_pago_id and eliminado_en is null and activo;
  if v_medio.id is null then
    raise exception 'El medio de pago no existe o está inactivo.';
  end if;
  if v_medio.tipo in ('fiado', 'cuenta_corriente', 'cheque') then
    raise exception 'Un fiado se cobra en efectivo, con tarjeta o con transferencia.';
  end if;

  select coalesce(sum(saldo), 0) into v_debe
  from app.estado_de_fiados(v_persona.id)
  where p_fiado_id is null or fiado_id = p_fiado_id;
  if v_importe > v_debe + 0.009 then
    raise exception 'Debe % y se quieren cobrar %.', app.pesos(v_debe), app.pesos(v_importe);
  end if;

  if v_medio.afecta_caja then
    if p_caja_id is null then
      raise exception 'Cobrar en % necesita una caja abierta: si no, el dinero entra y el arqueo no lo ve.', v_medio.nombre;
    end if;
    select estado into v_estado from public.caja where id = p_caja_id;
    if v_estado is null then
      raise exception 'La caja indicada no existe.';
    end if;
    if v_estado <> 'abierta' then
      raise exception 'La caja está cerrada.';
    end if;
  end if;

  insert into public.fiado_pago (id, persona_id, importe, medio_pago_id, caja_id, usuario_id)
  values (v_pago, v_persona.id, v_importe, v_medio.id, p_caja_id, v_usuario);

  v_resta := v_importe;
  for v_f in
    select e.fiado_id, e.saldo
    from app.estado_de_fiados(v_persona.id) e
    join public.fiado f on f.id = e.fiado_id
    where e.saldo > 0 and (p_fiado_id is null or e.fiado_id = p_fiado_id)
    order by f.fecha, f.creado_en
  loop
    exit when v_resta <= 0;
    v_parte := least(v_resta, v_f.saldo);
    insert into public.fiado_imputacion (pago_id, fiado_id, importe) values (v_pago, v_f.fiado_id, v_parte);
    v_resta := v_resta - v_parte;
  end loop;

  v_numero := app.siguiente_numero_recibo(v_serie);
  v_concepto := 'Pago de fiado' || coalesce(' — ' || (
    select string_agg('venta ' || v.codigo, ', ' order by f.fecha)
    from public.fiado_imputacion i
    join public.fiado f on f.id = i.fiado_id
    join public.venta v on v.id = f.venta_id
    where i.pago_id = v_pago), '');

  insert into public.recibo (id, serie, numero, fiado_persona_id, fecha, total, concepto, emitido_por, caja_id)
  values (p_id, v_serie, v_numero, v_persona.id, app.hoy_en_obera(), v_importe, v_concepto, v_usuario,
          (select id from public.caja where id = p_caja_id and estado = 'abierta'));

  insert into public.recibo_pago (recibo_id, orden, medio_pago_id, importe, fiado_pago_id)
  values (p_id, 1, v_medio.id, v_importe, v_pago);

  if v_medio.afecta_caja then
    insert into public.caja_movimiento (caja_id, tipo, importe, concepto, usuario_id)
    values (p_caja_id, 'ingreso', v_importe,
            'Cobro de fiado — ' || v_persona.nombre || ' · recibo ' || v_serie || '-' || lpad(v_numero::text, 8, '0'),
            v_usuario);
  end if;

  return json_build_object('id', p_id, 'serie', v_serie, 'numero', v_numero, 'total', v_importe, 'repetido', false);
end;
$$;
