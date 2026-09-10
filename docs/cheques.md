---
actualizado: 2026-09-10
estado: alcance nuevo — falta la decisión de Lucas
---

# Cheques

> **Confirmado por Francisco el 10/09: Gross recibe cheques y le paga a proveedores con cheque.**
>
> Hasta hoy esto era una sospecha anotada el 09/09 al mirar OBTech. Ahora es un hecho, y **no está en ninguna parte del alcance** — ni en V1-A, ni en V1-B, ni en el backlog. No se postergó: nunca se habló.

---

## Lo que hay hoy: nada

Verificado contra la base. Los medios de pago son cinco:

| | Afecta la caja |
|---|---|
| Efectivo | Sí |
| Tarjeta de débito | No |
| Tarjeta de crédito | No |
| Transferencia | No |
| Cuenta corriente | No |

**No hay cheque**, y la palabra no aparece en ninguna línea de código.

**Qué significa en la práctica:** el 27 de octubre, cuando entre el primer cheque, el cajero va a tener que elegir "Efectivo" o "Transferencia" — y en los dos casos el sistema va a dar por cobrada una plata que todavía no está. Los cheques van a volver al cuaderno.

---

## Por qué un cheque no es un medio de pago más

Un cheque **no es plata que entró**: es una promesa con fecha, que además se puede mover.

- **Tiene fecha de pago propia**, casi siempre posterior. Un cheque a 60 días cobrado hoy no es caja de hoy.
- **Tiene identidad**: número, banco, quién lo libró. Dos cheques del mismo importe no son intercambiables.
- **Tiene estados y se mueve entre ellos**: en cartera → depositado, o endosado a un proveedor, o **rechazado**.
- **Puede rebotar**, y ahí la venta que se había dado por cobrada deja de estarlo.

Por eso no alcanza con agregar una fila a la tabla de medios de pago. Lo que hace falta es saber **qué cheques hay, de quién, por cuánto, para cuándo y dónde están**.

---

## Y esto contesta un pedido de Lucas que quedó abierto en agosto

En el mensaje del **10/08** quedó sin resolver esto:

> *"Lo del «calendario de recibos», cuando lo tengas mirado. Necesito saber si son los vencimientos de las cuentas corrientes, cheques, pagos a proveedores, o todo junto."*

**Nunca lo contestó, y por eso el pedido quedó sin tamaño ni lugar en el plan.** Con lo que sabemos ahora, casi seguro es esto: **qué se cobra y qué se paga en los próximos días** — cheques que vencen, cuentas corrientes por vencer, pagos a proveedores comprometidos.

👉 Conviene volver a preguntarlo con esta información delante, porque ahora la pregunta es mucho más concreta.

---

## Las tres piezas, y cuál duele primero

### A · Recibir un cheque y saber que lo tenés 🔴

Registrar el cobro con cheque y llevar la cartera: número, banco, librador, importe, **fecha de pago**, y en qué estado está.

**Por qué es la urgente:** es lo único que **no tiene reemplazo**. Un pago a proveedor se puede anotar en un papel por unas semanas; una cartera de cheques que vencen en fechas distintas, no — y el que se pasa de fecha es plata que se cobra tarde o no se cobra.

**Tamaño: medio.** Una tabla de valores, el medio de pago nuevo, y una pantalla de cartera con los vencimientos.

> **Un detalle que hay que hacer bien desde el principio:** el cheque **no cuenta como efectivo en la caja**. Ya existe la distinción —`afecta_caja`— así que el arqueo no se rompe. Pero si se cargara como efectivo, la caja cerraría con una diferencia todos los días.

### B · Pagarle al proveedor con cheque 🟠

Dos casos, y los dos existen: **cheque propio** de la chequera, y **cheque de tercero endosado** — uno de los que están en cartera.

**Va pegado a la cuenta corriente de proveedores** ([`plan-compras.md`](plan-compras.md), pieza A): es la misma pantalla de pago. Hacerlas juntas cuesta bastante menos que hacerlas separadas, y hacerlas separadas obliga a tocar dos veces lo mismo.

**Tamaño: chico, si va junto con la cuenta corriente de proveedores.** Mediano, si va después.

### C · El calendario de vencimientos 🟡

La vista que junta todo: qué cheques se cobran esta semana, cuáles se pagan, qué cuentas corrientes vencen.

**Tamaño: chico**, pero **sólo tiene sentido cuando A y B existen** — es una consulta sobre datos que hoy no están.

Es, con mucha probabilidad, el *"calendario de recibos"* que pidió Lucas en agosto.

---

## Lo que propongo

**Antes del 26/10: la pieza A.** Que se pueda cobrar con cheque y que la cartera exista. Es lo único que se pierde sin reemplazo posible.

**Junto con la cuenta corriente de proveedores: la pieza B.** No antes ni después: la misma pantalla.

**Después del corte: la C.** Cuando los datos existan, es una tarde.

> ⚠️ **Y hay que decir el costo, no esconderlo.** Esto es alcance nuevo, no un pendiente conocido, y aparece a seis semanas y media del corte — con V1-A ya cargada con proveedor, aumento masivo de precios, facturas de compra y ahora la cuenta corriente del proveedor.
>
> **Algo va a tener que moverse.** No es una decisión de ingeniería: es de Lucas, y la única forma de tomarla bien es con las dos listas al lado. Lo que no puede pasar es que el 27 de octubre aparezca como sorpresa.

---

## Las preguntas que abre esta respuesta

Una sola respuesta —"sí, usamos cheques"— abre cuatro cosas que cambian el tamaño:

1. **¿Los cheques que reciben, los depositan o se los endosan a los proveedores?** Si sólo depositan, la pieza B es más chica.
2. **¿Emiten cheques propios**, o le pagan a los proveedores sólo con cheques de terceros?
3. **¿Hay cheques diferidos**, o son todos al día?
4. **El "calendario de recibos" de agosto: ¿es esto?**
