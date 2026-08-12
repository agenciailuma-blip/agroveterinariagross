-- ═══════════════════════════════════════════════════════════════
-- 005 — OPTIMIZACIÓN DE POLÍTICAS RLS E ÍNDICES DE CLAVES FORÁNEAS
--
-- PROBLEMA
-- Las políticas de escritura se crearon con FOR ALL, y FOR ALL incluye
-- SELECT. Resultado: en cada lectura Postgres evaluaba DOS políticas
-- —la de lectura y la de escritura— y por lo tanto llamaba dos veces a
-- app.tiene_permiso().
--
-- Esto importa porque la lectura es el camino caliente del sistema: el
-- buscador de productos del mostrador consulta con cada tecla que toca
-- el vendedor. Pagar el doble de verificación de permisos ahí se nota.
--
-- SOLUCIÓN
-- Separar las políticas de escritura en INSERT, UPDATE y DELETE
-- explícitos. Así el SELECT evalúa una sola política.
--
-- Se hace ahora, con la base vacía, porque después implica tocar
-- políticas sobre tablas en producción.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  t record;
begin
  for t in
    select * from (values
      -- tabla,                  permiso requerido para escribir
      ('animal',                 'productos.editar'),
      ('categoria',              'productos.editar'),
      ('etapa_vida',             'productos.editar'),
      ('marca',                  'productos.editar'),
      ('presentacion',           'productos.editar'),
      ('producto_animal',        'productos.editar'),
      ('producto_codigo_barra',  'productos.editar'),
      ('producto_etapa_vida',    'productos.editar'),
      ('configuracion',          'configuracion.gestionar'),
      ('punto_venta',            'configuracion.gestionar'),
      ('terminal',               'configuracion.gestionar'),
      ('rol',                    'roles.gestionar'),
      ('rol_permiso',            'roles.gestionar'),
      ('usuario',                'usuarios.gestionar')
    ) as x(tabla, permiso)
  loop
    execute format('drop policy if exists %I on public.%I', t.tabla || '_write', t.tabla);

    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check ((select app.tiene_permiso(%L)))',
      t.tabla || '_insert', t.tabla, t.permiso);

    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((select app.tiene_permiso(%L)))
         with check ((select app.tiene_permiso(%L)))',
      t.tabla || '_update', t.tabla, t.permiso, t.permiso);

    execute format(
      'create policy %I on public.%I for delete to authenticated
         using ((select app.tiene_permiso(%L)))',
      t.tabla || '_delete', t.tabla, t.permiso);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────
-- Índices de claves foráneas que faltaban.
-- Sin ellos, Postgres hace recorrido completo de la tabla para
-- verificar la integridad al borrar el registro referenciado.
-- ───────────────────────────────────────────────────────────────
create index rol_permiso_permiso_idx    on public.rol_permiso (permiso_clave);
create index terminal_punto_venta_idx   on public.terminal    (punto_venta_id);
create index producto_presentacion_idx  on public.producto    (presentacion_id) where eliminado_en is null;
create index producto_alicuota_iva_idx  on public.producto    (alicuota_iva_id) where eliminado_en is null;
create index producto_revisado_por_idx  on public.producto    (revisado_por)    where revisado_por is not null;
