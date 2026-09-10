---
actualizado: 2026-09-10
estado: propuesta — falta la decisión de Lucas
---

# Plan de Compras

> **Para qué existe:** el 26/10 Gross deja OBTech. De su menú `Compras`, **hoy cubrimos dos entradas de siete**. Este documento parte lo que falta en piezas, les pone tamaño, y dice qué pasa si cada una no entra. La decisión de qué entra es de Lucas; lo que corresponde de nuestro lado es que la tome con los números a la vista y no en noviembre, cuando ya sea tarde.

---

## Lo que hay hoy, y lo que no

| Entrada de OBTech | Qué es | Estado |
|---|---|---|
| Proveedores | La ficha: nombre, CUIT, contacto | ✅ Hecho el 09/09 |
| Registración de Comprobantes de Compras | La factura del proveedor, con su desglose de IVA | ✅ Hecho el 10/09 |
| Consolidación de Saldos | Cuánto se le debe a cada proveedor | ❌ |
| Resumen de Ctas. Ctes. Proveedores | El detalle de esa cuenta | ❌ |
| Órdenes de Pago | Lo que se le paga, y contra qué facturas | ❌ |
| Comprobantes de Retención IIBB | Retenciones | ❌ — y hay que confirmar si las usan |
| Exportar Comprobantes de Retención IIBB | Lo mismo, para el contador | ❌ |

**Y hay una octava cosa que no está en ese menú pero pasa por ahí:** cuando Lucas carga la factura de compra en OBTech, **también le entra la mercadería al stock**. Lo dijo él: *"cuando yo cargo esa factura en proveedor también me da ingreso al stock… entonces yo ya hago lo que es stock"*.

---

## Las cuatro piezas que faltan

### A · La cuenta corriente del proveedor 🔴

**Qué es:** cuánto le debe Gross a cada proveedor, cómo se formó ese saldo, y qué se le fue pagando.

**Por qué es la más urgente:** es lo único de esta lista que **no tiene reemplazo manual razonable**. Un mostrador puede cargar stock a mano por un tiempo; nadie puede llevar de memoria lo que le debe a quince laboratorios. El 27/10 esa información desaparece con OBTech.

**Lo que la abarata:** es **el espejo de la cuenta corriente de clientes, que ya está construida y funciona** — saldo, movimientos, límite, cobranzas. Del otro lado del mostrador es lo mismo: cada factura de compra suma al saldo, cada pago lo baja.

**Tamaño: medio.** No es un módulo nuevo: es el mismo modelo mirado al revés, más una pantalla de pago.

**Qué incluye:**
- El saldo por proveedor, alimentado por las facturas que ya se cargan.
- El pago: contra qué facturas se imputa.
- El resumen de cuenta de un proveedor, que es lo que se mira antes de pagarle.

### B · La entrada de mercadería por la factura 🟠

**Qué es:** que al cargar la factura se puedan cargar también sus líneas, y que eso ingrese el stock y actualice los costos.

**Por qué importa:** es como trabajan hoy. Sin esto, la mercadería entra por **Stock → ajuste**, a mano, producto por producto. Funciona, pero es más lento y desconecta el costo de la factura que lo justifica.

**Lo que lo hace grande** —y por lo que sigue en V1-B— son las decisiones que arrastra, no el código:
- Emparejar el código del proveedor con el nuestro. ¿Qué pasa la primera vez que llega un producto que no está en el catálogo?
- ¿El costo de la factura pisa el costo del producto? ¿Siempre? ¿Y el precio de venta se recalcula solo?
- ¿Qué pasa si la factura trae 14 productos y sólo 12 están en el catálogo?

**Tamaño: grande**, y con decisiones pendientes.

> ⚠️ **Ojo con una condición que puso Lucas y que no hay que perder** (audio 3): tiene que poder hacerse **junto con la factura o por separado**. *"Si la misma persona que carga las facturas del stock es la misma que hace el IVA compras, carga todo de una"*; si son dos personas, cada una usa su parte. Lo que ya construimos respeta eso: la factura se carga sola, y las líneas serían un paso aparte que se puede hacer después y desde otra máquina.

### C · Las retenciones de IIBB ❓

**Qué es:** OBTech tiene dos pantallas para esto y no sabemos si las usan.

**Lo que sí sabemos:** Gross es **agente de percepción** de IIBB en Misiones, régimen 14 — eso ya está construido y es del lado de las ventas. Las pantallas de OBTech dicen **retención**, que es otra cosa y va del lado de las compras.

👉 **Es una pregunta antes que una tarea.** Si no las usan, se cierra en un minuto. Si las usan, hay que ver qué régimen es.

### D · La columna "Centro de Costo" ❓

En la grilla del desglose de IVA de OBTech, la primera columna se llama así. **Es la pregunta que quedó abierta** después de escuchar bien los audios: Lucas llama *"centro de costos"* a toda esa grilla —que es la que ya construimos— pero **la columna** con ese nombre es un dato aparte: a qué área se imputa el gasto.

👉 **Una sola pregunta lo resuelve:** cuando carga esa grilla, ¿elige algo en esa columna o la deja como viene? Si la deja, no hay nada que hacer. Si elige, es un dato por línea, **chico**, con una lista de opciones.

---

## Lo que propongo

**Entra antes del 26/10: la pieza A**, la cuenta corriente del proveedor.

Es la única que desaparece sin reemplazo el día del corte, es la más barata de las que faltan porque ya existe su espejo, y es la que Lucas va a extrañar la primera semana de noviembre — cuando le toque pagarle a un laboratorio y no tenga contra qué.

**Queda para después: la pieza B**, la entrada de mercadería por la factura. No porque no importe, sino porque **tiene un reemplazo que ya funciona** —Stock— y porque las decisiones que arrastra conviene tomarlas sin la fecha encima. Es más caro apurarla mal que hacerla en noviembre.

**C y D son preguntas, no tareas.** Las dos se contestan en la misma reunión.

> **El argumento para Lucas, en una línea:** *"Cargar la factura ya lo tenés. Lo que falta antes del corte es saber cuánto le debés a cada proveedor, porque eso es lo único que el 27 de octubre no vas a poder hacer en ningún lado."*

---

## Lo que NO entra, y conviene decirlo

- **Órdenes de compra.** Están en nuestro alcance de V1-B, pero **no están en el menú de OBTech**: hoy no las usan. No hay nada que reemplazar.
- **Centro de costos como módulo contable** (imputar gastos por área y reportarlos). Eso es V2 y sigue siéndolo, sea cual sea la respuesta de la pieza D.
- **Bancos y cheques.** No está en ningún lado de nuestro alcance y OBTech lo tiene. Es una pregunta abierta desde el 09/09 y **no es parte de Compras**, pero se cruza: si a un proveedor se le paga con cheque, el pago de la pieza A necesita saberlo.

---

## Las preguntas, juntas y cortas

1. ¿Le llevan la cuenta a cada proveedor en OBTech —cuánto le deben— o eso lo miran en otro lado?
2. Las pantallas de **retención de IIBB** de OBTech, ¿las usan?
3. En la grilla del IVA de compras, la columna **Centro de Costo**: ¿elegís algo ahí o la dejás como viene?
4. ¿Reciben **cheques**? ¿Les pagan a proveedores con cheque?

→ Las cuatro caben en cinco minutos de reunión y **las cuatro cambian el tamaño de lo que sigue**.
