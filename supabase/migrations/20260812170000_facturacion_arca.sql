-- ═══════════════════════════════════════════════════════════════
-- 010 — FACTURACION ELECTRONICA ARCA
--
-- CUATRO COSAS QUE DEFINEN ESTE MODULO
--
-- 1) EL COMPROBANTE ES UNA FOTO COMPLETA.
--    Se copian los datos del cliente (nombre, documento, condicion de
--    IVA, domicilio) al emitir. ARCA exige conservar la documentacion
--    diez anios: si dentro de ocho anios el cliente cambio de domicilio
--    o lo dieron de baja, el comprobante tiene que seguir mostrando lo
--    que decia el dia que se emitio.
--
-- 2) LA NUMERACION NO PUEDE TENER SALTOS.
--    Es secuencial por punto de venta y tipo de comprobante. El numero
--    se reserva al crear el comprobante y NO se libera si ARCA rechaza:
--    se corrige el error y se reintenta con el MISMO numero. Saltear un
--    numero es un problema fiscal, no un detalle.
--
-- 3) HAY QUE REGISTRAR CADA INTENTO, TAMBIEN LOS FALLIDOS.
--    La RG 5852/2026 (vigente desde el 1/8/2026) exige dejar asentado
--    cada intento con fecha, causa y responsable, y limita el uso de
--    CAEA a contingencia real, con un tope de indisponibilidad de
--    alrededor del 5% mensual por punto de venta (RG 4290/2018).
--    Por eso intento_arca no es un log de debug: es documentacion
--    exigida por norma.
--
-- 4) EL CAE TIENE VENTANA DE TIEMPO.
--    Para comprobantes de PRODUCTOS, ARCA acepta una fecha de hasta 5
--    dias corridos de diferencia con el dia de la solicitud. Si una
--    terminal estuvo mas de 5 dias sin conexion, esas ventas ya no
--    pueden obtener CAE con su fecha original: ahi es donde entra el
--    CAEA. El sistema lo avisa antes de que sea tarde.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Tipos de comprobante — codigos de ARCA (FEParamGetTiposCbte)
-- ───────────────────────────────────────────────────────────────
create table public.tipo_comprobante (
  id          smallint primary key,
  descripcion text not null,
  clase       char(1) not null check (clase in ('A', 'B', 'C', 'M')),
  familia     text not null check (familia in ('factura', 'nota_credito', 'nota_debito')),
  -- +1 suma a la deuda del cliente, -1 la reduce
  signo       smallint not null check (signo in (-1, 1)),
  activo      boolean not null default true
);

insert into public.tipo_comprobante (id, descripcion, clase, familia, signo, activo) values
  (1,   'Factura A',           'A', 'factura',       1, true),
  (2,   'Nota de Débito A',    'A', 'nota_debito',   1, true),
  (3,   'Nota de Crédito A',   'A', 'nota_credito', -1, true),
  (6,   'Factura B',           'B', 'factura',       1, true),
  (7,   'Nota de Débito B',    'B', 'nota_debito',   1, true),
  (8,   'Nota de Crédito B',   'B', 'nota_credito', -1, true),
  (11,  'Factura C',           'C', 'factura',       1, false),
  (12,  'Nota de Débito C',    'C', 'nota_debito',   1, false),
  (13,  'Nota de Crédito C',   'C', 'nota_credito', -1, false),
  (51,  'Factura M',           'M', 'factura',       1, false),
  (52,  'Nota de Débito M',    'M', 'nota_debito',   1, false),
  (53,  'Nota de Crédito M',   'M', 'nota_credito', -1, false),
  (201, 'FCE MiPyME A',        'A', 'factura',       1, false),
  (202, 'ND FCE MiPyME A',     'A', 'nota_debito',   1, false),
  (203, 'NC FCE MiPyME A',     'A', 'nota_credito', -1, false),
  (206, 'FCE MiPyME B',        'B', 'factura',       1, false),
  (207, 'ND FCE MiPyME B',     'B', 'nota_debito',   1, false),
  (208, 'NC FCE MiPyME B',     'B', 'nota_credito', -1, false);

alter table public.tipo_comprobante enable row level security;

-- ───────────────────────────────────────────────────────────────
-- Tributos — codigos de ARCA (FEParamGetTiposTributos)
-- La percepcion de IIBB Misiones va como tributo provincial (id 2).
-- ───────────────────────────────────────────────────────────────
create table public.tributo (
  id          smallint primary key,
  descripcion text not null,
  activo      boolean not null default true
);

insert into public.tributo (id, descripcion, activo) values
  (1,  'Impuestos nacionales',   false),
  (2,  'Impuestos provinciales', true),
  (3,  'Impuestos municipales',  false),
  (4,  'Impuestos internos',     false),
  (99, 'Otros',                  false);

alter table public.tributo enable row level security;

-- ───────────────────────────────────────────────────────────────
-- Secuencia de numeracion
--
-- Una por punto de venta y tipo de comprobante, como exige ARCA.
-- Se sincroniza contra FECompUltimoAutorizado al conectar, por si el
-- sistema y ARCA quedaron desfasados.
-- ───────────────────────────────────────────────────────────────
create table public.secuencia_comprobante (
  punto_venta_id      uuid     not null references public.punto_venta(id)     on delete cascade,
  tipo_comprobante_id smallint not null references public.tipo_comprobante(id),
  ultimo_numero       bigint   not null default 0 check (ultimo_numero >= 0),
  -- ultimo numero que ARCA reconoce como autorizado
  ultimo_arca         bigint,
  sincronizado_en     timestamptz,
  actualizado_en      timestamptz not null default now(),
  primary key (punto_venta_id, tipo_comprobante_id)
);

create index secuencia_comprobante_tipo_idx on public.secuencia_comprobante (tipo_comprobante_id);

create or replace function app.siguiente_numero_comprobante(
  p_punto_venta_id      uuid,
  p_tipo_comprobante_id smallint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero bigint;
begin
  -- El insert-on-conflict con update toma el bloqueo de fila, asi que
  -- dos cajas concurrentes no pueden sacar el mismo numero.
  insert into public.secuencia_comprobante
    (punto_venta_id, tipo_comprobante_id, ultimo_numero, actualizado_en)
  values (p_punto_venta_id, p_tipo_comprobante_id, 1, now())
  on conflict (punto_venta_id, tipo_comprobante_id) do update
    set ultimo_numero  = public.secuencia_comprobante.ultimo_numero + 1,
        actualizado_en = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

revoke all on function app.siguiente_numero_comprobante(uuid, smallint) from public, anon;
grant execute on function app.siguiente_numero_comprobante(uuid, smallint) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- CAEA — Codigo de Autorizacion Electronico Anticipado
--
-- Se pide por quincena POR ADELANTADO y permite emitir cuando ARCA no
-- responde. Despues hay que informar los comprobantes emitidos con el.
-- Desde la RG 5852/2026 esta reservado a contingencia real.
-- ───────────────────────────────────────────────────────────────
create table public.caea (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null,
  periodo             integer not null check (periodo between 202000 and 210012),
  -- 1 = del 1 al 15, 2 = del 16 al fin de mes
  quincena            smallint not null check (quincena in (1, 2)),
  fecha_desde         date not null,
  fecha_hasta         date not null,
  -- fecha limite para informarle a ARCA los comprobantes emitidos
  fecha_tope_informar date,
  estado              text not null default 'vigente'
                        check (estado in ('vigente', 'vencido', 'informado')),
  solicitado_en       timestamptz not null default now(),
  informado_en        timestamptz,
  observaciones       text,

  constraint caea_periodo_quincena_unico unique (periodo, quincena),
  constraint caea_rango_coherente check (fecha_hasta >= fecha_desde)
);

create unique index caea_codigo_unico on public.caea (codigo);
create index caea_vigente_idx on public.caea (fecha_desde, fecha_hasta) where estado = 'vigente';

comment on table public.caea is
  'Códigos anticipados para facturar cuando ARCA no responde. Se piden por quincena y hay que informar después qué se emitió con ellos.';

-- ───────────────────────────────────────────────────────────────
-- Comprobante
-- ───────────────────────────────────────────────────────────────
create table public.comprobante (
  id                  uuid primary key default gen_random_uuid(),

  tipo_comprobante_id smallint not null references public.tipo_comprobante(id),
  punto_venta_id      uuid     not null references public.punto_venta(id) on delete restrict,
  numero              bigint   not null check (numero > 0),

  venta_id            uuid references public.venta(id) on delete set null,
  cliente_id          uuid references public.cliente(id) on delete set null,

  -- ── Foto del receptor al momento de emitir ──
  receptor_nombre           text     not null,
  receptor_tipo_documento_id smallint not null references public.tipo_documento(id),
  receptor_documento        text,
  receptor_condicion_iva_id smallint not null references public.condicion_iva_receptor(id),
  receptor_domicilio        text,

  -- ── Datos del comprobante ──
  fecha               date not null default current_date,
  -- 1 productos, 2 servicios, 3 ambos. Gross vende productos.
  concepto            smallint not null default 1 check (concepto in (1, 2, 3)),
  moneda              char(3) not null default 'PES',
  cotizacion          numeric(14,6) not null default 1,

  -- ── Importes ──
  neto_gravado        numeric(14,2) not null default 0,
  neto_no_gravado     numeric(14,2) not null default 0,
  exento              numeric(14,2) not null default 0,
  iva_total           numeric(14,2) not null default 0,
  tributos_total      numeric(14,2) not null default 0,
  total               numeric(14,2) not null default 0,

  -- ── Autorizacion ──
  estado              text not null default 'pendiente' check (estado in (
                        'pendiente',      -- creado, todavia no se pidio autorizacion
                        'autorizado',     -- ARCA devolvio CAE
                        'contingencia',   -- emitido con CAEA, falta informarlo
                        'informado',      -- CAEA ya informado a ARCA
                        'rechazado',      -- ARCA lo rechazo; hay que corregir y reintentar
                        'anulado')),
  modalidad           text not null default 'cae' check (modalidad in ('cae', 'caea')),

  cae                 text,
  cae_vencimiento     date,
  caea_id             uuid references public.caea(id) on delete set null,

  arca_resultado      char(1) check (arca_resultado in ('A', 'P', 'R')),
  arca_observaciones  jsonb,
  arca_errores        jsonb,
  autorizado_en       timestamptz,

  -- ── Impresion ──
  impreso_en          timestamptz,
  impresiones         integer not null default 0,

  -- ── Trazabilidad ──
  usuario_id          uuid references public.usuario(id)  on delete set null,
  terminal_id         uuid references public.terminal(id) on delete set null,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  -- La numeracion no admite duplicados dentro del punto de venta y tipo
  constraint comprobante_numeracion_unica
    unique (punto_venta_id, tipo_comprobante_id, numero),
  -- Un comprobante autorizado tiene que tener CAE con su vencimiento
  constraint comprobante_autorizado_con_cae check (
    estado <> 'autorizado' or (cae is not null and cae_vencimiento is not null)),
  -- Uno emitido en contingencia tiene que apuntar al CAEA que uso
  constraint comprobante_contingencia_con_caea check (
    modalidad <> 'caea' or caea_id is not null)
);

create index comprobante_venta_idx      on public.comprobante (venta_id);
create index comprobante_cliente_idx    on public.comprobante (cliente_id, fecha desc);
create index comprobante_estado_idx     on public.comprobante (estado, fecha desc);
create index comprobante_fecha_idx      on public.comprobante (fecha desc);
create index comprobante_tipo_idx       on public.comprobante (tipo_comprobante_id);
create index comprobante_pv_idx         on public.comprobante (punto_venta_id, fecha desc);
create index comprobante_caea_idx       on public.comprobante (caea_id);
create index comprobante_usuario_idx    on public.comprobante (usuario_id);
create index comprobante_terminal_idx   on public.comprobante (terminal_id);
create index comprobante_receptor_doc_idx on public.comprobante (receptor_documento);
create index comprobante_actualizado_idx on public.comprobante (actualizado_en);
-- Los que esperan resolucion: es la cola que mira el cajero
create index comprobante_cola_idx on public.comprobante (creado_en)
  where estado in ('pendiente', 'contingencia', 'rechazado');

create trigger comprobante_actualizado_en before update on public.comprobante
  for each row execute function app.set_actualizado_en();

comment on table public.comprobante is
  'Comprobante fiscal. Guarda foto del receptor porque ARCA exige conservación por 10 años y los datos del cliente cambian.';
comment on column public.comprobante.numero is
  'Secuencial por punto de venta y tipo. Se reserva al crear y NO se libera si ARCA rechaza: se corrige y se reintenta con el mismo número.';

-- ── Desglose de IVA por alicuota (array Iva de WSFEv1) ──
create table public.comprobante_alicuota (
  id               uuid primary key default gen_random_uuid(),
  comprobante_id   uuid not null references public.comprobante(id) on delete cascade,
  alicuota_iva_id  smallint not null references public.alicuota_iva(id),
  base_imponible   numeric(14,2) not null,
  importe          numeric(14,2) not null,
  constraint comprobante_alicuota_unica unique (comprobante_id, alicuota_iva_id)
);

create index comprobante_alicuota_comp_idx on public.comprobante_alicuota (comprobante_id);
create index comprobante_alicuota_iva_idx  on public.comprobante_alicuota (alicuota_iva_id);

-- ── Tributos: percepciones de IIBB Misiones (array Tributos) ──
create table public.comprobante_tributo (
  id             uuid primary key default gen_random_uuid(),
  comprobante_id uuid not null references public.comprobante(id) on delete cascade,
  tributo_id     smallint not null references public.tributo(id),
  descripcion    text not null,
  base_imponible numeric(14,2) not null,
  alicuota       numeric(7,4) not null,
  importe        numeric(14,2) not null
);

create index comprobante_tributo_comp_idx on public.comprobante_tributo (comprobante_id);
create index comprobante_tributo_trib_idx on public.comprobante_tributo (tributo_id);

-- ── Comprobantes asociados: una NC/ND referencia a su factura ──
create table public.comprobante_asociado (
  id                    uuid primary key default gen_random_uuid(),
  comprobante_id        uuid not null references public.comprobante(id) on delete cascade,
  asociado_id           uuid references public.comprobante(id) on delete set null,
  -- copia de los datos por si el asociado es anterior al sistema
  tipo_comprobante_id   smallint not null references public.tipo_comprobante(id),
  punto_venta_numero    integer not null,
  numero                bigint not null,
  fecha                 date,
  creado_en             timestamptz not null default now()
);

create index comprobante_asociado_comp_idx on public.comprobante_asociado (comprobante_id);
create index comprobante_asociado_asoc_idx on public.comprobante_asociado (asociado_id);
create index comprobante_asociado_tipo_idx on public.comprobante_asociado (tipo_comprobante_id);

-- ───────────────────────────────────────────────────────────────
-- Registro de intentos contra ARCA
--
-- Exigido por la RG 5852/2026: cada intento, con fecha, causa y
-- responsable. Es documentacion de cumplimiento, no un log de debug.
-- ───────────────────────────────────────────────────────────────
create table public.intento_arca (
  id             uuid primary key default gen_random_uuid(),
  comprobante_id uuid references public.comprobante(id) on delete set null,
  punto_venta_id uuid references public.punto_venta(id) on delete set null,

  operacion      text not null check (operacion in (
                   'FECAESolicitar', 'FECAEASolicitar', 'FECAEARegInformativo',
                   'FECompUltimoAutorizado', 'FECompConsultar', 'FEDummy',
                   'FEParamGet', 'WSAA')),
  resultado      text not null check (resultado in ('ok', 'error', 'timeout', 'rechazado')),

  -- causa del fallo, que es lo que pide la norma
  error_codigo   text,
  error_mensaje  text,

  request        jsonb,
  response       jsonb,
  duracion_ms    integer,

  -- responsable
  usuario_id     uuid references public.usuario(id)  on delete set null,
  terminal_id    uuid references public.terminal(id) on delete set null,

  creado_en      timestamptz not null default now()
);

create index intento_arca_comprobante_idx on public.intento_arca (comprobante_id, creado_en desc);
create index intento_arca_creado_idx      on public.intento_arca (creado_en desc);
create index intento_arca_resultado_idx   on public.intento_arca (resultado, creado_en desc);
create index intento_arca_pv_idx          on public.intento_arca (punto_venta_id, creado_en desc);
create index intento_arca_usuario_idx     on public.intento_arca (usuario_id);
create index intento_arca_terminal_idx    on public.intento_arca (terminal_id);

comment on table public.intento_arca is
  'Registro de cada intento contra ARCA, exitoso o fallido, con causa y responsable. Exigido por RG 5852/2026 para justificar el uso de CAEA.';

-- ───────────────────────────────────────────────────────────────
-- Armar el comprobante a partir de una venta
--
-- Deja el comprobante en estado pendiente, con el numero ya reservado y
-- el desglose de IVA calculado. Pedirle el CAE a ARCA es el paso
-- siguiente y lo hace el servicio que habla con el web service.
-- ───────────────────────────────────────────────────────────────
create or replace function public.preparar_comprobante(
  p_venta_id       uuid,
  p_punto_venta_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta      public.venta;
  v_cliente    public.cliente;
  v_clase      char(1);
  v_tipo       smallint;
  v_pv         uuid;
  v_numero     bigint;
  v_comp_id    uuid;
  v_neto       numeric := 0;
  v_iva        numeric := 0;
  v_exento     numeric := 0;
begin
  select * into v_venta from public.venta where id = p_venta_id;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado <> 'cobrada' then
    raise exception 'Solo se factura una venta cobrada. Esta esta %.', v_venta.estado;
  end if;
  if exists (select 1 from public.comprobante
             where venta_id = p_venta_id and estado <> 'anulado') then
    raise exception 'La venta ya tiene un comprobante emitido.';
  end if;

  select * into v_cliente from public.cliente where id = v_venta.cliente_id;

  -- A un Responsable Inscripto le corresponde A; al resto B
  v_clase := public.tipo_comprobante_para(v_venta.cliente_id);
  select id into v_tipo from public.tipo_comprobante
  where clase = v_clase and familia = 'factura' and activo;

  -- Punto de venta: el explicito, o el de la caja donde se cobro
  v_pv := p_punto_venta_id;
  if v_pv is null then
    select t.punto_venta_id into v_pv
    from public.caja c join public.terminal t on t.id = c.terminal_id
    where c.id = v_venta.caja_id;
  end if;
  if v_pv is null then
    select id into v_pv from public.punto_venta
    where activo and not es_respaldo and eliminado_en is null
    order by numero limit 1;
  end if;
  if v_pv is null then
    raise exception 'No hay punto de venta configurado para facturar.';
  end if;

  v_numero := app.siguiente_numero_comprobante(v_pv, v_tipo);

  select
    coalesce(sum(neto), 0),
    coalesce(sum(iva), 0)
  into v_neto, v_iva
  from public.vista_venta_iva where venta_id = p_venta_id;

  select coalesce(sum(l.importe), 0) into v_exento
  from public.venta_linea l
  where l.venta_id = p_venta_id and l.condicion_iva = 'exento';

  insert into public.comprobante (
    tipo_comprobante_id, punto_venta_id, numero, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, concepto,
    neto_gravado, exento, iva_total, total,
    estado, usuario_id, terminal_id
  ) values (
    v_tipo, v_pv, v_numero, p_venta_id, v_cliente.id,
    v_cliente.nombre, v_cliente.tipo_documento_id, v_cliente.numero_documento,
    v_cliente.condicion_iva_id,
    nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero, v_cliente.localidad)), ''),
    v_venta.ocurrido_en::date, 1,
    v_neto, v_exento, v_iva, v_venta.total,
    'pendiente', v_venta.cajero_id, v_venta.terminal_origen_id
  ) returning id into v_comp_id;

  insert into public.comprobante_alicuota (comprobante_id, alicuota_iva_id, base_imponible, importe)
  select v_comp_id, alicuota_iva_id, neto, iva
  from public.vista_venta_iva where venta_id = p_venta_id;

  return v_comp_id;
end;
$$;

comment on function public.preparar_comprobante(uuid, uuid) is
  'Arma el comprobante desde una venta cobrada: reserva número, copia los datos del receptor y calcula el desglose de IVA. Deja el pedido de CAE al servicio que habla con ARCA.';

grant execute on function public.preparar_comprobante(uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- El semaforo que describio Lucas
--
--   verde    autorizado e impreso
--   amarillo autorizado pero sin imprimir
--   naranja  esperando autorizacion
--   rojo     rechazado por ARCA
--   violeta  emitido con CAEA, falta informarlo
--
-- Ademas avisa cuando se acerca el limite de 5 dias para pedir el CAE.
-- ───────────────────────────────────────────────────────────────
create view public.vista_comprobante_estado
with (security_invoker = true) as
select
  c.id,
  c.estado,
  c.modalidad,
  tc.descripcion            as tipo,
  pv.numero                 as punto_venta,
  c.numero,
  lpad(pv.numero::text, 5, '0') || '-' || lpad(c.numero::text, 8, '0') as comprobante,
  c.fecha,
  c.receptor_nombre,
  c.total,
  c.cae,
  c.cae_vencimiento,
  c.impresiones,
  current_date - c.fecha    as dias_desde_emision,
  case
    when c.estado = 'autorizado'   and c.impresiones > 0 then 'verde'
    when c.estado = 'autorizado'   and c.impresiones = 0 then 'amarillo'
    when c.estado = 'pendiente'                          then 'naranja'
    when c.estado = 'rechazado'                          then 'rojo'
    when c.estado = 'contingencia'                       then 'violeta'
    when c.estado = 'informado'                          then 'verde'
    else 'gris'
  end                       as semaforo,
  -- Para comprobantes de productos ARCA acepta hasta 5 dias de
  -- diferencia entre la fecha del comprobante y la solicitud del CAE.
  case
    when c.estado not in ('pendiente', 'rechazado') then null
    when current_date - c.fecha > 5  then 'vencido'
    when current_date - c.fecha >= 4 then 'urgente'
    when current_date - c.fecha >= 2 then 'atencion'
    else 'en_plazo'
  end                       as ventana_cae,
  (select count(*) from public.intento_arca i
    where i.comprobante_id = c.id and i.resultado <> 'ok') as intentos_fallidos,
  (select max(i.creado_en) from public.intento_arca i
    where i.comprobante_id = c.id)                         as ultimo_intento
from public.comprobante c
join public.tipo_comprobante tc on tc.id = c.tipo_comprobante_id
join public.punto_venta pv      on pv.id = c.punto_venta_id;

comment on view public.vista_comprobante_estado is
  'Estado operativo de los comprobantes con semáforo. ventana_cae avisa cuando se agota el plazo de 5 días para pedir el CAE de un comprobante de productos.';

-- ───────────────────────────────────────────────────────────────
-- Disponibilidad de ARCA por punto de venta y mes
--
-- La RG 4290/2018 tolera alrededor de un 5% de indisponibilidad mensual
-- por punto de venta. Esta vista permite demostrarlo con numeros si
-- ARCA alguna vez pregunta por que se uso CAEA.
-- ───────────────────────────────────────────────────────────────
create view public.vista_disponibilidad_arca
with (security_invoker = true) as
select
  i.punto_venta_id,
  pv.numero                                            as punto_venta,
  date_trunc('month', i.creado_en)::date               as mes,
  count(*)                                             as intentos,
  count(*) filter (where i.resultado = 'ok')           as exitosos,
  count(*) filter (where i.resultado <> 'ok')          as fallidos,
  round(100.0 * count(*) filter (where i.resultado <> 'ok') / nullif(count(*), 0), 2)
                                                       as porcentaje_fallido,
  round(100.0 * count(*) filter (where i.resultado <> 'ok') / nullif(count(*), 0), 2) > 5
                                                       as supera_tolerancia
from public.intento_arca i
join public.punto_venta pv on pv.id = i.punto_venta_id
where i.operacion in ('FECAESolicitar', 'FECAEARegInformativo')
group by i.punto_venta_id, pv.numero, date_trunc('month', i.creado_en);

comment on view public.vista_disponibilidad_arca is
  'Indisponibilidad de ARCA por punto de venta y mes. Respalda el uso de CAEA frente al tope de ~5% de la RG 4290/2018.';

-- ───────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────
alter table public.secuencia_comprobante enable row level security;
alter table public.caea                  enable row level security;
alter table public.comprobante           enable row level security;
alter table public.comprobante_alicuota  enable row level security;
alter table public.comprobante_tributo   enable row level security;
alter table public.comprobante_asociado  enable row level security;
alter table public.intento_arca          enable row level security;

create policy tipo_comprobante_select on public.tipo_comprobante
  for select to authenticated using ((select app.es_usuario_activo()));
create policy tributo_select on public.tributo
  for select to authenticated using ((select app.es_usuario_activo()));

create policy secuencia_comprobante_select on public.secuencia_comprobante
  for select to authenticated using ((select app.tiene_permiso('facturacion.ver')));

create policy caea_select on public.caea
  for select to authenticated using ((select app.tiene_permiso('facturacion.ver')));
create policy caea_insert on public.caea
  for insert to authenticated with check ((select app.tiene_permiso('facturacion.contingencia')));
create policy caea_update on public.caea
  for update to authenticated
  using ((select app.tiene_permiso('facturacion.contingencia')))
  with check ((select app.tiene_permiso('facturacion.contingencia')));

create policy comprobante_select on public.comprobante
  for select to authenticated using ((select app.tiene_permiso('facturacion.ver')));
create policy comprobante_insert on public.comprobante
  for insert to authenticated with check ((select app.tiene_permiso('facturacion.emitir')));
create policy comprobante_update on public.comprobante
  for update to authenticated
  using ((select app.tiene_permiso('facturacion.emitir')))
  with check ((select app.tiene_permiso('facturacion.emitir')));

create policy comprobante_alicuota_select on public.comprobante_alicuota
  for select to authenticated using ((select app.tiene_permiso('facturacion.ver')));
create policy comprobante_alicuota_insert on public.comprobante_alicuota
  for insert to authenticated with check ((select app.tiene_permiso('facturacion.emitir')));

create policy comprobante_tributo_select on public.comprobante_tributo
  for select to authenticated using ((select app.tiene_permiso('facturacion.ver')));
create policy comprobante_tributo_insert on public.comprobante_tributo
  for insert to authenticated with check ((select app.tiene_permiso('facturacion.emitir')));

create policy comprobante_asociado_select on public.comprobante_asociado
  for select to authenticated using ((select app.tiene_permiso('facturacion.ver')));
create policy comprobante_asociado_insert on public.comprobante_asociado
  for insert to authenticated with check ((select app.tiene_permiso('facturacion.emitir')));

-- El registro de intentos se lee pero no se edita: es documentacion
-- de cumplimiento, no un log administrable.
create policy intento_arca_select on public.intento_arca
  for select to authenticated using ((select app.tiene_permiso('facturacion.ver')));
create policy intento_arca_insert on public.intento_arca
  for insert to authenticated with check ((select app.tiene_permiso('facturacion.emitir')));

grant select on public.tipo_comprobante, public.tributo, public.secuencia_comprobante,
                 public.caea, public.comprobante, public.comprobante_alicuota,
                 public.comprobante_tributo, public.comprobante_asociado,
                 public.intento_arca, public.vista_comprobante_estado,
                 public.vista_disponibilidad_arca
  to authenticated;
grant insert, update on public.caea, public.comprobante to authenticated;
grant insert on public.comprobante_alicuota, public.comprobante_tributo,
                 public.comprobante_asociado, public.intento_arca to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Configuracion del modulo
-- ───────────────────────────────────────────────────────────────
insert into public.configuracion (clave, valor, descripcion, grupo) values
  ('arca.ambiente', '"homologacion"',
   'homologacion o produccion. Define contra qué servidor de ARCA se factura.', 'arca'),
  ('arca.dias_tolerancia_cae', '5',
   'Días de diferencia que ARCA acepta entre la fecha del comprobante y la solicitud del CAE (productos).', 'arca'),
  ('arca.reintentos_antes_de_caea', '3',
   'Intentos fallidos consecutivos antes de pasar a contingencia con CAEA.', 'arca'),
  ('arca.timeout_segundos', '20',
   'Tiempo máximo de espera de una respuesta de ARCA.', 'arca');
