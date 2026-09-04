-- ═══════════════════════════════════════════════════════════════
-- 044 — DÓNDE ESTÁ LA IMPRESORA DEL MOSTRADOR
--
-- La Hasar vive en la red del local, escuchando en un puerto. El
-- alcance la nombra: "Impresion en la Hasar P-HAS-181 por red, con QR
-- de ARCA".
--
-- Va a configuracion y no al codigo porque es un dato de la instalacion
-- de Gross: si mañana cambian el router o la reemplazan, lo corrige el
-- administrador y no hace falta una version nueva del sistema.
--
-- Vacio significa "no hay impresora configurada", y en ese caso el
-- comprobante se imprime desde el navegador como hasta ahora. Nunca
-- puede pasar que no haya forma de entregarle algo al cliente.
-- ═══════════════════════════════════════════════════════════════

insert into public.configuracion (clave, valor, descripcion, grupo) values
  ('comercio.impresora_host', '""',
   'Dirección de la impresora del mostrador en la red del local (por ejemplo 192.168.1.50). Vacío = se imprime desde el navegador.', 'comercio'),
  ('comercio.impresora_puerto', '"9100"',
   'Puerto en el que escucha la impresora. 9100 es el habitual para impresoras de red.', 'comercio')
on conflict (clave) do nothing;
