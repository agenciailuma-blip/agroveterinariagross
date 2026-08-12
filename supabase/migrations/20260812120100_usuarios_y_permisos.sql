-- ═══════════════════════════════════════════════════════════════
-- 002 — USUARIOS, ROLES, PERMISOS, TERMINALES Y PUNTOS DE VENTA
--
-- Modelo de identidad en dos capas, que es lo que resuelve el pedido
-- de Lucas de "no estar entrando y saliendo de usuario":
--
--   · La TERMINAL se autentica una vez y queda con sesión abierta todo
--     el día (es la que tiene cuenta en auth.users).
--   · El OPERADOR se identifica con un PIN de 4 dígitos para cada
--     operación. No hay login, pero sí queda registrado quién hizo qué.
--
-- Los usuarios de oficina sí tienen su propia cuenta y entran normal.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Permisos y roles
-- ───────────────────────────────────────────────────────────────
create table public.permiso (
  clave        text primary key,
  grupo        text not null,
  descripcion  text not null,
  orden        integer not null default 0
);

alter table public.permiso enable row level security;

create table public.rol (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  descripcion    text,
  -- los roles de sistema no se pueden borrar desde la pantalla de administración
  es_sistema     boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz
);

create unique index rol_nombre_unico on public.rol (lower(nombre)) where eliminado_en is null;

create trigger rol_actualizado_en
  before update on public.rol
  for each row execute function app.set_actualizado_en();

alter table public.rol enable row level security;

create table public.rol_permiso (
  rol_id        uuid not null references public.rol(id) on delete cascade,
  permiso_clave text not null references public.permiso(clave) on delete cascade,
  primary key (rol_id, permiso_clave)
);

alter table public.rol_permiso enable row level security;

-- ───────────────────────────────────────────────────────────────
-- Usuarios
-- ───────────────────────────────────────────────────────────────
create table public.usuario (
  id             uuid primary key default gen_random_uuid(),
  -- sólo para quienes inician sesión (oficina, administración, terminales)
  auth_user_id   uuid unique references auth.users(id) on delete set null,
  nombre         text not null,
  email          text,
  telefono       text,
  rol_id         uuid not null references public.rol(id),
  -- opera con PIN en el mostrador
  opera_con_pin  boolean not null default false,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz
);

create index usuario_rol_idx    on public.usuario (rol_id);
create index usuario_activo_idx on public.usuario (activo) where eliminado_en is null;
create unique index usuario_email_unico on public.usuario (lower(email)) where email is not null and eliminado_en is null;

create trigger usuario_actualizado_en
  before update on public.usuario
  for each row execute function app.set_actualizado_en();

alter table public.usuario enable row level security;

-- ───────────────────────────────────────────────────────────────
-- PIN de operación — vive en el schema privado
--
-- El hash del PIN NO va en public.usuario a propósito: cualquier tabla
-- de public puede terminar expuesta por la Data API, y un hash de PIN de
-- 4 dígitos es trivial de romper por fuerza bruta si se filtra.
-- ───────────────────────────────────────────────────────────────
create table app.usuario_pin (
  usuario_id     uuid primary key references public.usuario(id) on delete cascade,
  pin_hash       text not null,
  intentos       integer not null default 0,
  bloqueado_hasta timestamptz,
  actualizado_en timestamptz not null default now()
);

revoke all on table app.usuario_pin from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────
-- Puntos de venta de ARCA
--
-- En el esquema nuevo sólo la caja emite comprobantes, así que en
-- principio hay uno solo. Se prevé el de respaldo por si falla esa PC.
-- ───────────────────────────────────────────────────────────────
create table public.punto_venta (
  id             uuid primary key default gen_random_uuid(),
  numero         integer not null unique check (numero > 0),
  nombre         text not null,
  es_respaldo    boolean not null default false,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz
);

comment on column public.punto_venta.numero is
  'Número de punto de venta habilitado en ARCA con modalidad Web Service (RECE).';

create trigger punto_venta_actualizado_en
  before update on public.punto_venta
  for each row execute function app.set_actualizado_en();

alter table public.punto_venta enable row level security;

-- ───────────────────────────────────────────────────────────────
-- Terminales
-- ───────────────────────────────────────────────────────────────
create table public.terminal (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  tipo             text not null check (tipo in ('caja', 'mostrador', 'oficina')),
  -- sólo las cajas facturan, y por eso sólo ellas tienen punto de venta
  punto_venta_id   uuid references public.punto_venta(id),
  auth_user_id     uuid unique references auth.users(id) on delete set null,
  -- impresora térmica Hasar P-HAS-181 por red
  impresora_host   text,
  impresora_puerto integer not null default 9100,
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  eliminado_en     timestamptz,

  constraint terminal_caja_requiere_punto_venta
    check (tipo <> 'caja' or punto_venta_id is not null)
);

create unique index terminal_nombre_unico on public.terminal (lower(nombre)) where eliminado_en is null;

create trigger terminal_actualizado_en
  before update on public.terminal
  for each row execute function app.set_actualizado_en();

alter table public.terminal enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- HELPERS DE AUTORIZACIÓN
--
-- Van en el schema app (no expuesto) porque son SECURITY DEFINER.
-- Una función SECURITY DEFINER en public sería un endpoint público:
-- Postgres otorga EXECUTE a PUBLIC por defecto.
-- ═══════════════════════════════════════════════════════════════

create or replace function app.usuario_actual_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.usuario u
  where u.auth_user_id = (select auth.uid())
    and u.activo
    and u.eliminado_en is null
  limit 1
$$;

create or replace function app.es_usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuario u
    where u.auth_user_id = (select auth.uid())
      and u.activo
      and u.eliminado_en is null
  )
$$;

create or replace function app.tiene_permiso(p_clave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuario u
    join public.rol_permiso rp on rp.rol_id = u.rol_id
    where u.auth_user_id = (select auth.uid())
      and u.activo
      and u.eliminado_en is null
      and rp.permiso_clave = p_clave
  )
$$;

revoke all on function app.usuario_actual_id()   from public, anon;
revoke all on function app.es_usuario_activo()   from public, anon;
revoke all on function app.tiene_permiso(text)   from public, anon;
grant execute on function app.usuario_actual_id() to authenticated;
grant execute on function app.es_usuario_activo() to authenticated;
grant execute on function app.tiene_permiso(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- POLÍTICAS RLS
--
-- Patrón general: leer requiere ser usuario activo; escribir requiere
-- un permiso concreto. Nunca se usa "TO authenticated" solo, que es
-- autenticación sin autorización.
-- ═══════════════════════════════════════════════════════════════

-- Auditoría: se lee con permiso, y nadie la modifica ni la borra.
-- El alta la hacen los triggers, que corren con privilegios del definer.
create policy auditoria_select on public.auditoria
  for select to authenticated
  using ((select app.tiene_permiso('auditoria.ver')));

-- Configuración
create policy configuracion_select on public.configuracion
  for select to authenticated
  using ((select app.es_usuario_activo()));

create policy configuracion_write on public.configuracion
  for all to authenticated
  using ((select app.tiene_permiso('configuracion.gestionar')))
  with check ((select app.tiene_permiso('configuracion.gestionar')));

-- Permisos: catálogo de sólo lectura para armar la pantalla de roles
create policy permiso_select on public.permiso
  for select to authenticated
  using ((select app.es_usuario_activo()));

-- Roles
create policy rol_select on public.rol
  for select to authenticated
  using ((select app.es_usuario_activo()));

create policy rol_write on public.rol
  for all to authenticated
  using ((select app.tiene_permiso('roles.gestionar')))
  with check ((select app.tiene_permiso('roles.gestionar')));

create policy rol_permiso_select on public.rol_permiso
  for select to authenticated
  using ((select app.es_usuario_activo()));

create policy rol_permiso_write on public.rol_permiso
  for all to authenticated
  using ((select app.tiene_permiso('roles.gestionar')))
  with check ((select app.tiene_permiso('roles.gestionar')));

-- Usuarios: todos ven la lista (hace falta para elegir vendedor),
-- pero sólo quien tiene el permiso puede modificarla.
create policy usuario_select on public.usuario
  for select to authenticated
  using ((select app.es_usuario_activo()));

create policy usuario_write on public.usuario
  for all to authenticated
  using ((select app.tiene_permiso('usuarios.gestionar')))
  with check ((select app.tiene_permiso('usuarios.gestionar')));

-- Puntos de venta y terminales
create policy punto_venta_select on public.punto_venta
  for select to authenticated
  using ((select app.es_usuario_activo()));

create policy punto_venta_write on public.punto_venta
  for all to authenticated
  using ((select app.tiene_permiso('configuracion.gestionar')))
  with check ((select app.tiene_permiso('configuracion.gestionar')));

create policy terminal_select on public.terminal
  for select to authenticated
  using ((select app.es_usuario_activo()));

create policy terminal_write on public.terminal
  for all to authenticated
  using ((select app.tiene_permiso('configuracion.gestionar')))
  with check ((select app.tiene_permiso('configuracion.gestionar')));

-- ═══════════════════════════════════════════════════════════════
-- GRANTS
-- Las tablas nuevas no quedan expuestas a la Data API automáticamente.
-- ═══════════════════════════════════════════════════════════════
grant select on public.auditoria, public.permiso, public.rol, public.rol_permiso,
                 public.usuario, public.punto_venta, public.terminal, public.configuracion
  to authenticated;

grant insert, update, delete on public.rol, public.rol_permiso, public.usuario,
                                public.punto_venta, public.terminal, public.configuracion
  to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- SEMILLA — permisos y roles base
-- ═══════════════════════════════════════════════════════════════
insert into public.permiso (clave, grupo, descripcion, orden) values
  ('productos.ver',              'Productos',    'Ver el catálogo de productos',                10),
  ('productos.crear',            'Productos',    'Dar de alta productos',                       20),
  ('productos.editar',           'Productos',    'Modificar productos',                         30),
  ('productos.eliminar',         'Productos',    'Dar de baja productos',                       40),
  ('productos.editar_precio',    'Productos',    'Modificar precios de lista',                  50),

  ('stock.ver',                  'Stock',        'Consultar existencias',                      110),
  ('stock.ajustar',              'Stock',        'Registrar ajustes de stock',                 120),
  ('stock.inventariar',          'Stock',        'Realizar tomas de inventario',               130),
  ('stock.configurar_umbrales',  'Stock',        'Definir umbrales de stock bajo y crítico',   140),

  ('ventas.crear',               'Ventas',       'Armar ventas',                               210),
  ('ventas.cobrar',              'Ventas',       'Cobrar y cerrar ventas',                     220),
  ('ventas.modificar_precio',    'Ventas',       'Modificar el precio final en la venta',      230),
  ('ventas.anular',              'Ventas',       'Anular ventas y registrar devoluciones',     240),
  ('ventas.ver_todas',           'Ventas',       'Ver ventas de todos los vendedores',         250),

  ('caja.abrir',                 'Caja',         'Abrir caja',                                 310),
  ('caja.cerrar',                'Caja',         'Cerrar caja y arquear',                      320),

  ('clientes.ver',               'Clientes',     'Ver clientes',                               410),
  ('clientes.crear',             'Clientes',     'Dar de alta clientes',                       420),
  ('clientes.editar',            'Clientes',     'Modificar clientes',                         430),

  ('cuentacorriente.ver',        'Cuenta cte.',  'Consultar cuentas corrientes',               510),
  ('cuentacorriente.cobrar',     'Cuenta cte.',  'Registrar cobranzas',                        520),
  ('cuentacorriente.limite',     'Cuenta cte.',  'Definir límites de crédito',                 530),

  ('facturacion.emitir',         'Facturación',  'Emitir comprobantes fiscales',               610),
  ('facturacion.ver',            'Facturación',  'Consultar comprobantes emitidos',            620),
  ('facturacion.contingencia',   'Facturación',  'Operar la cola de contingencia de ARCA',     630),

  ('compras.ver',                'Compras',      'Ver compras a proveedores',                  710),
  ('compras.registrar',          'Compras',      'Registrar compras y recepciones',            720),

  ('reportes.ver',               'Reportes',     'Ver reportes y métricas',                    810),
  ('auditoria.ver',              'Sistema',      'Consultar el registro de auditoría',         910),
  ('usuarios.gestionar',         'Sistema',      'Administrar usuarios',                       920),
  ('roles.gestionar',            'Sistema',      'Administrar roles y permisos',               930),
  ('configuracion.gestionar',    'Sistema',      'Modificar la configuración del sistema',     940);

insert into public.rol (nombre, descripcion, es_sistema) values
  ('Administrador', 'Acceso total al sistema',                                     true),
  ('Encargado',     'Supervisa la operación diaria y autoriza excepciones',        true),
  ('Cajero',        'Cobra, factura y cierra caja',                                true),
  ('Vendedor',      'Arma ventas y consulta stock',                                true);

-- Administrador: todos los permisos
insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r cross join public.permiso p
where r.nombre = 'Administrador';

-- Encargado: todo salvo la administración del sistema
insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r cross join public.permiso p
where r.nombre = 'Encargado'
  and p.clave not in ('usuarios.gestionar', 'roles.gestionar', 'configuracion.gestionar');

-- Cajero
insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r cross join public.permiso p
where r.nombre = 'Cajero'
  and p.clave in (
    'productos.ver', 'stock.ver',
    'ventas.crear', 'ventas.cobrar', 'ventas.ver_todas',
    'caja.abrir', 'caja.cerrar',
    'clientes.ver', 'clientes.crear',
    'cuentacorriente.ver', 'cuentacorriente.cobrar',
    'facturacion.emitir', 'facturacion.ver', 'facturacion.contingencia'
  );

-- Vendedor
insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r cross join public.permiso p
where r.nombre = 'Vendedor'
  and p.clave in (
    'productos.ver', 'stock.ver',
    'ventas.crear',
    'clientes.ver', 'clientes.crear',
    'cuentacorriente.ver'
  );

-- ═══════════════════════════════════════════════════════════════
-- SEMILLA — configuración inicial
-- ═══════════════════════════════════════════════════════════════
insert into public.configuracion (clave, valor, descripcion, grupo) values
  ('comercio.razon_social',      '"ERNESTO HUGO GROSS"',  'Razón social como figura en ARCA',            'fiscal'),
  ('comercio.cuit',              '"20146369767"',         'CUIT de Gross',                               'fiscal'),
  ('comercio.condicion_iva',     '"responsable_inscripto"', 'Condición frente al IVA',                   'fiscal'),
  ('stock.umbral_bajo_general',   '10',                   'Umbral general de stock bajo, en unidades',   'stock'),
  ('stock.umbral_critico_general', '3',                   'Umbral general de stock crítico',             'stock'),
  ('pin.longitud',                '4',                    'Cantidad de dígitos del PIN de operación',    'seguridad'),
  ('pin.intentos_maximos',        '5',                    'Intentos fallidos antes de bloquear el PIN',  'seguridad');
