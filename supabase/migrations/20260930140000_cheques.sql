-- ═══════════════════════════════════════════════════════════════
-- LOS CHEQUES
--
-- Un cheque no es plata que entró: es una promesa con fecha, que además
-- se mueve. Entra por la caja o por la cobranza de un cliente, pasa un
-- tiempo en la cartera, y sale depositado o endosado a un proveedor. Y
-- puede volver rechazado, que es cuando más importa saber de quién vino
-- y a quién se le dio. Ver docs/cheques.md.
--
-- ─── LO QUE CONTESTÓ LUCAS EL 30/09 ───
--
-- · Los cheques que reciben se depositan Y se endosan a proveedores;
--   casi siempre se los «hace correr» lo más posible.
-- · Emiten cheques propios, de chequera y cada vez más e-cheq, y también
--   pagan con cheques de terceros.
-- · Hay cheques al día y diferidos.
-- · El «calendario de recibos» que pidió en agosto es esto: qué se cobra
--   y qué se paga en los próximos días. Va al final (vista_calendario).
--
-- ─── LAS DECISIONES DE DISEÑO ───
--
-- · Un solo registro por cheque, recibido o propio, con su estado y la
--   historia de cada cambio. Dos cheques del mismo importe no son
--   intercambiables: cada uno tiene su número, su banco y su fecha.
-- · El cheque NUNCA va al arqueo de la caja: el medio «Cheque» no afecta
--   la caja, y la base no deja configurarlo de otra forma.
-- · En la caja el cheque tiene que poder cobrarse sin internet, como todo
--   lo demás. Por eso sus datos viajan con el pago de la venta
--   (venta_pago.datos_cheque) y el cheque entra a la cartera recién
--   cuando el cobro llega al servidor. Si los datos llegan incompletos
--   —una caja con una versión anterior—, el cheque entra igual, marcado
--   para completar: está en el cajón y tiene que figurar.
-- · El cheque de tercero se endosa ENTERO y se elige de la cartera. No
--   se tipea: tipearlo de nuevo es cómo un mismo cheque termina dos veces.
-- · Un rechazo devuelve la deuda a donde corresponde: si el cheque se le
--   había dado a un proveedor, se le vuelve a deber (un pendiente más de
--   su cuenta, que se paga como una factura); y, si se elige, se le carga
--   al cliente que lo entregó, con los gastos del banco.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Los permisos
-- ───────────────────────────────────────────────────────────────
/*
  Recibir un cheque no pide permiso nuevo: en la caja es cobrar, y en la
  cuenta del cliente es registrar una cobranza. Lo nuevo es mirar la
  cartera y moverla, que es de quien maneja la plata del negocio.
*/
insert into public.permiso (clave, grupo, descripcion, orden) values
  ('cheques.ver',       'Cheques', 'Ver la cartera de cheques y el calendario de cobros y pagos', 760),
  ('cheques.gestionar', 'Cheques', 'Depositar, devolver y marcar cheques como rechazados o debitados', 770)
on conflict (clave) do nothing;

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r
cross join (values ('cheques.ver'), ('cheques.gestionar')) p(clave)
where r.nombre in ('Administrador', 'Encargado')
on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- El medio de pago «Cheque»
-- ───────────────────────────────────────────────────────────────
alter table public.medio_pago drop constraint medio_pago_tipo_check;
alter table public.medio_pago add constraint medio_pago_tipo_check check (tipo in (
  'efectivo', 'tarjeta_debito', 'tarjeta_credito', 'transferencia',
  'cuenta_corriente', 'cheque', 'otro'));

/*
  Si un cheque sumara al arqueo, la caja cerraría con una diferencia
  todos los días que entra uno: el sistema esperaría en el cajón una
  plata que es un papel con fecha. Y un cheque no se paga en cuotas.
*/
alter table public.medio_pago add constraint medio_pago_cheque_no_va_al_cajon
  check (tipo <> 'cheque' or (not afecta_caja and not admite_cuotas));

/*
  Con la lista de la transferencia, que es la de contado. Si Gross cobra
  distinto a un cheque diferido, se cambia en Precios → Medios de pago.
*/
insert into public.medio_pago (nombre, tipo, lista_precio_id, admite_cuotas, cuotas_maximas, afecta_caja, orden)
select 'Cheque', 'cheque',
       coalesce(
         (select lista_precio_id from public.medio_pago
           where tipo = 'transferencia' and eliminado_en is null order by orden limit 1),
         (select id from public.lista_precio where es_predeterminada and eliminado_en is null limit 1)),
       false, 1, false,
       coalesce((select max(orden) from public.medio_pago
                  where tipo = 'transferencia' and eliminado_en is null), 40) + 1
where not exists (select 1 from public.medio_pago where tipo = 'cheque' and eliminado_en is null);

insert into public.medio_pago_cuota (medio_pago_id, cuotas, recargo_porcentaje)
select id, 1, 0 from public.medio_pago where tipo = 'cheque' and eliminado_en is null
on conflict do nothing;

/*
  Los datos del cheque, con el pago de la venta. Es el formato de viaje
  desde la caja —que puede estar sin conexión—; el cheque de verdad lo
  arma la base al cobrar (app.cheques_de_la_venta_cobrada).
*/
alter table public.venta_pago add column datos_cheque jsonb;

comment on column public.venta_pago.datos_cheque is
  'Banco, número, fecha de pago, librador, CUIT y si es e-cheq, cuando el pago es con cheque. Al cobrarse la venta se convierte en un cheque de la cartera.';

-- La cobranza de un cliente puede traer un cheque.
alter table public.movimiento_cuenta_corriente
  drop constraint movimiento_cuenta_corriente_referencia_tipo_check;
alter table public.movimiento_cuenta_corriente
  add constraint movimiento_cuenta_corriente_referencia_tipo_check
  check (referencia_tipo in ('venta', 'comprobante', 'recibo', 'manual', 'devolucion', 'cheque'));

-- ───────────────────────────────────────────────────────────────
-- El cheque
-- ───────────────────────────────────────────────────────────────
create table public.cheque (
  id             uuid primary key default gen_random_uuid(),
  -- 'tercero': lo recibió Gross. 'propio': lo libró Gross.
  origen         text not null check (origen in ('tercero', 'propio')),
  electronico    boolean not null default false,
  banco          text,
  numero         text,
  importe        numeric(14,2) not null check (importe > 0),
  fecha_emision  date,
  -- Desde cuándo se puede cobrar. Igual a la emisión: al día. Posterior:
  -- diferido.
  fecha_pago     date not null,
  librador       text,
  librador_cuit  text,
  estado         text not null,
  -- El día del último cambio de estado: cuándo se depositó, se endosó...
  estado_desde   date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,

  -- De dónde vino (los de tercero)
  cliente_id     uuid references public.cliente(id) on delete restrict,
  venta_pago_id  uuid unique references public.venta_pago(id) on delete restrict,
  cobranza_id    uuid unique references public.movimiento_cuenta_corriente(id) on delete restrict,
  caja_id        uuid references public.caja(id) on delete set null,

  -- Adónde fue
  proveedor_id   uuid references public.proveedor(id) on delete restrict,
  deposito       text,
  -- Del rechazo o de la devolución
  motivo         text,
  gastos         numeric(14,2) check (gastos is null or gastos >= 0),
  cargo_id       uuid references public.movimiento_cuenta_corriente(id) on delete restrict,

  observaciones  text,
  registrado_por uuid references public.usuario(id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint cheque_estado_segun_origen check (
    (origen = 'tercero' and estado in ('en_cartera', 'depositado', 'endosado', 'devuelto', 'rechazado'))
    or (origen = 'propio' and estado in ('emitido', 'debitado', 'anulado', 'rechazado'))
  ),
  constraint cheque_propio_tiene_proveedor check (origen = 'tercero' or proveedor_id is not null),
  constraint cheque_endosado_tiene_proveedor check (estado <> 'endosado' or proveedor_id is not null),
  constraint cheque_pago_desde_la_emision check (fecha_emision is null or fecha_pago >= fecha_emision)
);

create index cheque_estado_idx    on public.cheque (estado, fecha_pago);
create index cheque_cliente_idx   on public.cheque (cliente_id) where cliente_id is not null;
create index cheque_proveedor_idx on public.cheque (proveedor_id) where proveedor_id is not null;
create index cheque_caja_idx      on public.cheque (caja_id) where caja_id is not null;

create trigger cheque_actualizado_en before update on public.cheque
  for each row execute function app.set_actualizado_en();

comment on table public.cheque is
  'Cada cheque, recibido (tercero) o librado por Gross (propio), con su estado. Se escribe sólo por funciones; la historia está en cheque_movimiento.';

/*
  La historia del cheque: cuándo entró, a quién se le dio, quién lo
  depositó. Es lo que contesta «¿dónde está el cheque de Fulano?».
*/
create table public.cheque_movimiento (
  id         uuid primary key default gen_random_uuid(),
  cheque_id  uuid not null references public.cheque(id) on delete cascade,
  fecha      date not null,
  estado     text not null,
  detalle    text not null,
  usuario_id uuid references public.usuario(id) on delete set null,
  -- La hora de verdad y no la de la transacción: anular un pago y
  -- volver a endosar el cheque tienen que quedar en orden.
  creado_en  timestamptz not null default clock_timestamp()
);

create index cheque_movimiento_cheque_idx on public.cheque_movimiento (cheque_id, creado_en);

alter table public.cheque            enable row level security;
alter table public.cheque_movimiento enable row level security;

/*
  Lo ve quien maneja la cartera, y quien paga a proveedores: para
  endosar hay que ver qué cheques hay. El cajero recibe cheques pero no
  ve la cartera, igual que no ve cuánto se le debe a cada proveedor.
*/
create policy cheque_select on public.cheque
  for select to authenticated
  using ((select app.tiene_permiso('cheques.ver')) or (select app.tiene_permiso('proveedores.pagar')));
create policy cheque_movimiento_select on public.cheque_movimiento
  for select to authenticated
  using ((select app.tiene_permiso('cheques.ver')) or (select app.tiene_permiso('proveedores.pagar')));

grant select on public.cheque, public.cheque_movimiento to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Las piezas de adentro
-- ───────────────────────────────────────────────────────────────
create or replace function app.hoy_en_obera()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;

/* Una fecha escrita, o nada: un dato mal tipeado no puede trabar un cobro. */
create or replace function app.fecha_o_nulo(p text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  return nullif(btrim(p), '')::date;
exception when others then
  return null;
end;
$$;

/* Cómo se nombra un cheque en cualquier mensaje o renglón. */
create or replace function app.nombre_del_cheque(p public.cheque)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p.electronico then 'e-cheq' else 'cheque' end
         || coalesce(' ' || p.banco, '')
         || coalesce(' N° ' || p.numero, ' sin número')
$$;

create or replace function app.estado_del_cheque(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'en_cartera' then 'en cartera'
    when 'depositado' then 'depositado'
    when 'endosado'   then 'endosado'
    when 'devuelto'   then 'devuelto'
    when 'rechazado'  then 'rechazado'
    when 'emitido'    then 'entregado'
    when 'debitado'   then 'debitado'
    when 'anulado'    then 'anulado'
    else p
  end
$$;

/* Un número de cheque se compara sin los ceros de adelante. */
create or replace function app.numero_de_cheque(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(ltrim(regexp_replace(coalesce(p, ''), '\s', '', 'g'), '0'), '')
$$;

/*
  Cambia el estado y deja el renglón en la historia. Todo cambio de
  estado pasa por acá: un estado que cambia sin historia es un cheque
  del que nadie sabe cómo llegó adonde está.
*/
create or replace function app.cheque_pasa_a(p_id uuid, p_estado text, p_fecha date, p_detalle text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cheque set estado = p_estado, estado_desde = p_fecha where id = p_id;
  insert into public.cheque_movimiento (cheque_id, fecha, estado, detalle, usuario_id)
  values (p_id, p_fecha, p_estado, p_detalle, app.usuario_actual_id());
end;
$$;

revoke all on function app.cheque_pasa_a(uuid, text, date, text) from public;

/*
  Lo que se controla de un cheque que se carga con alguien delante: en
  la cobranza, o al pagarle a un proveedor con uno propio. El de la caja
  no pasa por acá, porque puede llegar horas después desde una caja sin
  conexión, con el cliente ya ido: ahí se guarda lo que haya.
*/
create or replace function app.validar_cheque(p jsonb, p_origen text)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_hoy     date := app.hoy_en_obera();
  v_pago    date := app.fecha_o_nulo(p->>'fecha_pago');
  v_emision date := app.fecha_o_nulo(p->>'fecha_emision');
  v_numero  text := nullif(btrim(coalesce(p->>'numero', '')), '');
  v_cuit    text := nullif(regexp_replace(coalesce(p->>'librador_cuit', ''), '\D', '', 'g'), '');
begin
  if coalesce((p->>'importe')::numeric, 0) <= 0 then
    raise exception 'Un cheque necesita el importe.';
  end if;
  if nullif(btrim(coalesce(p->>'banco', '')), '') is null then
    raise exception 'Falta el banco del cheque%.', coalesce(' N° ' || v_numero, '');
  end if;
  if v_numero is null then
    raise exception 'Falta el número del cheque del %.', btrim(p->>'banco');
  end if;
  if v_pago is null then
    raise exception 'Falta la fecha de pago del cheque N° %.', v_numero;
  end if;
  -- Un diferido es, como mucho, a 360 días. Más que eso es un año mal
  -- tipeado, y ese cheque quedaría fuera de todo calendario.
  if v_pago > v_hoy + 365 then
    raise exception 'El cheque N° % dice que se cobra el %: un cheque diferido es, como mucho, a 360 días.',
      v_numero, to_char(v_pago, 'DD/MM/YYYY');
  end if;
  -- Pasados 30 días de su fecha de pago, el banco ya no lo paga.
  if p_origen = 'tercero' and v_pago < v_hoy - 30 then
    raise exception 'El cheque N° % es del %: pasaron más de 30 días y el banco ya no lo paga.',
      v_numero, to_char(v_pago, 'DD/MM/YYYY');
  end if;
  if v_emision is not null and v_pago < v_emision then
    raise exception 'La fecha de pago del cheque N° % es anterior a la de emisión.', v_numero;
  end if;
  if v_cuit is not null and not app.cuit_valido(v_cuit) then
    raise exception 'El CUIT del librador del cheque N° % no es válido.', v_numero;
  end if;
end;
$$;

/*
  El mismo cheque dos veces en la cartera es plata contada dos veces. Un
  cheque de tercero es el mismo si coinciden banco, número e importe y
  todavía anda circulando.
*/
create or replace function app.cheque_ya_cargado(p_banco text, p_numero text, p_importe numeric, p_origen text)
returns public.cheque
language sql
stable
set search_path = ''
as $$
  select c.* from public.cheque c
  where c.origen = p_origen
    and app.texto_para_comparar(c.banco) = app.texto_para_comparar(p_banco)
    and app.numero_de_cheque(c.numero) = app.numero_de_cheque(p_numero)
    and (p_origen = 'propio' or c.importe = round(p_importe, 2))
    and c.estado not in ('devuelto', 'anulado')
  limit 1
$$;

/*
  Cargarle al cliente un cheque que no se cobró: vuelve a deberlo, con
  los gastos del banco si los hubo. Vence en el día, porque es plata que
  el cliente ya tendría que haber pagado.
*/
create or replace function app.cargar_cheque_al_cliente(p_cheque public.cheque, p_importe numeric, p_concepto text, p_fecha date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente public.cliente;
  v_id      uuid;
begin
  select * into v_cliente from public.cliente where id = p_cheque.cliente_id;
  if v_cliente.id is null then
    raise exception 'No se sabe qué cliente entregó el %: no hay a quién cargárselo.', app.nombre_del_cheque(p_cheque);
  end if;
  if not v_cliente.cuenta_corriente then
    raise exception '% no tiene cuenta corriente: para cargárselo, primero hay que habilitársela en su ficha.',
      v_cliente.nombre;
  end if;

  insert into public.movimiento_cuenta_corriente
    (cliente_id, tipo, importe, concepto, vencimiento, referencia_tipo, referencia_id, usuario_id, operador_id)
  values
    (v_cliente.id, 'nota_debito', round(p_importe, 2), p_concepto, p_fecha,
     'cheque', p_cheque.id, app.usuario_actual_id(), app.usuario_actual_id())
  returning id into v_id;

  update public.cheque set cargo_id = v_id where id = p_cheque.id;
  return v_id;
end;
$$;

revoke all on function app.cargar_cheque_al_cliente(public.cheque, numeric, text, date) from public;

-- ───────────────────────────────────────────────────────────────
-- 1. El cheque que entra por la caja
-- ───────────────────────────────────────────────────────────────
/*
  Cuando la venta queda cobrada, cada pago con cheque se vuelve un
  cheque de la cartera. En el mismo momento y no antes: los pagos se
  cargan un paso antes del cobro, y si el cobro falla no hay cheque.

  Nunca frena el cobro. Si faltan datos, entra con lo que haya y la
  cartera lo marca para completar.
*/
create or replace function app.cheques_de_la_venta_cobrada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy     date := app.hoy_en_obera();
  v_cliente public.cliente;
begin
  select * into v_cliente from public.cliente where id = new.cliente_id;

  with nuevos as (
    insert into public.cheque (
      origen, electronico, banco, numero, importe, fecha_emision, fecha_pago,
      librador, librador_cuit, estado, estado_desde,
      cliente_id, venta_pago_id, caja_id, registrado_por)
    select
      'tercero',
      coalesce(app.si_o_no(vp.datos_cheque->>'electronico'), false),
      nullif(btrim(vp.datos_cheque->>'banco'), ''),
      nullif(btrim(vp.datos_cheque->>'numero'), ''),
      round(vp.importe, 2),
      app.fecha_o_nulo(vp.datos_cheque->>'fecha_emision'),
      greatest(coalesce(app.fecha_o_nulo(vp.datos_cheque->>'fecha_pago'), v_hoy),
               coalesce(app.fecha_o_nulo(vp.datos_cheque->>'fecha_emision'), '-infinity'::date)),
      coalesce(nullif(btrim(vp.datos_cheque->>'librador'), ''), v_cliente.nombre),
      nullif(regexp_replace(coalesce(vp.datos_cheque->>'librador_cuit', ''), '\D', '', 'g'), ''),
      'en_cartera', v_hoy,
      new.cliente_id, vp.id, new.caja_id, new.cajero_id
    from public.venta_pago vp
    join public.medio_pago mp on mp.id = vp.medio_pago_id
    where vp.venta_id = new.id and mp.tipo = 'cheque'
    on conflict (venta_pago_id) do nothing
    returning id
  )
  insert into public.cheque_movimiento (cheque_id, fecha, estado, detalle, usuario_id)
  select id, v_hoy, 'en_cartera', 'Recibido en la caja, venta ' || new.codigo, new.cajero_id
  from nuevos;

  return null;
end;
$$;

create trigger venta_cobrada_trae_sus_cheques
  after update of estado on public.venta
  for each row
  when (new.estado = 'cobrada' and old.estado is distinct from 'cobrada')
  execute function app.cheques_de_la_venta_cobrada();

/*
  Se anula la venta: el cheque que todavía está en la cartera vuelve al
  cliente. Si ya se depositó o se endosó, la plata ya se usó y la
  devolución al cliente va por otro lado; el cheque queda donde está.
*/
create or replace function app.cheques_de_la_venta_anulada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in
    select c.id from public.cheque c
    join public.venta_pago vp on vp.id = c.venta_pago_id
    where vp.venta_id = new.id and c.estado = 'en_cartera'
    for update of c
  loop
    update public.cheque set motivo = 'Se anuló la venta ' || new.codigo where id = v_id;
    perform app.cheque_pasa_a(v_id, 'devuelto', app.hoy_en_obera(),
      'Se anuló la venta ' || new.codigo || ': el cheque vuelve al cliente');
  end loop;
  return null;
end;
$$;

create trigger venta_anulada_devuelve_sus_cheques
  after update of estado on public.venta
  for each row
  when (new.estado = 'anulada' and old.estado = 'cobrada')
  execute function app.cheques_de_la_venta_anulada();

/* Lo que el cajero entrega al cerrar: los cheques que entraron en su turno. */
create or replace function public.cheques_de_la_caja(p_caja_id uuid)
returns table (nombre text, importe numeric, fecha_pago date, cliente text)
language sql
stable
security definer
set search_path = ''
as $$
  select app.nombre_del_cheque(c), c.importe, c.fecha_pago, cl.nombre
  from public.cheque c
  left join public.cliente cl on cl.id = c.cliente_id
  where c.caja_id = p_caja_id
    and (app.tiene_permiso('caja.cerrar') or app.tiene_permiso('cheques.ver'))
  order by c.creado_en
$$;

revoke all on function public.cheques_de_la_caja(uuid) from public, anon;
grant execute on function public.cheques_de_la_caja(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- 2. El cheque que entra por la cobranza de la cuenta corriente
-- ───────────────────────────────────────────────────────────────
/*
  Un cliente viene a pagar la cuenta y deja uno o varios cheques. Cada
  cheque es un renglón de la cuenta, así un rechazo después apunta a lo
  que de verdad no se cobró.
*/
create or replace function public.registrar_cobranza_con_cheques(
  p_cliente_id uuid,
  p_cheques    jsonb,
  p_concepto   text default null,
  p_usuario_id uuid default null
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente public.cliente;
  v_usuario uuid := coalesce(p_usuario_id, app.usuario_actual_id());
  v_hoy     date := app.hoy_en_obera();
  v_x       jsonb;
  v_cheque  public.cheque;
  v_previo  public.cheque;
  v_mov     uuid;
  v_ids     uuid[] := '{}';
begin
  if not app.tiene_permiso('cuentacorriente.cobrar') then
    raise exception 'No tenés permiso para registrar cobranzas.';
  end if;

  select * into v_cliente from public.cliente where id = p_cliente_id and eliminado_en is null;
  if v_cliente.id is null then
    raise exception 'El cliente no existe.';
  end if;
  if not v_cliente.cuenta_corriente then
    raise exception 'El cliente % no tiene cuenta corriente habilitada.', v_cliente.nombre;
  end if;

  if jsonb_array_length(coalesce(p_cheques, '[]'::jsonb)) = 0 then
    raise exception 'La cobranza no tiene cheques.';
  end if;

  for v_x in select * from jsonb_array_elements(p_cheques) loop
    perform app.validar_cheque(v_x, 'tercero');

    v_previo := app.cheque_ya_cargado(v_x->>'banco', v_x->>'numero', (v_x->>'importe')::numeric, 'tercero');
    if v_previo.id is not null then
      raise exception 'El % de % ya está cargado: figura %.',
        app.nombre_del_cheque(v_previo), app.pesos(v_previo.importe), app.estado_del_cheque(v_previo.estado);
    end if;

    insert into public.cheque (
      origen, electronico, banco, numero, importe, fecha_emision, fecha_pago,
      librador, librador_cuit, estado, estado_desde, cliente_id, registrado_por)
    values (
      'tercero',
      coalesce(app.si_o_no(v_x->>'electronico'), false),
      btrim(v_x->>'banco'),
      btrim(v_x->>'numero'),
      round((v_x->>'importe')::numeric, 2),
      app.fecha_o_nulo(v_x->>'fecha_emision'),
      app.fecha_o_nulo(v_x->>'fecha_pago'),
      coalesce(nullif(btrim(v_x->>'librador'), ''), v_cliente.nombre),
      nullif(regexp_replace(coalesce(v_x->>'librador_cuit', ''), '\D', '', 'g'), ''),
      'en_cartera', v_hoy, v_cliente.id, v_usuario)
    returning * into v_cheque;

    insert into public.movimiento_cuenta_corriente
      (cliente_id, tipo, importe, concepto, referencia_tipo, referencia_id, usuario_id, operador_id)
    values
      (v_cliente.id, 'cobranza', -v_cheque.importe,
       coalesce(nullif(btrim(p_concepto), '') || ' — ', '') || 'Cobranza con '
         || app.nombre_del_cheque(v_cheque) || ' al ' || to_char(v_cheque.fecha_pago, 'DD/MM/YYYY'),
       'cheque', v_cheque.id, v_usuario, v_usuario)
    returning id into v_mov;

    update public.cheque set cobranza_id = v_mov where id = v_cheque.id;

    insert into public.cheque_movimiento (cheque_id, fecha, estado, detalle, usuario_id)
    values (v_cheque.id, v_hoy, 'en_cartera', 'Recibido en la cobranza de la cuenta corriente', v_usuario);

    v_ids := v_ids || v_cheque.id;
  end loop;

  return v_ids;
end;
$$;

comment on function public.registrar_cobranza_con_cheques is
  'Cobranza de cuenta corriente con uno o varios cheques: cada cheque entra a la cartera y baja la deuda por su importe.';

revoke all on function public.registrar_cobranza_con_cheques(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.registrar_cobranza_con_cheques(uuid, jsonb, text, uuid) to authenticated;

/*
  La cobranza de siempre ya no acepta el medio «Cheque»: sin los datos,
  la deuda bajaría y el cheque no estaría en ningún lado.
*/
create or replace function public.registrar_cobranza(
  p_cliente_id    uuid,
  p_importe       numeric,
  p_medio_pago_id uuid,
  p_caja_id       uuid default null,
  p_concepto      text default null,
  p_usuario_id    uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cliente     public.cliente;
  v_medio       public.medio_pago;
  v_usuario     uuid;
  v_movimiento  uuid;
  v_estado_caja text;
begin
  if p_importe is null or p_importe <= 0 then
    raise exception 'El importe de la cobranza tiene que ser mayor que cero.';
  end if;

  select * into v_cliente from public.cliente
  where id = p_cliente_id and eliminado_en is null;

  if v_cliente.id is null then
    raise exception 'El cliente no existe.';
  end if;
  if not v_cliente.cuenta_corriente then
    raise exception 'El cliente % no tiene cuenta corriente habilitada.', v_cliente.nombre;
  end if;

  select * into v_medio from public.medio_pago
  where id = p_medio_pago_id and eliminado_en is null and activo;

  if v_medio.id is null then
    raise exception 'El medio de pago no existe o esta inactivo.';
  end if;
  if v_medio.tipo = 'cuenta_corriente' then
    raise exception 'No se puede cobrar una cuenta corriente con cuenta corriente.';
  end if;
  if v_medio.tipo = 'cheque' then
    raise exception 'Para cobrar con cheque hacen falta los datos de cada cheque: banco, número y fecha de pago.';
  end if;

  v_usuario := coalesce(p_usuario_id, app.usuario_actual_id());

  insert into public.movimiento_cuenta_corriente
    (cliente_id, tipo, importe, concepto, referencia_tipo, usuario_id, operador_id)
  values
    (p_cliente_id, 'cobranza', -p_importe,
     coalesce(nullif(trim(p_concepto), ''), 'Cobranza en ' || v_medio.nombre),
     'recibo', v_usuario, v_usuario)
  returning id into v_movimiento;

  -- Al cajón sólo lo que efectivamente entra al cajón.
  if v_medio.afecta_caja then
    if p_caja_id is null then
      raise exception 'Cobrar en % necesita una caja abierta: si no, el dinero entra y el arqueo no lo ve.',
        v_medio.nombre;
    end if;

    select estado into v_estado_caja from public.caja where id = p_caja_id;
    if v_estado_caja is null then
      raise exception 'La caja indicada no existe.';
    end if;
    if v_estado_caja <> 'abierta' then
      raise exception 'La caja esta cerrada.';
    end if;

    insert into public.caja_movimiento (caja_id, tipo, importe, concepto, usuario_id)
    values (p_caja_id, 'ingreso', p_importe,
            'Cobranza cuenta corriente — ' || v_cliente.nombre, v_usuario);
  end if;

  return v_movimiento;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- 3. El cheque que sale: pagarle a un proveedor
-- ───────────────────────────────────────────────────────────────
alter table public.pago_proveedor_medio
  add column cheque_id uuid references public.cheque(id) on delete restrict;

create index pago_proveedor_medio_cheque_idx on public.pago_proveedor_medio (cheque_id) where cheque_id is not null;

/*
  Un cheque rechazado que se le había dado a un proveedor es deuda otra
  vez, y se paga como una factura: se le puede imputar un pago.
*/
alter table public.pago_proveedor_imputacion
  add column cheque_id uuid references public.cheque(id) on delete restrict;

alter table public.pago_proveedor_imputacion drop constraint imputacion_a_una_sola_cosa;
alter table public.pago_proveedor_imputacion add constraint imputacion_a_una_sola_cosa
  check (num_nonnulls(compra_id, saldo_inicial_id, cheque_id) = 1);

create index pago_imputacion_cheque_idx on public.pago_proveedor_imputacion (cheque_id) where cheque_id is not null;

create or replace view public.vista_pendiente_proveedor
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
where s.anulado_en is null
union all
/*
  El cheque que se le dio y volvió rechazado: se le debe de nuevo desde
  el día del rechazo, y ya está vencido — el proveedor esperaba cobrarlo.
*/
select
  ch.proveedor_id,
  'cheque_rechazado',
  ch.id,
  ch.estado_desde,
  ch.estado_desde,
  initcap(left(app.nombre_del_cheque(ch), 1)) || substr(app.nombre_del_cheque(ch), 2) || ' rechazado',
  1,
  ch.importe,
  coalesce(i.imputado, 0),
  ch.importe - coalesce(i.imputado, 0),
  ch.importe - coalesce(i.imputado, 0) > 0
from public.cheque ch
left join lateral (
  select sum(pi.importe) as imputado
  from public.pago_proveedor_imputacion pi
  join public.pago_proveedor p on p.id = pi.pago_id and p.anulado_en is null
  where pi.cheque_id = ch.id
) i on true
where ch.estado = 'rechazado' and ch.proveedor_id is not null;

/*
  El detalle del pago lee el cheque, no la copia del pago: si se corrige
  el número en la cartera, el resumen dice lo mismo.
*/
create or replace view public.vista_movimiento_proveedor
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
                   when 'cheque_propio'  then
                     case when ch.electronico then 'E-cheq propio ' else 'Cheque propio ' end
                     || coalesce(coalesce(ch.banco, m.banco) || ' ', '') || 'N° ' || coalesce(ch.numero, m.numero)
                     || ' al ' || to_char(coalesce(ch.fecha_pago, m.fecha_cobro), 'DD/MM/YYYY')
                   when 'cheque_tercero' then
                     case when ch.electronico then 'E-cheq de tercero ' else 'Cheque de tercero ' end
                     || coalesce(coalesce(ch.banco, m.banco) || ' ', '') || 'N° ' || coalesce(ch.numero, m.numero)
                     || ' al ' || to_char(coalesce(ch.fecha_pago, m.fecha_cobro), 'DD/MM/YYYY')
                   else 'Otro'
                 end || ' ' || app.pesos(m.importe)
                 || coalesce(' (' || m.referencia || ')', ''),
               ' · ' order by m.importe desc)
          from public.pago_proveedor_medio m
          left join public.cheque ch on ch.id = m.cheque_id
          where m.pago_id = p.id)
from public.pago_proveedor p
where p.anulado_en is null;

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
  v_id        uuid;
  v_proveedor text;
  v_importe   numeric := 0;
  v_imputado  numeric := 0;
  v_x         jsonb;
  v_m         jsonb;
  v_medio     text;
  v_origen    text;
  v_ref       uuid;
  v_monto     numeric;
  v_pend      public.vista_pendiente_proveedor;
  v_cheque    public.cheque;
  v_previo    public.cheque;
begin
  if not app.tiene_permiso('proveedores.pagar') then
    raise exception 'No tenés permiso para registrar pagos a proveedores.';
  end if;

  select nombre into v_proveedor from public.proveedor where id = p_proveedor_id and eliminado_en is null;
  if v_proveedor is null then
    raise exception 'Ese proveedor no existe o está dado de baja.';
  end if;

  if p_fecha is null or p_fecha > app.hoy_en_obera() then
    raise exception 'La fecha del pago no puede ser posterior a hoy.';
  end if;

  /*
    Los cheques, antes de tocar nada. El de tercero tiene que estar en la
    cartera y se endosa entero; el propio, tener sus datos. El mismo
    cheque dos veces en un pago no se ve mirando uno por uno.
  */
  if (select count(*) - count(distinct m->>'cheque_id')
        from jsonb_array_elements(coalesce(p_medios, '[]'::jsonb)) m
       where nullif(m->>'cheque_id', '') is not null) > 0 then
    raise exception 'El mismo cheque está dos veces en el pago.';
  end if;

  for v_m in select * from jsonb_array_elements(coalesce(p_medios, '[]'::jsonb)) loop
    v_medio := v_m->>'medio';
    if v_medio = 'cheque_tercero' then
      if nullif(v_m->>'cheque_id', '') is null then
        raise exception 'El cheque de tercero se elige de la cartera. Si no está, primero hay que registrarlo en la cobranza del cliente.';
      end if;
      select * into v_cheque from public.cheque where id = (v_m->>'cheque_id')::uuid for update;
      if v_cheque.id is null or v_cheque.origen <> 'tercero' then
        raise exception 'Ese cheque no está en la cartera.';
      end if;
      if v_cheque.estado <> 'en_cartera' then
        raise exception 'El % ya no está en la cartera: figura %.',
          app.nombre_del_cheque(v_cheque), app.estado_del_cheque(v_cheque.estado);
      end if;
      if v_cheque.banco is null or v_cheque.numero is null then
        raise exception 'Al % le faltan datos: completalos en Cheques antes de endosarlo.', app.nombre_del_cheque(v_cheque);
      end if;
      if round((v_m->>'importe')::numeric, 2) is distinct from v_cheque.importe then
        raise exception 'El % es de %: se endosa entero.', app.nombre_del_cheque(v_cheque), app.pesos(v_cheque.importe);
      end if;
    elsif v_medio = 'cheque_propio' then
      perform app.validar_cheque(
        jsonb_build_object('importe', v_m->'importe', 'banco', v_m->'banco', 'numero', v_m->'numero',
                           'fecha_pago', v_m->'fecha_cobro'),
        'propio');
    end if;
  end loop;

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
      app.pesos(v_imputado), app.pesos(v_importe);
  end if;

  if round(v_imputado, 2) < 0 then
    raise exception 'Las notas de crédito elegidas suman más que las facturas: no hay nada que pagar.';
  end if;

  insert into public.pago_proveedor (proveedor_id, fecha, importe, observaciones, registrado_por)
  values (p_proveedor_id, p_fecha, round(v_importe, 2),
          nullif(btrim(coalesce(p_observaciones, '')), ''), app.usuario_actual_id())
  returning id into v_id;

  for v_m in select * from jsonb_array_elements(coalesce(p_medios, '[]'::jsonb)) loop
    v_medio  := v_m->>'medio';
    v_cheque := null;

    if v_medio = 'cheque_tercero' then
      update public.cheque set proveedor_id = p_proveedor_id
       where id = (v_m->>'cheque_id')::uuid
      returning * into v_cheque;
      perform app.cheque_pasa_a(v_cheque.id, 'endosado', p_fecha, 'Endosado a ' || v_proveedor);

    elsif v_medio = 'cheque_propio' then
      -- Acá y no antes: así también se ve el mismo cheque dos veces en
      -- este pago.
      v_previo := app.cheque_ya_cargado(v_m->>'banco', v_m->>'numero', 0, 'propio');
      if v_previo.id is not null then
        raise exception 'El % propio ya está cargado: figura %.',
          app.nombre_del_cheque(v_previo), app.estado_del_cheque(v_previo.estado);
      end if;

      insert into public.cheque (
        origen, electronico, banco, numero, importe, fecha_emision, fecha_pago,
        estado, estado_desde, proveedor_id, registrado_por)
      values (
        'propio', coalesce(app.si_o_no(v_m->>'electronico'), false),
        btrim(v_m->>'banco'), btrim(v_m->>'numero'), round((v_m->>'importe')::numeric, 2),
        least(p_fecha, app.fecha_o_nulo(v_m->>'fecha_cobro')), app.fecha_o_nulo(v_m->>'fecha_cobro'),
        'emitido', p_fecha, p_proveedor_id, app.usuario_actual_id())
      returning * into v_cheque;

      insert into public.cheque_movimiento (cheque_id, fecha, estado, detalle, usuario_id)
      values (v_cheque.id, p_fecha, 'emitido', 'Entregado a ' || v_proveedor, app.usuario_actual_id());
    end if;

    begin
      insert into public.pago_proveedor_medio
        (pago_id, medio, importe, banco, numero, fecha_cobro, referencia, cheque_id)
      values (
        v_id, v_medio, round((v_m->>'importe')::numeric, 2),
        coalesce(v_cheque.banco, nullif(btrim(v_m->>'banco'), '')),
        coalesce(v_cheque.numero, nullif(btrim(v_m->>'numero'), '')),
        coalesce(v_cheque.fecha_pago, app.fecha_o_nulo(v_m->>'fecha_cobro')),
        nullif(btrim(v_m->>'referencia'), ''),
        v_cheque.id);
    exception when check_violation then
      raise exception 'Un cheque necesita el número y la fecha de cobro.';
    end;
  end loop;

  for v_x in select * from jsonb_array_elements(coalesce(p_imputaciones, '[]'::jsonb)) loop
    v_origen := v_x->>'origen';
    v_ref    := (v_x->>'id')::uuid;
    v_monto  := round((v_x->>'importe')::numeric, 2);

    if v_monto = 0 then continue; end if;

    -- Se bloquea el comprobante: dos pagos a la vez a la misma factura
    -- podrían pasar los dos el control de lo pendiente.
    if v_origen = 'compra' then
      perform 1 from public.compra where id = v_ref for update;
    elsif v_origen = 'cheque_rechazado' then
      perform 1 from public.cheque where id = v_ref for update;
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
        v_pend.descripcion, app.pesos(v_pend.pendiente), app.pesos(v_monto);
    end if;

    insert into public.pago_proveedor_imputacion (pago_id, compra_id, saldo_inicial_id, cheque_id, importe)
    values (v_id,
            case when v_origen = 'compra' then v_ref end,
            case when v_origen = 'saldo_inicial' then v_ref end,
            case when v_origen = 'cheque_rechazado' then v_ref end,
            v_monto);
  end loop;

  return v_id;
end;
$$;

/*
  Anular el pago deshace también lo que hizo con los cheques: el propio
  queda anulado y el de tercero vuelve a la cartera. Si el cheque ya se
  debitó o volvió rechazado, el pago no se puede anular: pasó de verdad.
*/
create or replace function public.anular_pago_proveedor(p_pago_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago public.pago_proveedor;
  v_ch   public.cheque;
  v_hoy  date := app.hoy_en_obera();
begin
  if not app.tiene_permiso('proveedores.pagar') then
    raise exception 'No tenés permiso para anular pagos a proveedores.';
  end if;

  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Para anular un pago hay que decir por qué.';
  end if;

  select * into v_pago from public.pago_proveedor where id = p_pago_id and anulado_en is null for update;
  if v_pago.id is null then
    raise exception 'Ese pago no existe o ya estaba anulado.';
  end if;

  for v_ch in
    select c.* from public.pago_proveedor_medio m
    join public.cheque c on c.id = m.cheque_id
    where m.pago_id = p_pago_id
    for update of c
  loop
    if v_ch.origen = 'propio' then
      if v_ch.estado <> 'emitido' then
        raise exception 'El % ya figura %: el pago no se puede anular.',
          app.nombre_del_cheque(v_ch), app.estado_del_cheque(v_ch.estado);
      end if;
      perform app.cheque_pasa_a(v_ch.id, 'anulado', v_hoy, 'Se anuló el pago: ' || btrim(p_motivo));
    else
      if v_ch.estado <> 'endosado' or v_ch.proveedor_id is distinct from v_pago.proveedor_id then
        raise exception 'El % ya figura %: el pago no se puede anular.',
          app.nombre_del_cheque(v_ch), app.estado_del_cheque(v_ch.estado);
      end if;
      -- Primero vuelve a la cartera y después se le saca el proveedor:
      -- un cheque endosado sin proveedor no puede existir ni un instante.
      perform app.cheque_pasa_a(v_ch.id, 'en_cartera', v_hoy,
        'Vuelve a la cartera: se anuló el pago. ' || btrim(p_motivo));
      update public.cheque set proveedor_id = null where id = v_ch.id;
    end if;
  end loop;

  update public.pago_proveedor
     set anulado_en = now(), anulado_por = app.usuario_actual_id(), motivo_anulacion = btrim(p_motivo)
   where id = p_pago_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- 4. Mover la cartera
-- ───────────────────────────────────────────────────────────────
create or replace function public.depositar_cheques(p_ids uuid[], p_fecha date, p_cuenta text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ch public.cheque;
  v_n  integer := 0;
begin
  if not app.tiene_permiso('cheques.gestionar') then
    raise exception 'No tenés permiso para mover la cartera de cheques.';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'No hay cheques elegidos.';
  end if;
  if p_fecha is null or p_fecha > app.hoy_en_obera() then
    raise exception 'La fecha del depósito no puede ser posterior a hoy.';
  end if;

  for v_ch in select * from public.cheque where id = any(p_ids) order by fecha_pago for update loop
    if v_ch.origen <> 'tercero' or v_ch.estado <> 'en_cartera' then
      raise exception 'El % no está en la cartera: figura %.',
        app.nombre_del_cheque(v_ch), app.estado_del_cheque(v_ch.estado);
    end if;
    if v_ch.banco is null or v_ch.numero is null then
      raise exception 'Al % le faltan datos: completalos antes de depositarlo.', app.nombre_del_cheque(v_ch);
    end if;
    update public.cheque set deposito = nullif(btrim(coalesce(p_cuenta, '')), '') where id = v_ch.id;
    perform app.cheque_pasa_a(v_ch.id, 'depositado', p_fecha,
      'Depositado' || coalesce(' en ' || nullif(btrim(coalesce(p_cuenta, '')), ''), ''));
    v_n := v_n + 1;
  end loop;

  if v_n <> array_length(p_ids, 1) then
    raise exception 'Alguno de los cheques elegidos no existe.';
  end if;
  return v_n;
end;
$$;

create or replace function public.marcar_cheques_debitados(p_ids uuid[], p_fecha date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ch public.cheque;
  v_n  integer := 0;
begin
  if not app.tiene_permiso('cheques.gestionar') then
    raise exception 'No tenés permiso para mover la cartera de cheques.';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'No hay cheques elegidos.';
  end if;
  if p_fecha is null or p_fecha > app.hoy_en_obera() then
    raise exception 'La fecha del débito no puede ser posterior a hoy.';
  end if;

  for v_ch in select * from public.cheque where id = any(p_ids) for update loop
    if v_ch.origen <> 'propio' or v_ch.estado <> 'emitido' then
      raise exception 'El % no está esperando el débito: figura %.',
        app.nombre_del_cheque(v_ch), app.estado_del_cheque(v_ch.estado);
    end if;
    perform app.cheque_pasa_a(v_ch.id, 'debitado', p_fecha, 'Debitado de la cuenta');
    v_n := v_n + 1;
  end loop;

  if v_n <> array_length(p_ids, 1) then
    raise exception 'Alguno de los cheques elegidos no existe.';
  end if;
  return v_n;
end;
$$;

/*
  Para el error de tocar el cheque equivocado: el depositado vuelve a la
  cartera y el debitado vuelve a esperar el débito. Nada más se deshace,
  porque lo demás movió cuentas.
*/
create or replace function public.deshacer_cheque(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ch public.cheque;
begin
  if not app.tiene_permiso('cheques.gestionar') then
    raise exception 'No tenés permiso para mover la cartera de cheques.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Para deshacer hay que decir por qué.';
  end if;

  select * into v_ch from public.cheque where id = p_id for update;
  if v_ch.id is null then
    raise exception 'Ese cheque no existe.';
  end if;

  if v_ch.estado = 'depositado' then
    update public.cheque set deposito = null where id = p_id;
    perform app.cheque_pasa_a(p_id, 'en_cartera', app.hoy_en_obera(), 'Vuelve a la cartera: ' || btrim(p_motivo));
  elsif v_ch.estado = 'debitado' then
    perform app.cheque_pasa_a(p_id, 'emitido', app.hoy_en_obera(), 'Vuelve a esperar el débito: ' || btrim(p_motivo));
  else
    raise exception 'Un cheque % no se puede deshacer.', app.estado_del_cheque(v_ch.estado);
  end if;
end;
$$;

/*
  El cheque vuelve a manos del cliente: lo cambia por otra forma de
  pago, o se lo pide. Si pagaba su cuenta, se le puede volver a cargar.
*/
create or replace function public.devolver_cheque(
  p_id                uuid,
  p_fecha             date,
  p_motivo            text,
  p_cargar_al_cliente boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ch public.cheque;
begin
  if not app.tiene_permiso('cheques.gestionar') then
    raise exception 'No tenés permiso para mover la cartera de cheques.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Para devolver un cheque hay que decir por qué.';
  end if;
  if p_fecha is null or p_fecha > app.hoy_en_obera() then
    raise exception 'La fecha de la devolución no puede ser posterior a hoy.';
  end if;

  select * into v_ch from public.cheque where id = p_id for update;
  if v_ch.id is null or v_ch.origen <> 'tercero' or v_ch.estado <> 'en_cartera' then
    raise exception 'Sólo se devuelve un cheque que está en la cartera.';
  end if;

  update public.cheque set motivo = btrim(p_motivo) where id = p_id;

  if p_cargar_al_cliente then
    perform app.cargar_cheque_al_cliente(v_ch, v_ch.importe,
      'Se le devolvió el ' || app.nombre_del_cheque(v_ch) || ' — ' || btrim(p_motivo), p_fecha);
  end if;

  perform app.cheque_pasa_a(p_id, 'devuelto', p_fecha,
    'Devuelto al cliente: ' || btrim(p_motivo) || case when p_cargar_al_cliente then '. Se le cargó a la cuenta.' else '' end);
end;
$$;

/*
  El cheque no se cobró. Lo que pasa depende de dónde estaba:
  · depositado: el banco lo devolvió. Se le puede cargar al cliente.
  · endosado: el proveedor lo trae de vuelta, y se le vuelve a deber.
    También se le puede cargar al cliente.
  · propio: el proveedor no lo pudo cobrar, y se le vuelve a deber.
*/
create or replace function public.rechazar_cheque(
  p_id                uuid,
  p_fecha             date,
  p_motivo            text,
  p_gastos            numeric default 0,
  p_cargar_al_cliente boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ch        public.cheque;
  v_gastos    numeric := round(coalesce(p_gastos, 0), 2);
  v_proveedor text;
begin
  if not app.tiene_permiso('cheques.gestionar') then
    raise exception 'No tenés permiso para mover la cartera de cheques.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Para marcar un cheque rechazado hay que decir el motivo.';
  end if;
  if p_fecha is null or p_fecha > app.hoy_en_obera() then
    raise exception 'La fecha del rechazo no puede ser posterior a hoy.';
  end if;
  if v_gastos < 0 then
    raise exception 'Los gastos no pueden ser negativos.';
  end if;

  select * into v_ch from public.cheque where id = p_id for update;
  if v_ch.id is null then
    raise exception 'Ese cheque no existe.';
  end if;
  if not ((v_ch.origen = 'tercero' and v_ch.estado in ('depositado', 'endosado'))
          or (v_ch.origen = 'propio' and v_ch.estado = 'emitido')) then
    raise exception 'Un cheque % no se puede marcar como rechazado.', app.estado_del_cheque(v_ch.estado);
  end if;
  if p_cargar_al_cliente and v_ch.origen <> 'tercero' then
    raise exception 'Un cheque propio no se le carga a ningún cliente.';
  end if;

  update public.cheque set motivo = btrim(p_motivo), gastos = nullif(v_gastos, 0) where id = p_id;

  if p_cargar_al_cliente then
    perform app.cargar_cheque_al_cliente(v_ch, v_ch.importe + v_gastos,
      initcap(left(app.nombre_del_cheque(v_ch), 1)) || substr(app.nombre_del_cheque(v_ch), 2)
        || ' rechazado — ' || btrim(p_motivo)
        || case when v_gastos > 0 then ' (con ' || app.pesos(v_gastos) || ' de gastos)' else '' end,
      p_fecha);
  end if;

  select nombre into v_proveedor from public.proveedor where id = v_ch.proveedor_id;

  perform app.cheque_pasa_a(p_id, 'rechazado', p_fecha,
    'Rechazado: ' || btrim(p_motivo)
    || case when v_proveedor is not null then '. Se le vuelve a deber a ' || v_proveedor else '' end
    || case when p_cargar_al_cliente then '. Se le cargó al cliente' else '' end);
end;
$$;

/*
  Corregir lo tipeado: el número, el banco, la fecha. El importe no se
  corrige, porque ya movió cuentas; si está mal, el cheque se devuelve o
  se anula el pago y se carga de nuevo.
*/
create or replace function public.corregir_cheque(p_id uuid, p_datos jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ch     public.cheque;
  v_nuevo  public.cheque;
  v_previo public.cheque;
  v_cambio text[] := '{}';
begin
  if not app.tiene_permiso('cheques.gestionar') then
    raise exception 'No tenés permiso para mover la cartera de cheques.';
  end if;

  select * into v_ch from public.cheque where id = p_id for update;
  if v_ch.id is null then
    raise exception 'Ese cheque no existe.';
  end if;

  v_nuevo := v_ch;
  if p_datos ? 'banco'         then v_nuevo.banco         := nullif(btrim(p_datos->>'banco'), ''); end if;
  if p_datos ? 'numero'        then v_nuevo.numero        := nullif(btrim(p_datos->>'numero'), ''); end if;
  if p_datos ? 'fecha_pago'    then v_nuevo.fecha_pago    := app.fecha_o_nulo(p_datos->>'fecha_pago'); end if;
  if p_datos ? 'fecha_emision' then v_nuevo.fecha_emision := app.fecha_o_nulo(p_datos->>'fecha_emision'); end if;
  if p_datos ? 'librador'      then v_nuevo.librador      := nullif(btrim(p_datos->>'librador'), ''); end if;
  if p_datos ? 'librador_cuit' then
    v_nuevo.librador_cuit := nullif(regexp_replace(coalesce(p_datos->>'librador_cuit', ''), '\D', '', 'g'), '');
  end if;
  if p_datos ? 'electronico'   then v_nuevo.electronico   := coalesce(app.si_o_no(p_datos->>'electronico'), false); end if;
  if p_datos ? 'observaciones' then v_nuevo.observaciones := nullif(btrim(p_datos->>'observaciones'), ''); end if;

  if v_nuevo.banco is null or v_nuevo.numero is null then
    raise exception 'El cheque necesita el banco y el número.';
  end if;
  if v_nuevo.fecha_pago is null then
    raise exception 'El cheque necesita la fecha de pago.';
  end if;
  if v_nuevo.fecha_emision is not null and v_nuevo.fecha_pago < v_nuevo.fecha_emision then
    raise exception 'La fecha de pago es anterior a la de emisión.';
  end if;
  if v_nuevo.librador_cuit is not null and not app.cuit_valido(v_nuevo.librador_cuit) then
    raise exception 'El CUIT del librador no es válido.';
  end if;

  v_previo := app.cheque_ya_cargado(v_nuevo.banco, v_nuevo.numero, v_nuevo.importe, v_nuevo.origen);
  if v_previo.id is not null and v_previo.id <> p_id then
    raise exception 'Ya hay otro % cargado: figura %.',
      app.nombre_del_cheque(v_previo), app.estado_del_cheque(v_previo.estado);
  end if;

  if v_nuevo.banco is distinct from v_ch.banco then
    v_cambio := v_cambio || ('banco ' || coalesce(v_ch.banco, '—') || ' → ' || v_nuevo.banco);
  end if;
  if v_nuevo.numero is distinct from v_ch.numero then
    v_cambio := v_cambio || ('número ' || coalesce(v_ch.numero, '—') || ' → ' || v_nuevo.numero);
  end if;
  if v_nuevo.fecha_pago is distinct from v_ch.fecha_pago then
    v_cambio := v_cambio || ('fecha de pago ' || to_char(v_ch.fecha_pago, 'DD/MM/YYYY')
                             || ' → ' || to_char(v_nuevo.fecha_pago, 'DD/MM/YYYY'));
  end if;
  if v_nuevo.librador is distinct from v_ch.librador or v_nuevo.librador_cuit is distinct from v_ch.librador_cuit then
    v_cambio := v_cambio || 'librador'::text;
  end if;
  if v_nuevo.electronico is distinct from v_ch.electronico then
    v_cambio := v_cambio || case when v_nuevo.electronico then 'es e-cheq' else 'es de chequera' end;
  end if;

  update public.cheque
     set banco = v_nuevo.banco, numero = v_nuevo.numero, fecha_pago = v_nuevo.fecha_pago,
         fecha_emision = v_nuevo.fecha_emision, librador = v_nuevo.librador,
         librador_cuit = v_nuevo.librador_cuit, electronico = v_nuevo.electronico,
         observaciones = v_nuevo.observaciones
   where id = p_id;

  -- La copia en el pago, para quien la lea sin pasar por el cheque.
  update public.pago_proveedor_medio
     set banco = v_nuevo.banco, numero = v_nuevo.numero, fecha_cobro = v_nuevo.fecha_pago
   where cheque_id = p_id;

  if array_length(v_cambio, 1) > 0 then
    insert into public.cheque_movimiento (cheque_id, fecha, estado, detalle, usuario_id)
    values (p_id, app.hoy_en_obera(), v_ch.estado,
            'Datos corregidos: ' || array_to_string(v_cambio, ', '), app.usuario_actual_id());
  end if;
end;
$$;

revoke all on function public.depositar_cheques(uuid[], date, text) from public, anon;
revoke all on function public.marcar_cheques_debitados(uuid[], date) from public, anon;
revoke all on function public.deshacer_cheque(uuid, text) from public, anon;
revoke all on function public.devolver_cheque(uuid, date, text, boolean) from public, anon;
revoke all on function public.rechazar_cheque(uuid, date, text, numeric, boolean) from public, anon;
revoke all on function public.corregir_cheque(uuid, jsonb) from public, anon;
grant execute on function public.depositar_cheques(uuid[], date, text) to authenticated;
grant execute on function public.marcar_cheques_debitados(uuid[], date) to authenticated;
grant execute on function public.deshacer_cheque(uuid, text) to authenticated;
grant execute on function public.devolver_cheque(uuid, date, text, boolean) to authenticated;
grant execute on function public.rechazar_cheque(uuid, date, text, numeric, boolean) to authenticated;
grant execute on function public.corregir_cheque(uuid, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Lo que lee la pantalla
-- ───────────────────────────────────────────────────────────────
create view public.vista_cheque
with (security_invoker = true) as
select
  c.id, c.origen, c.electronico, c.banco, c.numero, c.importe,
  c.fecha_emision, c.fecha_pago, c.librador, c.librador_cuit,
  c.estado, c.estado_desde, c.cliente_id, c.proveedor_id, c.deposito,
  c.motivo, c.gastos, c.observaciones, c.creado_en,
  app.nombre_del_cheque(c)                             as nombre,
  cl.nombre                                            as cliente,
  cl.cuenta_corriente                                  as cliente_con_cuenta,
  pr.nombre                                            as proveedor,
  v.codigo                                             as venta,
  -- Al día o diferido, con la fecha en que se recibió o se libró.
  c.fecha_pago > coalesce(c.fecha_emision,
                          (c.creado_en at time zone 'America/Argentina/Buenos_Aires')::date) as diferido,
  -- Hasta cuándo el banco lo paga: 30 días desde su fecha de pago.
  case when c.origen = 'tercero' then c.fecha_pago + 30 end as presentar_hasta,
  (c.banco is null or c.numero is null)               as faltan_datos
from public.cheque c
left join public.cliente cl   on cl.id = c.cliente_id
left join public.proveedor pr on pr.id = c.proveedor_id
left join public.venta_pago vp on vp.id = c.venta_pago_id
left join public.venta v       on v.id = vp.venta_id;

comment on view public.vista_cheque is
  'Cada cheque con de quién vino, a quién se le dio y hasta cuándo se puede depositar.';

grant select on public.vista_cheque to authenticated;

-- ───────────────────────────────────────────────────────────────
-- 5. El calendario: qué se cobra y qué se paga, día por día
-- ───────────────────────────────────────────────────────────────
/*
  El «calendario de recibos» que pidió Lucas en agosto. Junta lo que va
  a entrar —cheques de la cartera por su fecha de pago y cuentas de
  clientes por su vencimiento— y lo que va a salir —facturas de
  proveedores por su vencimiento y cheques propios por su fecha—.

  No cuenta nada dos veces: una factura pagada con un cheque diferido
  deja de estar pendiente y aparece el cheque, en su fecha. Lo mismo del
  lado de los clientes.

  Lo que no tiene fecha —una factura cargada sin vencimiento— sale con
  fecha vacía: la pantalla lo muestra aparte.

  Cada uno ve lo que sus permisos le dejan ver de cada tabla.
*/
create view public.vista_calendario
with (security_invoker = true) as
with cargos as (
  select m.cliente_id, m.vencimiento, m.importe,
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
),
-- Lo que queda de cada cargo, pagando primero lo más viejo: la misma
-- cuenta que vista_deuda_antiguedad.
vivo as (
  select c.cliente_id, c.vencimiento,
         greatest(0, least(c.importe, c.acumulado - coalesce(p.total, 0))) as pendiente
  from cargos c
  left join pagado p on p.cliente_id = c.cliente_id
)
select c.fecha_pago as fecha, 'entra'::text as sentido, 'cheque'::text as tipo,
       app.nombre_del_cheque(c) as descripcion,
       coalesce(c.librador, cl.nombre) as quien,
       c.importe, c.id as referencia
from public.cheque c
left join public.cliente cl on cl.id = c.cliente_id
where c.estado = 'en_cartera'
union all
select v.vencimiento, 'entra', 'cuenta_cliente', 'Cuenta corriente',
       cl.nombre, sum(v.pendiente), cl.id
from vivo v
join public.cliente cl on cl.id = v.cliente_id and cl.eliminado_en is null
where v.pendiente > 0
group by v.vencimiento, cl.id, cl.nombre
union all
select p.vencimiento, 'sale', 'proveedor', p.descripcion, pr.nombre, p.pendiente, p.proveedor_id
from public.vista_pendiente_proveedor p
join public.proveedor pr on pr.id = p.proveedor_id
where p.pendiente > 0
union all
select c.fecha_pago, 'sale', 'cheque_propio', app.nombre_del_cheque(c), pr.nombre, c.importe, c.id
from public.cheque c
join public.proveedor pr on pr.id = c.proveedor_id
where c.origen = 'propio' and c.estado = 'emitido';

comment on view public.vista_calendario is
  'Lo que entra (cheques en cartera, cuentas de clientes) y lo que sale (facturas de proveedores, cheques propios), con su fecha.';

grant select on public.vista_calendario to authenticated;
