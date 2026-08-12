-- ═══════════════════════════════════════════════════════════════
-- 003 — CATÁLOGO DE PRODUCTOS
--
-- La clasificación NO es un árbol único, son varios ejes simultáneos,
-- copiando el esquema que ya usa la tienda online. Eso permite después:
--   · umbrales de stock por categoría (pedido de Lucas),
--   · métricas por marca / animal / categoría,
--   · sincronizar con la tienda sin traducir nada.
--
-- Cardinalidades, que no son uniformes:
--   Categoría     → una sola, pero jerárquica (Farmacia > Antiparasitarios)
--   Marca         → una sola
--   Presentación  → una sola
--   Animal        → varios (un antiparasitario puede ser de perros Y gatos)
--   Etapa de vida → varias
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Alícuotas de IVA
--
-- Los IDs son los códigos de ARCA (tabla FEParamGetTiposIva), no
-- inventados por nosotros. Así al facturar no hay que traducir nada
-- y no se puede equivocar el mapeo.
-- Verificar contra FEParamGetTiposIva al conectar con homologación.
-- ───────────────────────────────────────────────────────────────
create table public.alicuota_iva (
  id          smallint primary key,
  descripcion text not null,
  porcentaje  numeric(5,2) not null,
  activo      boolean not null default true
);

insert into public.alicuota_iva (id, descripcion, porcentaje, activo) values
  (3, '0%',    0.00,  true),
  (4, '10,5%', 10.50, true),
  (5, '21%',   21.00, true),
  (6, '27%',   27.00, true),
  (8, '5%',    5.00,  false),
  (9, '2,5%',  2.50,  false);

alter table public.alicuota_iva enable row level security;

-- ───────────────────────────────────────────────────────────────
-- Ejes de clasificación
-- ───────────────────────────────────────────────────────────────
create table public.categoria (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  slug           text not null,
  padre_id       uuid references public.categoria(id) on delete restrict,
  orden          integer not null default 0,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz,

  constraint categoria_no_es_su_propio_padre check (id <> padre_id)
);

create unique index categoria_slug_unico on public.categoria (slug) where eliminado_en is null;
create index categoria_padre_idx on public.categoria (padre_id);

create table public.marca (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  slug           text not null,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz
);

create unique index marca_slug_unico on public.marca (slug) where eliminado_en is null;

create table public.presentacion (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  slug           text not null,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz
);

create unique index presentacion_slug_unico on public.presentacion (slug) where eliminado_en is null;

create table public.animal (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  slug           text not null,
  orden          integer not null default 0,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz
);

create unique index animal_slug_unico on public.animal (slug) where eliminado_en is null;

create table public.etapa_vida (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  slug           text not null,
  orden          integer not null default 0,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz
);

create unique index etapa_vida_slug_unico on public.etapa_vida (slug) where eliminado_en is null;

-- ───────────────────────────────────────────────────────────────
-- Producto
-- ───────────────────────────────────────────────────────────────
create table public.producto (
  id               uuid primary key default gen_random_uuid(),

  -- identificación
  codigo           text not null,               -- SKU interno, viene de OBTech
  nombre_interno   text not null,               -- el que ve el vendedor: ALIM BAL LIVRA 1KG
  nombre_publico   text,                        -- el que ve el cliente y la tienda
  descripcion      text,

  -- clasificación
  categoria_id     uuid references public.categoria(id) on delete set null,
  marca_id         uuid references public.marca(id) on delete set null,
  presentacion_id  uuid references public.presentacion(id) on delete set null,

  -- fiscal
  alicuota_iva_id  smallint not null default 5 references public.alicuota_iva(id),
  condicion_iva    text not null default 'gravado'
                     check (condicion_iva in ('gravado', 'exento', 'no_gravado')),

  -- comercial
  precio_venta     numeric(14,4) not null default 0 check (precio_venta >= 0),
  costo            numeric(14,4) check (costo >= 0),

  -- unidad y fraccionamiento
  unidad_medida    text not null default 'unidad'
                     check (unidad_medida in ('unidad', 'kg', 'gramo', 'litro', 'ml', 'metro', 'bolsa', 'caja')),
  permite_fraccionamiento boolean not null default false,
  contenido        numeric(14,4),               -- 1 bolsa = 15 kg
  contenido_unidad text,

  -- preparación para SIGTRAZAVET (Res. SENASA 654/2026)
  -- Los campos existen desde el día uno pero no son obligatorios:
  -- si mañana sale la reglamentación, no hay que rehacer el módulo de stock.
  es_producto_veterinario boolean not null default false,
  requiere_receta         boolean not null default false,
  principio_activo        text,
  certificado_senasa      text,
  controla_lote           boolean not null default false,
  controla_vencimiento    boolean not null default false,

  -- fitosanitarios (Ley XVI-144 de Misiones)
  es_fitosanitario        boolean not null default false,

  -- estado y carga inicial
  activo           boolean not null default true,
  -- marca del operativo de carga: ¿ya lo revisó el personal contratado?
  revisado_en      timestamptz,
  revisado_por     uuid references public.usuario(id) on delete set null,

  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  eliminado_en     timestamptz
);

create unique index producto_codigo_unico on public.producto (upper(codigo)) where eliminado_en is null;
create index producto_categoria_idx  on public.producto (categoria_id) where eliminado_en is null;
create index producto_marca_idx      on public.producto (marca_id)     where eliminado_en is null;
create index producto_activo_idx     on public.producto (activo)       where eliminado_en is null;
create index producto_sin_revisar_idx on public.producto (revisado_en) where revisado_en is null and eliminado_en is null;
-- sincronización delta: las terminales piden "lo que cambió desde X"
create index producto_actualizado_en_idx on public.producto (actualizado_en);

-- Búsqueda por fragmento (trigramas), no por palabra completa.
-- El vendedor tipea "livra" o "1kg" y tiene que encontrar ALIM BAL LIVRA 1KG.
-- Un índice de texto completo no sirve acá porque estos nombres no son prosa.
create index producto_nombre_trgm_idx on public.producto
  using gin (nombre_interno extensions.gin_trgm_ops);
create index producto_codigo_trgm_idx on public.producto
  using gin (codigo extensions.gin_trgm_ops);

comment on column public.producto.nombre_interno is
  'Nombre operativo, el que le sirve al vendedor para identificar el producto.';
comment on column public.producto.nombre_publico is
  'Nombre comercial. Lo administra la tienda online; el sistema no lo pisa.';
comment on column public.producto.revisado_en is
  'Operativo de carga inicial: marca que el personal ya completó y verificó los datos de este producto.';

-- ───────────────────────────────────────────────────────────────
-- Códigos de barra — varios por producto
-- (el mismo alimento puede tener EAN de fábrica y etiqueta propia)
-- ───────────────────────────────────────────────────────────────
create table public.producto_codigo_barra (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid not null references public.producto(id) on delete cascade,
  codigo         text not null,
  es_principal   boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz
);

create unique index producto_codigo_barra_unico
  on public.producto_codigo_barra (codigo) where eliminado_en is null;
create index producto_codigo_barra_producto_idx
  on public.producto_codigo_barra (producto_id);

-- ───────────────────────────────────────────────────────────────
-- Ejes multivaluados
-- ───────────────────────────────────────────────────────────────
create table public.producto_animal (
  producto_id uuid not null references public.producto(id) on delete cascade,
  animal_id   uuid not null references public.animal(id)   on delete cascade,
  primary key (producto_id, animal_id)
);

create index producto_animal_animal_idx on public.producto_animal (animal_id);

create table public.producto_etapa_vida (
  producto_id   uuid not null references public.producto(id)   on delete cascade,
  etapa_vida_id uuid not null references public.etapa_vida(id) on delete cascade,
  primary key (producto_id, etapa_vida_id)
);

create index producto_etapa_vida_etapa_idx on public.producto_etapa_vida (etapa_vida_id);

-- ───────────────────────────────────────────────────────────────
-- Triggers de actualizado_en
-- ───────────────────────────────────────────────────────────────
create trigger categoria_actualizado_en    before update on public.categoria    for each row execute function app.set_actualizado_en();
create trigger marca_actualizado_en        before update on public.marca        for each row execute function app.set_actualizado_en();
create trigger presentacion_actualizado_en before update on public.presentacion for each row execute function app.set_actualizado_en();
create trigger animal_actualizado_en       before update on public.animal       for each row execute function app.set_actualizado_en();
create trigger etapa_vida_actualizado_en   before update on public.etapa_vida   for each row execute function app.set_actualizado_en();
create trigger producto_actualizado_en     before update on public.producto     for each row execute function app.set_actualizado_en();
create trigger producto_codigo_barra_actualizado_en before update on public.producto_codigo_barra for each row execute function app.set_actualizado_en();

-- ───────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────
alter table public.categoria             enable row level security;
alter table public.marca                 enable row level security;
alter table public.presentacion          enable row level security;
alter table public.animal                enable row level security;
alter table public.etapa_vida            enable row level security;
alter table public.producto              enable row level security;
alter table public.producto_codigo_barra enable row level security;
alter table public.producto_animal       enable row level security;
alter table public.producto_etapa_vida   enable row level security;

create policy alicuota_iva_select on public.alicuota_iva
  for select to authenticated using ((select app.es_usuario_activo()));

-- Los ejes de clasificación: los ve cualquier usuario activo,
-- los edita quien pueda editar productos.
create policy categoria_select on public.categoria
  for select to authenticated using ((select app.es_usuario_activo()));
create policy categoria_write on public.categoria
  for all to authenticated
  using ((select app.tiene_permiso('productos.editar')))
  with check ((select app.tiene_permiso('productos.editar')));

create policy marca_select on public.marca
  for select to authenticated using ((select app.es_usuario_activo()));
create policy marca_write on public.marca
  for all to authenticated
  using ((select app.tiene_permiso('productos.editar')))
  with check ((select app.tiene_permiso('productos.editar')));

create policy presentacion_select on public.presentacion
  for select to authenticated using ((select app.es_usuario_activo()));
create policy presentacion_write on public.presentacion
  for all to authenticated
  using ((select app.tiene_permiso('productos.editar')))
  with check ((select app.tiene_permiso('productos.editar')));

create policy animal_select on public.animal
  for select to authenticated using ((select app.es_usuario_activo()));
create policy animal_write on public.animal
  for all to authenticated
  using ((select app.tiene_permiso('productos.editar')))
  with check ((select app.tiene_permiso('productos.editar')));

create policy etapa_vida_select on public.etapa_vida
  for select to authenticated using ((select app.es_usuario_activo()));
create policy etapa_vida_write on public.etapa_vida
  for all to authenticated
  using ((select app.tiene_permiso('productos.editar')))
  with check ((select app.tiene_permiso('productos.editar')));

-- Productos: ver / crear / editar / dar de baja son permisos distintos
create policy producto_select on public.producto
  for select to authenticated
  using ((select app.tiene_permiso('productos.ver')));

create policy producto_insert on public.producto
  for insert to authenticated
  with check ((select app.tiene_permiso('productos.crear')));

create policy producto_update on public.producto
  for update to authenticated
  using ((select app.tiene_permiso('productos.editar')))
  with check ((select app.tiene_permiso('productos.editar')));

create policy producto_delete on public.producto
  for delete to authenticated
  using ((select app.tiene_permiso('productos.eliminar')));

create policy producto_codigo_barra_select on public.producto_codigo_barra
  for select to authenticated using ((select app.tiene_permiso('productos.ver')));
create policy producto_codigo_barra_write on public.producto_codigo_barra
  for all to authenticated
  using ((select app.tiene_permiso('productos.editar')))
  with check ((select app.tiene_permiso('productos.editar')));

create policy producto_animal_select on public.producto_animal
  for select to authenticated using ((select app.tiene_permiso('productos.ver')));
create policy producto_animal_write on public.producto_animal
  for all to authenticated
  using ((select app.tiene_permiso('productos.editar')))
  with check ((select app.tiene_permiso('productos.editar')));

create policy producto_etapa_vida_select on public.producto_etapa_vida
  for select to authenticated using ((select app.tiene_permiso('productos.ver')));
create policy producto_etapa_vida_write on public.producto_etapa_vida
  for all to authenticated
  using ((select app.tiene_permiso('productos.editar')))
  with check ((select app.tiene_permiso('productos.editar')));

-- ───────────────────────────────────────────────────────────────
-- Grants
-- ───────────────────────────────────────────────────────────────
grant select on public.alicuota_iva, public.categoria, public.marca, public.presentacion,
                 public.animal, public.etapa_vida, public.producto,
                 public.producto_codigo_barra, public.producto_animal, public.producto_etapa_vida
  to authenticated;

grant insert, update, delete on public.categoria, public.marca, public.presentacion,
                                public.animal, public.etapa_vida, public.producto,
                                public.producto_codigo_barra, public.producto_animal,
                                public.producto_etapa_vida
  to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- SEMILLA — ejes tomados de la tienda online, para que la
-- sincronización con Zubu no necesite traducir categorías.
-- ═══════════════════════════════════════════════════════════════
insert into public.categoria (nombre, slug, orden) values
  ('Farmacia',          'farmacia',          10),
  ('Alimentos',         'alimentos',         20),
  ('Antiparasitarios',  'antiparasitarios',  30),
  ('Higiene y cuidado', 'higiene-y-cuidado', 40),
  ('Accesorios',        'accesorios',        50);

insert into public.animal (nombre, slug, orden) values
  ('Perros',  'perros',  10),
  ('Gatos',   'gatos',   20),
  ('Bovinos', 'bovinos', 30);

insert into public.presentacion (nombre, slug) values
  ('Bolsa',  'bolsa'),
  ('Unidad', 'unidad'),
  ('Frasco', 'frasco');

insert into public.marca (nombre, slug) values
  ('Bagó',        'bago'),
  ('Bravecto',    'bravecto'),
  ('NexGard',     'nexgard'),
  ('Pro Plan',    'pro-plan'),
  ('Royal Canin', 'royal-canin'),
  ('Total Max',   'total-max'),
  ('Vetoquinol',  'vetoquinol'),
  ('Zoetis',      'zoetis');

-- Etapas de vida: valores a confirmar con Gross
insert into public.etapa_vida (nombre, slug, orden) values
  ('Cachorro', 'cachorro', 10),
  ('Adulto',   'adulto',   20),
  ('Senior',   'senior',   30);
