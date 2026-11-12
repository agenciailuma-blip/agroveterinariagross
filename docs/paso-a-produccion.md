# Paso a producción

Seguí estos pasos:

1. En ARCA, con clave fiscal nivel 3: *Administración de Certificados Digitales* → **Agregar alias** `SistemaGross` con el archivo `gross_produccion.csr` → descargar el `.crt`.
2. En *Administrador de Relaciones de Clave Fiscal* → **Nueva relación** → WebServices → **Facturación Electrónica** → representante `SistemaGross`. Repetir con **Consulta de Constancia de Inscripción**.
3. Mandar el `.crt` y el número del punto de venta **RECE para aplicativo y web services**, y avisar si otro sistema factura con ese mismo punto de venta.
4. Cargar los usuarios en *Administración → Usuarios* (con **Dar acceso** los que inician sesión, con PIN los que sólo venden) y elegir la impresora de tickets en cada computadora que cobra.
5. Apagar el envío de mails en *Administración → Configuración → Facturación*.
6. Acordar día y hora sin clientes. Ese día: cerrar la caja y no vender hasta que se avise que el cambio está hecho (alrededor de una hora).
7. Abrir el sistema con internet en cada computadora hasta que diga *Copia local lista*.
8. Abrir la caja y hacer una factura chica a consumidor final. Verla en ARCA, en *Mis comprobantes*.
9. Prender el envío de mails.

Listo.
