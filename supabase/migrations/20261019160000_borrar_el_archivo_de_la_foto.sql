-- ═══════════════════════════════════════════════════════════════
-- La foto quitada se borra también del depósito
--
-- Al quitar una foto, la app borra el archivo con el almacenamiento, y
-- el almacenamiento busca el archivo antes de borrarlo. Sin una regla
-- que le deje verlo, no lo encontraba, no borraba nada y no avisaba: la
-- foto salía de la tienda pero el archivo quedaba ocupando lugar. Lo
-- mismo con el archivo que se borra cuando la base no acepta la foto.
--
-- Visto en pantalla el 19/10, quitando una foto de un producto PRUEBA.
--
-- Ver no le da nada nuevo a nadie: el depósito es público y cada foto
-- se lee por su dirección. La regla es para quien puede borrar.
-- ═══════════════════════════════════════════════════════════════

create policy productos_imagen_ver on storage.objects
  for select to authenticated
  using (bucket_id = 'productos' and app.tiene_permiso('productos.editar'));
