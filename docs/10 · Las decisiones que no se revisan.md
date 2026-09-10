---
origen: ESTADO.md
actualizado: 2026-09-09
---

# 10 · Las decisiones que no se revisan

> Las decisiones de fondo. Cambiar cualquiera obliga a rehacer varios módulos.

> Se movió acá desde `ESTADO.md` el 09/09, sin tocar una palabra. Empezá por [[AHORA]].

---

## 3. Las decisiones que no se revisan

Están así por razones concretas. Cambiar cualquiera obliga a rehacer varios módulos.

### El stock se guarda como movimientos, no como saldo
El saldo es la suma. Si dos terminales sin conexión venden la última unidad, con un número que se pisa una venta desaparece sin dejar rastro; con movimientos entran las dos y el saldo queda negativo — que es una alerta visible, no un dato perdido. Por eso `stock_saldo` **puede ser negativo a propósito**.

### Los identificadores fiscales son los códigos de ARCA
Alícuotas de IVA, tipos de documento, condiciones de IVA del receptor y tipos de comprobante usan los códigos que publica ARCA, no numeración propia. Al facturar no hay traducción, y donde no hay traducción no hay error de mapeo.

### Los precios incluyen IVA
`producto.precio_venta` es el precio final de mostrador. Al facturar se desarma el neto. Está asentado en `configuracion.precios_incluyen_iva` para que el módulo fiscal no lo adivine.

### Tres precios por línea de venta
`precio_original` (lista) · `precio_acordado` (lo pactado, a nivel contado) · `precio_unitario` (lo que se cobra, ya ajustado por la lista). Recalcular parte **siempre del acordado**, así cambiar de medio de pago no pisa las rebajas del vendedor ni acumula redondeos.

### Nada se borra
Baja lógica con `eliminado_en` en todo lo sincronizable. Un registro que desaparece no deja rastro que viajar a una terminal que estuvo desconectada tres días.

### La identidad va en dos capas
La **terminal** se autentica una vez y queda abierta todo el día. El **operador** se identifica con PIN por operación. Resuelve las dos cosas que pidió Lucas sin que se contradigan: cero fricción y atribución real.

### Un punto de venta de ARCA por caja que factura
Los vendedores no facturan, así que alcanza con uno. Conviene dar de alta un segundo de respaldo por si muere la PC de la caja.

### El precio que se cotiza es el de tarjeta
El efectivo se presenta como descuento. Es marketing, pero define qué número lee el vendedor en voz alta: si dice el de contado y la caja cobra más, queda pegado con el cliente adelante.

### Sin internet, la caja es el punto de encuentro *(decidido el 10/09)*
Cuando se corta la conexión, las terminales no se buscan entre todas: **una escucha —la de la caja— y las demás le hablan**. No es una red de pares porque no hace falta que lo sea: el negocio ya tiene un lugar donde todo converge, que es donde la venta se cobra. Cuatro terminales buscándose entre sí serían seis relaciones que mantener y un problema de "quién tiene la verdad" que acá no existe.

Lo que viaja son **las mismas operaciones que van a Supabase, sin traducir**, con el id que generó la terminal. Si una termina llegando dos veces —una por la red del local y otra por internet— la segunda choca contra la clave primaria y se descarta sola. Es la misma propiedad que hace seguro reenviar, usada de nuevo.

**La consecuencia operativa hay que decirla:** la PC de la caja tiene que estar prendida. Ya lo estaba —es donde se cobra—, pero ahora las otras dependen de ella cuando no hay internet.

---

