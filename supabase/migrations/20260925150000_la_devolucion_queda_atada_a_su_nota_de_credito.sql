-- ═══════════════════════════════════════════════════════════════
-- LA DEVOLUCIÓN QUEDA ATADA A SU NOTA DE CRÉDITO
--
-- La otra mitad del error de la migración anterior, encontrada al
-- volver a probar la devolución en la pantalla: con el alta ya
-- permitida, la devolución se registraba y la nota de crédito se
-- armaba, pero al final devolver_lineas_de_venta() anota en la
-- devolución cuál es su nota de crédito —un update— y sin política de
-- modificación la base lo ignoraba sin avisar: cero filas, sin error.
--
-- La pantalla lee ese dato para saber a qué nota pedirle el CAE. Sin
-- él, decía «la venta no estaba facturada» y la nota quedaba en
-- pendiente, sin autorizar, con el stock ya devuelto.
--
-- Lo que se abre es lo mínimo: sólo la columna comprobante_id, sólo
-- mientras está vacía —se anota una vez y no se cambia— y sólo con el
-- permiso de facturar, que es el que pide la devolución.
-- ═══════════════════════════════════════════════════════════════

create policy devolucion_anotar_nota_de_credito on public.devolucion
  for update to authenticated
  using (comprobante_id is null and (select app.tiene_permiso('facturacion.emitir')))
  with check ((select app.tiene_permiso('facturacion.emitir')));

grant update (comprobante_id) on public.devolucion to authenticated;
