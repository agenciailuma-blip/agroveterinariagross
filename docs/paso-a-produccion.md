# Pasar el sistema a producción — paso a paso

Pasar a producción es que **el sistema empiece a sacar facturas válidas ante ARCA**. Hasta ese momento factura contra el ambiente de pruebas de ARCA: el sistema es el mismo, lo único que cambia es a dónde se piden las autorizaciones.

Son tres tramos: **lo que se prepara antes**, **el día del cambio** y **la primera semana**. Cada paso dice quién lo hace.

---

## 1. Antes del día — lo que hace Gross

### 1.1 El certificado de ARCA (diez minutos, con clave fiscal)

Lo hace quien tenga la **clave fiscal nivel 3** del CUIT del comercio: el titular, o el estudio contable si tiene delegado el servicio *Administración de Certificados Digitales*.

Se lleva el archivo **`gross_produccion.csr`**, que manda el equipo de sistemas. No tiene nada secreto: se puede pasar por mail o en un pendrive.

1. Entrar a **arca.gob.ar** con clave fiscal.
2. Abrir **Administración de Certificados Digitales**.
   *Si no aparece:* Administrador de Relaciones de Clave Fiscal → **Adherir servicio** → ARCA → Servicios interactivos → *Administración de Certificados Digitales*. Salir y volver a entrar.
3. Elegir el CUIT del comercio → **Agregar alias**.
   - Alias: **`SistemaGross`**
   - Archivo: **`gross_produccion.csr`** → *Agregar alias*.
4. En la lista, al lado de `SistemaGross`: **Ver** → **descargar el certificado** (un archivo `.crt`).
5. **Autorizarlo a facturar** — el paso que más se olvida:
   Administrador de Relaciones de Clave Fiscal → **Nueva relación** → Buscar → ARCA → WebServices → **Facturación Electrónica** → en *Representante*, Buscar → elegir **`SistemaGross`** → **Confirmar**.
6. **Y una relación más, en el mismo lugar:** Nueva relación → ARCA → WebServices → **Consulta de Constancia de Inscripción** → **`SistemaGross`** → Confirmar.
   Es la que permite que, con sólo el CUIT de un cliente, el sistema traiga su nombre, domicilio y condición frente al IVA.
7. Mandarle el `.crt` al equipo de sistemas. **Tampoco tiene nada secreto.**

> **No hay que** generar otro pedido desde el portal, ni mandar ninguna «clave privada». La clave privada la tiene el equipo de sistemas y no se comparte.

### 1.2 El punto de venta

En ARCA: *Administración de puntos de venta y domicilios* → A/B/M de puntos de venta. Pasar al equipo de sistemas:

- [ ] El **número del punto de venta** que dice **«RECE para aplicativo y web services»**, con su domicilio. Si no hay ninguno, se da de alta ahí con *Agregar*, con ese sistema de emisión.
- [ ] **Si el sistema anterior factura con ese mismo punto de venta.** Puede ser: la numeración sigue sola desde el último número que ARCA tenga autorizado. Lo único es que, desde el día del cambio, **el sistema anterior no saca más facturas en ese punto de venta**.

El punto de venta de contingencia (**CAEA**, el que se usa cuando se corta internet) ya está dado de alta y cargado.

### 1.3 Elegir el día y la hora

- Un momento **sin clientes**: antes de abrir o después de cerrar. El cambio lleva alrededor de **una hora** y durante ese rato no se factura.
- Ese día es **el último del sistema anterior**. Desde la hora del cambio, todo se vende y factura en este.
- Avisar con **dos o tres días** de anticipación, para que el equipo de sistemas lo tenga reservado.

### 1.4 Dejar todo listo en el sistema

- [ ] **Usuarios** (*Administración → Usuarios*): cada persona con su rol. Quien inicia sesión necesita correo y contraseña —se le da con **Dar acceso**—; quien sólo vende en el mostrador alcanza con un **PIN**. El encargado, con PIN: sin él no se abre ni se cierra la caja.
- [ ] **El usuario del local**, el que queda abierto en las computadoras del mostrador y la caja: con rol **Cajero** y su acceso.
- [ ] **Las impresoras**: en cada computadora que cobra, *Administración → Configuración → Esta computadora → Impresora del mostrador*, elegir la de tickets y apretar *Prueba*.
- [ ] **El envío de mails** (*Administración → Configuración → Facturación → Envío de mails*): **apagado** hasta el día del cambio, para que ningún cliente reciba un comprobante de prueba.
- [ ] **El stock real**: si hace falta, el conteo de lo que hay en el local, para cargarlo como inventario inicial después del cambio.

---

## 2. El día del cambio

### Gross, antes de empezar

- [ ] **Cerrar la caja** en el sistema. No queda ninguna caja abierta.
- [ ] Que **nadie venda ni facture** hasta que el equipo de sistemas avise que terminó.

### El equipo de sistemas (alrededor de una hora)

1. **Saca los comprobantes de prueba** —facturas, ventas, pagos, movimientos de stock y de cuenta corriente de prueba—, con un respaldo antes. Ocupan números que ARCA va a usar en las facturas reales.
2. **Carga el certificado** de producción en el servidor.
3. **Cambia el sistema a producción**: desde ese momento, cada factura es válida ante ARCA.
4. **Le pregunta a ARCA qué puntos de venta ve**: tienen que aparecer el de facturación y el de contingencia. Si el de facturación no es el que tiene cargado el sistema, se corrige ahí, antes de la primera factura.
5. **Pide el código de contingencia (CAEA)** de la quincena, para que el sistema pueda facturar sin internet.
6. Avisa que terminó.

### Gross, cuando le avisan

- [ ] En **cada computadora**: abrir el sistema **con internet** y esperar a que diga *Copia local lista*. La computadora baja todo de nuevo, ya sin lo de prueba. Si ofrece actualizar, **Actualizar ahora**.
- [ ] **Abrir la caja** con el efectivo real del cajón y el PIN del encargado.
- [ ] **La primera factura de verdad**: una venta chica a consumidor final, con factura. Tiene que salir el ticket con CAE.
- [ ] **Verla en ARCA**: *Comprobantes en línea* o *Mis comprobantes* → tiene que aparecer esa factura, con el mismo número y el mismo importe.
- [ ] **Prender el envío de mails** en *Administración → Configuración → Facturación*.
- [ ] Si se contó el stock, **cargar el inventario inicial**.

> **Si algo falla en la primera factura**, no seguir facturando: la venta queda guardada con su factura pendiente, y el equipo de sistemas la revisa antes de que se acumulen.

---

## 3. La primera semana

- [ ] **Facturar sin internet una vez, a propósito**, con el equipo de sistemas al tanto: se corta internet en la caja, se cobra una venta con factura, y tiene que salir el ticket con el CAEA. Al volver internet, el sistema le informa a ARCA esa factura solo.
- [ ] **A fin de la quincena**, el sistema le informa a ARCA lo facturado con el CAEA —o que no hubo movimiento—. Es obligatorio aunque no se haya usado, y lo hace solo: el equipo de sistemas mira que haya salido.
- [ ] **El contador**: que revise las primeras facturas, el libro de IVA ventas y las percepciones de Ingresos Brutos del primer período.
- [ ] Cualquier cosa rara —un ticket que no sale, una factura que queda pendiente, un número que no coincide— se avisa **ese mismo día**, con la hora y la computadora.

---

## Resumen de quién hace qué

| Paso | Quién |
|---|---|
| Certificado en ARCA y las dos autorizaciones | Gross (titular o estudio contable) |
| Número del punto de venta | Gross |
| Elegir el día y avisar | Gross |
| Usuarios, impresoras, mails apagados | Gross |
| Sacar lo de prueba, cargar el certificado, cambiar a producción | Equipo de sistemas |
| Abrir el sistema en cada PC, abrir la caja, primera factura | Gross |
| Verificar la factura en ARCA | Gross |
| Prender los mails | Gross |
| Prueba sin internet y cierre de la quincena | Gross y equipo de sistemas |
