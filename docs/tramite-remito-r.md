# Remito R desde el sistema — el trámite en ARCA

**Para:** el titular del CUIT y su contador.
**Qué se logra:** que el remito R, el que acompaña la mercadería que viaja por la provincia, **lo imprima el sistema** —en hoja en blanco o en PDF al celular— y no haya que encargar talonarios a la imprenta.

---

## Lo que hay que saber antes

- **El remito R no lleva CAE, lleva CAI** (Código de Autorización de Impresión). El CAE es sólo para facturas.
- **ARCA no autoriza los remitos uno por uno**, como hace con las facturas. Se pide **un CAI para un rango de números** de un punto de venta, y con ese CAI se emiten los remitos hasta que se terminan los números o vence el CAI. Después se pide otro.
- **Desde 2025 el remito puede ser digital** (RG 5678/2025): se muestra en el celular y se le manda una copia al destinatario. El CAI sigue haciendo falta igual.
- **Quién lo hace:** el titular con su clave fiscal, o el contador si tiene la delegación del CUIT. Se necesita **clave fiscal nivel 3**, el **CUIT activo sin limitaciones** y el **domicilio fiscal actualizado**.

---

## Paso 1 — La pregunta para el contador

> Queremos emitir el **Remito R desde nuestro sistema de gestión**, impreso en hoja en blanco o en PDF, sin talonario de imprenta. **¿Con qué modalidad damos de alta el punto de venta para eso —autoimpresor u otra— y Gross cumple los requisitos?**

Con esa respuesta se sigue. Los pasos 2 a 5 son iguales en cualquier caso.

## Paso 2 — Un punto de venta sólo para remitos

1. Entrar a ARCA con clave fiscal → **Administración de puntos de venta y domicilios**.
2. Elegir la empresa → **A/B/M de puntos de venta** → **Agregar**.
3. **Número:** uno libre, que no se use para nada más (por ejemplo, el **10**). **No usar los puntos de venta de las facturas**: el remito tiene que tener su propio número.
4. **Sistema de emisión:** el que indique el contador en el paso 1.
5. **Domicilio:** el del local desde donde sale la mercadería.
6. Confirmar.

## Paso 3 — Pedir el CAI

1. En ARCA, entrar al servicio **Autorización de Impresión de Comprobantes**. Si no aparece, agregarlo desde **Administrador de Relaciones de Clave Fiscal** → *Adherir servicio* → ARCA → **Autorización de Impresión de Comprobantes**.
2. **Solicitud de C.A.I.** → **Solicitud manual**.
3. Cuando pregunta si es para **comprobantes de resguardo** ante contingencias: **No**.
4. Completar:
   - **Punto de venta:** el del paso 2.
   - **Tipo de comprobante:** **Remito R** (código 091).
   - **Cantidad:** cantidad de **remitos**, no de talonarios. Conviene pedir lo de **un año de viajes**. Si no hay idea, 500.
5. **Confirmar.** Sale una **constancia** con el **número de CAI** y la **fecha de vencimiento**. Guardarla en PDF.

## Paso 4 — Cerrar el pedido

Si el servicio muestra **Recepción de C.A.I.** con el pedido pendiente, **informarlo** ahí. Si queda abierto, **ARCA no deja pedir el próximo CAI** para ese punto de venta.

## Paso 5 — Pasar los datos para cargarlos en el sistema

Mandar la **constancia del CAI** (el PDF), o estos cuatro datos:

| Dato | Ejemplo |
|---|---|
| Número de CAI | 12345678901234 |
| Fecha de vencimiento del CAI | 31/12/2027 |
| Punto de venta | 00010 |
| Números autorizados | desde 00000001 hasta 00000500 |

Con eso, cada remito R sale del sistema **numerado en orden**, con la **letra R**, el **CAI y su vencimiento**, y la leyenda **«Documento no válido como factura»**. El sistema **no deja pasar del último número ni de la fecha de vencimiento**, y **avisa antes** para pedir el próximo CAI a tiempo.

---

## Qué lleva cada remito (lo completa el sistema)

- Datos de Gross, del **destinatario** y de **quien lleva la carga**.
- **Domicilio de origen y de destino**, y la **fecha en que sale**.
- **Productos y cantidades.** Precio, sólo si se quiere.
- La **factura o el comprobante** con que se vendió, si lo hay.
- Se hace **antes de que salga la mercadería**: viaja con ella, en papel o en el celular.
- Se le manda **una copia al destinatario**, y **se guarda dos años**. El sistema lo guarda solo.

---

## Fuentes

- [ARCA — Cómo solicito el Código de Autorización de Impresión (CAI)](https://serviciosweb.afip.gob.ar/genericos/guiaspasopaso/VerGuia.aspx?id=138)
- [RG 5678/2025 — remitos digitales](https://www.consejosalta.org.ar/wp-content/uploads/ARCA-5678.pdf)
