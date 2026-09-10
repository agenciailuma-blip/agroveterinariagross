# Facturas de compra y Libro de IVA

> # ✅ RESUELTO EL 10/09 — la carga de facturas de compra está hecha
>
> **La decisión la tomó Francisco: sube a V1-A**, y quedó construida el mismo día. Se carga la cabecera —proveedor, tipo, punto de venta y número, fecha, desglose por alícuota y percepciones— sin líneas de producto. Pantalla **Compras**, entre Proveedores y Ventas.
>
> **El motivo que la sube NO es el del análisis de abajo.** Ese decía "el contador la necesita para el IVA", y la corrección del 09/09 ya lo había desmentido: el contador las baja de Mis Comprobantes de ARCA.
>
> El motivo verdadero es del negocio y tiene la misma fecha: **el 26/10 Gross deja OBTech, que es donde hoy carga sus facturas de compra.** Sin esto, desde ese día no hay dónde registrarlas — *"sino queda el hueco el 26"*, en palabras de Francisco.
>
> **La pieza C —recepción de mercadería, líneas, stock y costos— sigue entera en V1-B.**
>
> Lo que sigue pendiente de terceros: las **fotos de cómo cargan las facturas hoy**, para saber si falta algún campo que usan, y **qué columnas quiere el contador** en el Excel de ventas.

**9 de septiembre de 2026.**
**Por qué existe este documento:** porque el pedido estaba en el alcance pero **reducido a dos renglones sin ningún porqué**, y eso lo volvió invisible. Francisco lo notó el 09/09. Este archivo lo desarma y propone qué hacer.

---

> # ⚠️ CORREGIDO EL MISMO DÍA — leer esto antes que el resto
>
> Francisco aclaró cómo funciona de verdad el circuito con el contador, y **cambia la conclusión de todo lo que sigue**. Se deja el análisis original abajo porque el razonamiento sirve; lo que cambia es a qué lleva.
>
> **Lo que aclaró:**
>
> 1. **El Libro de IVA lo arma el contador**, no el sistema. Nosotros no producimos el libro.
> 2. **Las facturas de compra las baja el contador de ARCA** — de *Mis Comprobantes*, donde ya están todas las que le emitieron a Gross.
> 3. **Lo que Gross tiene que entregarle es un Excel con los datos de sus ventas.**
>
> ## Qué cambia
>
> | | Antes se pensaba | Lo que corresponde |
> |---|---|---|
> | **A · Cargar la factura de compra** | Candidata a subir a V1-A porque el contador la necesita para el IVA Compras | ❌ **El contador NO la necesita: la saca de ARCA.** Sale del camino crítico. Su única justificación pasa a ser del negocio —costos y recepción de mercadería— que es la pieza **C**, y **C ya estaba bien ubicada en V1-B** |
> | **B · Libro de IVA** | Producir el libro, Ventas y Compras, quizás en el formato oficial de ARCA | ✅ **Se reduce a UNA exportación de ventas a Excel.** No hay que producir ningún libro ni ningún formato oficial |
> | **La pregunta al contador** | *"¿Formato oficial de ARCA o Excel?"* | ✅ **Ya está contestada: Excel.** Lo que queda por preguntar es mucho más chico: **qué columnas quiere** |
>
> ## La conclusión nueva
>
> **No hay que mover casi nada a V1-A.** Lo único que se suma es **la exportación de ventas para el contador**, que es medio día de trabajo sobre datos que ya se guardan bien desde agosto.
>
> **Y el módulo de compras queda entero en V1-B, como estaba.** El alcance estaba bien; lo que estaba mal era el documento, que no explicaba para quién era cada parte.
>
> 👉 **Lo que se construye ahora (09/09):** proveedor, aumento masivo de precios por proveedor y rubro *(puntos 5 y 4 de Lucas, ya decididos para V1-A)*, y **la exportación de ventas para el contador**.
>
> ⚠️ **Sigue haciendo falta:** que el contador diga **qué columnas quiere en ese Excel**. Se arranca con lo que un libro de IVA Ventas necesita —fecha, tipo, punto de venta y número, cliente con CUIT y condición, neto por alícuota, IVA por alícuota, no gravado, exento, percepciones, total y CAE— más el **rubro de ARCA**, que Lucas pidió el 21/08 para poder separar ventas por actividad. Si quiere otra cosa, se agrega una columna.

---

## Lo que había, y por qué no alcanzaba

En [`alcance-v1.md`](alcance-v1.md), dentro de V1-B, todo esto era:

> **11. Compras a proveedores** → *"Registro de facturas de compra"*
> **12. Libro de IVA** → *"Libro de IVA Ventas · Libro de IVA Compras · Exportación en el formato que requiera el contador"*

Cinco renglones. Correctos, pero sin el **para quién** ni el **para cuándo**, y eso los dejó del mismo tamaño aparente que cualquier otra línea de una lista. En [`pedidos-de-lucas-estado.md`](pedidos-de-lucas-estado.md) se comprimieron todavía más: una fila de tabla que decía *"va a V1-B"*.

**Tres cosas se perdieron por el camino:**

1. **Que esto tiene una fecha externa.** El IVA se presenta todos los meses. No es una funcionalidad que se puede correr sin costo: hay alguien —el contador— con una obligación con vencimiento.
2. **Que Lucas mandó fotos de cómo lo hacen hoy.** No están en el repositorio y no se citan en ningún lado. Son la única referencia concreta de qué espera ver.
3. **Que la pregunta que define la forma sigue sin respuesta.** Está hecha en [`agenda-contador.md`](agenda-contador.md) §5 con prioridad Alta —*"¿formato oficial de ARCA, o una exportación en Excel que usted procesa?"*— pero **nunca se subió a la tabla de pendientes con terceros de ESTADO**, así que dejó de mirarse.

---

## No es una cosa: son tres

El error de fondo fue tratar "compras" como un bloque. Adentro hay tres piezas de **tamaños muy distintos** y **para gente distinta**.

| | Qué | Para quién | Tamaño | Necesita |
|---|---|---|---|---|
| **A** | **Cargar la factura de compra** — proveedor, tipo, punto de venta y número, fecha, neto por alícuota, IVA por alícuota, percepciones, total | El contador | **Chico** | La ficha de proveedor |
| **B** | **Libro de IVA** — Ventas y Compras, exportable | El contador | **Chico** (Ventas) · **Medio** (Compras) | A |
| **C** | **Recepción de mercadería** — las líneas de la factura, el ingreso de stock, los costos por proveedor | El negocio | **Grande** | A, y decisiones que todavía no se tomaron |

**La distinción que hace que esto importe:** el Libro de IVA Compras **no necesita las líneas de la factura**. Necesita la cabecera y el desglose por alícuota. Al contador no le importa que la factura de Bagó traía 14 productos: le importa que trajo $X de neto al 21% y $Y de IVA.

O sea que **A + B se pueden hacer sin C**. Y C es lo que Francisco intuyó como *"más complejo, puede quedar para más adelante"* — es correcto, y por buenas razones: emparejar los códigos del proveedor con los nuestros, decidir qué pasa cuando el costo cambia, qué pasa si la factura trae un producto que no existe. Nada de eso hace falta para el IVA.

> Es la misma frase de Lucas del 03/09, *"una cosa es cargar facturas y otra es subir stock"*, pero llevada hasta el final. Él ya había visto la diferencia; lo que faltaba era usarla para partir el trabajo.

---

## Lo que ya está construido, verificado el 09/09

Esto cambia bastante la cuenta, y no estaba escrito en ningún lado.

### El IVA de Ventas está prácticamente hecho

La tabla `comprobante` ya guarda, por cada comprobante emitido:

`fecha` · `receptor_nombre` · `receptor_tipo_documento_id` · `receptor_documento` · `receptor_condicion_iva_id` · `neto_gravado` · `neto_no_gravado` · `exento` · `iva_total` · `tributos_total` · `total`

Y el desglose fino vive en dos tablas hijas:

- **`comprobante_alicuota`** → `alicuota_iva_id`, `base_imponible`, `importe`. Es exactamente la forma que pide un libro de IVA: cuánto neto y cuánto impuesto por cada alícuota.
- **`comprobante_tributo`** → percepciones y otros tributos, con su base y su importe.

Existe además `rubro_arca` en el producto, que es lo que Lucas pidió el 21/08 para que el contador pueda separar ventas por actividad.

> **Conclusión:** el Libro de IVA **Ventas** no es un módulo, es **una consulta y una exportación** sobre datos que ya se guardan bien. Lo que falta es saber en qué formato quiere recibirlo el contador.

### El IVA de Compras no tiene nada

Verificado contra la base: **no existe la tabla `compra` ni la tabla `proveedor`.** Es la mitad que falta de verdad.

**Pero la forma ya está resuelta**, porque es el espejo de lo de ventas: una cabecera `compra` más una `compra_alicuota` y una `compra_tributo`, con las mismas columnas del lado emisor cambiadas al lado receptor. No hay que inventar un modelo: hay que reflejar uno que ya funciona y que ya pasó por ARCA.

---

## Cómo se engancha con los puntos 4 y 5

Francisco lo señaló y es la observación que cambia la decisión.

**El punto 5 —proveedor en el producto— ya entra en V1-A**, decidido el 04/09, para poder hacer el **punto 4 —aumento de precios por proveedor—**, que es lo que duele todos los días.

Eso significa que **la ficha de proveedor ya está comprometida para antes del 26/10**. Y la ficha de proveedor es justamente lo único que la pieza **A** necesita y no tiene.

> Dicho de otro modo: el costo de A **no es "un módulo de compras"**. Es la cabecera de una factura y su desglose por alícuota, montados sobre un proveedor que igual hay que construir. La parte cara —C— queda afuera y sigue en V1-B, donde estaba.

---

## Lo que propongo

**Mover A y B a V1-A, inmediatamente después de proveedor. Dejar C en V1-B.**

Concretamente:

1. **Proveedor** (ya decidido) — nombre, CUIT, contacto, condición de IVA.
2. **Aumento masivo de precios** por proveedor y por rubro (ya decidido, punto 4).
3. **Factura de compra** — cabecera con proveedor, tipo, punto de venta y número, fecha, y el desglose por alícuota. **Sin líneas de producto.**
4. **Libro de IVA Ventas** — consulta y exportación sobre lo que ya existe.
5. **Libro de IVA Compras** — la misma exportación del otro lado.

**Y queda en V1-B, como estaba:** órdenes de compra, recepción de mercadería con ingreso de stock, costos y márgenes por producto, umbrales por proveedor. Todo el punto C.

### Por qué conviene

- **La mayor parte del costo ya está comprometida.** Proveedor entra igual. Lo que se suma es la cabecera de la factura y dos exportaciones.
- **La mitad de Ventas es casi gratis** y hoy está del otro lado de la línea sin ninguna razón técnica.
- **Es lo único de la lista con una fecha que no manejamos.** El IVA se presenta todos los meses. Todo lo demás de V1-B puede esperar cinco semanas sin que nadie incumpla nada.
- **Es para el contador, que es quien tiene que dar el visto bueno.** Un contador que puede sacar sus libros del sistema nuevo desde el primer mes es el mejor aliado de la migración. Uno que tiene que hacerlos a mano en noviembre es un problema que después vuelve.

### El costo, dicho de frente

⚠️ **Esto es alcance agregado sobre alcance agregado.** V1-A ya absorbió proveedor con el riesgo de fecha asumido por Lucas el 04/09. Sumar A + B lo mueve otro poco.

**No es una decisión de ingeniería, es de negocio, y la tiene que tomar Lucas.** Lo que sí corresponde de nuestro lado es plantearlo con los números arriba de la mesa, en vez de que aparezca en noviembre como una sorpresa.

**El argumento para él, en una línea:** *"Ya vamos a construir el proveedor para poder aumentar precios de una. Con eso puesto, cargar la factura de compra para que el contador tenga el IVA cuesta bastante menos que hacerlo aparte en diciembre — y te evita un mes de libros a mano."*

---

## Lo que hace falta antes de poder estimarlo bien

Dos cosas, y ninguna depende de nosotros.

### 🔴 1 · Las fotos de Lucas

Mandó fotos de **cómo cargan las facturas de compra hoy**. No están en el repositorio y no se citan en ningún documento.

**No son para copiar el modelo** —eso ya lo aclaró Francisco— sino para **saber qué opciones le sirven**: qué campos usa, qué mira cuando la carga, qué le falta del sistema actual. Sin eso, A se diseña adivinando.

👉 **Hay que recuperarlas y guardarlas en el repositorio**, como se hizo con las fotos de las impresoras del 07/09.

### 🔴 2 · La respuesta del contador sobre el formato

La pregunta está hecha desde el principio en [`agenda-contador.md`](agenda-contador.md) §5:

> *"¿Qué información necesita recibir del sistema, en qué formato y con qué periodicidad?"*
> *"¿Prefiere un archivo con el formato oficial de ARCA, o una exportación en Excel que usted procesa?"*

**La respuesta cambia el tamaño del trabajo.** Un Excel con las columnas que él pida es medio día. El **formato oficial del Libro de IVA Digital** de ARCA es un archivo de ancho fijo con un régimen de campos propio, y es varios días más.

👉 **Está anotada con prioridad Alta y se cayó de la tabla de pendientes con terceros de ESTADO.** Vuelve ahí con esta actualización.

---

## Resumen para la próxima reunión

| | |
|---|---|
| **Qué se descubrió** | El pedido estaba en el alcance pero sin desarrollar, y adentro había tres cosas de tamaños muy distintos metidas en una |
| **Qué cambia** | El IVA de **Ventas** ya está construido en un 90%: los datos se guardan bien desde agosto. El de **Compras** necesita tablas, pero son el espejo exacto de las que ya funcionan |
| **La oportunidad** | La ficha de proveedor **ya entra en V1-A**. Con eso puesto, cargar la factura de compra para el IVA es incremental, no un módulo |
| **La decisión de Lucas** | Si A + B suben a V1-A —con lo que eso mueve la fecha— o esperan a V1-B como estaba |
| **Lo que hace falta ya** | Las fotos que mandó, y que el contador conteste en qué formato quiere el libro |
