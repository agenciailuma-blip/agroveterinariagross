-- La factura emitida con CAEA no subía al servidor.
--
-- registrar_comprobante_caea corre con los permisos del usuario y deja
-- la serie al día con un insert ... on conflict do update. Había
-- política para leer y para actualizar la fila, pero no para crearla:
-- la primera factura de una serie nueva —en el local, el 01/10, la
-- 0009-00000001, primera del punto de venta CAEA— chocaba contra RLS y
-- quedaba en la cola de la caja para siempre, sin llegar a ARCA.
--
-- Postgres pide la política de insert aunque la fila ya exista y
-- termine actualizándose, así que hace falta para cualquier serie.
create policy secuencia_comprobante_insert on public.secuencia_comprobante
  for insert to authenticated
  with check ((select app.tiene_permiso('facturacion.emitir')));

grant insert on public.secuencia_comprobante to authenticated;
