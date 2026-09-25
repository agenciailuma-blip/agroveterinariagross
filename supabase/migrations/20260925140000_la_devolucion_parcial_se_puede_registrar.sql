-- ═══════════════════════════════════════════════════════════════
-- LA DEVOLUCIÓN PARCIAL SE PUEDE REGISTRAR
--
-- Error de V1-A, del 11/09, encontrado el 25/09 al verificar
-- «Registrar devolución» en la pantalla Pedidos web: desde la
-- aplicación NINGUNA devolución parcial se podía registrar, tampoco
-- desde Facturación. Contestaba «new row violates row-level security
-- policy for table devolucion». En la base había cero devoluciones.
--
-- Por qué: la migración de las devoluciones cerró la escritura de
-- devolucion y devolucion_linea con la idea de que «pasa sólo por la
-- función», pero la función es SECURITY INVOKER —corre con los
-- permisos de quien la usa—, y sin una política de alta nadie podía
-- escribir. Las pruebas de ese día corrieron como dueño de la base,
-- que se saltea las políticas, y por eso no lo vieron.
--
-- Por qué se arregla con una política y no volviendo la función
-- SECURITY DEFINER: la función escribe también el stock, la cuenta
-- corriente y la nota de crédito, y hoy cada una de esas tablas
-- controla su propio permiso. Como dueño, la función se saltearía esos
-- controles y habría que reescribirlos adentro. La política pide lo
-- mismo que la pantalla para mostrar el botón: facturacion.emitir,
-- porque cada devolución emite una nota de crédito.
-- ═══════════════════════════════════════════════════════════════

create policy devolucion_insert on public.devolucion
  for insert to authenticated
  with check ((select app.tiene_permiso('facturacion.emitir')));

create policy devolucion_linea_insert on public.devolucion_linea
  for insert to authenticated
  with check ((select app.tiene_permiso('facturacion.emitir')));

grant insert on public.devolucion, public.devolucion_linea to authenticated;
