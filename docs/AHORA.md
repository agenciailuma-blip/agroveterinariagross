---
actualizado: 2026-09-09
estado: en curso
---

# AHORA

> **Empezá por acá.** Una página. Todo lo demás se lee **sólo si hace falta**, siguiendo un enlace.
> Corte comprometido: **26 de octubre de 2026**, el día que Gross deja OBTech.

---

## ⚠️ Lo primero de todo: hay 67 archivos sin commitear

Todo el trabajo del 08 y 09/09 está en el árbol de trabajo y **nada está commiteado**. Son dos días de trabajo: las dos tandas de pedidos de Lucas, proveedores, la exportación para el contador, el arreglo del instalador y la reorganización de los documentos.

👉 **Hacer el commit es lo primero de la próxima sesión**, antes de tocar nada.

---

## Lo último que pasó — 9 de septiembre

**Se publicó la 0.2.2 a Cloudflare**, firmada y con el arreglo del instalador adentro.

### 🔴 Lo que hay que hacer YA, y es una prueba, no código

**Actualizar UNA PC desde el programa y ver si funciona.** No las cuatro: una.

- El arreglo viaja **adentro del instalador 0.2.2**, así que aplica en esta misma actualización.
- Está verificado que **compila** y que queda en el lugar correcto del instalador. **No está verificado que funcione**: para eso hace falta un archivo realmente tomado por el programa.
- Si anda, recién ahí avisarle a Lucas que actualice las demás.

**Qué se arregló y por qué fallaba.** El actualizador cierra la app y después lanza el instalador. Tauri ya tiene un chequeo propio (`CheckIfAppIsRunning`) pero busca el proceso **por nombre**: como la app ya se cerró, no encuentra nada y sigue de largo sin esperar. Mientras tanto los procesos hijos de WebView2 —que se llaman distinto— todavía tienen el `.exe` abierto. El gancho nuevo ([`app/src-tauri/instalador.nsh`](../app/src-tauri/instalador.nsh)) corre **antes** y no pregunta por nombres: intenta abrir el archivo, espera hasta 10 segundos, y si sigue tomado mata lo que quedó.

🟡 **SmartScreen:** es esperable que **no** aparezca actualizando desde el programa —el aviso lo dispara la marca de web que pone el navegador al descargar, y el actualizador no la pone—. No está confirmado. Sacarlo de verdad necesita un certificado de firma de código, que es una compra anual.

## Lo que sigue, en orden

1. 🔴 **Impresión por impresora de Windows.** Lo único que traba el mostrador. Ya no le falta información: las fotos del 07/09 trajeron el nombre (`POS80 Printer`), el controlador (`POS80ENG`) y el formato (**RAW**, que es lo que permite mandarle ESC/POS por la cola de Windows). En las otras PC es `POS80 Printer(2)` en `DESKTOP-O4R9STD`. La pantalla de Configuración **tiene que listar las impresoras instaladas**, no pedir el nombre escrito.
2. 🔴 **CAEA** — falta el trámite, no el código.
3. **Métricas de venta en Inicio** — lo último visible que falta de V1-A.
4. **Reservar el concepto de depósito** en el modelo de stock. ⚠️ Subió de prioridad: el 09/09 se descubrió que **ya usan al menos cinco depósitos** en OBTech, uno de ellos "Fraccionamiento". Ver [`obtech-como-piso.md`](obtech-como-piso.md).
5. **Sincronización por red local** y **cifrado de la base local**.
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
| Las **fotos de cómo cargan facturas de compra** | Lucas | 🟡 Las mandó y no están en el repo |
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

## Cómo arrancar

```bash
npm --prefix "D:/00 ILUMA/Dev Code/Sistema Gross/app" run dev
```

Queda en `http://localhost:5173`.

⚠️ **El conector de Supabase tiene que apuntar a `ywggnhoifhtoncnxrodh`.** Hay tres conectores y **dos apuntan a otro lado**. Verificar **siempre** antes de aplicar una migración.

**Publicar una corrección:** subir la versión en `app/src-tauri/tauri.conf.json` y correr `npm --prefix app run escritorio:publicar` **desde Git Bash**. Sube solo a Cloudflare. **Nunca** subir `dist` a mano: un `dist` de `npm run build` no tiene `actualizaciones/` y deja a las 4 PC sin correcciones, en silencio.

---

## Qué se hizo el 8 y 9 de septiembre

**Tanda 1 — todo lo que se ve (10 puntos).** Scroll que frena, diálogos propios en lugar de los 16 `window.prompt`, umbral de stock en la ficha, descripción, descuento en caja por porcentaje con motivo de lista, cierre del PIN al enviar a caja, nombre para llamar al cliente, cantidad al agregar (configurable), descuento por línea con PIN, y Stock como entrada propia del menú.

**Tanda 2 — remitos y líneas libres (4 puntos).** Remito sin precios, remito de cero, elegir si descuenta stock, y el producto comodín en venta, presupuesto y remito.

**Proveedores y el contador.** Ficha de proveedor, **ajuste** de precios en masa por proveedor y rubro —sube y baja, `7` y `-8`, con deshacer exacto— y la exportación mensual de ventas a Excel.

**Documentación.** Se partió `ESTADO.md` (766 líneas) en `AHORA.md` + cuatro notas, sin perder una línea. Las 40 imágenes se movieron a `referencias/`.

📊 **16 de 24 pedidos de Lucas hechos** · 135 pruebas verdes · 58 migraciones.

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
