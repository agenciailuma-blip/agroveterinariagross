---
fecha: 2026-11-05
con: Lucas Gross y un vendedor
estado: mostrador hecho (0.20.0); caja hecha (0.21.0); traslados para más adelante
---

# Reunión del 5/11 — lo que salió de ver el sistema en uso

Nueve pedidos. Abajo, cada uno con lo que se encontró en el código y en la base, y lo que queda por decidir.

| Punto | Estado |
|---|---|
| 1. Fotos en la tienda | Del lado de la web: hay que pedírselo |
| 2. Ingresos, egresos y cierre de caja | ✅ 0.21.0: ingresos y egresos, el cierre por medio de pago, la planilla A4 y los cierres anteriores |
| 3. Buscar con el teclado | ✅ 0.20.0 en Mostrador y Caja; 0.21.1 en Remitos, Órdenes internas, Recepción y Mayorista |
| 4 y 5. Alimento suelto | ✅ 0.20.0: 86 productos a kilo o litro, coma en la cantidad, opción para todos. Falta atar cada suelto a su bolsa |
| 6. F10 | ✅ 0.20.0, en todas las pantallas |
| 7. Tab del mostrador | ✅ 0.20.0 |
| 8. Accesorios | ✅ 0.20.0: *precio en cada venta* |
| 9. Traslados y calendario | Para más adelante, sin número de fase |

## 1. Las fotos no aparecen en la tienda

**No es del sistema.** Ejemplo: *Pro Plan Active Mind Adulto x 3kg* (código 166).

- La foto está cargada desde el **3/11 a las 21:17** y el archivo se abre por internet.
- La API se la entrega a la tienda: `imagenes` con su dirección, `solo_consultar: false`, precio 57.999,99.
- La web muestra el producto **sin foto y como «Solo consulta»**: tiene datos viejos del producto entero, no sólo de la foto.
- La tienda consulta la API todo el tiempo (último uso, 5/11 18:02).

**Conclusión:** la tienda lee, pero no actualiza los productos que ya tenía. Hay que pedírselo a la web: que tome los cambios de los productos existentes (foto, *solo consultar*, precio) y que haga una lectura completa una vez para ponerse al día.

## 2. Ingresos y egresos de caja, y el cierre con detalle

**Lo que hay:** la base ya tiene la tabla de movimientos de caja (ingreso / egreso), pero **no hay pantalla para cargarlos**. El cierre de hoy sólo pide el efectivo contado y da la diferencia.

**Lo que piden, según las fotos del sistema anterior:**

- **Ingreso:** fecha, descripción, importe, *saldo de caja anterior*, *no incluir en el cierre*.
- **Egreso:** descripción, importe, efectivo o cheques, y el tipo: gastos autorizados, anticipos de haberes (con el vendedor), pago a proveedores, retiros de socios. También *no incluir en el cierre*.
- **Cierre:** contado y cuenta corriente por separado (facturas, notas de débito y de crédito, recibos), ingresos y egresos manuales, cantidad de comprobantes, importe rendido.
- **Planilla impresa:** ingresos, egresos por tipo con subtotal, y el detalle por medio de pago (efectivo, crédito, débito, transferencia, QR).

**Cómo quedó (0.21.0):** el *pago a proveedores* también baja la cuenta del proveedor, como pago a cuenta; sin proveedor es un acreedor y sólo sale del cajón. El *anticipo de haberes* queda anotado con el empleado. Los cheques salen sólo en un pago a proveedor (endosados). Las notas de crédito y devoluciones del turno entraron en la 0.21.1.

## 3. Buscar con el teclado

En el sistema anterior: las flechas recorren los resultados, Enter elige, y apretar una letra o un número en cualquier momento vuelve a escribir en el buscador. Hoy hay que usar el mouse. Va para **todas las pantallas con buscador**, empezando por Mostrador y Caja.

## 4 y 5. Alimento suelto y fraccionamiento

**Causa encontrada:** los **2.281 productos se importaron con unidad «unidad»**, y el sistema redondea las cantidades de esos productos. Por eso *LIVRA CACH x kg* no acepta 0,5: lo pasa a 1, y 0,374 a 0.

- Hay unos **50 productos «x kg» o «suelto»** que en realidad se venden por kilo o litro.
- **La apertura de la bolsa ya existe** (la caja y la suelta, de la 0.14.0): si *AGILITY x kg suelto AD* se ata a la bolsa *AGILITY AD x 15 kg*, al vender suelto sin stock suelto el sistema abre una bolsa sola: la bolsa baja 1 y el suelto sube 15. Hoy hay **un solo producto atado**.
- **Se hace desde el mostrador**, no hace falta la caja: con la unidad en kilos, la cantidad acepta 0,374.

**Hecho las dos cosas:** los que se venden por kilo o litro pasaron a esa unidad (63 y 23), y la opción *Decimales en todos los productos* queda en Configuración, apagada, para que Lucas la prenda si la quiere.

## 6. Enviar a caja con F10

En el sistema anterior **F10 es Aceptar en todas las pantallas**. Hoy F9 hace lo principal en todas. Conviene mover la regla entera a F10, no sólo el mostrador.

## 7. El Tab del mostrador

Hoy el Tab pasa por *Escribir*, cada renglón (cantidad, %, precio, quitar) y recién llega al cliente. Pedido: del buscador, directo al cliente; después el medio de pago y enviar.

## 8. Accesorios con precios distintos

*Accesorios* es un producto que representa muchos de la góndola. Agregarlo dos veces suma cantidad al mismo renglón, así que no se le puede poner otro precio. **Propuesta:** una marca en el producto, *precio en cada venta*, que pregunta el precio al agregarlo y siempre abre un renglón nuevo.

## 9. Traslados y calendario

**Queda para más adelante** (sin número de fase): era un desarrollo pensado para después.

El Calendario de hoy es **de plata** (cheques, vencimientos de clientes y proveedores). No tiene traslados. **Falta aclarar** qué se quiere: que cada traslado aparezca en su día del calendario y que desde un día se pueda crear un traslado, o que se conecte a un calendario externo (Google Calendar).
