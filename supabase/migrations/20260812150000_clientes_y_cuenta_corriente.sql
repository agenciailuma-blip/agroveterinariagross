-- ═══════════════════════════════════════════════════════════════
-- 008 — CLIENTES Y CUENTA CORRIENTE
--
-- DOS CRITERIOS HEREDADOS DE LOS MODULOS ANTERIORES
--
-- 1) Los identificadores fiscales son los CODIGOS DE ARCA, no numeros
--    propios. Igual que se hizo con las alicuotas de IVA: al facturar no
--    hay traduccion, y donde no hay traduccion no hay error de mapeo.
--
-- 2) La cuenta corriente se guarda como LIBRO DE MOVIMIENTOS y el saldo
--    es la suma, exactamente igual que el stock. Misma razon: si dos
--    terminales sin conexion registran una venta y una cobranza del
--    mismo cliente, con un saldo que se pisa una de las dos desaparece.
--    Y ademas es como se lleva una cuenta corriente de verdad: no se
--    borra un renglon, se hace el asiento que lo corrige.
--
-- CONVENCION DE SIGNOS
--    positivo = el cliente debe mas   (venta, nota de debito)
--    negativo = el cliente debe menos (cobranza, nota de credito)
--    saldo positivo = nos debe
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Tipos de documento — codigos de ARCA (FEParamGetTiposDoc)
-- ───────────────────────────────────────────────────────────────
create table public.tipo_documento (
  id          smallint primary key,
  descripcion text not null,
  sigla       text not null,
  activo      boolean not null default true
);

insert into public.tipo_documento (id, sigla, descripcion, activo) values
  (80, 'CUIT',      'CUIT',                        true),
  (86, 'CUIL',      'CUIL',                        true),
  (96, 'DNI',       'DNI',                         true),
  (99, 'S/D',       'Sin identificar',             true),
  (87, 'CDI',       'CDI',                         false),
  (89, 'LE',        'Libreta de enrolamiento',     false),
  (90, 'LC',        'Libreta cívica',              false),
  (91, 'CI EXT',    'CI extranjera',               false),
  (94, 'PASAPORTE', 'Pasaporte',                   false);

alter table public.tipo_documento enable row level security;

-- ───────────────────────────────────────────────────────────────
-- Condición de IVA del receptor — codigos de ARCA
-- (FEParamGetCondicionIvaReceptor)
--
-- Informar esta condicion en el comprobante es obligatorio desde el
-- Regimen de Transparencia Fiscal (Ley 27.743). Verificar la tabla
-- contra el web service al conectar con homologacion.
-- ───────────────────────────────────────────────────────────────
create table public.condicion_iva_receptor (
  id                smallint primary key,
  descripcion       text not null,
  -- Gross es Responsable Inscripto: a un RI se le emite A, al resto B.
  tipo_comprobante  char(1) not null check (tipo_comprobante in ('A', 'B')),
  activo            boolean not null default true
);

insert into public.condicion_iva_receptor (id, descripcion, tipo_comprobante, activo) values
  (1,  'IVA Responsable Inscripto',                        'A', true),
  (4,  'IVA Sujeto Exento',                                'B', true),
  (5,  'Consumidor Final',                                 'B', true),
  (6,  'Responsable Monotributo',                          'B', true),
  (7,  'Sujeto No Categorizado',                           'B', true),
  (13, 'Monotributista Social',                            'B', true),
  (15, 'IVA No Alcanzado',                                 'B', true),
  (16, 'Monotributo Trabajador Independiente Promovido',   'B', false),
  (10, 'IVA Liberado - Ley 19.640',                        'B', false),
  (8,  'Proveedor del Exterior',                           'B', false),
  (9,  'Cliente del Exterior',                             'B', false);

alter table public.condicion_iva_receptor enable row level security;

-- ───────────────────────────────────────────────────────────────
-- Clientes
-- ───────────────────────────────────────────────────────────────
create table public.cliente (
  id                      uuid primary key default gen_random_uuid(),
  codigo                  text,
  tipo_persona            text not null default 'fisica'
                            check (tipo_persona in ('fisica', 'juridica')),
  nombre                  text not null,
  nombre_fantasia         text,

  -- fiscal
  condicion_iva_id        smallint not null default 5
                            references public.condicion_iva_receptor(id),
  tipo_documento_id       smallint not null default 99
                            references public.tipo_documento(id),
  numero_documento        text,

  -- domicilio
  calle                   text,
  numero                  text,
  piso_depto              text,
  localidad               text,
  provincia               text default 'Misiones',
  codigo_postal           text,

  -- contacto
  telefono                text,
  email                   text,

  -- comercial
  descuento_porcentaje    numeric(7,4) not null default 0
                            check (descuento_porcentaje >= 0 and descuento_porcentaje <= 100),
  lista_precio_id         uuid references public.lista_precio(id) on delete set null,

  -- cuenta corriente
  cuenta_corriente        boolean not null default false,
  limite_credito          numeric(14,4) check (limite_credito >= 0),
  dias_vencimiento        integer not null default 30 check (dias_vencimiento >= 0),

  observaciones           text,
  activo                  boolean not null default true,
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now(),
  eliminado_en            timestamptz,

  -- Para emitir Factura A hace falta CUIT: no se puede facturar A a
  -- alguien identificado con DNI o sin identificar.
  constraint cliente_ri_requiere_cuit check (
    condicion_iva_id <> 1 or (tipo_documento_id = 80 and numero_documento is not null)
  )
);

create unique index cliente_codigo_unico on public.cliente (upper(codigo))
  where codigo is not null and eliminado_en is null;
create unique index cliente_documento_unico
  on public.cliente (tipo_documento_id, numero_documento)
  where numero_documento is not null and tipo_documento_id <> 99 and eliminado_en is null;
create index cliente_nombre_trgm_idx on public.cliente using gin (nombre extensions.gin_trgm_ops);
create index cliente_documento_idx   on public.cliente (numero_documento) where numero_documento is not null;
create index cliente_cuenta_cte_idx  on public.cliente (cuenta_corriente) where cuenta_corriente and eliminado_en is null;
create index cliente_condicion_idx   on public.cliente (condicion_iva_id);
create index cliente_tipo_doc_idx    on public.cliente (tipo_documento_id);
create index cliente_lista_idx       on public.cliente (lista_precio_id);
create index cliente_actualizado_idx on public.cliente (actualizado_en);

create trigger cliente_actualizado_en before update on public.cliente
  for each row execute function app.set_actualizado_en();

comment on column public.cliente.dias_vencimiento is
  'Plazo por defecto para el vencimiento de las ventas en cuenta corriente de este cliente.';
comment on column public.cliente.lista_precio_id is
  'Lista propia del cliente. Le gana a la del medio de pago. Si es nula, manda la del medio de pago.';

-- ───────────────────────────────────────────────────────────────
-- Movimientos de cuenta corriente
-- ───────────────────────────────────────────────────────────────
create table public.movimiento_cuenta_corriente (
  -- id generado por el cliente, tambien offline: clave de idempotencia
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.cliente(id) on delete restrict,

  tipo            text not null check (tipo in (
                    'saldo_inicial',   -- migracion desde el sistema anterior
                    'venta',           -- venta a cuenta corriente
                    'cobranza',        -- pago del cliente
                    'nota_credito',    -- devolucion / bonificacion
                    'nota_debito',     -- interes, recargo
                    'ajuste')),

  -- positivo aumenta la deuda, negativo la reduce
  importe         numeric(14,4) not null,

  concepto        text,
  vencimiento     date,

  referencia_tipo text check (referencia_tipo in ('venta', 'comprobante', 'recibo', 'manual')),
  referencia_id   uuid,

  usuario_id      uuid references public.usuario(id)  on delete set null,
  operador_id     uuid references public.usuario(id)  on delete set null,
  terminal_id     uuid references public.terminal(id) on delete set null,

  ocurrido_en     timestamptz not null default now(),
  creado_en       timestamptz not null default now(),
  registrado_offline boolean not null default false,

  constraint movimiento_cc_importe_no_cero check (importe <> 0),
  constraint movimiento_cc_signo_coherente check (
    case tipo
      when 'venta'        then importe > 0
      when 'nota_debito'  then importe > 0
      when 'cobranza'     then importe < 0
      when 'nota_credito' then importe < 0
      else true
    end
  )
);

create index movimiento_cc_cliente_idx     on public.movimiento_cuenta_corriente (cliente_id, ocurrido_en desc);
create index movimiento_cc_vencimiento_idx on public.movimiento_cuenta_corriente (vencimiento)
  where vencimiento is not null;
create index movimiento_cc_referencia_idx  on public.movimiento_cuenta_corriente (referencia_tipo, referencia_id);
create index movimiento_cc_tipo_idx        on public.movimiento_cuenta_corriente (tipo, ocurrido_en desc);
create index movimiento_cc_usuario_idx     on public.movimiento_cuenta_corriente (usuario_id);
create index movimiento_cc_operador_idx    on public.movimiento_cuenta_corriente (operador_id);
create index movimiento_cc_terminal_idx    on public.movimiento_cuenta_corriente (terminal_id);
create index movimiento_cc_creado_idx      on public.movimiento_cuenta_corriente (creado_en desc);

comment on table public.movimiento_cuenta_corriente is
  'Libro de cuenta corriente. Inmutable: un error se corrige con el asiento que lo compensa, no editando.';

create table public.cuenta_corriente_saldo (
  cliente_id     uuid primary key references public.cliente(id) on delete cascade,
  saldo          numeric(14,4) not null default 0,
  actualizado_en timestamptz not null default now()
);

create index cuenta_corriente_saldo_deudor_idx on public.cuenta_corriente_saldo (cliente_id)
  where saldo > 0;

comment on table public.cuenta_corriente_saldo is
  'Saldo materializado. Derivado del libro, reconstruible con app.recalcular_saldo_cuenta_corriente(). Positivo = el cliente nos debe.';

create or replace function app.aplicar_movimiento_cuenta_corriente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cuenta_corriente_saldo (cliente_id, saldo, actualizado_en)
  values (new.cliente_id, new.importe, now())
  on conflict (cliente_id) do update
    set saldo          = public.cuenta_corriente_saldo.saldo + excluded.saldo,
        actualizado_en = now();
  return new;
end;
$$;

create trigger movimiento_cc_aplicar
  after insert on public.movimiento_cuenta_corriente
  for each row execute function app.aplicar_movimiento_cuenta_corriente();

create trigger movimiento_cc_inmutable
  before update or delete on public.movimiento_cuenta_corriente
  for each row execute function app.bloquear_modificacion_movimiento();

create or replace function app.recalcular_saldo_cuenta_corriente(p_cliente_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_afectados integer;
begin
  insert into public.cuenta_corriente_saldo (cliente_id, saldo, actualizado_en)
  select m.cliente_id, sum(m.importe), now()
  from public.movimiento_cuenta_corriente m
  where p_cliente_id is null or m.cliente_id = p_cliente_id
  group by m.cliente_id
  on conflict (cliente_id) do update
    set saldo = excluded.saldo, actualizado_en = now();
  get diagnostics v_afectados = row_count;
  return v_afectados;
end;
$$;

revoke all on function app.recalcular_saldo_cuenta_corriente(uuid) from public, anon;
grant execute on function app.recalcular_saldo_cuenta_corriente(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Que tipo de comprobante corresponde a un cliente
--
-- La regla vive en un solo lugar. Gross es Responsable Inscripto:
-- a un RI se le emite A, a todos los demas B.
-- ───────────────────────────────────────────────────────────────
create or replace function public.tipo_comprobante_para(p_cliente_id uuid)
returns char(1)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.tipo_comprobante
  from public.cliente cl
  join public.condicion_iva_receptor c on c.id = cl.condicion_iva_id
  where cl.id = p_cliente_id
$$;

grant execute on function public.tipo_comprobante_para(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Precio para un cliente concreto
--
-- Resuelve la lista y el descuento desde la ficha y delega en
-- calcular_precio(). Precedencia de la lista:
--   lista del cliente -> lista del medio de pago -> predeterminada
--
-- Nota para mas adelante: hoy el recargo de tarjeta vive en la lista
-- "Tarjeta". Si alguna vez se crean listas por segmento de cliente
-- (mayorista, productor), conviene mover ese recargo a
-- medio_pago_cuota, para que el segmento y la financiacion no compitan
-- por el mismo lugar.
-- ───────────────────────────────────────────────────────────────
create or replace function public.calcular_precio_cliente(
  p_producto_id   uuid,
  p_cliente_id    uuid    default null,
  p_medio_pago_id uuid    default null,
  p_cuotas        integer default 1
)
returns table (
  precio_base       numeric,
  precio_lista      numeric,
  recargo_cuotas    numeric,
  descuento_cliente numeric,
  precio_final      numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_descuento numeric := 0;
  v_lista     uuid;
  v_medio     uuid := p_medio_pago_id;
begin
  if p_cliente_id is not null then
    select cl.descuento_porcentaje, cl.lista_precio_id
      into v_descuento, v_lista
    from public.cliente cl
    where cl.id = p_cliente_id and cl.eliminado_en is null;
  end if;

  -- La lista del cliente le gana a la del medio de pago: se resuelve
  -- pasando el medio de pago que apunta a esa lista.
  if v_lista is not null then
    select mp.id into v_medio
    from public.medio_pago mp
    where mp.lista_precio_id = v_lista and mp.eliminado_en is null and mp.activo
    limit 1;
    v_medio := coalesce(v_medio, p_medio_pago_id);
  end if;

  return query
  select * from public.calcular_precio(
    p_producto_id, v_medio, p_cuotas, coalesce(v_descuento, 0));
end;
$$;

grant execute on function public.calcular_precio_cliente(uuid, uuid, uuid, integer) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Vista de cuenta corriente con antigüedad de deuda
--
-- Es la base del "calendario de recibos": quien debe, cuanto, y desde
-- cuando. El alcance exacto todavia lo tiene que confirmar Lucas.
-- ───────────────────────────────────────────────────────────────
create view public.vista_cuenta_corriente
with (security_invoker = true) as
select
  cl.id                          as cliente_id,
  cl.nombre,
  cl.telefono,
  cl.limite_credito,
  coalesce(s.saldo, 0)           as saldo,
  case
    when cl.limite_credito is null then null
    else cl.limite_credito - coalesce(s.saldo, 0)
  end                            as credito_disponible,
  coalesce(v.vencido, 0)         as vencido,
  coalesce(v.por_vencer, 0)      as por_vencer,
  v.vencimiento_mas_antiguo,
  case
    when coalesce(v.vencido, 0) > 0 then 'vencido'
    when cl.limite_credito is not null
         and coalesce(s.saldo, 0) > cl.limite_credito then 'excedido'
    when coalesce(s.saldo, 0) > 0 then 'al_dia'
    else 'sin_deuda'
  end                            as estado
from public.cliente cl
left join public.cuenta_corriente_saldo s on s.cliente_id = cl.id
left join lateral (
  select
    sum(m.importe) filter (where m.vencimiento <  current_date) as vencido,
    sum(m.importe) filter (where m.vencimiento >= current_date) as por_vencer,
    min(m.vencimiento) filter (where m.vencimiento < current_date) as vencimiento_mas_antiguo
  from public.movimiento_cuenta_corriente m
  where m.cliente_id = cl.id and m.importe > 0 and m.vencimiento is not null
) v on true
where cl.eliminado_en is null and cl.cuenta_corriente;

comment on view public.vista_cuenta_corriente is
  'Cuenta corriente con deuda vencida, por vencer y crédito disponible. Base del calendario de cobranzas.';

-- ───────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────
alter table public.cliente                      enable row level security;
alter table public.movimiento_cuenta_corriente  enable row level security;
alter table public.cuenta_corriente_saldo       enable row level security;

create policy tipo_documento_select on public.tipo_documento
  for select to authenticated using ((select app.es_usuario_activo()));
create policy condicion_iva_receptor_select on public.condicion_iva_receptor
  for select to authenticated using ((select app.es_usuario_activo()));

create policy cliente_select on public.cliente
  for select to authenticated using ((select app.tiene_permiso('clientes.ver')));
create policy cliente_insert on public.cliente
  for insert to authenticated with check ((select app.tiene_permiso('clientes.crear')));
create policy cliente_update on public.cliente
  for update to authenticated
  using ((select app.tiene_permiso('clientes.editar')))
  with check ((select app.tiene_permiso('clientes.editar')));

create policy movimiento_cc_select on public.movimiento_cuenta_corriente
  for select to authenticated using ((select app.tiene_permiso('cuentacorriente.ver')));
create policy movimiento_cc_insert on public.movimiento_cuenta_corriente
  for insert to authenticated
  with check (
    (select app.tiene_permiso('cuentacorriente.cobrar'))
    or (select app.tiene_permiso('ventas.cobrar'))
  );

create policy cuenta_corriente_saldo_select on public.cuenta_corriente_saldo
  for select to authenticated using ((select app.tiene_permiso('cuentacorriente.ver')));

grant select on public.tipo_documento, public.condicion_iva_receptor, public.cliente,
                 public.movimiento_cuenta_corriente, public.cuenta_corriente_saldo,
                 public.vista_cuenta_corriente
  to authenticated;
grant insert, update on public.cliente to authenticated;
grant insert on public.movimiento_cuenta_corriente to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- SEMILLA
--
-- Cliente generico para la venta de mostrador sin identificacion.
-- Sin esto, cada venta rapida obligaria a dar de alta a alguien.
-- ═══════════════════════════════════════════════════════════════
insert into public.cliente
  (codigo, nombre, condicion_iva_id, tipo_documento_id, cuenta_corriente, observaciones)
values
  ('CF', 'Consumidor Final', 5, 99, false,
   'Cliente genérico para ventas de mostrador sin identificación. No borrar.');
