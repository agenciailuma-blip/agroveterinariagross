# OBTech / Tauros — lo que ya está resuelto, como piso

**9 de septiembre de 2026.**
**De dónde sale:** las capturas del sistema en uso en Gross (28/08) y del sitio de Tauros (09/09), en [`referencias/obtech-tauros/`](referencias/obtech-tauros/).

---

## La idea de Francisco, y por qué es correcta

> *"Si OBTech ya tiene un sistema que funciona en varios comercios, es porque mucho de todo esto ya está resuelto. Nosotros debemos ponerlo como piso, base de funciones, y sobre eso seguir mejorando."*

**Es el encuadre correcto, y conviene decir por qué** — porque "copiemos al competidor" y esto no son lo mismo.

Un sistema que lleva años facturando en varios comercios **ya pagó el precio de descubrir qué hace falta de verdad**. Cada pantalla que tiene existe porque alguien la pidió trabajando. Eso lo convierte en **la lista de requisitos mejor validada que vamos a conseguir** — mejor que cualquier reunión, porque no es lo que alguien dice que necesita: es lo que terminó usando.

**Pero es un piso, no un plano.** Dos cosas quedan afuera a propósito:

- **Lo que está ahí por historia y no por necesidad.** Un sistema de escritorio de hace años arrastra decisiones de su época. Que exista una pantalla no prueba que se use.
- **Cómo lo resuelve.** Nos importa **qué** problema cubre, no con qué forma. Las tres listas de precios como columnas fijas del artículo, por ejemplo, son una solución de los noventa a un problema real; nuestra respuesta —listas con porcentaje— cubre lo mismo y admite una cuarta sin migrar la tabla.

> **En una línea:** de Tauros tomamos **la lista de lo que hace falta**, no las pantallas. Es cobertura funcional lo que se compara, no diseño.

---

## Qué es Tauros

**Tauros** es la familia de sistemas de **OBTech Sistemas**, en tres versiones:

| | Para quién | |
|---|---|---|
| **Tauros Gestión** | Medianas y grandes empresas | **Es el que usa Gross** |
| **Tauros Pymes** | Kioscos, comercios, bares y restaurantes | POS liviano |
| **Tauros Autorepuestos** | Repuestos y ferreterías | "Próximamente" |

En la barra de menú del sistema en uso se lee: *Archivos · Almacén · Ventas · Imprimir Reparto · Compras · Caja · Listados · Etiquetas · Impuestos · Banco · Parámetros · Herramientas*.

---

## La comparación, módulo por módulo

Lo que Tauros declara, contra lo que tenemos al 09/09.

### ✅ Cubierto — y en varios casos, mejor

| Tauros | Nosotros |
|---|---|
| Facturación electrónica, NC y ND | ✅ CAE real en homologación · **falta la ND** |
| Presupuestos, proformas, remitos, recibos | ✅ Los tres tipos, con numeración propia |
| Clientes, cuentas corrientes, saldos y límites | ✅ Con cobranza integrada a la caja |
| Artículos, listas de precios | ✅ Listas con porcentaje, ABM completo |
| Stock: existencias, movimientos, inventario | ✅ **Movimientos, no saldo** — ver abajo |
| Cajas: aperturas, cierres, movimientos | ✅ Con arqueo |
| Puntos de venta | ✅ Con régimen CAEA |
| Multiusuario con permisos por módulo | ✅ 40 permisos, 4 roles |
| Proveedores | ✅ Ficha mínima + ajuste de precios (09/09) |
| Aumento de precios | ✅ Por proveedor **y por rubro**, con **deshacer** |
| Reportes y listados | 🟡 Faltan las métricas de venta |

**Tres cosas donde estamos por encima, y conviene poder decirlo:**

1. **El stock son movimientos, no un número.** En la captura de Tauros se ve un artículo con `STOCK -5.00`: también admite negativos, así que el criterio es parecido. Pero nosotros guardamos **cada movimiento con su motivo, su responsable y su origen**, lo que permite reconstruir por qué el saldo es el que es. Un saldo suelto no se puede auditar.
2. **Funciona sin internet.** Tauros es de escritorio con servidor en el local —se ve `Caja: servidor2` en la barra— así que si se cae el servidor, se cae todo. Lo nuestro sigue vendiendo y cobrando con la copia local de cada terminal.
3. **Se puede deshacer un ajuste de precios.** No vimos nada equivalente. Es la diferencia entre una función que se usa y una que da miedo usar.

### 🔜 Lo que ellos tienen y nosotros no — la lista de verdad

Ordenado por lo que más se nota.

| Qué | Dónde está en nuestro plan |
|---|---|
| **Depósitos y transferencias entre depósitos** | 🔴 **Lo usan HOY.** Ver abajo — es el hallazgo que cambia una decisión |
| **IVA compras y ventas** | ✅ La exportación de ventas está (09/09). Compras las baja el contador de ARCA |
| **Órdenes de compra y de pago** | V1-B — Compras a proveedores |
| **Cheques** | 🔴 **Confirmado el 10/09: los usan en las dos direcciones.** Alcance nuevo: [`cheques.md`](cheques.md) |
| **Bancos** | ❌ No está en el alcance y nadie lo pidió |
| **Etiquetas** (menú propio en Tauros) | ❌ No previsto. Impresión de etiquetas de góndola con precio |
| **Reparto y hoja de ruta** | 🟡 Tenemos los remitos; la hoja de ruta no. Lucas la mencionó como "optimización con IA", que es otra cosa |
| **Ventas en cuotas / financiación** | ✅ Cuotas con recargo por medio de pago |
| **Cobros con QR de Mercado Pago** | ❌ No previsto. Vale preguntarle a Lucas si lo usan |
| **CRM y seguimiento** | V2 |
| **Multisucursal** | V1-B / V2 — el segundo local abre pronto |
| **Centro de costos** | V2 — aparece como columna en su pantalla de IVA Compras |
| **Órdenes de trabajo · Pedidos internos · Pedidos móviles** | ❌ No previsto. Probablemente de otros rubros |

---

## Los dos hallazgos que cambian algo

### 🔴 1 · Ya usan depósitos, y uno se llama "Fraccionamiento"

En la captura de *Transferencia de mercadería entre depósitos* se ve una transferencia real:

> **Dep. de origen:** `1` — DEPOSITO CENTRAL
> **Dep. de destino:** `5` — FRACCIONAMIENTO

**Esto contradice el supuesto con el que se decidió el punto 3.** El 04/09 los depósitos se mandaron a V1-B *"porque hoy tienen uno solo"*. Tienen **al menos cinco**, y uno de ellos no es un lugar físico: es el **fraccionamiento**, que es donde se abre una bolsa grande para vender suelto.

Eso no es un depósito más. Es **cómo se registra hoy el fraccionamiento**, que en nuestro modelo es un tipo de movimiento (`apertura`) sin destino.

> **Qué hacer:** no cambia que el módulo de depósitos vaya a V1-B. **Sí refuerza, y mucho, la decisión de reservar el concepto ahora** — que ya estaba anotada como pendiente de V1-A. Agregarlo después obliga a tocar cada movimiento histórico, y ahora sabemos que el histórico va a tener al menos cinco depósitos que migrar, no uno.

> ✅ **Reservado y después administrable, los dos el 10/09.** Cada movimiento del libro de stock ya dice en qué depósito ocurrió, y hay una sección en Configuración para darlos de alta, nombrarlos y elegir el principal. El módulo —transferencias y stock separado por depósito— sigue en V1-B. El fraccionamiento **no** se copió como depósito: acá ya es un tipo de movimiento (`apertura`), que es lo que de verdad es.
>
> ⚠️ **Y este hallazgo hay que leerlo con cuidado.** Francisco aclaró el 10/09 que **hoy Gross tiene un solo depósito** y que en breve son dos, cuando abra el segundo local. **Los cinco de OBTech no son referencia**: los números 1 y 5 que se ven en la captura bien pueden ser los que el sistema trae de fábrica, y nadie confirmó que estén en uso. La conclusión de reservar el concepto seguía siendo la correcta —por el segundo local, no por los cinco—, pero **el "ya usan al menos cinco" del título de arriba no está verificado.**

~~⚠️ Y hay que preguntarle a Lucas cuáles son los cinco.~~ → **Contestado el 10/09: no hace falta.** Hoy usan uno, en breve dos, y los cinco de la captura no son referencia. Lo que se carga cuando abra el segundo local es su nombre, en Configuración → Depósitos.

### 🔴 2 · Los cheques no estaban en el alcance, y los usan

Tauros tiene *Banco* como menú propio, y *"Cajas y tesorería: aperturas, cierres, movimientos, bancos y cheques"*.

**En nuestro alcance no aparece en ningún lado** — ni en V1-A, ni en V1-B, ni en el backlog. No es que se haya postergado: **nunca se habló**.

Para una agroveterinaria que vende a productores, los cheques son un medio de pago habitual. Si Gross los recibe, hoy los estaría anotando fuera del sistema.

👉 ~~Pregunta directa para Lucas.~~ → ✅ **Contestado por Francisco el 10/09: sí, reciben cheques y le pagan a proveedores con cheque.**

**Era un agujero real, y quedó confirmado.** El análisis, las tres piezas y lo que propongo están en [`cheques.md`](cheques.md). De paso destraba el *"calendario de recibos"* que Lucas pidió el 10/08 y que quedó sin contestar justamente porque no se sabía si eran cheques.

---

## Lo que la captura de IVA Compras confirmó

La pantalla *"Registración de IVA Compras"* de Tauros tiene exactamente esta forma:

> Tipo de Comprobante · Proveedor + CUIT · Fecha Comp / Fecha de Proceso · Detalle · Actividad · Provincia
> **Grilla:** Centro de Costos · Tipo de Iva · Importe · Neto · Iva · Exento · Perc. IVA · Ing. Brutos · Imp. Int.
> **Totales:** Neto · Iva · Imp. Int. · Exento · Perc. Iva · Ret. Gan. · Ing. Brutos · TOTAL

**No tiene una sola línea de producto.** Es la confirmación directa de lo que se había razonado en [`compras-e-iva.md`](compras-e-iva.md): la factura de compra **para el IVA** es una cabecera más un desglose por alícuota, y **la carga de artículos es otra cosa** —la que en Tauros vive en *Compras → órdenes y recepción*—.

Es exactamente la frase de Lucas del 03/09: *"una cosa es cargar facturas y otra es subir stock"*. Él la dijo mirando esta pantalla.

---

## Cómo se usa este documento

**No es una lista de tareas.** Es la referencia contra la que chequear que no falte nada obvio, y sirve para tres cosas:

1. **Antes de cerrar V1-A**, releer la tabla de "lo que ellos tienen y nosotros no" y confirmar que cada línea está decidida —adentro, afuera o postergada— y no simplemente olvidada.
2. **Cuando Lucas pida algo nuevo**, mirar primero si Tauros ya lo tiene: si lo tiene, probablemente lo está pidiendo porque lo usa todos los días, y eso cambia la prioridad.
3. **El día del corte**, para poder contestar *"¿qué pierdo respecto de lo que tenía?"* sin adivinar. Es la pregunta que Gross va a hacer, y merece una respuesta con nombre y apellido.

⚠️ **Un límite que conviene dejar escrito.** Esto se armó mirando el sitio de Tauros y unas fotos del sistema en uso. **No es un relevamiento**: puede haber pantallas que no vimos y funciones que no usan. Donde diga "no tienen" o "no previsto", lo correcto es preguntarle a Lucas, no darlo por cierto.
