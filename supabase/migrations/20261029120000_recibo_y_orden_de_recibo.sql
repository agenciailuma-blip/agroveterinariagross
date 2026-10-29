-- ═══════════════════════════════════════════════════════════════
-- EL RECIBO NUMERADO Y LA ORDEN DE RECIBO
--
-- Fase 03, punto 5.4. Hasta acá la cobranza de cuenta corriente bajaba
-- la deuda pero no dejaba un papel: el número del recibo se escribía a
-- mano en el concepto. Ahora cada cobranza es un recibo, con su número,
-- que se imprime, se manda por mail y se busca después en el registro.
--
-- La orden de recibo es lo que arma el vendedor de calle: el cliente le
-- transfiere y le muestra el comprobante, pero Facundo no sabe si la
-- plata llegó. Lucas: si el vendedor pudiera bajar deuda, el día que es
-- amigo del cliente le da de baja algo que no se pagó. Así que la orden
-- no toca la cuenta: en el local confirman que entró la plata y recién
-- al aceptarla sale el recibo y baja la deuda.
--
-- El recibo usa las mismas dos funciones de cobranza que ya había —con
-- y sin cheques—: lo que cambia es que las envuelve, les pone número y
-- deja escrito qué movimientos de la cuenta corresponden a cuál recibo.
-- ═══════════════════════════════════════════════════════════════

-- ── Permiso del vendedor ────────────────────────────────────────
insert into public.permiso (clave, grupo, descripcion, orden) values
  ('mayorista.cobrar', 'Mayorista', 'Armar órdenes de recibo de lo que le pagan en la calle', 276)
on conflict (clave) do nothing;

insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, 'mayorista.cobrar'
from public.rol r
where r.nombre in ('Vendedor de calle', 'Administrador', 'Encargado') and r.eliminado_en is null
on conflict do nothing;

-- ── El recibo ───────────────────────────────────────────────────
/*
  Un solo talonario. Si el local quiere seguir la numeración del
  talonario de papel, se pone el primer número en la configuración
  (recibo.primer_numero) antes de emitir el primero.
*/
insert into public.configuracion (clave, valor, descripcion, grupo)
values ('recibo.primer_numero', '1'::jsonb,
        'Número del primer recibo del sistema, para seguir el talonario de papel', 'Comprobantes')
on conflict (clave) do nothing;

create table public.recibo (
  id                 uuid primary key default gen_random_uuid(),
  serie              text not null default '0001',
  numero             bigint not null,
  cliente_id         uuid not null references public.cliente(id),
  fecha              date not null default app.hoy_en_obera(),
  total              numeric(14, 2) not null check (total > 0),
  concepto           text,
  orden_id           uuid unique,
  emitido_por        uuid references public.usuario(id),
  emitido_en         timestamptz not null default now(),
  -- El último mail: para contestar «¿me lo mandaste?» sin buscar.
  mail_destinatario  text,
  mail_estado        text check (mail_estado in ('enviado', 'error')),
  mail_error         text,
  mail_en            timestamptz,
  unique (serie, numero)
);

create index recibo_cliente_idx on public.recibo (cliente_id, emitido_en desc);

comment on table public.recibo is
  'Recibo numerado de una cobranza de cuenta corriente. Lo emite el local; el vendedor de calle sólo arma la orden.';

/*
  Con qué se pagó y qué movimiento de la cuenta dejó cada pago. Un
  recibo con tres cheques tiene tres renglones: cada cheque se deposita
  o rebota por su cuenta.
*/
create table public.recibo_pago (
  id             uuid primary key default gen_random_uuid(),
  recibo_id      uuid not null references public.recibo(id) on delete cascade,
  orden          smallint not null,
  medio_pago_id  uuid not null references public.medio_pago(id),
  importe        numeric(14, 2) not null check (importe > 0),
  cheque_id      uuid references public.cheque(id),
  movimiento_id  uuid not null references public.movimiento_cuenta_corriente(id),
  unique (recibo_id, orden)
);

create index recibo_pago_recibo_idx on public.recibo_pago (recibo_id);

alter table public.recibo enable row level security;
alter table public.recibo_pago enable row level security;

create policy recibo_select on public.recibo
  for select to authenticated
  using ((select app.tiene_permiso('cuentacorriente.ver')) or (select app.tiene_permiso('cuentacorriente.cobrar')));

create policy recibo_pago_select on public.recibo_pago
  for select to authenticated
  using ((select app.tiene_permiso('cuentacorriente.ver')) or (select app.tiene_permiso('cuentacorriente.cobrar')));

grant select on public.recibo, public.recibo_pago to authenticated;

-- ── La orden de recibo ──────────────────────────────────────────
create sequence if not exists public.orden_recibo_numero_seq;

create table public.orden_recibo (
  id              uuid primary key,
  numero          bigint not null unique default nextval('public.orden_recibo_numero_seq'),
  cliente_id      uuid not null references public.cliente(id),
  vendedor_id     uuid references public.usuario(id),
  importe         numeric(14, 2) not null check (importe > 0),
  forma           text not null check (forma in ('transferencia', 'efectivo', 'cheque')),
  detalle         text,
  armado_en       timestamptz not null default now(),
  recibido_en     timestamptz not null default now(),
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada')),
  recibo_id       uuid references public.recibo(id),
  resuelto_por    uuid references public.usuario(id),
  resuelto_en     timestamptz,
  motivo_rechazo  text,
  constraint orden_recibo_aceptada_con_recibo check ((estado = 'aceptada') = (recibo_id is not null)),
  constraint orden_recibo_rechazada_con_motivo check (estado <> 'rechazada' or motivo_rechazo is not null)
);

alter sequence public.orden_recibo_numero_seq owned by public.orden_recibo.numero;

create index orden_recibo_estado_idx on public.orden_recibo (estado, recibido_en desc);

alter table public.recibo
  add constraint recibo_orden_fk foreign key (orden_id) references public.orden_recibo(id);

alter table public.orden_recibo enable row level security;

create policy orden_recibo_select on public.orden_recibo
  for select to authenticated
  using ((select app.tiene_permiso('cuentacorriente.cobrar'))
         or ((select app.tiene_permiso('mayorista.cobrar')) and vendedor_id = (select app.usuario_actual_id())));

grant select on public.orden_recibo to authenticated;

-- ── El número ───────────────────────────────────────────────────
create or replace function app.siguiente_numero_recibo(p_serie text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ultimo bigint;
  v_primero bigint;
begin
  -- Dos cajas cobrando a la vez no se llevan el mismo número.
  perform pg_advisory_xact_lock(hashtext('recibo:' || p_serie));

  select max(numero) into v_ultimo from public.recibo where serie = p_serie;

  select case when jsonb_typeof(valor) = 'number' then (valor #>> '{}')::bigint
              when valor #>> '{}' ~ '^\d+$' then (valor #>> '{}')::bigint end
    into v_primero
  from public.configuracion where clave = 'recibo.primer_numero';

  return greatest(coalesce(v_ultimo + 1, 1), coalesce(v_primero, 1));
end;
$$;

revoke execute on function app.siguiente_numero_recibo(text) from public, anon;

-- ── Emitir el recibo ────────────────────────────────────────────
/*
  Una cobranza, ya con su recibo. Con cheques, lo que se paga es la
  suma de los cheques; con cualquier otro medio, el importe.

  El identificador lo pone la pantalla: si se corta la conexión después
  de grabar y se aprieta de nuevo, contesta el mismo recibo en vez de
  cobrar dos veces.

  Con p_orden_id, acepta la orden del vendedor en la misma transacción:
  o sale el recibo y la orden queda aceptada, o no pasa ninguna de las
  dos.
*/
create or replace function public.emitir_recibo(
  p_id            uuid,
  p_cliente_id    uuid,
  p_medio_pago_id uuid,
  p_importe       numeric default null,
  p_cheques       jsonb default null,
  p_caja_id       uuid default null,
  p_concepto      text default null,
  p_orden_id      uuid default null
)
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
  insert into public.recibo (id, serie, numero, cliente_id, fecha, total, concepto, orden_id, emitido_por)
  values (p_id, v_serie, v_numero, p_cliente_id, app.hoy_en_obera(), 0.01,
          nullif(btrim(coalesce(p_concepto, '')), ''), p_orden_id, v_usuario);

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

grant execute on function public.emitir_recibo(uuid, uuid, uuid, numeric, jsonb, uuid, text, uuid) to authenticated;

-- ── El recibo entero, para imprimirlo y mandarlo ────────────────
create or replace function public.recibo_completo(p_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado json;
begin
  if not (app.tiene_permiso('cuentacorriente.ver') or app.tiene_permiso('cuentacorriente.cobrar')) then
    raise exception 'No tenés permiso para ver recibos.';
  end if;

  select json_build_object(
    'id', r.id, 'serie', r.serie, 'numero', r.numero, 'fecha', r.fecha, 'total', r.total,
    'concepto', r.concepto, 'emitido_en', r.emitido_en,
    'emitido_por_nombre', u.nombre,
    'mail_destinatario', r.mail_destinatario, 'mail_estado', r.mail_estado,
    'mail_error', r.mail_error, 'mail_en', r.mail_en,
    'cliente_id', c.id, 'cliente_nombre', c.nombre, 'cliente_email', c.email,
    'cliente_documento', c.numero_documento,
    'cliente_domicilio', nullif(concat_ws(' ', c.calle, c.numero) || coalesce(', ' || c.localidad, ''), ''),
    'saldo_despues', (select coalesce(sum(m.importe), 0) from public.movimiento_cuenta_corriente m
                      where m.cliente_id = c.id and m.ocurrido_en <= r.emitido_en + interval '1 second'),
    'orden_numero', o.numero, 'orden_vendedor', uv.nombre,
    'pagos', coalesce((
      select json_agg(json_build_object(
               'medio', mp.nombre, 'importe', rp.importe,
               'cheque', case when ch.id is not null then
                 json_build_object('banco', ch.banco, 'numero', ch.numero, 'fecha_pago', ch.fecha_pago,
                                   'librador', ch.librador) end)
             order by rp.orden)
      from public.recibo_pago rp
      join public.medio_pago mp on mp.id = rp.medio_pago_id
      left join public.cheque ch on ch.id = rp.cheque_id
      where rp.recibo_id = r.id), '[]'::json)
  )
  into v_resultado
  from public.recibo r
  join public.cliente c on c.id = r.cliente_id
  left join public.usuario u on u.id = r.emitido_por
  left join public.orden_recibo o on o.id = r.orden_id
  left join public.usuario uv on uv.id = o.vendedor_id
  where r.id = p_id;

  if v_resultado is null then
    raise exception 'El recibo no existe.';
  end if;
  return v_resultado;
end;
$$;

grant execute on function public.recibo_completo(uuid) to authenticated;

-- ── El registro de recibos ──────────────────────────────────────
create or replace function public.listar_recibos(p_texto text default null, p_limite int default 200)
returns table (
  id            uuid,
  serie         text,
  numero        bigint,
  fecha         date,
  total         numeric,
  cliente_id    uuid,
  cliente_nombre text,
  medios        text,
  orden_numero  bigint,
  emitido_por_nombre text,
  mail_estado   text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
  v_digitos text := nullif(regexp_replace(coalesce(p_texto, ''), '\D', '', 'g'), '');
begin
  if not (app.tiene_permiso('cuentacorriente.ver') or app.tiene_permiso('cuentacorriente.cobrar')) then
    raise exception 'No tenés permiso para ver recibos.';
  end if;

  return query
  select r.id, r.serie, r.numero, r.fecha, r.total, c.id, c.nombre,
         (select string_agg(distinct mp.nombre, ', ') from public.recibo_pago rp
          join public.medio_pago mp on mp.id = rp.medio_pago_id where rp.recibo_id = r.id),
         o.numero, u.nombre, r.mail_estado
  from public.recibo r
  join public.cliente c on c.id = r.cliente_id
  left join public.orden_recibo o on o.id = r.orden_id
  left join public.usuario u on u.id = r.emitido_por
  where v_texto is null
     or c.nombre ilike '%' || v_texto || '%'
     or coalesce(c.nombre_fantasia, '') ilike '%' || v_texto || '%'
     -- «12», «0001-00000012» y «00000012» encuentran el mismo recibo.
     or (v_digitos is not null and length(v_digitos) <= 12
         and (r.numero = right(v_digitos, 8)::bigint or r.numero = v_digitos::bigint))
  order by r.emitido_en desc
  limit greatest(1, least(coalesce(p_limite, 200), 1000));
end;
$$;

grant execute on function public.listar_recibos(text, int) to authenticated;

-- ── La orden, desde el teléfono ─────────────────────────────────
/*
  Igual que el pedido: el identificador lo pone el teléfono, así que
  mandarla dos veces —se cortó la señal a mitad— no la duplica.
*/
create or replace function public.mayorista_enviar_orden_recibo(
  p_id         uuid,
  p_cliente_id uuid,
  p_importe    numeric,
  p_forma      text,
  p_detalle    text default null,
  p_armado_en  timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existente public.orden_recibo;
  v_cliente   public.cliente;
  v_numero    bigint;
begin
  if not app.tiene_permiso('mayorista.cobrar') then
    raise exception 'No tenés permiso para armar órdenes de recibo.';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador de la orden.';
  end if;

  select * into v_existente from public.orden_recibo where id = p_id;
  if v_existente.id is not null then
    return json_build_object('id', v_existente.id, 'numero', v_existente.numero, 'repetido', true);
  end if;

  select * into v_cliente from public.cliente where id = p_cliente_id and eliminado_en is null;
  if v_cliente.id is null or not v_cliente.mayorista then
    raise exception 'Ese cliente no es mayorista.';
  end if;
  if p_importe is null or p_importe <= 0 then
    raise exception 'El importe tiene que ser mayor que cero.';
  end if;
  if p_forma not in ('transferencia', 'efectivo', 'cheque') then
    raise exception 'La forma de pago no es válida.';
  end if;

  insert into public.orden_recibo (id, cliente_id, vendedor_id, importe, forma, detalle, armado_en)
  values (p_id, p_cliente_id, app.usuario_actual_id(), round(p_importe, 2), p_forma,
          nullif(btrim(coalesce(p_detalle, '')), ''),
          least(coalesce(p_armado_en, now()), now()))
  returning numero into v_numero;

  return json_build_object('id', p_id, 'numero', v_numero, 'repetido', false);
end;
$$;

grant execute on function public.mayorista_enviar_orden_recibo(uuid, uuid, numeric, text, text, timestamptz) to authenticated;

-- ── Las órdenes, para el local y para el vendedor ───────────────
create or replace function public.mayorista_ordenes_recibo(p_vista text)
returns table (
  id               uuid,
  numero           bigint,
  estado           text,
  cliente_id       uuid,
  cliente_nombre   text,
  cliente_localidad text,
  cliente_ruta     text,
  cliente_email    text,
  cliente_saldo    numeric,
  vendedor_nombre  text,
  importe          numeric,
  forma            text,
  detalle          text,
  armado_en        timestamptz,
  recibido_en      timestamptz,
  resuelto_en      timestamptz,
  resuelto_por_nombre text,
  motivo_rechazo   text,
  recibo_id        uuid,
  recibo_numero    text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_todo boolean := app.tiene_permiso('cuentacorriente.cobrar');
begin
  if not (v_todo or app.tiene_permiso('mayorista.cobrar')) then
    raise exception 'No tenés permiso para ver las órdenes de recibo.';
  end if;

  return query
  select o.id, o.numero, o.estado, c.id, c.nombre, c.localidad, c.ruta, c.email,
         case when v_todo or app.tiene_permiso('mayorista.ver_deuda')
              then coalesce((select s.saldo from public.cuenta_corriente_saldo s where s.cliente_id = c.id), 0) end,
         uv.nombre, o.importe, o.forma, o.detalle, o.armado_en, o.recibido_en, o.resuelto_en,
         ur.nombre, o.motivo_rechazo, r.id,
         case when r.id is not null then r.serie || '-' || lpad(r.numero::text, 8, '0') end
  from public.orden_recibo o
  join public.cliente c on c.id = o.cliente_id
  left join public.usuario uv on uv.id = o.vendedor_id
  left join public.usuario ur on ur.id = o.resuelto_por
  left join public.recibo r on r.id = o.recibo_id
  where (v_todo or o.vendedor_id = app.usuario_actual_id())
    and case p_vista
          when 'pendientes' then o.estado = 'pendiente'
          when 'aceptadas' then o.estado = 'aceptada' and o.resuelto_en > now() - interval '60 days'
          when 'rechazadas' then o.estado = 'rechazada' and o.resuelto_en > now() - interval '60 days'
          else false
        end
  order by case when o.estado = 'pendiente' then o.recibido_en end asc,
           o.resuelto_en desc nulls last
  limit 300;
end;
$$;

grant execute on function public.mayorista_ordenes_recibo(text) to authenticated;

create or replace function public.mayorista_ordenes_recibo_pendientes()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when app.tiene_permiso('cuentacorriente.cobrar')
              then (select count(*)::int from public.orden_recibo where estado = 'pendiente')
              else 0 end;
$$;

grant execute on function public.mayorista_ordenes_recibo_pendientes() to authenticated;

/*
  «No llegó la plata»: la orden queda rechazada con el motivo, y el
  vendedor lo ve. No se borra: es lo que le dijo el cliente.
*/
create or replace function public.mayorista_rechazar_orden_recibo(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden public.orden_recibo;
begin
  if not app.tiene_permiso('cuentacorriente.cobrar') then
    raise exception 'No tenés permiso para rechazar órdenes de recibo.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Falta el motivo.';
  end if;

  select * into v_orden from public.orden_recibo where id = p_id for update;
  if v_orden.id is null then
    raise exception 'La orden de recibo no existe.';
  end if;
  if v_orden.estado <> 'pendiente' then
    raise exception 'La orden de recibo % ya está %.', v_orden.numero, v_orden.estado;
  end if;

  update public.orden_recibo
  set estado = 'rechazada', motivo_rechazo = btrim(p_motivo),
      resuelto_por = app.usuario_actual_id(), resuelto_en = now()
  where id = p_id;
end;
$$;

grant execute on function public.mayorista_rechazar_orden_recibo(uuid, text) to authenticated;

-- Ninguna de estas funciones es para quien no inició sesión.
revoke execute on function
  public.emitir_recibo(uuid, uuid, uuid, numeric, jsonb, uuid, text, uuid),
  public.recibo_completo(uuid),
  public.listar_recibos(text, int),
  public.mayorista_enviar_orden_recibo(uuid, uuid, numeric, text, text, timestamptz),
  public.mayorista_ordenes_recibo(text),
  public.mayorista_ordenes_recibo_pendientes(),
  public.mayorista_rechazar_orden_recibo(uuid, text)
from public, anon;

-- ── El mayorista va siempre a cuenta corriente ──────────────────
/*
  Todo lo que vende el vendedor de calle se factura a la cuenta
  corriente, y la orden de recibo la baja. Al marcar a un cliente como
  mayorista —desde su ficha, o cuando el vendedor da de alta uno que ya
  existía— se le habilita la cuenta si no la tenía: si no, el primer
  pedido no se puede facturar y nadie entiende por qué. El 29/10 ningún
  cliente la tenía habilitada.

  Sólo al marcarlo: si después alguien le saca la cuenta corriente a
  propósito, se respeta.
*/
create or replace function app.mayorista_con_cuenta_corriente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.mayorista and (tg_op = 'INSERT' or not old.mayorista) and not new.cuenta_corriente then
    new.cuenta_corriente := true;
    new.dias_vencimiento := coalesce(new.dias_vencimiento, 30);
  end if;
  return new;
end;
$$;

create trigger cliente_mayorista_con_cuenta_corriente
  before insert or update of mayorista on public.cliente
  for each row execute function app.mayorista_con_cuenta_corriente();
