# Los pedidos de Lucas — qué está hecho y qué falta

**Al 14 de septiembre de 2026.**
**Para qué sirve:** un solo lugar donde mirar los **24 puntos del documento del 03/09** y los **pedidos de la visita del 07/09**, con su estado real. Es el papel para llevar a la próxima reunión.

**Fuentes:** [`sugerencias-lucas-2026-09.md`](sugerencias-lucas-2026-09.md) (los 24 puntos clasificados) y [`reunion-lucas-2026-09-07.md`](reunion-lucas-2026-09-07.md) (la visita al local).

---

## El número, primero

| | Cantidad |
|---|---|
| ✅ **Hechos** | **16 de 24** |
| 🔜 Faltan **antes del 26/10** (V1-A) | 1 |
| 🔜 Van a **V1-B** (arranca al día siguiente del corte) | 3 |
| 🔜 Backlog **V2 / V3** | 3 |
| ❓ **Esperan una definición de Lucas** | 1 |
| 🟡 Sin asignar todavía | 1 |

**Y los 10 pedidos del 07/09 están todos hechos**, salvo un detalle cosmético.

---

## ✅ Lo que ya está — 13 puntos

Todos se pueden mostrar en pantalla.

| # | Lo que pidió | Dónde está | Cuándo |
|---|---|---|---|
| 1 *(parte)* | Salidas y entradas de stock **con motivo** | `movimiento_stock`, con diez tipos: carga inicial, compra, venta, devolución, ajuste, inventario, apertura, merma, remito y retorno de remito | Ya estaba |
| 2 | **Stock como entrada propia del menú** | Pantalla **Stock**, ordenada por urgencia, con botón para copiar la lista de faltantes | 08/09 |
| 7 | Artículos en punto crítico / **umbral de stock bajo** | Dos niveles —bajo y crítico—, por producto o por categoría entera. **Se configura en la ficha del producto** | Base ya estaba · pantalla 08/09 |
| 12 | *"Registro, veo y exporto"* | Adoptado como criterio. Hoy exporta el listado de comprobantes no fiscales a Excel; el resto llega con los reportes de V1-B | — |
| 13 y 14 | **La caja edita la venta**: quita, cambia cantidades, agrega | Con dos límites: los precios acordados no se tocan sin dejar rastro, y todo queda con el nombre del cajero | 04/09 |
| 15 | **Nombre del cliente para llamarlo en la caja** | Se pide al enviar la venta y aparece primero en la cola del cajero | 08/09 |
| 18 | **Pedir la cantidad al agregar** un producto | Y es **configurable**: se prueba unos días y se apaga desde Configuración si al mostrador no le sirve | 08/09 |
| 19 | Cambiar el precio de una línea · **columna de descuento en %** · **PIN que autoriza** | El motivo sale de una lista para poder contarlo después. Quien pone el PIN queda como responsable, **y puede no ser el vendedor** | Mecanismo ya estaba · % y PIN 08/09 |
| 20 | Marcar **factura o proforma antes de cobrar**, con su conteo | Selector en la caja, con tres candados del lado del servidor. Los tres tipos: presupuesto, remito y comprobante interno | 04/09 |
| 21 | **Cerrar la sesión al enviar a caja** | Cada vendedor vuelve a poner su PIN | 08/09 |
| 22 | **Descripción del producto** para la tienda web | El campo existía desde el principio; faltaba mostrarlo en el editor | 08/09 |
| 24 | **Remitos** para repartos y envíos | Circuito completo: desde una venta o de cero, sin precios, con la opción de descontar stock o no | 04/09 y 09/09 |
| 5 | **Proveedor en el producto** | Ficha mínima —nombre, CUIT, contacto— con su pantalla propia, y el desplegable en la ficha del producto | 09/09 |
| 4 | **Aumento de precios por proveedor** *(y por rubro)* | Elegís proveedor, ponés +7%, listo. Dice **a cuántos productos les va a pegar antes de aplicar**, y **se puede deshacer** | 09/09 |
| 11 *(parte)* | **IVA Ventas** para el contador | Exportación mensual a Excel, en Facturación. Una fila por alícuota | 09/09 |

---

## 🔜 Lo que falta antes del 26 de octubre — 1 punto

Esto es lo que todavía se le debe a Lucas dentro de V1-A.

### 16 · Todo con teclado, menos mouse

Él mismo lo puso **para lo último antes del 26/10**, y coincido: es de lo que más va a cambiar la velocidad del mostrador, pero tiene que hacerse cuando las pantallas ya no se muevan. Rehacer los atajos tres veces es tirar el trabajo.

### ✅ 3 · El concepto de depósito quedó reservado (10/09)

Los depósitos y transferencias siguen yendo a **V1-B**. Lo que se hizo el 10/09 es la mitad chica y urgente: **cada movimiento del libro de stock ya dice en qué depósito ocurrió**, y se completa solo con el principal mientras no haya pantalla.

No se ve en ningún lado y no cambió nada de lo que anda. Era ahora o migrar el histórico entero en diciembre — con al menos cinco depósitos, no uno.

---

## 🔜 Lo que va a V1-B — 4 puntos

V1-B arranca al día siguiente del corte. **No es alcance nuevo: ya estaba firmado.**

> ⚠️ **Revisado el 09/09 y hay una decisión pendiente.** Lo que sigue estaba comprimido en dos filas de tabla, y adentro había **tres cosas de tamaños muy distintos**. El análisis completo está en [`compras-e-iva.md`](compras-e-iva.md); acá va lo que cambia.

| # | Lo que pidió | Dónde entra |
|---|---|---|
| 11 *(parte)* | **IVA Ventas** | 🟠 **Está construido en un 90% y hoy figura en V1-B sin razón técnica.** Los datos se guardan bien desde agosto (`comprobante`, `comprobante_alicuota`, `comprobante_tributo`). Falta una consulta y una exportación |
| 1 *(parte)* | **Cargar la factura de compra** | ✅ **Hecho el 10/09 y movido a V1-A.** Pantalla Compras: proveedor, tipo, número, fecha, desglose por alícuota y percepciones, sin líneas. El motivo del cambio no fue el contador —él las baja de ARCA— sino que el 26/10 se corta OBTech, que es donde las cargan hoy |
| 1 *(parte)*, 6, 10 | **Recepción de mercadería**, órdenes de compra, costos por proveedor | ✅ **Queda en V1-B**, como estaba. Es la parte grande y la que necesita decisiones que todavía no se tomaron |

> Su frase *"una cosa es cargar facturas y otra es subir stock"* es exactamente la distinción, **llevada hasta el final**: la **recepción** de mercadería mueve stock y es cara; la **factura de compra** registra el IVA y es barata. Él ya había visto la diferencia — lo que faltaba era usarla para partir el trabajo.

🔴 **Por qué esto no puede quedar dormido:** es lo único de toda la lista con **una fecha que no manejamos**. El IVA se presenta todos los meses. Si se corta OBTech el 26/10 y V1-B llega cinco semanas después, la presentación de octubre cae en el medio y el contador la hace a mano.

**También en V1-B:** exportar Rentas de Misiones, que es concreto y probablemente necesario.

---

## 🔜 Backlog — 3 puntos

| # | Qué | Dónde |
|---|---|---|
| 8 | Aviso de reposición según la **venta media mensual** | **V3** — sugerencia automática según ventas históricas y estacionalidad. *(La pantalla de Stock ya muestra cuánto costaría reponer hasta el umbral; esto sería calcular el umbral solo.)* |
| 11 *(parte)* | **Centro de costos** | Es un módulo entero. V2 |
| 23 | **Comparador de productos** en la pantalla de venta | Idea buena y nueva. Sin asignar |

---

## ❓ Lo único que sigue sin respuesta — 1 punto

### 9 · "Comprobantes de percepción"

**Hay que aclarar qué es en su cabeza.** Si la percepción va en la factura, la factura *es* el comprobante. Lo más probable es que esté pidiendo **un listado para el contador**.

Lucas quedó en consultarlo el 03/09 y todavía no volvió con la respuesta. **Conviene preguntarlo de nuevo en la próxima reunión** — es de las pocas cosas que no se pueden estimar sin saber qué son.

---

## 🟡 Sin asignar — 1 punto

### 17 · Mandar la factura por email al cobrar

Necesita un servicio de correo, que hoy no está contratado. **El trabajo en sí es chico** si se apoya en el circuito de facturación ya armado: el comprobante ya se genera y ya se puede imprimir a PDF.

**Falta decidir dos cosas con Lucas:** si lo quiere para V1-A o V1-B, y desde qué dirección salen los mails.

> **Lo volvió a mencionar el 14/09**, en el audio del resumen de cuenta corriente: *"cada vez que alguien viene a buscar en cuenta corriente, yo le mando la factura por mail, que sería la ideal"*. Confirma el uso —es para el cliente de cuenta corriente, no para el mostrador— pero **no cambia lo que falta decidir**. Mientras tanto se puede hacer a mano: la factura en A4 se guarda como PDF desde *Ver / Imprimir* y se adjunta al mail.

---

## ✅ Pedido del 14/09 — el resumen de cuenta corriente

Audio de Lucas: *"que yo pueda generar un PDF con el resumen de cuentas corrientes… a fin de mes, si veo que no me pagaron, yo les mando el resumen"*.

**Hecho el 14/09.** En la ficha del cliente, pestaña *Cuenta corriente* → **Resumen de cuenta (PDF)**. Y, para el caso que describió, desde **Reportes**: la tabla de quién debe tiene un enlace *Resumen* en cada cliente.

Tiene la forma de un resumen bancario: saldo anterior, cada factura, cobranza y nota de crédito con el saldo que va quedando, y el saldo al cierre. Si llega hasta hoy, dice además cuánto de ese saldo está vencido y desde cuándo. Se elige el período —*Este mes*, *Mes pasado* o *Todo*— y se guarda como PDF con el nombre del cliente y el período ya puesto.

---

## Los pedidos del 07/09 — todos hechos

| Qué pidió en el local | Estado |
|---|---|
| El scroll no frena en el tope, deja fondo gris | ✅ 08/09 |
| El umbral de stock no aparece en la ficha del producto | ✅ 08/09 |
| El aviso dice *"tauri localhost dice"* | ✅ 08/09 — eran **16** diálogos, no uno |
| Descuento en caja **por porcentaje**, no sólo por monto | ✅ 08/09 |
| Motivo del descuento **por desplegable** | ✅ 08/09 — descuento por cantidad, vencimiento próximo, bonificación especial, más redondeo |
| No cierra el PIN al enviar a caja | ✅ 08/09 |
| No pide el nombre para llamar al cliente | ✅ 08/09 |
| En el remito **no van precios**, sólo cantidad | ✅ 09/09 — cierra con total de unidades |
| **Remito de cero** desde la página de Remitos | ✅ 09/09 |
| Elegir si el remito **descuenta stock o no** | ✅ 09/09 |
| **Producto comodín** — líneas escritas sin crear el producto | ✅ 09/09 — en venta, presupuesto y remito |

🟡 **Queda un detalle cosmético:** sin conexión, el aviso de factura pendiente ofrece *"Ir a Facturación para reintentar"*, donde reintentar no puede funcionar hasta que vuelva internet. Conviene que sin conexión no invite a reintentar.

---

## Y además — lo que no pidió Lucas pero falta igual

No sale de sus listas, pero está comprometido y entra antes del corte. Se anota acá para que el panorama esté completo.

| | Qué | Por qué importa |
|---|---|---|
| ✅ | **Impresión por la impresora de Windows** | Hecha el 09/09 y publicada en la 0.2.3. Se elige de una lista y se guarda por terminal. **Falta el papel:** probarla en el local, que son dos minutos |
| 🟡 | **El actualizador automático** | Arreglado en la 0.2.2, **pero todavía sin probar de punta a punta**: la actualización se hizo desinstalando primero. Mientras tanto, cada corrección se instala desinstalando |
| ✅ | **Métricas de venta en Inicio** | Hechas el 10/09: hoy, últimos 7 días, mes, lo más vendido y cuánto vendió cada uno. Era lo último visible que faltaba de V1-A |
| 🟡 | **Sincronización por red local** | Sin esto, "el mostrador sigue funcionando sin internet" se cumple a medias: una venta armada por un vendedor no llega a la caja hasta que vuelva la conexión |
| 🟡 | **Cifrado de la base local** | Hecho el 14/09 en la 0.4.0: los datos de clientes que guarda cada PC quedan cifrados. **Falta instalarlo en el local, limpio** |
| 🟡 | **Devoluciones parciales y nota de débito** | Hoy la devolución es de la venta entera: si el cliente devuelve 1 de 3, hay que anular todo y rehacer |
| 🟡 | **Reportes** | La única pantalla de V1-A que no existe todavía |

**Y lo que depende de terceros, que no se puede empujar desde acá:**

- 🔴 El **Excel con la columna de IVA** por producto — sigue siendo lo que más bloquea.
- 🔴 El **alta del punto de venta CAEA** — el estudio contable se ofreció a hacerlo, falta que Lucas lo autorice.
- 🔴 El **certificado de producción de ARCA**.
- 🔴 **Dónde se cobra la percepción de IIBB**: en la caja junto con la venta, o a la cuenta corriente.
