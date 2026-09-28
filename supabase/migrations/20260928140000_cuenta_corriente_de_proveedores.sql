-- ═══════════════════════════════════════════════════════════════
-- LA CUENTA CORRIENTE DE LOS PROVEEDORES
--
-- Cuánto le debe Gross a cada proveedor, cómo se formó ese saldo y qué
-- se le fue pagando. Es lo que el 26/10 desaparece con OBTech y no tiene
-- reemplazo manual: nadie lleva de memoria lo que le debe a quince
-- laboratorios. Decidido el 28/09 que entra antes del corte.
--
-- ─── LAS DECISIONES, TOMADAS EL 28/09 ───
--
-- · Al pagar se ELIGE a qué facturas va el pago, con las más viejas ya
--   marcadas. Lo que sobra queda «a cuenta»: baja el saldo igual.
-- · El cheque, por ahora, es un dato del pago: banco, número y fecha de
--   cobro. El módulo de cheques —recibidos, endosados, propios— es
--   aparte y viene después (docs/cheques.md).
-- · El saldo que traen de OBTech se carga a mano, uno por proveedor, con
--   la fecha del corte. Se le puede imputar un pago como a una factura.
--
-- ─── TODA FACTURA VA A LA CUENTA ───
--
-- No hay una marca de «contado». Una factura que se paga en el momento
-- es una factura y un pago del mismo día: el saldo queda en cero y el
-- resumen cuenta la historia completa. Dos caminos para lo mismo
-- terminan con facturas pagadas que figuran como deuda.
--
-- ─── EL SALDO NO SE GUARDA: SE SUMA ───
--
-- A diferencia del stock y de la cuenta de clientes, acá no hay una foto
-- materializada del saldo. Son decenas de comprobantes por mes, no miles
-- de ventas desde cuatro terminales sin conexión: la suma es instantánea
-- y no hay nada que se pueda desincronizar.
--
--   saldo = saldo inicial + facturas y notas de débito
--           − notas de crédito − pagos
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- El permiso de pagar
-- ───────────────────────────────────────────────────────────────
/*
  Aparte de cargar facturas: registrar un pago dice que salió plata. Ver
  la cuenta alcanza con 'compras.ver', que el Vendedor y el Cajero no
  tienen — ellos ven proveedores para saber a quién pedirle, no cuánto
  se les debe.
*/
insert into public.permiso (clave, grupo, descripcion, orden) values
  ('proveedores.pagar', 'proveedores', 'Registrar pagos a proveedores y su saldo inicial', 30)
on conflict (clave) do nothing;

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, 'proveedores.pagar'
from public.rol r where r.nombre in ('Administrador', 'Encargado')
on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- El vencimiento de la factura
-- ───────────────────────────────────────────────────────────────
/*
  Estaba en la pantalla de OBTech y quedó pendiente el 10/09 porque no
  tenía dónde apoyarse. Ahora sí: es lo que dice qué hay que pagar
  primero. Opcional — sin él, la factura se ordena por su fecha y nunca
  figura como vencida.
*/
alter table public.compra add column vencimiento date;

alter table public.compra add constraint compra_vencimiento_posterior
  check (vencimiento is null or vencimiento >= fecha);

drop function if exists public.registrar_compra(
  uuid, smallint, integer, bigint, date, numeric, numeric, text, jsonb, jsonb
);

create or replace function public.registrar_compra(
  p_proveedor_id        uuid,
  p_tipo_comprobante_id smallint,
  p_punto_venta         integer,
  p_numero              bigint,
  p_fecha               date,
  p_neto_no_gravado     numeric default 0,
  p_exento              numeric default 0,
  p_observaciones       text    default null,
  p_alicuotas           jsonb   default '[]'::jsonb,
  p_tributos            jsonb   default '[]'::jsonb,
  p_vencimiento         date    default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  begin
    insert into public.compra (
      proveedor_id, tipo_comprobante_id, punto_venta, numero, fecha, vencimiento,
      neto_no_gravado, exento, observaciones, cargada_por
    )
    values (
      p_proveedor_id, p_tipo_comprobante_id, p_punto_venta, p_numero, p_fecha, p_vencimiento,
      coalesce(p_neto_no_gravado, 0), coalesce(p_exento, 0),
      nullif(btrim(coalesce(p_observaciones, '')), ''),
      (select app.usuario_actual_id())
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esa factura ya está cargada: %-%.',
      lpad(p_punto_venta::text, 4, '0'), lpad(p_numero::text, 8, '0');
  end;

  insert into public.compra_alicuota (compra_id, alicuota_iva_id, base_imponible, importe)
  select v_id, (x->>'alicuota_iva_id')::smallint, (x->>'base_imponible')::numeric, (x->>'importe')::numeric
  from jsonb_array_elements(coalesce(p_alicuotas, '[]'::jsonb)) x;

  insert into public.compra_tributo (compra_id, descripcion, base_imponible, alicuota, importe)
  select v_id, x->>'descripcion', coalesce((x->>'base_imponible')::numeric, 0),
         (x->>'alicuota')::numeric, (x->>'importe')::numeric
  from jsonb_array_elements(coalesce(p_tributos, '[]'::jsonb)) x;

  return v_id;
end;
$$;

comment on function public.registrar_compra is
  'Carga una factura de compra entera —cabecera, alícuotas y percepciones— en una sola transacción. Los totales los calculan los disparadores desde el detalle.';

grant execute on function public.registrar_compra(
  uuid, smallint, integer, bigint, date, numeric, numeric, text, jsonb, jsonb, date
) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- El saldo que traen de OBTech
-- ───────────────────────────────────────────────────────────────
/*
  Uno vigente por proveedor. Positivo: Gross le debe. Negativo: el
  proveedor le debe a Gross (una nota de crédito sin usar, un pago de
  más).
*/
create table public.proveedor_saldo_inicial (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references public.proveedor(id) on delete restrict,
  fecha         date not null,
  importe       numeric(14,2) not null check (importe <> 0),
  detalle       text,
  cargado_por   uuid references public.usuario(id) on delete set null,
  creado_en     timestamptz not null default now(),
  anulado_en    timestamptz
);

create unique index proveedor_saldo_inicial_unico
  on public.proveedor_saldo_inicial (proveedor_id) where anulado_en is null;

comment on table public.proveedor_saldo_inicial is
  'Lo que se le debía a cada proveedor el día que se dejó OBTech. Uno vigente por proveedor; se le pueden imputar pagos como a una factura.';

-- ───────────────────────────────────────────────────────────────
-- El pago
-- ───────────────────────────────────────────────────────────────
create table public.pago_proveedor (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid not null references public.proveedor(id) on delete restrict,
  fecha          date not null,
  -- La suma de los medios: lo que salió. Lo mantiene la función que
  -- registra el pago, que no deja que discrepe.
  importe        numeric(14,2) not null check (importe >= 0),
  observaciones  text,
  registrado_por uuid references public.usuario(id) on delete set null,
  creado_en      timestamptz not null default now(),
  anulado_en     timestamptz,
  anulado_por    uuid references public.usuario(id) on delete set null,
  motivo_anulacion text
);

create index pago_proveedor_proveedor_idx on public.pago_proveedor (proveedor_id, fecha desc);

comment on table public.pago_proveedor is
  'Un pago a un proveedor. Se anula con motivo, no se borra ni se edita.';

/*
  Con qué se pagó. Un pago puede ir en partes —una transferencia y un
  cheque—, y cada parte se ve por separado en el resumen.
*/
create table public.pago_proveedor_medio (
  id          uuid primary key default gen_random_uuid(),
  pago_id     uuid not null references public.pago_proveedor(id) on delete restrict,
  medio       text not null check (medio in
                ('efectivo', 'transferencia', 'cheque_propio', 'cheque_tercero', 'otro')),
  importe     numeric(14,2) not null check (importe > 0),
  -- Del cheque. Cuando exista el módulo de cheques, esto pasa a ser una
  -- referencia al cheque; los datos ya están.
  banco       text,
  numero      text,
  fecha_cobro date,
  referencia  text,

  constraint pago_medio_cheque_completo check (
    medio not in ('cheque_propio', 'cheque_tercero')
    or (numero is not null and btrim(numero) <> '' and fecha_cobro is not null)
  )
);

create index pago_proveedor_medio_pago_idx on public.pago_proveedor_medio (pago_id);

/*
  A qué se imputó. Una fila por comprobante: una factura o nota de
  débito (en positivo), una nota de crédito que se descuenta (en
  negativo) o el saldo inicial.
*/
create table public.pago_proveedor_imputacion (
  id                uuid primary key default gen_random_uuid(),
  pago_id           uuid not null references public.pago_proveedor(id) on delete restrict,
  compra_id         uuid references public.compra(id) on delete restrict,
  saldo_inicial_id  uuid references public.proveedor_saldo_inicial(id) on delete restrict,
  importe           numeric(14,2) not null check (importe <> 0),

  constraint imputacion_a_una_sola_cosa check ((compra_id is null) <> (saldo_inicial_id is null))
);

create index pago_imputacion_pago_idx   on public.pago_proveedor_imputacion (pago_id);
create index pago_imputacion_compra_idx on public.pago_proveedor_imputacion (compra_id) where compra_id is not null;
create index pago_imputacion_saldo_idx  on public.pago_proveedor_imputacion (saldo_inicial_id) where saldo_inicial_id is not null;

-- ───────────────────────────────────────────────────────────────
-- Quién ve y quién escribe
--
-- Se lee con 'compras.ver'. Se escribe sólo por las funciones de abajo,
-- que controlan 'proveedores.pagar' y las cuentas: por eso no hay
-- políticas de alta ni de cambio.
-- ───────────────────────────────────────────────────────────────
alter table public.proveedor_saldo_inicial    enable row level security;
alter table public.pago_proveedor             enable row level security;
alter table public.pago_proveedor_medio       enable row level security;
alter table public.pago_proveedor_imputacion  enable row level security;

create policy proveedor_saldo_inicial_select on public.proveedor_saldo_inicial
  for select to authenticated using ((select app.tiene_permiso('compras.ver')));
create policy pago_proveedor_select on public.pago_proveedor
  for select to authenticated using ((select app.tiene_permiso('compras.ver')));
create policy pago_proveedor_medio_select on public.pago_proveedor_medio
  for select to authenticated using ((select app.tiene_permiso('compras.ver')));
create policy pago_proveedor_imputacion_select on public.pago_proveedor_imputacion
  for select to authenticated using ((select app.tiene_permiso('compras.ver')));

grant select on public.proveedor_saldo_inicial, public.pago_proveedor,
                 public.pago_proveedor_medio, public.pago_proveedor_imputacion
  to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Lo que falta pagar de cada comprobante
-- ───────────────────────────────────────────────────────────────
/*
  Una fila por comprobante vigente —facturas, notas y el saldo inicial—
  con lo que ya se le imputó y lo que queda. Todo con el signo de la
  deuda: una nota de crédito es un pendiente negativo, que se usa para
  descontar.
*/
create view public.vista_pendiente_proveedor
with (security_invoker = true) as
select
  c.proveedor_id,
  'compra'::text                              as origen,
  c.id,
  c.fecha,
  c.vencimiento,
  t.descripcion || ' ' || lpad(c.punto_venta::text, 4, '0') || '-' || lpad(c.numero::text, 8, '0') as descripcion,
  t.signo                                     as signo,
  round(t.signo * c.total, 2)                 as total,
  coalesce(i.imputado, 0)                     as imputado,
  round(t.signo * c.total, 2) - coalesce(i.imputado, 0) as pendiente,
  c.vencimiento is not null and c.vencimiento < (now() at time zone 'America/Argentina/Buenos_Aires')::date
    and t.signo > 0                           as vencida
from public.compra c
join public.tipo_comprobante t on t.id = c.tipo_comprobante_id
left join lateral (
  select sum(pi.importe) as imputado
  from public.pago_proveedor_imputacion pi
  join public.pago_proveedor p on p.id = pi.pago_id and p.anulado_en is null
  where pi.compra_id = c.id
) i on true
where c.eliminado_en is null
union all
select
  s.proveedor_id,
  'saldo_inicial',
  s.id,
  s.fecha,
  null,
  'Saldo al ' || to_char(s.fecha, 'DD/MM/YYYY') || coalesce(' — ' || s.detalle, ''),
  case when s.importe > 0 then 1 else -1 end,
  s.importe,
  coalesce(i.imputado, 0),
  s.importe - coalesce(i.imputado, 0),
  false
from public.proveedor_saldo_inicial s
left join lateral (
  select sum(pi.importe) as imputado
  from public.pago_proveedor_imputacion pi
  join public.pago_proveedor p on p.id = pi.pago_id and p.anulado_en is null
  where pi.saldo_inicial_id = s.id
) i on true
where s.anulado_en is null;

comment on view public.vista_pendiente_proveedor is
  'Cada comprobante vigente de un proveedor con lo imputado y lo pendiente, con el signo de la deuda. Las notas de crédito dan pendiente negativo.';

-- ───────────────────────────────────────────────────────────────
-- El saldo de cada proveedor — la «consolidación de saldos» de OBTech
-- ───────────────────────────────────────────────────────────────
create view public.vista_saldo_proveedor
with (security_invoker = true) as
select
  pr.id                         as proveedor_id,
  pr.nombre,
  pr.numero_documento,
  coalesce(d.documentos, 0) - coalesce(pg.pagado, 0)                        as saldo,
  coalesce(d.vencido, 0)                                                    as vencido,
  -- Lo pagado que no se imputó a nada: ya bajó el saldo, pero no canceló
  -- ninguna factura en particular.
  coalesce(pg.pagado, 0) - coalesce(pg.imputado, 0)                         as a_cuenta,
  d.proximo_vencimiento,
  pg.ultimo_pago
from public.proveedor pr
left join lateral (
  select sum(v.total)                                          as documentos,
         sum(v.pendiente) filter (where v.vencida)             as vencido,
         min(v.vencimiento) filter (where v.pendiente > 0 and v.vencimiento is not null) as proximo_vencimiento
  from public.vista_pendiente_proveedor v
  where v.proveedor_id = pr.id
) d on true
left join lateral (
  select sum(p.importe) as pagado,
         max(p.fecha)   as ultimo_pago,
         (select sum(pi.importe) from public.pago_proveedor_imputacion pi
           join public.pago_proveedor p2 on p2.id = pi.pago_id
          where p2.proveedor_id = pr.id and p2.anulado_en is null) as imputado
  from public.pago_proveedor p
  where p.proveedor_id = pr.id and p.anulado_en is null
) pg on true
where pr.eliminado_en is null;

comment on view public.vista_saldo_proveedor is
  'Cuánto se le debe a cada proveedor: saldo inicial + facturas − notas de crédito − pagos. Positivo: Gross debe.';

-- ───────────────────────────────────────────────────────────────
-- El resumen de cuenta: todo lo que movió el saldo, en orden
-- ───────────────────────────────────────────────────────────────
create view public.vista_movimiento_proveedor
with (security_invoker = true) as
select v.proveedor_id, v.fecha, v.origen as tipo, v.id, v.descripcion,
       greatest(v.total, 0)  as debe,
       greatest(-v.total, 0) as haber,
       null::text            as detalle
from public.vista_pendiente_proveedor v
union all
select p.proveedor_id, p.fecha, 'pago', p.id,
       'Pago',
       0,
       p.importe,
       (select string_agg(
                 case m.medio
                   when 'efectivo'       then 'Efectivo'
                   when 'transferencia'  then 'Transferencia'
                   when 'cheque_propio'  then 'Cheque propio ' || coalesce(m.banco || ' ', '') || 'N° ' || m.numero
                   when 'cheque_tercero' then 'Cheque de tercero ' || coalesce(m.banco || ' ', '') || 'N° ' || m.numero
                   else 'Otro'
                 end || ' ' || to_char(m.importe, 'FM999G999G990D00')
                 || coalesce(' (' || m.referencia || ')', ''),
               ' · ' order by m.importe desc)
          from public.pago_proveedor_medio m where m.pago_id = p.id)
from public.pago_proveedor p
where p.anulado_en is null;

comment on view public.vista_movimiento_proveedor is
  'El resumen de cuenta de un proveedor: saldo inicial, comprobantes y pagos, con debe y haber. El saldo acumulado lo arma la pantalla en orden de fecha.';

grant select on public.vista_pendiente_proveedor, public.vista_saldo_proveedor,
                 public.vista_movimiento_proveedor to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Registrar un pago
-- ───────────────────────────────────────────────────────────────
/*
  Todo junto o nada: el pago, sus medios y sus imputaciones. Un pago
  sin imputación a medias deja una factura «pagada» que sigue figurando
  como deuda, o al revés.

  Las reglas que se cuidan acá y no en la pantalla:
  · lo imputado no pasa de lo que sale más lo que se descuenta con notas
    de crédito — el resto queda a cuenta;
  · a ningún comprobante se le imputa más de lo que le falta;
  · los comprobantes son de ese proveedor y están vigentes.

  security definer con el permiso controlado adentro: escribe en tres
  tablas que no tienen políticas de alta, a propósito.
*/
create or replace function public.registrar_pago_proveedor(
  p_proveedor_id  uuid,
  p_fecha         date,
  p_medios        jsonb,
  p_imputaciones  jsonb default '[]'::jsonb,
  p_observaciones text  default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_importe  numeric := 0;
  v_imputado numeric := 0;
  v_x        jsonb;
  v_origen   text;
  v_ref      uuid;
  v_monto    numeric;
  v_pend     public.vista_pendiente_proveedor;
begin
  if not app.tiene_permiso('proveedores.pagar') then
    raise exception 'No tenés permiso para registrar pagos a proveedores.';
  end if;

  if not exists (select 1 from public.proveedor where id = p_proveedor_id and eliminado_en is null) then
    raise exception 'Ese proveedor no existe o está dado de baja.';
  end if;

  if p_fecha is null or p_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'La fecha del pago no puede ser posterior a hoy.';
  end if;

  select coalesce(sum((m->>'importe')::numeric), 0) into v_importe
  from jsonb_array_elements(coalesce(p_medios, '[]'::jsonb)) m;

  select coalesce(sum((x->>'importe')::numeric), 0) into v_imputado
  from jsonb_array_elements(coalesce(p_imputaciones, '[]'::jsonb)) x;

  -- Sin plata puede haber pago: descontar una nota de crédito de una
  -- factura es imputar sin que salga nada. Lo que no puede es no haber
  -- ni plata ni imputaciones.
  if v_importe <= 0 and jsonb_array_length(coalesce(p_imputaciones, '[]'::jsonb)) = 0 then
    raise exception 'El pago no tiene importe.';
  end if;

  if round(v_imputado, 2) > round(v_importe, 2) then
    raise exception 'Se está imputando % y el pago es de %: sobran facturas o falta plata.',
      to_char(v_imputado, 'FM999G999G990D00'), to_char(v_importe, 'FM999G999G990D00');
  end if;

  if round(v_imputado, 2) < 0 then
    raise exception 'Las notas de crédito elegidas suman más que las facturas: no hay nada que pagar.';
  end if;

  insert into public.pago_proveedor (proveedor_id, fecha, importe, observaciones, registrado_por)
  values (p_proveedor_id, p_fecha, round(v_importe, 2),
          nullif(btrim(coalesce(p_observaciones, '')), ''), app.usuario_actual_id())
  returning id into v_id;

  begin
    insert into public.pago_proveedor_medio (pago_id, medio, importe, banco, numero, fecha_cobro, referencia)
    select v_id, m->>'medio', round((m->>'importe')::numeric, 2),
           nullif(btrim(m->>'banco'), ''), nullif(btrim(m->>'numero'), ''),
           (m->>'fecha_cobro')::date, nullif(btrim(m->>'referencia'), '')
    from jsonb_array_elements(coalesce(p_medios, '[]'::jsonb)) m;
  exception when check_violation then
    raise exception 'Un cheque necesita el número y la fecha de cobro.';
  end;

  for v_x in select * from jsonb_array_elements(coalesce(p_imputaciones, '[]'::jsonb)) loop
    v_origen := v_x->>'origen';
    v_ref    := (v_x->>'id')::uuid;
    v_monto  := round((v_x->>'importe')::numeric, 2);

    if v_monto = 0 then continue; end if;

    -- Se bloquea el comprobante: dos pagos a la vez a la misma factura
    -- podrían pasar los dos el control de lo pendiente.
    if v_origen = 'compra' then
      perform 1 from public.compra where id = v_ref for update;
    else
      perform 1 from public.proveedor_saldo_inicial where id = v_ref for update;
    end if;

    select * into v_pend from public.vista_pendiente_proveedor
    where id = v_ref and origen = v_origen and proveedor_id = p_proveedor_id;

    if v_pend.id is null then
      raise exception 'Uno de los comprobantes no es de este proveedor o ya no está vigente.';
    end if;

    -- El signo de la imputación es el del comprobante, y no puede pasar
    -- de lo que le falta.
    if sign(v_monto) <> sign(v_pend.pendiente) or abs(v_monto) > abs(v_pend.pendiente) then
      raise exception 'A % le quedan % por pagar, y se le quieren imputar %.',
        v_pend.descripcion, to_char(v_pend.pendiente, 'FM999G999G990D00'), to_char(v_monto, 'FM999G999G990D00');
    end if;

    insert into public.pago_proveedor_imputacion (pago_id, compra_id, saldo_inicial_id, importe)
    values (v_id,
            case when v_origen = 'compra' then v_ref end,
            case when v_origen = 'saldo_inicial' then v_ref end,
            v_monto);
  end loop;

  return v_id;
end;
$$;

comment on function public.registrar_pago_proveedor is
  'Registra un pago a un proveedor con sus medios e imputaciones, en una transacción. Lo no imputado queda a cuenta.';

revoke all on function public.registrar_pago_proveedor(uuid, date, jsonb, jsonb, text) from public, anon;
grant execute on function public.registrar_pago_proveedor(uuid, date, jsonb, jsonb, text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Anular un pago
-- ───────────────────────────────────────────────────────────────
/*
  El pago queda, marcado como anulado y con el motivo. Sus imputaciones
  dejan de contar solas —las vistas sólo miran pagos vigentes—, así que
  las facturas vuelven a figurar pendientes sin tocarlas.
*/
create or replace function public.anular_pago_proveedor(p_pago_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('proveedores.pagar') then
    raise exception 'No tenés permiso para anular pagos a proveedores.';
  end if;

  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Para anular un pago hay que decir por qué.';
  end if;

  update public.pago_proveedor
     set anulado_en = now(), anulado_por = app.usuario_actual_id(), motivo_anulacion = btrim(p_motivo)
   where id = p_pago_id and anulado_en is null;

  if not found then
    raise exception 'Ese pago no existe o ya estaba anulado.';
  end if;
end;
$$;

revoke all on function public.anular_pago_proveedor(uuid, text) from public, anon;
grant execute on function public.anular_pago_proveedor(uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Cargar el saldo que viene de OBTech
-- ───────────────────────────────────────────────────────────────
/*
  Si ya había uno, se reemplaza — pero sólo si todavía no se le imputó
  ningún pago. Cambiar un saldo que ya se empezó a pagar dejaría esos
  pagos imputados a un número que no existe más.

  Con importe cero se quita el que había.
*/
create or replace function public.definir_saldo_inicial_proveedor(
  p_proveedor_id uuid,
  p_fecha        date,
  p_importe      numeric,
  p_detalle      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior uuid;
begin
  if not app.tiene_permiso('proveedores.pagar') then
    raise exception 'No tenés permiso para cargar el saldo de un proveedor.';
  end if;

  if not exists (select 1 from public.proveedor where id = p_proveedor_id and eliminado_en is null) then
    raise exception 'Ese proveedor no existe o está dado de baja.';
  end if;

  select id into v_anterior from public.proveedor_saldo_inicial
  where proveedor_id = p_proveedor_id and anulado_en is null
  for update;

  if v_anterior is not null then
    if exists (
      select 1 from public.pago_proveedor_imputacion pi
      join public.pago_proveedor p on p.id = pi.pago_id and p.anulado_en is null
      where pi.saldo_inicial_id = v_anterior
    ) then
      raise exception 'Ese saldo ya tiene pagos imputados. Para corregirlo, primero anulá esos pagos.';
    end if;

    update public.proveedor_saldo_inicial set anulado_en = now() where id = v_anterior;
  end if;

  if coalesce(round(p_importe, 2), 0) <> 0 then
    if p_fecha is null then
      raise exception 'El saldo necesita la fecha a la que corresponde.';
    end if;

    insert into public.proveedor_saldo_inicial (proveedor_id, fecha, importe, detalle, cargado_por)
    values (p_proveedor_id, p_fecha, round(p_importe, 2),
            nullif(btrim(coalesce(p_detalle, '')), ''), app.usuario_actual_id());
  end if;
end;
$$;

revoke all on function public.definir_saldo_inicial_proveedor(uuid, date, numeric, text) from public, anon;
grant execute on function public.definir_saldo_inicial_proveedor(uuid, date, numeric, text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Una factura con pagos no se da de baja
-- ───────────────────────────────────────────────────────────────
/*
  Darla de baja dejaría pagos imputados a algo que ya no cuenta, y el
  saldo bajaría dos veces. Primero se anula el pago.
*/
create or replace function app.compra_con_pagos_no_se_da_de_baja()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.eliminado_en is not null and old.eliminado_en is null and exists (
    select 1 from public.pago_proveedor_imputacion pi
    join public.pago_proveedor p on p.id = pi.pago_id and p.anulado_en is null
    where pi.compra_id = new.id
  ) then
    raise exception 'Esa factura tiene pagos imputados. Para darla de baja, primero anulá esos pagos.';
  end if;
  return new;
end;
$$;

create trigger compra_con_pagos_no_se_da_de_baja
  before update of eliminado_en on public.compra
  for each row execute function app.compra_con_pagos_no_se_da_de_baja();
