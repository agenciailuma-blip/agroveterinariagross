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

**La venta llega a la caja sin internet.** Es el punto 2-bis del alcance, entero: la terminal de la caja escucha, los mostradores le entregan lo que no pudieron subir, y el cajero ve la venta como si nada.

> **La decisión de fondo:** las terminales no se buscan entre todas — una escucha, la de la caja, y las demás le hablan. El negocio ya tiene un lugar donde todo converge. Está en [[10 · Las decisiones que no se revisan]] con su porqué.
>
> **Las dos suben lo mismo, y es a propósito:** si la máquina del mostrador no vuelve a encenderse, la venta sube igual desde la caja. La segunda copia choca contra la clave primaria y se descarta sola. **Nadie configura una IP:** la caja publica el nombre de su computadora y las demás la buscan por ahí.
>
> ⚠️ **Falta probarlo con dos máquinas de verdad** — sólo se puede en el local. Y la primera vez, **Windows va a preguntar si permite que el programa se comunique en redes privadas**: hay que decir que sí, una sola vez, en la máquina de la caja.

**Se puede cargar la factura de compra.** Decisión de Francisco: sube a V1-A, porque el 26/10 Gross deja OBTech y OBTech es donde carga sus facturas hoy — *"sino queda el hueco el 26"*. Pantalla **Compras**, entre Proveedores y Ventas.

Se carga lo que dice el papel —proveedor, tipo, número, fecha, desglose por alícuota y percepciones— **sin líneas de producto**: la recepción de mercadería es la parte grande y sigue en V1-B. El IVA se sugiere al escribir el neto y se puede corregir, porque manda el papel; el total se arma solo para compararlo antes de guardar; y la misma factura no entra dos veces. El detalle está en [[Lo construido, en detalle]].

⚠️ **Ojo con el argumento que NO hay que volver a usar:** no es que el contador necesite estas facturas para el IVA. Las baja de Mis Comprobantes de ARCA — se corrigió el 09/09 y está en [`compras-e-iva.md`](compras-e-iva.md). Lo que el contador espera de este sistema es el Excel de ventas.

**Llegaron las fotos de cómo lo hacen hoy**, con tres audios de Lucas. Confirman la partición que hicimos —la factura y la mercadería a veces las carga la misma persona y a veces dos distintas— y de ahí salió que las percepciones se elijan de una lista. **Y abren un hueco nuevo, el de la tabla de abajo: la cuenta corriente de proveedores.**

> ⚠️ **Corregido al volver a escuchar los audios:** acá decía que Lucas "nunca usó el centro de costos". **Mal leído.** En el audio arranca diciendo eso y se corrige enseguida: *"centro de costos"* es como él llama a **la grilla del desglose de IVA**, que sí usa y que es justamente lo que se construyó. Lo que queda sin confirmar es la **columna** con ese nombre. La pregunta exacta está en [`compras-e-iva.md`](compras-e-iva.md).

**Coherencia visual y menú achicable.** Los botones de Productos usaban el gris de Tailwind y el magenta invertido; ahora hay un solo lugar donde están definidos ([`estilos.ts`](../app/src/estilos.ts)) y el gris es el de la identidad de Gross en todo el sistema. Y el menú se puede achicar a sólo íconos, con la decisión guardada **por computadora**: la caja tiene un monitor chico y la oficina no.

**Los depósitos se administran desde Configuración**, y cada movimiento de stock ya guarda en cuál ocurrió.

> **El dato que faltaba:** hoy hay **uno** y en breve son **dos**, porque abre el segundo local. **Los cinco de OBTech no son referencia.** Lo que sigue en V1-B es el módulo —mover mercadería entre depósitos y ver el stock separado—: poder nombrarlos no es lo mismo que poder mover entre ellos.
>
> **El principal no se puede desactivar**, y lo impide la base: sin principal, la próxima venta fallaría con un error que no menciona depósitos por ningún lado.

**Las métricas de venta en Inicio**, que era lo último visible que le faltaba a V1-A. Al abrir el sistema se ve cuánto se vendió **hoy**, en los **últimos 7 días** y en el **mes**, qué fue **lo más vendido** y **cuánto vendió cada uno**. Antes había que ir a Facturación y sumar a ojo.

> Tres cosas que no se ven pero definen si el número está bien: **el día es el de Oberá y no el del servidor** —sin eso, lo cobrado después de las nueve figura como vendido mañana—, **sólo cuentan las cobradas**, y **cada uno ve lo suyo**: quien no puede ver todas las ventas lee *"Tus ventas"* en vez de *"Ventas del local"*.

## Lo que pasó el 9 de septiembre

**Se construyó la impresión por impresora de Windows**, que era lo único que trababa el mostrador, y **se publicó en la 0.2.3**. Antes, en el mismo día, salió la 0.2.2 con el arreglo del instalador adentro.

> **Como se lo contás a Lucas:** la impresora se elige de una lista, como cuando imprimís desde el Word, y **cada computadora elige la suya**. El ticket sale por la cola de impresión de Windows y no por la red, porque la POS80 está enchufada por USB a la caja y compartida desde ahí para los mostradores.

El detalle completo —por qué el nombre se guarda por terminal, qué hace el diagnóstico, qué se verificó sin la impresora delante— está en [[Lo construido, en detalle]]. ⚠️ **Falta el papel:** que la POS80 imprima el ticket sólo se puede ver en Oberá.

**Y la 0.2.2, con el arreglo del instalador**: un gancho propio que espera a que el `.exe` se suelte antes de reemplazarlo, porque el chequeo que trae Tauri busca el proceso por nombre y los hijos de WebView2 se llaman distinto. El detalle está en el paso 8 de [`instalacion-en-el-local.md`](instalacion-en-el-local.md). ⚠️ Sin probar de punta a punta — ver *Lo primero de todo*.

🟡 **SmartScreen:** es esperable que **no** aparezca actualizando desde el programa —lo dispara la marca de web que pone el navegador al descargar, y el actualizador no la pone—. Sin confirmar. Sacarlo de verdad necesita un certificado de firma de código, que es una compra anual.

**Las percepciones de IIBB se exportan para el contador.** Francisco preguntó por las pantallas de *retención* de OBTech: **no son retenciones.** El contador confirmó por escrito que Gross es agente de **percepción** —régimen 14— y no de retención, así que no emite comprobantes de retención; lo que presenta todos los meses es el detalle de lo percibido. Eso ahora sale en un archivo, al lado del de ventas, y el dato ya se guardaba desde agosto.

> 📋 **Para la reunión hay un plan aparte de toda la sección Compras**, con lo que falta, cuánto cuesta cada pieza y qué pasa si no entra: [`plan-compras.md`](plan-compras.md).

## Lo que sigue, en orden

1. 🔴 **Probar la impresión en el local, con la impresora delante.** El código está publicado en la 0.2.3: lo que falta es el papel.
2. 🔴 **CAEA** — falta el trámite, no el código.
3. **Cifrado de la base local.**
4. **Devoluciones parciales** — hoy hay que anular la venta entera y rehacerla.
5. **Reportes** — la única pantalla de V1-A que todavía no existe.
6. **Todo con teclado y la versión móvil** — lo último antes del 26/10, decidido con Lucas. En el celular el menú va a ser una hamburguesa; el achicado de ahora es para tablet.

## Lo que está bloqueado, y por quién

| Qué | Quién | |
|---|---|---|
| El **Excel con la columna de IVA** por producto | Lucas | 🔴 Lo que más bloquea |
| **Alta del punto de venta CAEA** en ARCA | Lucas (autorizar al contador) | 🔴 |
| **Certificado de producción** de ARCA | Lucas | 🔴 |
| **Dónde se cobra la percepción de IIBB** | Lucas | 🔴 Bloquea el cobro a mayoristas |
| Qué es un **"comprobante de percepción"** | Lucas | 🟡 Sin definir desde el 03/09 |
| ~~¿Reciben cheques?~~ | — | ✅ **Contestado el 10/09: sí, y también le pagan a proveedores con cheque.** Es alcance nuevo y no está en ningún lado: [`cheques.md`](cheques.md) |
| **¿Cómo se llama el segundo local?** | Lucas | 🟢 Se carga en Configuración → Depósitos cuando abra. Los cinco de OBTech quedaron descartados como referencia |
| ~~Las **fotos de cómo cargan facturas de compra**~~ | Lucas | ✅ Llegaron el 10/09, con tres audios. Análisis en [`compras-e-iva.md`](compras-e-iva.md) |
| **¿La cuenta corriente de proveedores entra al alcance?** | Lucas | 🔴 Hay plan con tamaños: [`plan-compras.md`](plan-compras.md). Son cuatro preguntas de cinco minutos |
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

📊 **16 de 24 pedidos de Lucas hechos** · 173 pruebas verdes en la app y 9 en el programa · 68 migraciones.

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
