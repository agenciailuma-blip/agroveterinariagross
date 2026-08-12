-- ═══════════════════════════════════════════════════════════════
-- 004 — CORRECCIÓN DE ACENTOS EN LA SEMILLA
--
-- Al aplicar las migraciones 002 y 003 se enviaron los textos de
-- semilla sin acentos por precaución de codificación. Verificado que
-- UTF-8 viaja bien, esta migración restituye la ortografía correcta.
--
-- Son textos que ve el usuario final (pantalla de permisos, listado de
-- marcas, configuración), así que no pueden quedar sin acentos.
-- Idempotente: se puede correr las veces que haga falta.
-- ═══════════════════════════════════════════════════════════════

update public.marca set nombre = 'Bagó' where slug = 'bago';

update public.permiso set descripcion = 'Ver el catálogo de productos'             where clave = 'productos.ver';
update public.permiso set descripcion = 'Definir umbrales de stock bajo y crítico' where clave = 'stock.configurar_umbrales';
update public.permiso set descripcion = 'Definir límites de crédito'               where clave = 'cuentacorriente.limite';
update public.permiso set descripcion = 'Ver reportes y métricas'                  where clave = 'reportes.ver';
update public.permiso set descripcion = 'Consultar el registro de auditoría'       where clave = 'auditoria.ver';
update public.permiso set descripcion = 'Modificar la configuración del sistema'   where clave = 'configuracion.gestionar';
update public.permiso set grupo       = 'Facturación'                              where grupo = 'Facturacion';

update public.rol set descripcion = 'Supervisa la operación diaria y autoriza excepciones' where nombre = 'Encargado';

update public.configuracion set descripcion = 'Razón social como figura en ARCA'         where clave = 'comercio.razon_social';
update public.configuracion set descripcion = 'Condición frente al IVA'                  where clave = 'comercio.condicion_iva';
update public.configuracion set descripcion = 'Umbral general de stock crítico'          where clave = 'stock.umbral_critico_general';
update public.configuracion set descripcion = 'Cantidad de dígitos del PIN de operación' where clave = 'pin.longitud';

comment on table public.auditoria is
  'Registro inmutable de operaciones sensibles. Sin FKs a propósito: debe sobrevivir a la baja de lo que audita.';
comment on column public.punto_venta.numero is
  'Número de punto de venta habilitado en ARCA con modalidad Web Service (RECE).';
comment on column public.producto.revisado_en is
  'Operativo de carga inicial: marca que el personal ya completó y verificó los datos de este producto.';
