-- ═══════════════════════════════════════════════════════════════
-- 001 — FUNDACIONES
-- Extensiones, schema privado, helpers de timestamps y auditoría.
--
-- Convenciones de todo el proyecto:
--   · Claves primarias UUID, generables por el cliente sin conexión.
--   · Toda tabla sincronizable lleva creado_en / actualizado_en / eliminado_en.
--   · No se borra físicamente: se marca eliminado_en (baja lógica), para que
--     la baja también viaje a las terminales offline.
--   · RLS habilitado en todas las tablas de public.
-- ═══════════════════════════════════════════════════════════════

-- pgcrypto ya viene instalada en el schema extensions (se usa para el hash del PIN).
-- pg_trgm y unaccent hacen falta para la búsqueda de productos por fragmento:
-- el vendedor tipea "livra" o "1kg", no la palabra completa.
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ───────────────────────────────────────────────────────────────
-- Schema privado: no se expone por la Data API.
-- Acá viven las funciones SECURITY DEFINER, que si estuvieran en
-- public serían invocables por cualquier cliente.
-- ───────────────────────────────────────────────────────────────
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Trigger genérico de actualizado_en
-- ───────────────────────────────────────────────────────────────
create or replace function app.set_actualizado_en()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- Auditoría
--
-- Deliberadamente SIN claves foráneas: el registro de auditoría tiene
-- que sobrevivir a la baja del usuario, de la terminal o del registro
-- auditado. Un log que se borra en cascada no es un log.
-- ───────────────────────────────────────────────────────────────
create table public.auditoria (
  id              uuid primary key default gen_random_uuid(),
  tabla           text not null,
  registro_id     uuid,
  accion          text not null check (accion in ('insert', 'update', 'delete')),
  -- quién: el usuario autenticado (terminal u oficina) y el operador (PIN)
  usuario_id      uuid,
  operador_id     uuid,
  terminal_id     uuid,
  -- qué cambió
  datos_antes     jsonb,
  datos_despues   jsonb,
  -- contexto libre: motivo del ajuste, autorización de un encargado, etc.
  contexto        jsonb,
  creado_en       timestamptz not null default now()
);

create index auditoria_tabla_registro_idx on public.auditoria (tabla, registro_id, creado_en desc);
create index auditoria_creado_en_idx       on public.auditoria (creado_en desc);
create index auditoria_operador_idx        on public.auditoria (operador_id, creado_en desc);

comment on table public.auditoria is
  'Registro inmutable de operaciones sensibles. Sin FKs a propósito: debe sobrevivir a la baja de lo que audita.';

alter table public.auditoria enable row level security;

-- ───────────────────────────────────────────────────────────────
-- Configuración del sistema (clave/valor tipado)
-- Umbrales generales, colchones de stock, datos del comercio, etc.
-- ───────────────────────────────────────────────────────────────
create table public.configuracion (
  clave           text primary key,
  valor           jsonb not null,
  descripcion     text,
  grupo           text not null default 'general',
  actualizado_en  timestamptz not null default now()
);

create trigger configuracion_actualizado_en
  before update on public.configuracion
  for each row execute function app.set_actualizado_en();

alter table public.configuracion enable row level security;
