---
actualizado: 2026-09-16
estado: esperando el trámite
---

# El certificado de producción de ARCA

> **Es lo único que falta para facturar de verdad, y también para terminar de probar el CAEA.** El pedido ya está armado: `secrets/gross_produccion.csr`, generado el 16/09. Lo que queda es un trámite con clave fiscal, de unos diez minutos.

---

## Por qué ahora bloquea también el CAEA

El punto de venta **00009** (régimen CAEA, contingencias) quedó dado de alta en ARCA el 11/09 y **se cargó en el sistema el 16/09**. Al usarlo, el ambiente de pruebas de ARCA lo rechazó:

> **1204** — El PtoVta debe corresponder a un punto de venta CAEA

Y al preguntarle qué puntos de venta ve para el CUIT de Gross, contestó **«602 — Sin Resultados»**: ninguno, ni el 9 ni el 1. **El ambiente de pruebas no tiene el padrón de puntos de venta de la ARCA real.** Con el CAE no se nota, porque en pruebas no controla el punto de venta; con el CAEA sí lo controla.

> **Cómo se lo contás a Lucas:** el alta del punto de venta está bien hecha y ya está cargada. Pero el "simulador" de ARCA donde probamos no se entera de las altas reales, así que la última prueba del CAEA —avisarle a ARCA qué se facturó en contingencia— sólo se puede hacer con la ARCA de verdad. Para eso hace falta el certificado de producción.

---

## El trámite — lo hace quien tenga la clave fiscal del CUIT 20-14636976-7

El CUIT está a nombre de **GROSS ERNESTO HUGO**. Lo puede hacer el titular, o quien tenga delegado el servicio *Administración de Certificados Digitales* (si el estudio contable hizo el alta del punto de venta 9, puede que ya lo tenga).

**Se lleva:** el archivo `gross_produccion.csr`. No tiene nada secreto adentro: se puede mandar por mail o llevar en un pendrive.

1. Entrar a **arca.gob.ar** con clave fiscal.
2. Abrir **Administración de Certificados Digitales**.
   *Si no aparece en la lista de servicios:* Administrador de Relaciones de Clave Fiscal → **Adherir servicio** → ARCA → Servicios interactivos → *Administración de Certificados Digitales*. Salir y volver a entrar.
3. Elegir el CUIT de Gross → **Agregar alias**.
   - Alias: **`SistemaGross`** (igual que el de pruebas, así el certificado sale con el mismo nombre que ya espera el sistema).
   - Archivo: **`gross_produccion.csr`** → *Agregar alias*.
4. En la lista, al lado de `SistemaGross`, **Ver** → **descargar el certificado** (`.crt`).
5. ⚠️ **El paso que todo el mundo se olvida — autorizarlo a facturar.** Administrador de Relaciones de Clave Fiscal → **Nueva relación** → Buscar → ARCA → WebServices → **Facturación Electrónica** → en *Representante*, Buscar → elegir el computador fiscal **`SistemaGross`** → **Confirmar**.
   Sin esto el certificado existe pero no puede facturar, y el error que devuelve ARCA no dice que el problema es éste.
6. Mandar el `.crt`. **Tampoco tiene nada secreto.**

**Lo que NO hay que hacer:** generar otro pedido desde el portal, ni pedir o mandar ninguna "clave privada". La clave privada es `secrets/gross_produccion.key`, se generó acá y **no sale de acá** salvo para cargarse en el servidor.

---

## Cuando llegue el `.crt` — lo que hacemos nosotros

**Importante: cambiar a producción es un solo interruptor para todo el sistema.** Desde ese momento, cada factura que sale es una factura de verdad, y el CAE de pruebas deja de funcionar. **Cuándo se cambia es una decisión aparte**, que se toma con Lucas y contra la fecha del 26/10: tener el certificado no obliga a cambiar ese día.

**Antes de cambiar:**

- [ ] Guardar el certificado como `secrets/gross_produccion.crt` y verificar que corresponde a la clave (que `openssl x509 -modulus` y `openssl rsa -modulus` den lo mismo).
- [ ] Que el panel de contingencia filtre por ambiente: `vista_caea_estado` hoy muestra los CAEA de pruebas y los reales juntos, y en la quincena del cambio habría dos "vigentes" con el mismo período. **Emitir no se confunde** —`caea_vigente()` sí filtra—, pero la pantalla mostraría un código que no sirve.

**El día del cambio:**

- [ ] Reemplazar los secretos `ARCA_CERT_PEM` y `ARCA_KEY_PEM` en Supabase por los de producción. Los usan las dos Edge Functions, `arca-wsfe-solicitar-cae` y `arca-wsfe-caea`.
- [ ] `configuracion` → `arca.ambiente` = `produccion`.
- [ ] Llamar a `arca-wsfe-caea` con `accion: 'puntos_venta'`. **Tienen que aparecer dos:** el 9 como CAEA, y el del web service (RECE) con el que se va a facturar. ⚠️ **Confirmar que ese número es el 1**, que es el que tiene cargado hoy el sistema. Si es otro, se corrige antes de la primera factura.
- [ ] Pedir el CAEA de la quincena en curso desde el panel (o esperar a la tarea de las 9). A partir de ese pedido, **ARCA espera que se le informe al final de la quincena**, aunque no se use: la tarea diaria lo hace sola.

**La verificación que falta, y que sólo se puede hacer ahí:**

- [ ] El primer aviso de «sin movimiento» del punto de venta 9 aceptado por ARCA (queda en `caea_sin_movimiento`).
- [ ] Un comprobante emitido con CAEA e informado con `FECAEARegInformativo`. El armado del XML ya lo parseó ARCA en pruebas (rechazó por numeración, no por formato), pero **nunca lo aceptó entero**.

---

## Lo que ya se dejó listo el 16/09

- **Punto de venta 9 cargado** como *Contingencia CAEA*, marcado de respaldo: nunca se elige para una venta común, ni siquiera en las terminales que no tienen punto de venta asignado.
- **Consulta de puntos de venta** en la Edge Function (`accion: 'puntos_venta'`). Es de sólo lectura. Sirve para ver qué reconoce ARCA **antes** de depender de eso el día que se caiga.
- **La tarea diaria no mezcla ambientes.** El aviso de «sin movimiento» buscaba los CAEA pendientes sin mirar si eran de pruebas o reales: el día del cambio le habría mandado a la ARCA real, todos los días, los códigos de pruebas que nunca se pudieron informar. Verificado con la consulta vieja contra la nueva: con el ambiente en producción, la vieja agarraba el CAEA de pruebas y la nueva no agarra ninguno.
