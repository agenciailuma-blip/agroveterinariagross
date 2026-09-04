-- ═══════════════════════════════════════════════════════════════
-- COMPROBANTES NO FISCALES — presupuesto, remito y comprobante interno
--
-- POR QUE UNA TABLA APARTE Y NO UN TIPO MAS DE comprobante
--
-- Seria mas corto agregar 'Presupuesto' y 'Remito' a tipo_comprobante
-- y reusar la tabla comprobante, que ya tiene numeracion, impresion y
-- listado. Hay tres razones para no hacerlo, y las tres ya nos costaron
-- tiempo antes:
--
-- 1) LOS ID DE tipo_comprobante SON DE ARCA, NO NUESTROS.
--    Es una de las decisiones que no se revisan: los identificadores
--    fiscales son los codigos que publica ARCA, para que al facturar no
--    haya traduccion. Inventar un "900 = Remito" es ocupar un espacio
--    de numeracion ajeno, que es exactamente el error de mapeo que esa
--    decision existe para evitar.
--
-- 2) UN NO FISCAL ADENTRO DE comprobante SE FILTRA SOLO A ARCA.
--    Hoy hay consultas que dicen "comprobantes": el semaforo, la cola
--    de pendientes, las ventas sin facturar y —la peligrosa— el
--    FECAEARegInformativo que le informa a ARCA que se emitio con CAEA.
--    Cada una tendria que acordarse de excluir los no fiscales. La que
--    se olvide una vez le informa a ARCA un documento que no existe
--    para el fisco: es un problema de cumplimiento, no un bug de
--    pantalla.
--
-- 3) LA SERIE FISCAL NO TOLERA HUECOS Y YA NOS MORDIO.
--    El error 703 al rendir el CAEA fue justamente eso. Meter dos
--    regimenes de numeracion en la misma tabla es donde se esconde el
--    siguiente.
--
-- Comparten la pantalla y la impresora. No comparten los numeros.
--
-- EL LIMITE, ESCRITO UNA VEZ
--
-- No se construye nada que borre o esconda lo que paso. Un comprobante
-- no fiscal se anula con motivo, nunca se borra; y no tiene forma de
-- imprimirse con aspecto de factura, porque no guarda CAE, ni CAEA, ni
-- clase A/B, ni desglose de IVA. No es una intencion: es que las
-- columnas no existen.
--
-- El argumento a favor de tenerlo, que es el que importa: sin este
-- documento esa venta no se carga en el sistema. Ahi se pierde el
-- stock, se pierde quien vendio, y el inventario deja de servir.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Los tres tipos
--
-- Tabla y no un check, para que la pantalla arme el desplegable de
-- aca y para poder apagar uno sin migrar.
-- ───────────────────────────────────────────────────────────────
create table public.tipo_comprobante_no_fiscal (
  clave       text primary key check (clave in ('presupuesto', 'remito', 'comprobante_interno')),
  descripcion text not null,
  -- va adelante del numero: PRE 0002-00000045
  sigla       text not null,
  -- el remito acompania mercaderia que se mueve de verdad; los otros dos no
  mueve_stock boolean not null default false,
  orden       smallint not null,
  activo      boolean not null default true
);

create unique index tipo_comprobante_no_fiscal_sigla_unica
  on public.tipo_comprobante_no_fiscal (upper(sigla));

insert into public.tipo_comprobante_no_fiscal (clave, descripcion, sigla, mueve_stock, orden) values
  ('presupuesto',         'Presupuesto',         'PRE', false, 10),
  ('remito',              'Remito',              'REM', true,  20),
  ('comprobante_interno', 'Comprobante interno', 'CI',  false, 30);

alter table public.tipo_comprobante_no_fiscal enable row level security;

comment on table public.tipo_comprobante_no_fiscal is
  'Los tres documentos que numera Gross, no ARCA. Ninguno lleva CAE ni discrimina IVA: no pueden parecerse a una factura.';

-- ───────────────────────────────────────────────────────────────
-- Cabecera
--
-- Copia la foto del receptor igual que comprobante, por la misma
-- razon: dentro de dos anios el cliente cambio de domicilio y el papel
-- tiene que seguir diciendo lo que decia el dia que se emitio.
-- ───────────────────────────────────────────────────────────────
create table public.comprobante_no_fiscal (
  -- lo genera la terminal, incluso sin conexion: es la clave de
  -- idempotencia de la sincronizacion, igual que en movimiento_stock
  id                  uuid primary key default gen_random_uuid(),

  tipo_clave          text not null references public.tipo_comprobante_no_fiscal(clave),

  -- ── Numeracion propia ──
  -- La serie es el prefijo de la terminal, congelado como texto. La
  -- terminal puede renombrarse o darse de baja; el numero impreso en
  -- un papel que el cliente tiene en la mano, no.
  serie               text   not null check (length(trim(serie)) > 0),
  numero              bigint not null check (numero > 0),
  terminal_id         uuid references public.terminal(id) on delete set null,

  venta_id            uuid references public.venta(id)   on delete set null,
  cliente_id          uuid references public.cliente(id) on delete set null,

  -- ── Foto del receptor al momento de emitir ──
  receptor_nombre             text     not null,
  receptor_tipo_documento_id  smallint not null references public.tipo_documento(id),
  receptor_documento          text,
  receptor_condicion_iva_id   smallint not null references public.condicion_iva_receptor(id),
  receptor_domicilio          text,

  fecha               date not null default current_date,
  total               numeric(14,2) not null default 0,
  observaciones       text,

  -- ── Solo presupuesto ──
  valido_hasta        date,

  -- ── Solo remito ──
  -- Arranca del domicilio del cliente y se puede cambiar por remito:
  -- el reparto no siempre va a la direccion de facturacion.
  entrega_domicilio   text,
  entrega_localidad   text,
  entrega_contacto    text,
  transportista       text,

  -- ── Cuando termina siendo factura ──
  convertido_en_comprobante_id uuid references public.comprobante(id) on delete set null,
  convertido_en                timestamptz,

  estado              text not null default 'emitido'
                        check (estado in ('emitido', 'convertido', 'anulado')),

  -- ── Trazabilidad: la decision tiene nombre ──
  emitido_por         uuid references public.usuario(id) on delete set null,
  anulado_en          timestamptz,
  anulado_por         uuid references public.usuario(id) on delete set null,
  motivo_anulacion    text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  registrado_offline  boolean not null default false,

  -- Anular exige motivo: un documento que desaparece sin explicacion es
  -- justamente lo que este modulo no puede permitir.
  constraint comprobante_no_fiscal_anulacion_justificada check (
    estado <> 'anulado'
    or (anulado_en is not null and motivo_anulacion is not null
        and length(trim(motivo_anulacion)) >= 3)),

  -- Si dice que se convirtio, tiene que decir en que
  constraint comprobante_no_fiscal_conversion_completa check (
    estado <> 'convertido'
    or (convertido_en_comprobante_id is not null and convertido_en is not null)),

  -- La validez es del presupuesto; el domicilio de entrega, del remito.
  -- Sin esto los tres tipos se contaminan y la pantalla tiene que
  -- adivinar cual de los campos mirar.
  constraint comprobante_no_fiscal_validez_solo_presupuesto check (
    valido_hasta is null or tipo_clave = 'presupuesto'),
  constraint comprobante_no_fiscal_entrega_solo_remito check (
    tipo_clave = 'remito'
    or (entrega_domicilio is null and entrega_localidad is null
        and entrega_contacto is null and transportista is null)),

  -- La numeracion es por tipo y serie. Dos terminales nunca chocan
  -- porque el prefijo las separa, que es lo que permite emitir sin
  -- conexion sin preguntarle el numero a nadie.
  constraint comprobante_no_fiscal_numeracion_unica unique (tipo_clave, serie, numero)
);

create index comprobante_no_fiscal_tipo_idx     on public.comprobante_no_fiscal (tipo_clave, fecha desc);
create index comprobante_no_fiscal_venta_idx    on public.comprobante_no_fiscal (venta_id);
create index comprobante_no_fiscal_cliente_idx  on public.comprobante_no_fiscal (cliente_id, fecha desc);
create index comprobante_no_fiscal_estado_idx   on public.comprobante_no_fiscal (estado, fecha desc);
create index comprobante_no_fiscal_fecha_idx    on public.comprobante_no_fiscal (fecha desc);
create index comprobante_no_fiscal_terminal_idx on public.comprobante_no_fiscal (terminal_id);
create index comprobante_no_fiscal_emitido_idx  on public.comprobante_no_fiscal (emitido_por);
create index comprobante_no_fiscal_anulado_idx  on public.comprobante_no_fiscal (anulado_por);
create index comprobante_no_fiscal_convertido_idx
  on public.comprobante_no_fiscal (convertido_en_comprobante_id);
-- La sincronizacion baja por actualizado_en, como todas las demas
create index comprobante_no_fiscal_actualizado_idx on public.comprobante_no_fiscal (actualizado_en);
-- Presupuestos abiertos: es la consulta que Lucas pidio poder contestar
create index comprobante_no_fiscal_abiertos_idx
  on public.comprobante_no_fiscal (tipo_clave, fecha desc) where estado = 'emitido';

create trigger comprobante_no_fiscal_actualizado_en
  before update on public.comprobante_no_fiscal
  for each row execute function app.set_actualizado_en();

comment on table public.comprobante_no_fiscal is
  'Presupuestos, remitos y comprobantes internos. Numeracion propia de Gross, separada de ARCA a proposito. No guarda CAE ni desglosa IVA.';
comment on column public.comprobante_no_fiscal.serie is
  'Prefijo de la terminal congelado como texto. El numero impreso en un papel que el cliente tiene no puede depender de que la terminal siga existiendo.';
comment on column public.comprobante_no_fiscal.convertido_en_comprobante_id is
  'Cuando el presupuesto o el interno terminan facturados, queda el hilo. Es lo que permite contestar cuantos quedaron abiertos.';

-- ───────────────────────────────────────────────────────────────
-- Lineas
--
-- Foto, igual que venta_linea: todo lo necesario para reimprimir el
-- documento dentro de anios vive aca y no depende de que el producto
-- siga existiendo.
--
-- NO hay alicuota de IVA ni condicion frente al IVA, y es a proposito:
-- discriminar IVA es lo que le da a un papel aspecto de factura.
-- ───────────────────────────────────────────────────────────────
create table public.comprobante_no_fiscal_linea (
  id                        uuid primary key default gen_random_uuid(),
  comprobante_no_fiscal_id  uuid not null
                              references public.comprobante_no_fiscal(id) on delete cascade,
  orden                     integer not null default 0,

  producto_id               uuid references public.producto(id) on delete set null,
  codigo_producto           text not null,
  descripcion               text not null,

  cantidad                  numeric(14,4) not null check (cantidad > 0),
  -- Cero es valido: un remito puede ir sin valorizar
  precio_unitario           numeric(14,4) not null default 0 check (precio_unitario >= 0),
  importe                   numeric(14,4) generated always as (cantidad * precio_unitario) stored,

  -- De que linea de la venta salio, para poder remitir parcialmente
  venta_linea_id            uuid references public.venta_linea(id) on delete set null,

  creado_en                 timestamptz not null default now(),
  actualizado_en            timestamptz not null default now()
);

create index comprobante_no_fiscal_linea_cab_idx
  on public.comprobante_no_fiscal_linea (comprobante_no_fiscal_id, orden);
create index comprobante_no_fiscal_linea_producto_idx
  on public.comprobante_no_fiscal_linea (producto_id);
create index comprobante_no_fiscal_linea_venta_linea_idx
  on public.comprobante_no_fiscal_linea (venta_linea_id);

create trigger comprobante_no_fiscal_linea_actualizado_en
  before update on public.comprobante_no_fiscal_linea
  for each row execute function app.set_actualizado_en();

-- ───────────────────────────────────────────────────────────────
-- Que documentacion lleva la venta
--
-- Sin esta columna el panel rojo de Facturacion —"ventas cobradas sin
-- comprobante", que es el caso grave— se llenaria con todas las ventas
-- no fiscales, y en dos semanas nadie lo mira. Un semaforo que grita
-- siempre deja de ser un semaforo.
--
-- Ademas es literalmente el conteo que pidio Lucas: cuanto se factura
-- y cuanto no.
--
-- Se guarda la DECISION, no se deduce de si existe el documento: la
-- decision se toma antes de emitir, y el documento puede fallar.
-- ───────────────────────────────────────────────────────────────
alter table public.venta
  add column documentacion text not null default 'fiscal'
    check (documentacion in ('fiscal', 'no_fiscal'));

create index venta_documentacion_idx on public.venta (documentacion, ocurrido_en desc);

comment on column public.venta.documentacion is
  'Si la venta lleva factura de ARCA o comprobante no fiscal. Se decide en la caja antes de cobrar y define que se le exige despues.';

-- ───────────────────────────────────────────────────────────────
-- Permisos
--
-- Cuatro y no uno, porque significan cosas distintas. El que importa
-- es vender_sin_factura: es el candado. Emitir un presupuesto o un
-- remito es operacion diaria; decidir que una venta no lleve factura
-- es una decision del duenio, no del turno de la tarde.
-- ───────────────────────────────────────────────────────────────
insert into public.permiso (clave, grupo, descripcion, orden) values
  ('facturacion.no_fiscal_ver',    'Facturación', 'Ver presupuestos, remitos y comprobantes internos', 640),
  ('facturacion.no_fiscal_emitir', 'Facturación', 'Emitir presupuestos, remitos y comprobantes internos', 650),
  ('facturacion.vender_sin_factura','Facturación', 'Decidir que una venta se cobre sin factura de ARCA', 660),
  ('facturacion.no_fiscal_anular', 'Facturación', 'Anular comprobantes no fiscales y remitos',         670);

-- Administrador: todo, como siempre
insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r cross join public.permiso p
where r.nombre = 'Administrador'
  and p.clave in ('facturacion.no_fiscal_ver', 'facturacion.no_fiscal_emitir',
                  'facturacion.vender_sin_factura', 'facturacion.no_fiscal_anular')
on conflict do nothing;

-- Encargado: todo salvo administracion del sistema, que no es esto
insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r cross join public.permiso p
where r.nombre = 'Encargado'
  and p.clave in ('facturacion.no_fiscal_ver', 'facturacion.no_fiscal_emitir',
                  'facturacion.vender_sin_factura', 'facturacion.no_fiscal_anular')
on conflict do nothing;

-- Cajero: emite y ve. NO decide vender sin factura, NO anula —anular un
-- remito devuelve mercaderia al stock y eso se mira, no se hace al paso.
insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r cross join public.permiso p
where r.nombre = 'Cajero'
  and p.clave in ('facturacion.no_fiscal_ver', 'facturacion.no_fiscal_emitir')
on conflict do nothing;

-- Vendedor: arma el presupuesto que el cliente se lleva a pensar. Es
-- exactamente su trabajo.
insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r cross join public.permiso p
where r.nombre = 'Vendedor'
  and p.clave in ('facturacion.no_fiscal_ver', 'facturacion.no_fiscal_emitir')
on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────
alter table public.comprobante_no_fiscal       enable row level security;
alter table public.comprobante_no_fiscal_linea enable row level security;

create policy tipo_comprobante_no_fiscal_select on public.tipo_comprobante_no_fiscal
  for select to authenticated using ((select app.es_usuario_activo()));

create policy comprobante_no_fiscal_select on public.comprobante_no_fiscal
  for select to authenticated using ((select app.tiene_permiso('facturacion.no_fiscal_ver')));
create policy comprobante_no_fiscal_insert on public.comprobante_no_fiscal
  for insert to authenticated with check ((select app.tiene_permiso('facturacion.no_fiscal_emitir')));
-- Update cubre dos cosas distintas: marcar convertido (lo hace quien
-- emite) y anular (lo hace quien anula). Si la politica pidiera solo el
-- permiso de emitir, alguien autorizado a anular y nada mas chocaria
-- contra RLS despues de haber pasado el control de la funcion, con un
-- error que no explica nada.
create policy comprobante_no_fiscal_update on public.comprobante_no_fiscal
  for update to authenticated
  using ((select app.tiene_permiso('facturacion.no_fiscal_emitir'))
      or (select app.tiene_permiso('facturacion.no_fiscal_anular')))
  with check ((select app.tiene_permiso('facturacion.no_fiscal_emitir'))
      or (select app.tiene_permiso('facturacion.no_fiscal_anular')));

create policy comprobante_no_fiscal_linea_select on public.comprobante_no_fiscal_linea
  for select to authenticated using ((select app.tiene_permiso('facturacion.no_fiscal_ver')));
create policy comprobante_no_fiscal_linea_insert on public.comprobante_no_fiscal_linea
  for insert to authenticated with check ((select app.tiene_permiso('facturacion.no_fiscal_emitir')));

-- Nadie borra. La anulacion es un cambio de estado con motivo.
-- No hay policy de delete, y sin policy no hay delete.

-- ───────────────────────────────────────────────────────────────
-- Numeracion
--
-- Mira la realidad, no su propio contador. Es la leccion que dejo la
-- numeracion fiscal: un contador que solo le suma uno a su valor
-- anterior entrega numeros ocupados apenas algo mueve la serie.
--
-- El bloqueo por serie evita que dos operaciones simultaneas de la
-- misma terminal saquen el mismo numero. Se libera solo al terminar la
-- transaccion. El indice unico queda igual como ultima red.
-- ───────────────────────────────────────────────────────────────
create or replace function app.siguiente_numero_no_fiscal(
  p_tipo_clave text,
  p_serie      text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ultimo bigint;
begin
  perform pg_advisory_xact_lock(hashtext('cnf:' || p_tipo_clave || ':' || upper(p_serie)));

  select coalesce(max(numero), 0) into v_ultimo
  from public.comprobante_no_fiscal
  where tipo_clave = p_tipo_clave and upper(serie) = upper(p_serie);

  return v_ultimo + 1;
end;
$$;

revoke all on function app.siguiente_numero_no_fiscal(text, text) from public, anon;
grant execute on function app.siguiente_numero_no_fiscal(text, text) to authenticated;

comment on function app.siguiente_numero_no_fiscal(text, text) is
  'Siguiente numero por tipo y serie. Toma el mayor usado + 1: un contador que solo se suma a si mismo entrega numeros ocupados.';

-- ───────────────────────────────────────────────────────────────
-- Emitir
--
-- Sale siempre de una venta —tambien el presupuesto, que es una venta
-- en borrador que el cliente se lleva a pensar— porque asi las lineas
-- son las mismas que ya calculo el sistema y no hay una segunda forma
-- de armar precios que se pueda separar de la primera.
--
-- p_lineas permite remitir parcialmente: [{"venta_linea_id": ...,
-- "cantidad": 2}]. En null se copia la venta entera, que es el caso
-- de todos los dias.
--
-- Este archivo NO mueve stock. El remito si lo mueve, y eso vive en la
-- migracion siguiente, sola, porque es el cambio delicado.
-- ───────────────────────────────────────────────────────────────
create or replace function public.emitir_comprobante_no_fiscal(
  p_venta_id     uuid,
  p_tipo_clave   text,
  p_terminal_id  uuid    default null,
  p_lineas       jsonb   default null,
  p_observaciones text   default null,
  p_valido_hasta date    default null,
  p_entrega_domicilio text default null,
  p_entrega_localidad text default null,
  p_entrega_contacto  text default null,
  p_transportista     text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta    public.venta;
  v_cliente  public.cliente;
  v_tipo     public.tipo_comprobante_no_fiscal;
  v_serie    text;
  v_numero   bigint;
  v_id       uuid;
  v_usuario  uuid;
  v_total    numeric;
begin
  select * into v_tipo from public.tipo_comprobante_no_fiscal
  where clave = p_tipo_clave and activo;
  if v_tipo.clave is null then
    raise exception 'No existe el tipo de comprobante no fiscal "%".', p_tipo_clave;
  end if;

  select * into v_venta from public.venta where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'La venta esta anulada: no se puede emitir documentacion sobre ella.';
  end if;
  if not exists (select 1 from public.venta_linea where venta_id = p_venta_id) then
    raise exception 'La venta no tiene productos.';
  end if;

  select * into v_cliente from public.cliente where id = v_venta.cliente_id;
  v_usuario := app.usuario_actual_id();

  -- La serie es el prefijo de la terminal. Si no se pasa terminal se usa
  -- la de origen de la venta; si tampoco hay, queda 'T' como en la
  -- numeracion de ventas.
  select coalesce(t.prefijo, 'T') into v_serie
  from public.terminal t
  where t.id = coalesce(p_terminal_id, v_venta.terminal_origen_id);
  v_serie := coalesce(v_serie, 'T');

  v_numero := app.siguiente_numero_no_fiscal(p_tipo_clave, v_serie);

  insert into public.comprobante_no_fiscal (
    tipo_clave, serie, numero, terminal_id, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, observaciones, valido_hasta,
    entrega_domicilio, entrega_localidad, entrega_contacto, transportista,
    emitido_por
  ) values (
    p_tipo_clave, v_serie, v_numero,
    coalesce(p_terminal_id, v_venta.terminal_origen_id),
    p_venta_id, v_venta.cliente_id,
    v_cliente.nombre, v_cliente.tipo_documento_id, v_cliente.numero_documento,
    v_cliente.condicion_iva_id,
    nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero,
                          v_cliente.piso_depto, v_cliente.localidad)), ''),
    current_date, p_observaciones,
    case when p_tipo_clave = 'presupuesto' then p_valido_hasta end,
    -- El domicilio de entrega arranca del cliente y se puede pisar por
    -- remito: el reparto no siempre va a la direccion de facturacion.
    case when p_tipo_clave = 'remito' then coalesce(
      p_entrega_domicilio,
      nullif(trim(concat_ws(' ', v_cliente.calle, v_cliente.numero, v_cliente.piso_depto)), '')) end,
    case when p_tipo_clave = 'remito' then coalesce(p_entrega_localidad, v_cliente.localidad) end,
    case when p_tipo_clave = 'remito' then coalesce(p_entrega_contacto, v_cliente.telefono) end,
    case when p_tipo_clave = 'remito' then p_transportista end,
    v_usuario
  )
  returning id into v_id;

  if p_lineas is null then
    -- La venta entera
    insert into public.comprobante_no_fiscal_linea
      (comprobante_no_fiscal_id, orden, producto_id, codigo_producto,
       descripcion, cantidad, precio_unitario, venta_linea_id)
    select v_id, l.orden, l.producto_id, l.codigo_producto,
           l.descripcion, l.cantidad, l.precio_unitario, l.id
    from public.venta_linea l
    where l.venta_id = p_venta_id;
  else
    -- Entrega parcial: solo lo que se lleva la camioneta hoy
    insert into public.comprobante_no_fiscal_linea
      (comprobante_no_fiscal_id, orden, producto_id, codigo_producto,
       descripcion, cantidad, precio_unitario, venta_linea_id)
    select v_id, l.orden, l.producto_id, l.codigo_producto,
           l.descripcion, (e->>'cantidad')::numeric, l.precio_unitario, l.id
    from jsonb_array_elements(p_lineas) e
    join public.venta_linea l on l.id = (e->>'venta_linea_id')::uuid
    where l.venta_id = p_venta_id
      and (e->>'cantidad')::numeric > 0;

    if not exists (select 1 from public.comprobante_no_fiscal_linea
                   where comprobante_no_fiscal_id = v_id) then
      raise exception 'Ninguna de las lineas indicadas pertenece a esta venta.';
    end if;
  end if;

  select coalesce(sum(importe), 0) into v_total
  from public.comprobante_no_fiscal_linea where comprobante_no_fiscal_id = v_id;

  update public.comprobante_no_fiscal set total = round(v_total, 2) where id = v_id;

  return v_id;
end;
$$;

comment on function public.emitir_comprobante_no_fiscal is
  'Emite un presupuesto, remito o comprobante interno a partir de una venta. Con p_lineas se remite parcialmente.';

grant execute on function public.emitir_comprobante_no_fiscal(
  uuid, text, uuid, jsonb, text, date, text, text, text, text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Anular
--
-- Cambia el estado y exige motivo. No borra: un documento que se le
-- entrego a alguien y despues desaparece del sistema es exactamente lo
-- que este modulo tiene prohibido.
--
-- La devolucion del stock del remito se agrega en la migracion
-- siguiente, junto con la salida.
-- ───────────────────────────────────────────────────────────────
create or replace function public.anular_comprobante_no_fiscal(
  p_id     uuid,
  p_motivo text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_doc public.comprobante_no_fiscal;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Hay que indicar el motivo de la anulacion.';
  end if;

  if not app.tiene_permiso('facturacion.no_fiscal_anular') then
    raise exception 'No tenes permiso para anular comprobantes no fiscales.';
  end if;

  select * into v_doc from public.comprobante_no_fiscal where id = p_id for update;
  if v_doc.id is null then
    raise exception 'El comprobante no existe.';
  end if;
  if v_doc.estado = 'anulado' then
    raise exception 'El comprobante ya estaba anulado.';
  end if;
  if v_doc.estado = 'convertido' then
    raise exception 'Este comprobante ya se convirtio en factura. Para revertirlo hay que anular la factura.';
  end if;

  update public.comprobante_no_fiscal
  set estado           = 'anulado',
      anulado_en       = now(),
      anulado_por      = app.usuario_actual_id(),
      motivo_anulacion = p_motivo
  where id = p_id;

  return p_id;
end;
$$;

comment on function public.anular_comprobante_no_fiscal(uuid, text) is
  'Anula con motivo. No borra: el documento se entrego y tiene que seguir estando.';

grant execute on function public.anular_comprobante_no_fiscal(uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Marcar convertido
--
-- Se llama despues de facturar la venta del presupuesto o del interno.
-- Deja el hilo entre el papel que el cliente tuvo primero y la factura
-- que termino recibiendo.
-- ───────────────────────────────────────────────────────────────
create or replace function public.marcar_no_fiscal_convertido(
  p_id             uuid,
  p_comprobante_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.comprobante_no_fiscal
  set estado                       = 'convertido',
      convertido_en_comprobante_id = p_comprobante_id,
      convertido_en                = now()
  where id = p_id and estado = 'emitido';

  if not found then
    raise exception 'El comprobante no existe o no estaba en estado emitido.';
  end if;

  return p_id;
end;
$$;

grant execute on function public.marcar_no_fiscal_convertido(uuid, uuid) to authenticated;
