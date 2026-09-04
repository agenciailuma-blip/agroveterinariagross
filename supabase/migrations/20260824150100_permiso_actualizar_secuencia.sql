-- La alineacion con ARCA necesita poder adelantar el contador local
-- hasta donde esta ARCA. Sin esta politica el UPDATE no falla: afecta
-- cero filas en silencio, que es peor, porque el contador sigue
-- desalineado y nadie se entera.
create policy secuencia_comprobante_update on public.secuencia_comprobante
  for update to authenticated
  using ((select app.tiene_permiso('facturacion.emitir')))
  with check ((select app.tiene_permiso('facturacion.emitir')));

grant update on public.secuencia_comprobante to authenticated;
