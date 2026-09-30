---
actualizado: 2026-09-30
estado: construido — falta verlo en pantalla y publicarlo
---

# Cheques

> **Construido el 30/09**, con las cuatro respuestas de Lucas. Las tres piezas que se habían planteado el 10/09 —recibir, pagar con cheque y el calendario— entraron juntas: con las respuestas a la vista, B y C eran chicas encima de A.

---

## Lo que contestó Lucas

| Pregunta | Respuesta | Qué cambió |
|---|---|---|
| ¿Los cheques que reciben, los depositan o los endosan? | **Las dos cosas.** Casi siempre se los «hace correr» lo más posible | El endoso a proveedores entra completo, y la cartera se ordena por fecha de pago con el plazo para depositar a la vista |
| ¿Emiten cheques propios? | **Sí, y también pagan con cheques de terceros.** De chequera y cada vez más e-cheq | Cheque propio al pagarle a un proveedor, con la marca de e-cheq |
| ¿Hay diferidos? | **Hay diferidos y al día** | Cada cheque tiene su fecha de pago; el calendario los ubica en su día |
| ¿El «calendario de recibos» de agosto es esto? | **Sí** | Pantalla Calendario, en la sección nueva Tesorería |

---

## Cómo funciona

> **Cómo se lo contás a Lucas:** un cheque entra por la caja o por la cobranza de la cuenta del cliente, y queda en la **cartera**, en Tesorería → Cheques, ordenado por la fecha en que se puede cobrar. Desde ahí se deposita —de a varios—, se le devuelve al cliente, o se marca rechazado. Para **hacerlo correr**, al pagarle a un proveedor se elige «Cheque de la cartera» y se lo endosa. Los **propios** —de chequera o e-cheq— se cargan en el mismo pago, y quedan esperando el débito. El **Calendario** junta todo: qué se cobra y qué se paga cada día.

### Por dónde entra un cheque

- **En la caja**, eligiendo «Cheque» como medio de pago: se escriben banco, número, fecha de pago, librador y, si se sabe, su CUIT. **Funciona sin internet**, como el resto de la caja: los datos viajan con el pago y el cheque entra a la cartera cuando el cobro llega al servidor. Se pueden cargar **varios cheques** para una misma compra.
- **En la cobranza de la cuenta corriente** del cliente, eligiendo «Cheque»: uno o varios, cada uno con su importe. Cada cheque es un renglón de la cuenta —«Cobranza con cheque Macro N° 777 al 15/11»—, así un rechazo después apunta a lo que de verdad no se cobró.
- **Nunca entra al arqueo de la caja.** El medio «Cheque» no afecta la caja y la base no deja configurarlo de otra forma. Al cerrar el turno, la caja muestra **los cheques del turno** para entregarlos con el cierre.

### Por dónde sale

- **Depositado**, desde la cartera, de a varios: fecha y, opcional, en qué cuenta.
- **Endosado a un proveedor**, al registrarle un pago: se elige de la cartera y **se endosa entero**. No se tipea, a propósito: tipear de nuevo un cheque que ya está es cómo termina contado dos veces.
- **Devuelto al cliente**, con motivo. Si con ese cheque pagaba la cuenta, se le puede volver a cargar.
- Si se **anula la venta** que se pagó con un cheque que todavía está en la cartera, el cheque pasa solo a devuelto.

### El rechazo

Un cheque depositado o endosado puede volver rechazado. Se marca con el motivo y, si hubo, los gastos del banco, y **la deuda vuelve a donde corresponde**:

- **Si se le había endosado a un proveedor**, se le vuelve a deber: aparece en su cuenta como «Cheque Macro N° 777 rechazado», vencido desde ese día, y **se paga como una factura**.
- **Si se elige, se le carga al cliente** que lo entregó, con los gastos, en su cuenta corriente y vencido en el día. Si el cliente no tiene cuenta corriente, el reclamo queda anotado en el cheque.
- Un cheque **propio** rechazado vuelve a la cuenta del proveedor igual.

### Los propios

Se cargan al pagarle a un proveedor —«Cheque propio o e-cheq»— con banco, número y fecha de pago. Quedan «por debitar» hasta que se marcan como **debitados**, de a varios. El Calendario los muestra el día que se debitan: **es la plata que tiene que haber en el banco ese día.**

### Corregir y deshacer

- **Los datos se corrigen** (banco, número, fecha, librador) y queda en la historia qué cambió. **El importe no**, porque ya movió cuentas: si está mal, el cheque se devuelve o se anula el pago y se carga de nuevo.
- **Un depósito o un débito marcados por error se deshacen**, con motivo. Lo demás no: movió cuentas.
- **Anular un pago a proveedor** deshace lo que hizo con los cheques: el de la cartera vuelve a la cartera y el propio queda anulado. Si el cheque ya se debitó o volvió rechazado, el pago no se anula: pasó de verdad.

### El plazo

Un cheque se puede depositar **desde su fecha de pago y durante 30 días**; después el banco ya no lo paga. La cartera lo dice en cada cheque, y en ámbar la última semana. Uno que ya pasó los 30 días no se puede cargar en una cobranza.

---

## Lo que no se ve pero define si está bien

- **Un cheque es un registro con historia.** Cada cambio de estado deja un renglón —cuándo, quién, qué—: es lo que contesta «¿dónde está el cheque de Fulano?».
- **El mismo cheque no entra dos veces.** Banco, número e importe iguales, mientras el primero siga circulando, lo frena la base. El número se compara sin los ceros de adelante y el banco sin mayúsculas ni acentos.
- **El calendario no cuenta nada dos veces.** Una factura pagada con un cheque diferido deja de estar pendiente y aparece el cheque, en su fecha. Una cobranza con cheque baja la cuenta del cliente y el cheque aparece en la suya.
- **La caja sin internet** valida el cheque en la máquina —banco, número y fecha— porque después el cliente ya se fue. Una caja con una versión anterior que cobre con cheque igual lo manda a la cartera, marcado **«Completar los datos»**: está en el cajón y tiene que figurar. Sin datos no se puede depositar ni endosar.
- **Permisos nuevos:** *cheques.ver* y *cheques.gestionar*, para Administrador y Encargado. Recibir un cheque no pide permiso nuevo: en la caja es cobrar y en la cuenta es registrar una cobranza. El cajero recibe cheques pero no ve la cartera.

Verificado contra la base real: **62 comprobaciones** en [`supabase/pruebas/cheques.sql`](../supabase/pruebas/cheques.sql), como usuario. Se corrió todo en seco antes de aplicar, porque toca el pago a proveedores y la cobranza, y **apareció un error real**: anular un pago le sacaba el proveedor al cheque antes de devolverlo a la cartera, y la base lo frenaba. Se rompió a propósito de tres maneras —que anular el pago se olvide de los cheques, que el calendario cuente un propio ya debitado, y que no se reconozca el mismo número con ceros adelante— y **las tres fueron atrapadas**.

---

## Lo que queda

- **Verlo en pantalla** con un cheque de punta a punta: caja, cartera, endoso, rechazo.
- **La lista de precio del medio «Cheque»** arranca en la de contado, igual que la transferencia. Si Gross le cobra distinto a un cheque diferido, se cambia en Precios → Medios de pago: es configuración, no desarrollo.
- **La conciliación con el banco** —marcar solo lo que el extracto dice que se acreditó o se debitó— no está: se marca a mano. Tiene sentido cuando haya extractos que leer.
