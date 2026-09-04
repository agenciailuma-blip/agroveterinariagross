-- ═══════════════════════════════════════════════════════════════
-- 022 — CLASIFICACIÓN DE PRODUCTOS POR RUBRO DE ARCA
--
-- Esto es distinto de "categoria": categoria es el eje COMERCIAL que
-- se comparte con la tienda online (Farmacia, Alimentos, Accesorios,
-- Antiparasitarios...). rubro_arca es el eje FISCAL: la actividad
-- económica bajo la que Gross está inscripto en ARCA, tomada tal cual
-- de su constancia de inscripción (CUIT 20146369767).
--
-- Lo pidió Lucas después de la respuesta del contador: necesita poder
-- separar las ventas por actividad (servicios veterinarios, venta de
-- productos veterinarios, alimentos, vivero...) para el control propio
-- y para lo que en V1-B va a alimentar el Libro de IVA. El reporte y
-- la exportación se construyen en V1-B; esta migración solo deja la
-- clasificación cargable desde ya, para no tener que revisar de
-- nuevo 3.000 productos más adelante.
--
-- Los IDs son el código de actividad de ARCA, igual que se hizo con
-- alicuota_iva, tipo_documento y tipo_comprobante: donde no hay
-- traducción no hay error de mapeo.
-- ═══════════════════════════════════════════════════════════════

create table public.rubro_arca (
  id             integer primary key,  -- código de actividad económica de ARCA
  descripcion    text not null,
  orden          integer not null default 0,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.rubro_arca is
  'Actividades económicas registradas en ARCA para Gross (constancia de inscripción). Eje fiscal de clasificación, no comercial: ver producto.rubro_arca_id.';

create trigger rubro_arca_actualizado_en before update on public.rubro_arca
  for each row execute function app.set_actualizado_en();

alter table public.rubro_arca enable row level security;

create policy rubro_arca_select on public.rubro_arca
  for select to authenticated using ((select app.es_usuario_activo()));
create policy rubro_arca_write on public.rubro_arca
  for all to authenticated
  using ((select app.tiene_permiso('configuracion.gestionar')))
  with check ((select app.tiene_permiso('configuracion.gestionar')));

grant select on public.rubro_arca to authenticated;
grant insert, update on public.rubro_arca to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Semilla — tomada de la constancia de inscripción de ARCA vigente
-- al 2026-08-21. Verificar contra una constancia nueva si Gross da de
-- alta o de baja una actividad.
-- ───────────────────────────────────────────────────────────────
insert into public.rubro_arca (id, descripcion, orden) values
  (750000, 'Servicios veterinarios', 10),
  (477470, 'Venta al por menor de productos veterinarios, animales domésticos y alimento balanceado para mascotas', 20),
  (464340, 'Venta al por mayor de productos veterinarios', 30),
  (463170, 'Venta al por mayor de alimentos balanceados para animales', 40),
  (477440, 'Venta al por menor de flores, plantas, semillas, abonos, fertilizantes y otros productos de vivero', 50),
  (475490, 'Venta al por menor de artículos para el hogar N.C.P.', 60),
  (681098, 'Servicios inmobiliarios realizados por cuenta propia, con bienes urbanos propios o arrendados N.C.P.', 70);

-- ───────────────────────────────────────────────────────────────
-- Producto: un rubro fiscal fijo, el que predomina para ese artículo.
-- Nullable a propósito: la carga inicial de 3.000 productos no puede
-- depender de tener esto resuelto de entrada.
-- ───────────────────────────────────────────────────────────────
alter table public.producto
  add column rubro_arca_id integer references public.rubro_arca(id) on delete set null;

create index producto_rubro_arca_idx on public.producto (rubro_arca_id) where eliminado_en is null;

comment on column public.producto.rubro_arca_id is
  'Actividad de ARCA bajo la que se declara la venta de este producto. Eje fiscal: no confundir con categoria_id, que es el eje comercial de la tienda.';
