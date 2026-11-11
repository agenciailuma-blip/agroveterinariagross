# Audios de Lucas — 10/11/2026

Seis pedidos que llegaron por WhatsApp, revisados contra el código y la base. Los puntos 1, 2, 4 y 5 están hechos (el 1, el 4 y el 5 con el OK de Francisco, el 10/11). El 6 espera el OK al enfoque.

| # | Pedido | Qué hay hoy | Qué propongo | Cuánto lleva |
|---|---|---|---|---|
| 1 | Código que se completa solo | Nada: el campo arranca vacío | Sugerir el mayor + 1, editable | ✅ **Hecho** |
| 2 | WhatsApp del fiado abre una carpeta | Error | ✅ **Corregido y verificado** | — |
| 3 | Sumar una impresora a otra PC | Cada PC elige la suya en Configuración | Instalarla en Windows y elegirla en esa PC | — |
| 4 | Cobro dividido | Ya existe en la caja, pero no se ve | Un botón «Dividir el pago» | ✅ **Hecho** |
| 5 | Condición de venta y web en la factura | No están | Agregarlas en el ticket, el A4 y el PDF | ✅ **Hecho** |
| 6 | Vender y cobrar en la misma PC | Mostrador y caja separados | Botón «Cobrar» en el mostrador | 1 a 2 semanas, según una pregunta |

---

## 1 · Código automático de productos y clientes

**Hoy:** en *Nuevo producto* y *Nuevo cliente* el código arranca vacío (`ProductoEditor.tsx`, `ClienteEditor.tsx`). La base no deja repetirlo: en los dos hay un índice único.

**En la base:** de los 2.281 productos, 2.280 tienen código numérico, y el mayor es el **3667**. De los 2.496 clientes, 2.494 lo tienen numérico, y el mayor es el **4003**. Hay huecos, porque OBTech salteó números.

**Propuesta:** al abrir la ficha nueva, el código viene puesto con **el mayor + 1** (3668, 4004), como sugerencia: se puede borrar o cambiar. No rellena huecos, porque Lucas busca el último, no el que falta. Si dos PC crean a la vez, la segunda recibe el aviso de código repetido, como hoy. Para la suelta, el «-S» sigue igual.

**½ día**, con pruebas.

✅ **Hecho el 10/11.** Dos funciones en la base, [`codigo_siguiente_y_pie_del_comprobante`](../supabase/migrations/20261110120000_codigo_siguiente_y_pie_del_comprobante.sql), ya aplicada. **Visto en pantalla:** *Nuevo producto* trae **3668** y *Nuevo cliente*, **4004**. Se cerraron sin guardar. Sin conexión, el campo queda vacío como antes.

## 2 · El WhatsApp del fiado abría una carpeta — ✅ corregido

**La causa:** el programa le pasaba el enlace a `explorer.exe`, y el Explorador lo toma como una ruta de archivo. Con el mensaje del fiado el enlace mide unos **300 caracteres**, y pasados los 260 el Explorador abre la carpeta *Documentos*. Por eso a Lucas le aparecía «el buscador de archivos». Un WhatsApp sin mensaje andaba, porque es corto.

**Reproducido en esta PC:** con el enlace de 304 caracteres se abrió *Documentos*.

**El arreglo:** el enlace se abre con la función de Windows que usa el navegador predeterminado (`ShellExecuteW`), sin pasar por el Explorador (`app/src-tauri/src/enlaces.rs` y una línea en `Cargo.toml`). Siguen siendo sólo enlaces de wa.me y de Google Maps.

**Verificado:** se llamó a la función real del programa con el mismo enlace de 304 caracteres, en una prueba temporal que después se borró. Abrió Chrome en *Compartir en WhatsApp*, y no se abrió ninguna carpeta. Compila. **Llega al local con la próxima versión.** El botón *Mapa* de Traslados abre por el mismo camino, así que una dirección larga ya no puede fallar.

**Visto de paso, sin tocar:** en *Mayorista → Clientes*, el botón de WhatsApp y el *Cómo llegar* del mapa son enlaces comunes (`target="_blank"`). Dentro del programa de escritorio no hacen nada; en el navegador, sí. Pasarlos a la misma función es un arreglo de 15 minutos.

## 3 · Impresora

**No hay nada atado a una impresora puntual en el código.** Cada PC guarda **el nombre de su impresora** en su terminal, elegido de una lista en *Configuración*. Hoy: *Caja 1* → `POS80 Printer(2)`, *Mostrador 1* → `\\DESKTOP-O4R9STD\POS80 Printer(2)` (la de la caja, compartida). *Caja 2* y *Mostrador 2* no tienen ninguna elegida.

**Lo que preguntó Lucas: sumar una impresora a otra PC** (la segunda caja, o un mostrador; para el sistema es lo mismo, la impresora es de la PC y no del tipo de puesto):
1. Instalarla en Windows **en esa PC** (cable USB y su controlador), como cualquier impresora.
2. Abrir Sistema Gross **en esa misma PC** → *Configuración → Impresora* → elegirla de la lista → *Guardar* → *Imprimir una prueba*.
3. Si otra PC tiene que imprimir en ella, compartirla en Windows y elegirla también en *Configuración* de esa otra PC (aparece con el nombre de la PC dueña adelante).

**Si alguna vez la reemplaza por otra:** lo mismo; si Windows le da otro nombre, la elección vieja deja de andar en todas las PC que la usaban.

4. **Que sea de 80 mm y compatible con Epson (ESC/POS)**, como casi todas las térmicas de comercio. El ticket está armado a 48 caracteres de ancho, el de un rollo de 80 mm. Una de **58 mm** imprimiría cortado.

## 4 · Cobro dividido

**Ya existe, en la caja.** Se elige un medio y se baja el importe; aparece **«Falta cubrir $X»** y debajo **«Completar con:»** con los otros medios. Al tocar uno, se suma con el resto ya puesto. No deja cobrar hasta que cierra la cuenta.

**Pero no se descubre solo:** hay que saber que el importe se puede tocar. Lucas lo pidió en el **mostrador**, debajo de *Asociar productos*, porque ahí arma la venta; hoy el mostrador no cobra (ver el punto 6).

**Propuesta:** en la caja, debajo de los medios, un botón **«Dividir el pago»**. Agrega un segundo renglón vacío y deja el cursor en el importe, y desde ahí sigue todo como hoy. Si se hace el punto 6, el mismo botón aparece en el mostrador al cobrar. **1–2 horas.**

✅ **Hecho el 10/11**, un poco distinto: no agrega un renglón vacío. Lleva el cursor al importe del medio elegido, con el número seleccionado, y dice *«Poné cuánto paga con Efectivo y elegí con qué completa el resto»*. Al bajarlo aparecen *Falta cubrir* y *Completar con:*, como siempre. Sale sólo con un medio puesto y la cuenta cerrada. **Sin ver en pantalla:** probarlo pide una caja abierta y una venta en cola en una terminal, y en la base real eso es abrir una caja de verdad.

## 5 · Factura: condición de venta y página web

**Condición de venta.** Hoy no figura ni en el ticket de 80 mm, ni en la hoja A4, ni en el PDF del mail. La RG 1415 la lista entre los datos del comprobante («contado, cuenta corriente…»). No se le manda a ARCA: va sólo en el papel.

- **De dónde sale:** de cómo se cobró la venta. **«Cuenta corriente»** si algún pago fue a cuenta corriente o fiado; si no, **«Contado»**. Si se pagó una parte de contado y el resto a cuenta: **«Contado / Cuenta corriente»**. Una factura agrupada de *Por facturar* sale según cómo se cobraron sus ventas. Sin pagos conocidos (una nota de crédito suelta), el renglón no sale.
- **Dónde va:** debajo de *Condición de IVA* del cliente, como en el modelo de ARCA. En el ticket, el A4, el PDF y la vista en pantalla, y también en lo emitido sin conexión.

**Página web.** Francisco pidió el texto: *«Compra fácil, rápido y seguro en: www.agroveterinariagross.com.ar»*. Va como **leyenda al pie**, centrada debajo del QR, en dos renglones. Es un dato nuevo en *Configuración → Datos del emisor*, **«Leyenda al pie»**, que Lucas puede cambiar sin pedirlo. Sale en las facturas y notas de crédito; los comprobantes internos y no fiscales siguen sin datos del emisor, como se decidió.

**½ día los dos juntos**, con pruebas.

✅ **Hecho el 10/11**, en el ticket de 80 mm, la vista en pantalla, la hoja A4 y el PDF del mail. Lo emitido sin conexión toma los pagos de la cola mientras no subieron. **Visto en pantalla** con facturas reales: la A 17, cobrada con fiado, dice *Cuenta corriente*; la B 48, efectivo y débito, dice *Contado*. Las dos cierran con la leyenda. **Sin ver en papel.**

## 6 · Vender y cobrar en la misma PC

### Cómo está hoy

- **Mostrador:** arma la venta con el PIN de quien vende y la **manda a la cola de la caja**. No cobra ni factura.
- **Caja:** toma la venta de la cola, la puede corregir, cobra, factura e imprime. Antes hay que **abrirla** con el monto inicial y al final del turno **cerrarla** con el arqueo por medio de pago y la planilla.
- **Una caja abierta por PC.** La base lo exige así: la caja está atada a la terminal, no al usuario. Hay dos cajas dadas de alta (*Caja 1* y *Caja 2*), las dos facturan por el **punto de venta 1**. O sea, **varias PC cobrando a la vez ya funciona**: cada una con su caja y su arqueo.
- **Impresión:** cada PC elige su impresora. El *Mostrador 1* ya imprime en la POS80 de la caja, compartida. **«Imprimir en el mismo lugar que hoy» desde cualquier PC ya se puede.**
- **Sin conexión:** se cobra igual y la factura sale con CAEA por el **punto de venta 9**. Pero abrir y cerrar caja necesitan internet.

### Qué propongo

Un botón **«Cobrar»** en el mostrador, al lado de *Enviar a caja*, para quien tiene permiso de cobrar. Abre, en la misma pantalla, el panel de cobro que hoy tiene la caja: medio de pago, cuotas, dividir, con o sin factura, descuento. Al confirmar, **cobra, factura e imprime en el acto**, en la impresora de esa PC. *Enviar a caja* queda para el vendedor que no cobra y para los presupuestos.

Para Lucas cambia esto: **la caja se abre una vez a la mañana** (o la pide el primer *Cobrar* del día, con el monto inicial ahí mismo) y se cierra a la noche. En el medio, no se entra a la pantalla Caja para nada.

### La pregunta que define el tiempo: ¿cuántos cajones de plata hay?

✅ **Contestado por Francisco el 10/11: hay un solo cajón.** Va la opción **B**. La propuesta para Lucas, en [`propuesta-vender-y-cobrar.md`](propuesta-vender-y-cobrar.md). Lo que implica por dentro:

- **La caja deja de estar atada a la PC.** Hoy la base exige una caja abierta por terminal (`caja_abierta_unica` sobre `terminal_id`). Pasa a ser **una caja abierta por local**, y cada cobro guarda el cajero y la terminal desde la que se hizo (`venta.cajero_id` y `terminal_origen_id` ya existen).
- **Cada PC tiene que saber cuál es la caja abierta**, también sin conexión. Se baja con la sincronización al abrirla. Una PC que no la tiene todavía avisa que la caja no está abierta en vez de cobrar contra nada.
- **El cierre y la planilla juntan los cobros de todas las PC**, con un detalle por cajero y por puesto. Lo de ingresos, egresos, recibos y cheques del turno va a la misma caja.
- **La pantalla Caja** sigue sirviendo para abrir, cerrar, ingresos y egresos, y la cola de lo que se mandó a caja.

- **A · Un cajón por puesto.** Cada PC tiene su plata y rinde su propia caja. **Es lo que el sistema ya hace:** cada puesto se da de alta como caja y cierra su arqueo. El arqueo y la planilla no cambian. **1 semana** (5 días de trabajo + la prueba en el local).
- **B · Un solo cajón para todos.** Varias PC cobran contra la misma plata. Hay que **separar la caja de la PC**: una caja del local que se abre una vez y a la que cobran todas, con un solo arqueo al final que junta lo de todas y dice quién cobró cada cosa. Cambian la apertura, el cierre, la planilla y el cobro sin conexión, porque cada PC tiene que saber cuál es la caja abierta. **2 semanas.**

Si se arranca por A y después se pasa a B, no se tira nada: el botón *Cobrar* es el mismo.

### Qué cambia y qué riesgo tiene

- **El cobro sale de la pantalla Caja a un panel que usan las dos pantallas.** La pantalla Caja tiene unas 1.760 líneas, con la percepción, el recargo de cuotas, el cheque, el fiado, la cuenta corriente con autorización, el CAE y el CAEA. **Es lo más probado del sistema, y ahí está el riesgo:** se mueve, no se reescribe, y las pruebas de hoy tienen que seguir verdes.
- **El PIN:** hoy el mostrador pide PIN por venta (quién vendió) y la caja usa el usuario de la sesión (quién cobró). En una sola pantalla, **quien pone el PIN queda como vendedor y como cajero**. Si Lucas prefiere que cada uno entre con su usuario y no haya PIN, es otra decisión.
- **Permisos:** el vendedor hoy no tiene permiso de cobrar. O se le da, o ve sólo *Enviar a caja*.
- 🔴 **Sin conexión, con varias cajas:** el número de factura con CAEA lo calcula cada PC por su cuenta. **Dos PC facturando por el punto de venta 9 durante el mismo corte darían el mismo número.** Pasa ya hoy si *Caja 1* y *Caja 2* facturan las dos en un corte. Se resuelve con **un punto de venta CAEA por puesto**: es un trámite en ARCA (como el del 9), más una línea en la configuración de cada terminal. Mientras tanto, durante un corte, que factura una sola.

### Tiempo para darle a Lucas

- **Con un cajón por puesto (A): una semana**, más el trámite de los puntos de venta CAEA, que corre en paralelo.
- **Con un solo cajón (B): dos semanas.**
- En los dos casos, **una visita al local** para probarlo con las PC de verdad antes de arrancar.

✅ **Aprobado por Francisco el 11/11 y construido:** una sola caja, todos cobran desde su puesto, el encargado abre y cierra con su PIN, PIN en cada venta y un solo usuario para entrar en el local. El detalle, en la entrada del 11/11 de [`AHORA.md`](AHORA.md).

---

## Borrador para Lucas

> Lucas, ahí revisé todo:
>
> 1. **Códigos:** sí, se puede. Al crear un producto o un cliente ya te aparece el número siguiente puesto, y si querés lo cambiás.
> 2. **WhatsApp en fiados:** era un error, ya está arreglado.
> 3. **Impresora en otra PC:** sí, se puede, sea caja o mostrador. La instalás en Windows en esa PC, después abrís el sistema en esa misma PC, vas a Configuración → Impresora, la elegís de la lista y apretás «Imprimir una prueba». Cada PC tiene su impresora elegida. Que sea térmica de 80 mm, como la que tenés.
> 4. **Cobro dividido:** ya existe en la caja: bajás el monto y te pide completar el resto con otro medio. Igual le puse un botón «Dividir el pago» para que se vea a simple vista.
> 5. **Factura:** ya sale la condición de venta (Contado o Cuenta corriente) y al pie «Compra fácil, rápido y seguro en: www.agroveterinariagross.com.ar». El texto del pie lo podés cambiar vos en Configuración.
>
> Todo eso llega con la próxima actualización.
>
> 6. **Vender y cobrar en la misma PC:** se puede. Cada uno arma la venta y la cobra ahí mismo con un botón «Cobrar», y se imprime en la impresora de siempre, sin pasar por la caja. Una pregunta para calcular bien: ¿la plata va a estar en un solo cajón para todos, o cada puesto va a tener su cajón y rinde su caja? Con un cajón por puesto es más o menos una semana; con un solo cajón para todos, unas dos.
