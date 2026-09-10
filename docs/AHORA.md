---
actualizado: 2026-09-10
estado: en curso
---

# AHORA

> **Empezá por acá.** Una página. Todo lo demás se lee **sólo si hace falta**, siguiendo un enlace.
> Corte comprometido: **26 de octubre de 2026**, el día que Gross deja OBTech.

---

## Lo primero de todo

🔴 **Probar la impresión en el local, con el papel puesto.** Es lo último que traba el mostrador. Está **publicada en la 0.2.3** desde el 09/09 y probada hasta donde se puede probar sin la impresora delante; la prueba que falta es de dos minutos, con la PC de la caja adelante: Configuración → Impresora del mostrador → elegir de la lista → *Imprimir una prueba*. En **cada** PC, porque cada una elige la suya.

🟡 **El actualizador sigue sin probarse de punta a punta.** La 0.2.2 entró bien, pero desinstalando la versión vieja primero, así que **el arreglo del archivo tomado no se ejercitó**. Hoy no molesta: en el local se desinstala e instala con la máquina delante. Molesta **después del 26/10**, cuando una corrección tenga que llegar a las 4 PC sin viajar a Oberá. Conviene probarlo una vez con la próxima versión, en una sola PC, sin desinstalar nada.

---

## Lo último que pasó — 10 de septiembre

**Se puede cargar la factura de compra.** Decisión de Francisco: sube a V1-A, porque el 26/10 Gross deja OBTech y OBTech es donde carga sus facturas hoy — *"sino queda el hueco el 26"*. Pantalla **Compras**, entre Proveedores y Ventas.

- Se carga lo que dice el papel: proveedor, tipo, punto de venta y número, fecha, **desglose por alícuota de IVA** y percepciones. **Sin líneas de producto:** la recepción de mercadería es la parte grande y sigue en V1-B.
- **El IVA se sugiere solo al escribir el neto, y se puede corregir: manda el papel.** Una factura real trae un peso de diferencia por redondeo, y si el sistema insistiera con su cuenta, el total no cerraría con el del proveedor.
- **El total no se carga: se arma solo** con lo que se fue cargando, para compararlo con el del papel antes de guardar. Es la única comprobación que hace la persona.
- **La misma factura no entra dos veces**, y el aviso dice cuál es.
- La factura entera —cabecera, alícuotas y percepciones— se guarda en una sola transacción: en tres viajes, un corte en el segundo dejaría una factura con cero de IVA, y eso no se ve mirando la lista.

⚠️ **Ojo con el argumento que NO hay que volver a usar:** no es que el contador necesite estas facturas para el IVA. Las baja de Mis Comprobantes de ARCA — se corrigió el 09/09 y está en [`compras-e-iva.md`](compras-e-iva.md). Lo que el contador espera de este sistema es el Excel de ventas.

**Se reservó el concepto de depósito** en el libro de stock. No se ve en ninguna pantalla y no cambia nada de lo que anda: cada movimiento ahora dice **en qué depósito ocurrió**, y si no lo dice, se completa solo con el principal (hoy, "Local"). El módulo de depósitos sigue siendo de V1-B.

> **Por qué ahora:** el libro de movimientos es inmutable y es la verdad del stock. Un movimiento escrito hoy sin depósito es uno al que hay que inventarle uno en diciembre, cuando el histórico no sean 61 filas sino el año entero — y ya sabemos, por las capturas de OBTech, que los depósitos van a ser al menos cinco. Costó una migración; ponerlo después costaba migrar el histórico entero.
>
> Verificado contra la base: las 61 filas quedaron con su depósito, los 28 saldos siguen cuadrando exactamente con el libro, un movimiento nuevo sin depósito recibe el principal, y **el libro sigue siendo inmutable** — se probó que rechaza una edición, que es lo que había que no romper.

**Las métricas de venta en Inicio**, que era lo último visible que le faltaba a V1-A. Al abrir el sistema se ve cuánto se vendió **hoy**, en los **últimos 7 días** y en el **mes**, qué fue **lo más vendido** y **cuánto vendió cada uno**. Antes había que ir a Facturación y sumar a ojo.

Tres cosas que no se ven pero definen si el número está bien:

- **El día es el de Oberá, no el del servidor**, que vive en UTC. Sin eso, todo lo cobrado después de las nueve de la noche aparecería como vendido mañana — el cajero cierra la caja y la última hora ya figura en el total del día siguiente. Verificado contra la base: a las 22:00 del 8, la versión ingenua decía 0 ventas y la buena decía las 2 que había.
- **Sólo cuentan las cobradas**, por el momento en que se cobraron. Un borrador o una venta esperando en la caja todavía no es plata, y una anulada dejó de serlo.
- **Cada uno ve lo suyo.** Quien no tiene permiso para ver todas las ventas recibe únicamente las de él, y entonces el título dice *"Tus ventas"* en vez de *"Ventas del local"*: un número propio presentado como si fuera el del mostrador entero no es un número incompleto, es uno equivocado.

## Lo que pasó el 9 de septiembre

**Se construyó la impresión por impresora de Windows**, que era lo único que trababa el mostrador, y **se publicó en la 0.2.3**. Antes, en el mismo día, salió la 0.2.2 con el arreglo del instalador adentro.

> **Como se lo contás a Lucas:** la impresora se elige de una lista, como cuando imprimís desde el Word, y **cada computadora elige la suya**. El ticket sale por la cola de impresión de Windows y no por la red, porque la POS80 está enchufada por USB a la caja y compartida desde ahí para los mostradores.

El detalle completo —por qué el nombre se guarda por terminal, qué hace el diagnóstico, qué se verificó sin la impresora delante— está en [[Lo construido, en detalle]]. ⚠️ **Falta el papel:** que la POS80 imprima el ticket sólo se puede ver en Oberá.

**Y la 0.2.2, con el arreglo del instalador**: un gancho propio que espera a que el `.exe` se suelte antes de reemplazarlo, porque el chequeo que trae Tauri busca el proceso por nombre y los hijos de WebView2 se llaman distinto. El detalle está en el paso 8 de [`instalacion-en-el-local.md`](instalacion-en-el-local.md). ⚠️ Sin probar de punta a punta — ver *Lo primero de todo*.

🟡 **SmartScreen:** es esperable que **no** aparezca actualizando desde el programa —lo dispara la marca de web que pone el navegador al descargar, y el actualizador no la pone—. Sin confirmar. Sacarlo de verdad necesita un certificado de firma de código, que es una compra anual.

## Lo que sigue, en orden

1. 🔴 **Probar la impresión en el local, con la impresora delante.** El código está publicado en la 0.2.3: lo que falta es el papel.
2. 🔴 **CAEA** — falta el trámite, no el código.
3. **Sincronización por red local** y **cifrado de la base local**.
4. **Devoluciones parciales** — hoy hay que anular la venta entera y rehacerla.
5. **Reportes** — la única pantalla de V1-A que todavía no existe.
6. **Todo con teclado** — lo último antes del 26/10, decidido con Lucas.

## Lo que está bloqueado, y por quién

| Qué | Quién | |
|---|---|---|
| El **Excel con la columna de IVA** por producto | Lucas | 🔴 Lo que más bloquea |
| **Alta del punto de venta CAEA** en ARCA | Lucas (autorizar al contador) | 🔴 |
| **Certificado de producción** de ARCA | Lucas | 🔴 |
| **Dónde se cobra la percepción de IIBB** | Lucas | 🔴 Bloquea el cobro a mayoristas |
| Qué es un **"comprobante de percepción"** | Lucas | 🟡 Sin definir desde el 03/09 |
| **¿Reciben cheques?** | Lucas | 🟡 Nuevo del 09/09 — **no está en el alcance** |
| **¿Cuáles son los cinco depósitos?** | Lucas | 🟡 Nuevo del 09/09 |
| Las **fotos de cómo cargan facturas de compra** | Lucas | 🔴 Subió: la pantalla ya está hecha y sirven para ver si falta algún campo |
| Qué **columnas** quiere el contador en el Excel | Contador | 🟡 Ya se exporta con lo estándar |

→ La lista completa está en [[Pendientes con terceros]].

## Lo que NO hay que tocar

Está andando y verificado. Si algo de acá se rompe, es una regresión:

- **La emisión sin conexión** — probada con internet cortado de verdad el 07/09.
- **La reconciliación de stock del reparto** — `cobrar_venta()` lee el libro de movimientos, no las líneas del remito. Un remito que no descuenta no deja movimiento y la cuenta le da bien sola.
- **La numeración contra ARCA** — se alinea sola después de cada rechazo.
- **`networkMode: 'always'`** en React Query. Sacarlo cuelga el mostrador entero sin conexión.
- **El límite de 12 s** en `supabase.ts`.
- **`aumentar_precios` y `revertir_aumento` son SECURITY DEFINER a propósito.** No agregarles política de insert: el registro que existe para deshacer un error no puede ser editable por fuera del mecanismo que lo deshace.
- **La factura de compra no tiene líneas de producto, y es a propósito.** Agregárselas no es "completar la pantalla": es abrir la recepción de mercadería, que necesita emparejar códigos del proveedor con los nuestros y decidir qué pasa con los costos. Eso es V1-B.
- **El disparador que completa el depósito del movimiento.** Sacarlo obliga a que los dieciséis lugares que escriben en el libro de stock manden el depósito, y el que se olvide no falla al compilar: falla al vender.
- **La impresora se guarda por terminal, no en la configuración del comercio.** Volverla a un solo valor para todo el local deja tres de las cuatro PC imprimiendo a un nombre que en su lista no existe. Y el nombre se elige de la lista de Windows: escribirlo a mano falla en silencio.

## Cómo arrancar

```bash
npm --prefix "D:/00 ILUMA/Dev Code/Sistema Gross/app" run dev
```

Queda en `http://localhost:5173`.

⚠️ **El conector de Supabase tiene que apuntar a `ywggnhoifhtoncnxrodh`.** Hay tres conectores y **dos apuntan a otro lado**. Verificar **siempre** antes de aplicar una migración.

**Publicar una corrección:** subir la versión en `app/src-tauri/tauri.conf.json` y correr `npm --prefix app run escritorio:publicar` **desde Git Bash**. Sube solo a Cloudflare. Ojo: `actualizaciones/latest.json` puede tardar un minuto en cambiar de número —queda un rato cacheado en el borde de Cloudflare—, así que si se mira enseguida todavía dice la versión anterior y no es que falló. **Nunca** subir `dist` a mano: un `dist` de `npm run build` no tiene `actualizaciones/` y deja a las 4 PC sin correcciones, en silencio.

---

## Qué se hizo el 8 y 9 de septiembre

**Tanda 1 — todo lo que se ve (10 puntos).** Scroll que frena, diálogos propios en lugar de los 16 `window.prompt`, umbral de stock en la ficha, descripción, descuento en caja por porcentaje con motivo de lista, cierre del PIN al enviar a caja, nombre para llamar al cliente, cantidad al agregar (configurable), descuento por línea con PIN, y Stock como entrada propia del menú.

**Tanda 2 — remitos y líneas libres (4 puntos).** Remito sin precios, remito de cero, elegir si descuenta stock, y el producto comodín en venta, presupuesto y remito.

**Proveedores y el contador.** Ficha de proveedor, **ajuste** de precios en masa por proveedor y rubro —sube y baja, `7` y `-8`, con deshacer exacto— y la exportación mensual de ventas a Excel.

**La impresión del mostrador, rehecha.** Del camino por red —que no servía en ninguna de las dos cajas— al camino por la cola de Windows, con la impresora elegida de una lista y guardada por terminal. Es el punto 1 de la reunión del 07/09.

**Documentación.** Se partió `ESTADO.md` (766 líneas) en `AHORA.md` + cuatro notas, sin perder una línea. Las 40 imágenes se movieron a `referencias/`.

📊 **16 de 24 pedidos de Lucas hechos** · 162 pruebas verdes en la app y 5 en el programa · 65 migraciones.

---

## El mapa

**Para entender el proyecto**
- [[10 · Las decisiones que no se revisan]] — las ocho de fondo. Cambiar cualquiera obliga a rehacer módulos.
- [`ESTADO.md`](ESTADO.md) — qué es, estado por módulo, convenciones, datos de prueba.
- [`alcance-v1.md`](alcance-v1.md) — qué entra en V1-A y V1-B, y la definición de terminado.

**Para trabajar**
- [[Lo construido, en detalle]] — cada módulo, con qué criterio y cómo se verificó.
- [[Las del trabajo sin conexión]] — las trampas que ya costaron tiempo.
- [`guia-de-pantallas.md`](guia-de-pantallas.md) — el recorrido del menú, para mostrar y explicar.

**Para hablar con el cliente**
- [`pedidos-de-lucas-estado.md`](pedidos-de-lucas-estado.md) — los 24 puntos con su estado. El papel de la próxima reunión.
- [`reunion-lucas-2026-09-07.md`](reunion-lucas-2026-09-07.md) — la visita al local.
- [`obtech-como-piso.md`](obtech-como-piso.md) — qué cubre el sistema que usan hoy y qué nos falta.
- [`compras-e-iva.md`](compras-e-iva.md) — facturas de compra y Libro de IVA.

**Para el local**
- [`instalacion-en-el-local.md`](instalacion-en-el-local.md) — el guion de las 4 PC.
- [[Pendientes con terceros]] — a quién se le debe qué.

---

## Qué hacer con esta nota

**Se actualiza al empezar y al terminar cada sesión**, y se mantiene en una página. Si crece, algo tiene que bajar a una nota propia.

Lo que va acá es **lo que cambia**. Lo que no cambia —las decisiones, cómo funciona un módulo— vive en su nota y se enlaza.
