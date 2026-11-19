---
fecha: 2026-11-19
estado: propuesta — espera el OK de Francisco y dos respuestas de Lucas
---

# Registro de auditoría — propuesta

## Por qué

El alcance de la Fase 1 compromete un **«registro de auditoría de toda operación sensible»** (punto 1, *Base del sistema*). Es lo único de esa fase que falta construir.

**Lo que hay hoy:** casi todo lo sensible ya deja su rastro, pero cada cosa en su lugar: quién anuló una venta, quién cambió el precio de un renglón, quién autorizó vender a un cliente con deuda vencida, quién hizo un aumento masivo, cada movimiento de stock, cada entrada o salida de caja. Para saber «qué pasó el martes» hay que ir a mirar pantalla por pantalla.

**Lo que no deja rastro:** los cambios en las fichas y en la configuración. Si alguien cambia el precio de un producto en su ficha, el límite de crédito de un cliente, los permisos de un rol o un medio de pago, el sistema guarda el valor nuevo y nada más.

**Ya pasó una vez.** El 17/09 alguien tildó «Entra al arqueo de caja» en *Tarjeta de crédito*. Desde ese día el cierre de caja esperaba en el cajón la plata de las ventas con tarjeta y daba diferencias que no existían. Se encontró el 15/10: se supo **cuándo** cambió, pero **no quién** ni desde qué computadora.

## Qué se propone

Dos cosas.

### 1. Que los cambios en fichas y configuración dejen rastro

Desde que se activa, cada cambio en estas cosas queda anotado con **quién, cuándo, desde qué puesto, qué valor tenía antes y qué valor quedó**:

| Qué | Por ejemplo |
|---|---|
| Productos | precio, costo, IVA, unidad, si se vende online, dar de baja o restaurar |
| Precios por lista | el precio fijo de un producto en Contado, Mayorista o la de la web |
| Clientes | cuenta corriente, límite de crédito, días de vencimiento, lista de precios, descuento, las marcas (*Precio a convenir*, *Pide proforma*, mayorista), dar de baja |
| Usuarios y permisos | alta y baja, cambio de rol, PIN puesto o cambiado (sin guardar el PIN), cada permiso que se le da o se le saca a un rol |
| Configuración | datos del emisor, percepción de IIBB, envío de mails, puntos de venta, tandas del remito R, todo lo de *Configuración* |
| Medios de pago y listas | lo que pasó con la tarjeta: cuotas, recargo, si entra al arqueo |
| Puestos | nombre, punto de venta, depósito, cuál escucha a las demás |

Se anota **sólo lo que cambió**: si en un producto se tocó el precio, queda «precio: 12.000 → 13.500», no la ficha entera.

**Lo que no se anota acá**, porque ya tiene su propio registro o no aporta: cada venta y cada cobro (están en Ventas y en la Caja), los movimientos de stock (están en el historial de cada producto), lo que se mira o se busca, y lo que las PC informan solas (*Estado de las PC*).

**Nadie lo puede borrar ni corregir**, tampoco el administrador. Es lo que lo hace confiable.

### 2. Una pantalla para verlo todo junto

**Administración → Registro de auditoría.** Una sola lista, de lo más nuevo a lo más viejo, que junta lo de arriba con los rastros que ya existen:

- anulaciones: ventas, facturas por nota de crédito, proformas, recibos, movimientos de caja, entradas y salidas de stock, transferencias, pagos a proveedores;
- precios cambiados en un renglón de la venta, con el motivo y quién puso el PIN;
- ventas a cuenta corriente de clientes con deuda vencida, con quién las autorizó;
- aumentos masivos de precios y sus deshacer;
- aperturas y cierres de caja, con la diferencia;
- devoluciones;
- y todos los cambios de fichas y configuración.

Se filtra por **fechas, persona, puesto y tipo** («sólo anulaciones», «sólo precios», «sólo permisos») y se busca por texto: un producto, un cliente, un número de comprobante. Cada renglón lleva al papel o a la ficha. Se exporta a Excel.

**Lo que ya tenía rastro aparece desde el primer día con su historia completa**, desde que se empezó a usar el sistema. Lo nuevo —fichas y configuración— empieza a contar desde que se activa.

## Para contárselo a Lucas

«Hoy, si alguien cambia un precio en la ficha, el límite de un cliente o los permisos de un rol, el sistema no guarda quién fue. Con esto queda todo anotado y nadie lo puede borrar, y hay una pantalla donde se ve todo junto: qué se anuló, qué precios se tocaron, quién autorizó qué. Es lo que pasó con la tarjeta en septiembre: supimos cuándo cambió, pero no quién.»

## Lo que tiene que decidir Lucas

1. **¿Quién ve el registro?** Propuesta: **Administrador**, y que Lucas pueda dárselo al Encargado desde *Usuarios → Roles y permisos* (un permiso nuevo, *Ver el registro de auditoría*). Arranca sólo en Administrador.
2. **¿Quiere algún aviso?** Por ejemplo, un resumen diario por mail con las anulaciones y los precios cambiados. **Propuesta: no ahora.** Primero la pantalla; si después la mira todos los días, el aviso se suma.

## Tiempos

- **Tres días de trabajo**: uno para que fichas y configuración dejen rastro, uno para juntar todo en una sola lista, y uno para la pantalla, la exportación y las pruebas.
- **No cambia nada de cómo se trabaja.** Nadie tiene que hacer nada distinto: el registro se llena solo.
- **Lo de fichas y configuración funciona desde que se aplica en la base**, aunque las PC no hayan actualizado. La pantalla llega con la actualización, como siempre.
- **El espacio no es problema**: son cambios de fichas, no ventas; un local como Gross genera unos cientos por mes.
