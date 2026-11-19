# Auditoría de integralidad

*Recorrida del sistema entero el 19/11/2026, con el criterio que pidió Lucas en la Fase 03: menos saltos entre pantallas.*

## La vara

Lucas lo explicó con el pedido mayorista: llega el pedido, depósito da el ok ahí mismo, un clic arma el remito, otro factura, y después ese remito igual se ve, se busca y se exporta desde *Remitos*. De ahí salen cuatro preguntas, y cada circuito se miró con ellas:

1. **¿Se hace donde aparece?** Si una pantalla muestra algo pendiente, desde ahí se resuelve; no hay que ir a buscarlo a otra.
2. **¿Se elige lo mismo una sola vez?** Si ya se eligió el cliente o el proveedor, no se vuelve a buscar en la pantalla siguiente.
3. **¿Lo hecho se ve desde su archivo?** Una factura hecha desde un pedido está igual en *Facturas emitidas*; un remito, en *Remitos*.
4. **¿De un papel se llega a los que tiene atados?** De un movimiento de la cuenta, a su factura; de un remito, a su venta; de un recibo, a la cuenta del cliente.

## Lo que ya está integrado

Estos circuitos ya cumplen la vara y sirven de modelo para corregir los demás:

| Circuito | Cómo queda |
|---|---|
| **Pedido mayorista** | En la misma ficha: depósito corrige, *Facturar* o *Proforma*, y el *Remito logístico* se ofrece al terminar. La ficha muestra después la factura, la proforma y el remito, y cada uno se abre con un toque. Todos aparecen también en sus archivos. |
| **Orden de recibo** del vendedor | Se acepta en *Cobros*: abre la cobranza con el importe ya puesto, sale el recibo y baja la cuenta. El recibo queda enlazado en la orden. |
| **Pedidos web** | Revisar, facturar y emitir el remito desde el mismo pedido. |
| **Traslados** | *Mandar a caja* desde la orden; cuando se cobra, la orden muestra su factura. *Mapa* y teléfono en la misma tarjeta. |
| **Fiados** | Cobrar, cambiar fechas y escribir por WhatsApp desde la ficha de la persona; cada pago abre su recibo. |
| **Compra → mercadería → pedido** | La recepción se hace sobre la factura de compra, y ahí mismo se trae el pedido al proveedor que estaba esperando. Un producto nuevo se da de alta en el momento. |
| **Órdenes internas → pedido al proveedor** | El pedido arranca con lo que pidieron las órdenes, y las órdenes quedan pedidas solas. |
| **Presupuesto → caja** | Desde *Presupuestos*, *Mandar a caja* sin volver a cargar la venta. |
| **Proforma → factura** | *Facturar* en la proforma: misma venta, sin tocar stock ni caja. |
| **Cliente nuevo en el mostrador** | Se escribe el CUIT y se trae de ARCA ahí mismo, sin ir a *Clientes*. |

## Los saltos que quedan

Ordenados por cuánto se usan. **Tamaño:** *chico* entra en una versión junto con otros; *medio* es una versión propia.

### 1. Remitos internos: se ven en la cuenta del cliente, se facturan en otra pantalla

**Hoy.** La cuenta corriente del cliente (en *Clientes*) muestra en amarillo los remitos internos *Pendientes de facturar*. Tocarlos sólo abre el remito. Para ponerles precio y facturarlos hay que ir a *Comprobantes → Facturación*, bajar hasta *Pendientes de facturar* y volver a elegir el mismo cliente.

**Propuesta.** Un botón **Poner precios y facturar** en ese recuadro de la cuenta, que abre la misma ventana de *Pendientes de facturar* con el cliente ya elegido y sus remitos marcados. Lo de *Facturación* no se toca: sigue siendo el lugar para hacer los de todos los clientes a fin de mes.

**Por qué primero.** Es el circuito de las municipalidades, que es diario. **Tamaño: medio.**

### 2. Los movimientos de la cuenta corriente no abren su comprobante

**Hoy.** En la cuenta de un cliente, cada renglón (una venta, una nota de crédito, un pago) es sólo texto. Para ver la factura de un renglón hay que ir a *Facturas emitidas* y buscarla por cliente o por fecha. Sólo el último recibo y los remitos firmados tienen enlace.

**Propuesta.** Tocar el renglón abre su papel: la factura o la proforma de la venta, la nota de crédito, el recibo del pago. **Tamaño: chico.**

### 3. Una factura vieja no se puede devolver desde donde se la encuentra

**Hoy.** *Facturas emitidas* busca cualquier factura, de cualquier fecha, pero sólo deja verla. La devolución (la nota de crédito, total o parcial) está en la lista de *Facturación*, que muestra las últimas 200. Una factura de hace dos meses se encuentra en un lado y no se puede devolver en ninguno.

**Propuesta.** **Devolver** en la vista del comprobante, con la misma ventana de devolución parcial que ya existe. Así se llega desde cualquier lado: el buscador, la cuenta del cliente (punto 2), un pedido mayorista. **Tamaño: medio.**

### 4. El proveedor no tiene una ficha que lleve a sus cosas

**Hoy.** *Proveedores* agrupa productos y muestra cuántos tiene cada uno, pero no lleva a nada más. Lo que se le debe está en *Cuentas proveedores*, lo que se le pidió en *Pedidos*, y sus facturas en *Compras*: en cada una se lo vuelve a buscar. Al cargar una factura de compra no hay forma de pagarla desde ahí.

**Propuesta.**
- En cada proveedor de la lista: **Cuenta** (abre *Cuentas proveedores* con él elegido; esa pantalla ya lo admite) y **Pedir** (abre *Pedidos* con él elegido).
- En la factura de compra ya guardada: **Pagar**, que abre su cuenta con él elegido.

**Tamaño: chico.**

### 5. Los remitos logísticos no llevan a su venta

**Hoy.** En *Remito logístico*, la columna *Venta* dice el código y si está sin cobrar, pero no se toca. Para ver la factura de ese remito hay que buscarla aparte.

**Propuesta.** El código de la venta abre su factura o proforma. **Tamaño: chico.**

### 6. Un recibo no lleva a la cuenta del cliente

**Hoy.** *Recibos* encuentra el recibo y lo abre. Para ver cómo quedó la cuenta de ese cliente hay que ir a *Clientes* y buscarlo.

**Propuesta.** El nombre del cliente lleva a su cuenta corriente (o a su ficha de fiado, si el recibo es de un fiado). **Tamaño: chico.**

### 7. Un cheque de un cliente no lleva a su cuenta

**Hoy.** En *Cheques*, uno que se le dio a un proveedor tiene enlace a la cuenta del proveedor. Uno que entregó un cliente dice quién lo entregó, sin enlace.

**Propuesta.** El mismo enlace, a la cuenta del cliente. **Tamaño: chico.**

### 8. Hay que saber de qué tipo es un papel para encontrarlo

**Hoy.** Lo que emite el sistema está repartido en ocho lugares: *Facturación*, *Facturas emitidas*, *Proformas emitidas*, *Percepciones*, *Remito logístico*, *Comprobantes de entrega* y *Presupuestos* en *Comprobantes*, y *Recibos* en *Clientes*. Con un número en la mano («¿qué es el 0001-00000123?») hay que probar pantalla por pantalla.

**Propuesta.** Un **buscador por número** arriba de *Comprobantes* que busca en todos y abre lo que encuentra. Las pestañas siguen como están: son los archivos de cada tipo. **Tamaño: medio.**

### 9. El presupuesto que vuelve hay que ir a buscarlo a otra pantalla

**Hoy.** Cuando el cliente vuelve con el presupuesto impreso, el mostrador tiene que ir a *Presupuestos*, encontrarlo y mandarlo a caja.

**Propuesta.** En el buscador del mostrador, escribir el número del presupuesto lo trae y ofrece mandarlo a caja ahí mismo. **Tamaño: chico a medio.** Depende de cuánto se use: si casi no vuelven presupuestos, no vale la pena.

## Hecho

- **Tanda 1, en la 0.25.5 (19/11):** puntos 2, 4, 5, 6 y 7. Dos diferencias con lo propuesto: en *Compras* el botón de cada factura se llama **Cuenta** (no se sabe desde ahí si ya está pagada) y **Pagarla** aparece al guardar una nueva; y los recibos de **fiados** no llevan a la ficha del fiado, porque la consulta de recibos no trae a la persona.
- **Tanda 2, también en la 0.25.5 (19/11):** puntos 1 y 3, como se propusieron. En la cuenta del cliente, los remitos vienen marcados y se desmarca lo que no va; la devolución en la vista del comprobante usa las mismas reglas y ventanas que *Facturación*.

## Orden sugerido

| Tanda | Qué | Por qué junto |
|---|---|---|
| **1** | Puntos **2, 4, 5, 6 y 7** | Todos son enlaces entre pantallas que ya existen: ninguno cambia cómo se factura ni cómo se cobra. Una versión. |
| **2** | Puntos **1 y 3** | Cambian dónde se factura y dónde se devuelve. Usan ventanas que ya existen, pero cada uno merece probarse aparte. |
| **3** | Puntos **8 y 9** | Mejoran la búsqueda; no destraban ningún circuito. Se hacen si Lucas los pide al ver las tandas anteriores. |

**Para preguntarle a Lucas** antes de la tanda 3: ¿cuántos presupuestos vuelven por semana? ¿Les pasa seguido tener un número y no saber qué es?

## Lo que no se propone tocar

- **La cantidad de pestañas de *Comprobantes*.** Cada una es el archivo de un tipo de papel, y Lucas pidió exactamente eso: «registro, veo y exporto». El problema no es que existan, sino llegar a ellas: lo resuelven los puntos 2, 5 y 8.
- **Separar *Facturación***, que junta varias cosas (contingencia, lo emitido en un corte, el Excel del contador, *Por facturar*, *Pendientes de facturar* y la lista). Está junta a propósito: son los pendientes del que factura. Con el punto 1, *Pendientes de facturar* se puede hacer también desde el cliente.
