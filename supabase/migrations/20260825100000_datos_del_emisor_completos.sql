-- ═══════════════════════════════════════════════════════════════
-- 039 — LOS DATOS QUE FALTABAN DEL ENCABEZADO, Y EL LOGO
--
-- Ingresos Brutos y la fecha de inicio de actividades quedaron vacios
-- a proposito el 21/08: van impresos en toda factura y no se podian
-- verificar. El 25/08 Lucas mando dos comprobantes reales de OBTech
-- —un ticket de la Hasar y una Factura A en A4— y los dos traen los
-- mismos valores en el encabezado. Ahi se confirmaron:
--
--   Ingresos Brutos        20-14636976-7  (es el CUIT, como sospechaba
--                                          el contador para un agente
--                                          de percepcion)
--   Inicio de Actividades  16/06/1986     (mucho antes que el 11/2013
--                                          que mostraba la constancia:
--                                          esa era el alta de UNA
--                                          actividad, no la primera)
--
-- De los mismos comprobantes salen el telefono y el domicilio tal como
-- Gross los imprime hoy.
--
-- El logo va como dato, no como parte de esta migracion: es un activo
-- de marca que el cliente cambia cuando quiere, y se carga desde
-- Configuracion.
-- ═══════════════════════════════════════════════════════════════

update public.configuracion
   set valor       = '"20-14636976-7"',
       descripcion = 'Número de Ingresos Brutos. Confirmado el 25/08/2026 contra dos comprobantes reales de Gross: es el CUIT con guiones.'
 where clave = 'comercio.ingresos_brutos';

update public.configuracion
   set valor       = '"16/06/1986"',
       descripcion = 'Fecha de inicio de actividades como Gross la imprime hoy. Confirmada el 25/08/2026 contra dos comprobantes reales.'
 where clave = 'comercio.inicio_actividades';

-- Tal como figura en los comprobantes que entrega hoy
update public.configuracion set valor = '"Av. Libertad 315"' where clave = 'comercio.domicilio';
update public.configuracion set valor = '"GROSS ERNESTO HUGO"' where clave = 'comercio.razon_social';

insert into public.configuracion (clave, valor, descripcion, grupo) values
  ('comercio.telefono', '"3755-421829/401829"',
   'Teléfono que se imprime en el encabezado del comprobante.', 'comercio'),
  /*
    El logo viaja como data URI adentro del propio comprobante. No usa
    Storage a proposito: el comprobante tiene que poder imprimirse con
    la terminal sin internet, y una imagen que se baja de un servidor
    saldria en blanco justo el dia que se corta.
  */
  ('comercio.logo', '""',
   'Logo del comercio como data URI (se carga desde Configuración). Se imprime en el encabezado del ticket y de la hoja A4.', 'comercio')
on conflict (clave) do nothing;
