# Reunión en el local — 7 de septiembre de 2026

**Quiénes:** Francisco (ILUMA) y Lucas (Gross), en el local de Oberá.
**Para qué sirve este documento:** que no se pierda nada de lo que salió de esa visita, y que quede escrito qué se decidió hacer con cada cosa.

> ⚠️ **La lectura incómoda de la reunión, y hay que anotarla.** Francisco fue con el documento de las 24 sugerencias del 03/09 en la mano y tuvo que ir diciendo *"esto no, esto tampoco"* sobre la tanda de comodidad (bloque C), que no se había hecho. El trabajo de agosto y principios de septiembre fue casi todo invisible —emisión sin conexión, reconciliación de stock del reparto, contingencia CAEA, bugs que habrían roto la instalación—. Es trabajo real y necesario, pero no se muestra en una pantalla.
>
> **Consecuencia práctica, no emocional:** de acá al 26/10, cuando dos tareas valen parecido, va primero la que se ve. El bloque C y lo que salió de esta reunión pasan al frente de la fila.

---

## 1. Las impresoras — el dato que faltaba, ya está

Francisco sacó fotos de la configuración de impresión en cada PC. **Esto desbloquea la impresión por impresora de Windows**, que era lo único que trababa el mostrador.

| Qué | Valor |
|---|---|
| Nombre en la PC de caja | **`POS80 Printer`** |
| Nombre en las otras PC | **`POS80 Printer(2)` en `DESKTOP-O4R9STD`** — impresora compartida de Windows |
| Controlador | **`POS80ENG`**, tipo 3 (modo usuario) |
| Puerto | **USB** (`USB00x`) en la caja |
| Formato de datos | **RAW** ← esto es lo que importa |
| Papel | 80 mm (72 mm imprimibles), 203 ppp |
| Corte | Half Cut After Job, configurado en el controlador |

**Lo que confirma este relevamiento:**

- **No es un controlador fiscal ni un driver de Hasar.** Es el controlador genérico POS80, el que usa cualquier impresora térmica de 80 mm. **ESC/POS es el protocolo correcto** y todo lo construido en [`escpos.ts`](../app/src/lib/comprobante/escpos.ts) sirve tal cual.
- **El puerto es USB, no una IP.** Confirma lo que se sospechaba: el camino de red TCP contra `IP:9100` que hoy tiene el sistema **no sirve en ninguna de las dos cajas**. Hay que mandar los bytes a una impresora instalada de Windows, por nombre.
- **El formato RAW es la pieza clave.** Significa que Windows le pasa a la impresora exactamente los bytes que se le den, sin traducirlos. Es lo que permite mandarle ESC/POS a través de la cola de impresión de Windows en vez de por red.
- **La compartida resuelve las otras PC con el mismo camino.** `POS80 Printer(2) en DESKTOP-O4R9STD` es una impresora más de la lista de Windows: el programa no necesita saber que es de otra máquina.

> **Decisión de diseño que sale de acá:** la pantalla de Configuración no debe pedir el nombre escrito a mano. Tiene que **listar las impresoras instaladas** y que la persona elija de un desplegable. Los nombres cambian —`(2)`, `(Copia 1)`, el nombre del equipo— y un nombre mal tipeado falla en silencio.

⚠️ **Sigue sin verificarse con la impresora delante.** Lo que hay son los datos para construirlo bien; la prueba real es en el local.

---

## 2. La PC con Windows 7 — el error, para el archivo

El instalador falla, como estaba previsto. El mensaje exacto, para que quede escrito:

```
Instalación Anulada — La instalación no se completó correctamente.
No se ha podido instalar WebView2. Intente reiniciar el instalador.
Error: La instalación de WebView2 falló con el código -2147024769.
```

`-2147024769` es `0x8007007F` — *"no se encontró el procedimiento especificado"*. Es Microsoft: **WebView2 dejó de soportar Windows 7 en 2023** y el instalador de WebView2 usa funciones del sistema que esa versión no tiene. **No hay versión nuestra que lo arregle.**

**Qué se hace:** esa PC —la de ventas 01— **usa la versión web**, y Francisco confirmó en el local que funciona mejor así. Es un puesto de mostrador: no imprime tickets ni participa de la sincronización por red local, así que no pierde nada de lo que necesita. Lo único degradado es cosmético (los `color-mix()` de Tailwind 4 no existen en Chrome 109).

**Gross decidió no actualizar esa máquina.** Avisado y anotado.

---

## 3. Lo que Lucas pidió el 07/09

### 3.1 · Cosas rotas o que faltan y él vio

| | Qué | Tamaño |
|---|---|---|
| a | **El scroll no frena en el tope**: al llegar al final de una sección sigue tirando y deja un fondo gris. Pasa dentro del programa instalado | Chico |
| b | **El umbral de stock no aparece** en los detalles del producto. Lucas lo pidió en la sugerencia 7, está construido en la base desde hace rato, y no se lo pudo mostrar porque no hay pantalla | Chico |
| c | El aviso dice **"tauri localhost dice"**. No es estético ni claro | Chico, pero está en 16 lugares |

> **Sobre (b), que es el que más duele.** El umbral existe: tabla `umbral_stock`, con dos niveles —bajo y crítico— y se puede definir por producto o por categoría entera. La lista de productos ya muestra los estados *En stock / Stock bajo / Crítico / Sobrevendido* calculados con eso. Lo único que falta es **dónde configurarlo**. Es el ejemplo más claro de trabajo hecho que no se puede mostrar.

> **Sobre (c).** `window.prompt` y `window.confirm` son diálogos del navegador. Dentro de Tauri, el navegador se llama "tauri localhost", así que el cartel se presenta solo con ese nombre. No se puede cambiar el título: hay que reemplazar los diálogos por unos propios. Sale una vez y arregla los 16.

### 3.2 · El descuento en la caja

Hoy la caja pide un total nuevo escrito a mano y un motivo libre. Lucas pidió:

- **Descuento por porcentaje**, no sólo llevando el total a un número.
- **Motivo por desplegable**, no escrito. Los de arranque: *descuento por cantidad*, *vencimiento próximo*, *bonificación especial*. Se pueden sumar después.

> **Por qué el desplegable importa más de lo que parece:** un motivo escrito a mano no se puede contar. Con lista cerrada, en tres meses se puede responder "cuánto se bonificó por vencimiento próximo", que es una pregunta de negocio real.

La base no cambia: `ajustar_total_venta()` ya recibe un total y un motivo. El porcentaje es una cuenta de la pantalla.

### 3.3 · El PIN y el nombre del cliente al enviar a caja

Dos de la tanda de comodidad, confirmadas otra vez porque Lucas las volvió a pedir viéndolo funcionar:

- **Al enviar la venta a caja tiene que cerrarse la sesión del operador.** Cada vendedor vuelve a poner su PIN. Es lo que hace que "quién vendió qué" signifique algo. (Sugerencia 21.)
- **Tiene que pedir un nombre para llamar al cliente.** Hoy la cola de la caja muestra `CAJA1-000011 · Consumidor Final`. Con un nombre, el cajero llama a la persona en vez de cantar un número. (Sugerencia 15.)

### 3.4 · Remitos — la lógica está bien, faltan tres cosas

Lucas revisó el circuito y dijo que **la lógica viene bien**. Los comentarios:

| | Qué pidió | Por qué |
|---|---|---|
| a | **En el remito no va precio, sólo cantidad** | El remito acompaña a la factura, o la factura sale después si es cuenta corriente. El precio va en la factura, no en el remito |
| b | **Crear un remito de cero**, desde la página de Remitos | Hoy el remito sólo nace de una venta existente |
| c | **Que se pueda elegir si descuenta stock o no** | Ver abajo |

**El caso que explica (c), y que es el que importa.** Gross emite remitos para la municipalidad —y para clientes por pedido— **de mercadería que todavía no entró al local**. Se pide especialmente para ese cliente y se documenta antes de tenerla. Un remito así **no puede descontar stock**: descontaría algo que no está.

> **Esto no contradice la regla que ya está construida** (*el stock sigue al hecho físico y sale una sola vez*). La refina: hay remitos que documentan un compromiso, no una salida. La marca va en el remito, y la reconciliación de `cobrar_venta()` sigue funcionando igual porque lee el libro de movimientos — un remito que no descontó, simplemente no dejó movimiento.

**El remito de cero es como una venta**, con la opción de descontar stock o no.

### 3.5 · Producto comodín — líneas sin producto en la base

El pedido más grande de la reunión, y el mejor pensado:

> Poder **agregar una línea escribiéndola**, sin que exista el producto en la base y **sin crearlo**. En venta, remito y presupuesto.

**Para qué le sirve:**

- Productos que **todavía no se pidieron**, muy particulares, que se venden sólo por pedido a ciertos clientes.
- **Facturar cosas que no llegaron al local todavía.**
- Evita ensuciar el catálogo con productos de una sola vez.

**La buena noticia: el esquema ya lo permite.** `venta_linea.producto_id` y `comprobante_no_fiscal_linea.producto_id` son **anulables** desde el principio, y `codigo_producto` y `descripcion` son fotos de texto. Además, toda la maquinaria de stock ya filtra `producto_id is not null`, así que una línea libre **no mueve stock sola** — que es exactamente lo que corresponde.

> Lo que falta es la pantalla y que el camino de creación de la venta acepte la línea sin producto. No es alcance nuevo estructural: es usar una puerta que ya estaba abierta.

⚠️ **El límite a escribir una vez:** una línea libre **no reemplaza al catálogo**. No mueve stock, no participa del inventario y no tiene costo. Si un producto se vende dos veces, va al catálogo. La línea libre es para lo que pasa una vez.

### 3.6 · Sin internet, la factura queda pendiente — funciona

Francisco probó facturar sin conexión y sacó la foto del aviso:

> *"Venta CAJA1-000015 cobrada, pero la factura quedó pendiente: la venta quedó guardada en esta computadora y se va a facturar sola cuando vuelva la conexión."*

**Es el comportamiento correcto y el mensaje dice lo que hay que decir.** Queda anotado como verificado en el local, no sólo en pruebas.

🟡 Detalle menor: el enlace *"Ir a Facturación para reintentar"* aparece también sin conexión, donde reintentar no puede funcionar. Conviene que sin conexión no invite a reintentar.

---

## 4. Qué se hace, y en qué orden

El criterio es el de arriba: **primero lo que se ve.**

### Tanda 1 · Todo lo que se ve — ✅ HECHA el 08/09

Junta lo que quedó pendiente del bloque C con lo que salió de esta reunión. Se hizo y se muestra como una sola cosa.

| | Qué | De dónde viene | |
|---|---|---|---|
| 1 | El scroll frena en el tope | 07/09 (a) | ✅ |
| 2 | Diálogos propios en vez de los del navegador | 07/09 (c) | ✅ |
| 3 | Umbral de stock —bajo y crítico— en el editor de producto | Sugerencia 7 · 07/09 (b) | ✅ |
| 4 | Descripción del producto en el editor | Sugerencia 22 | ✅ |
| 5 | Descuento en la caja: por porcentaje o por monto, con motivo de una lista | 07/09 | ✅ |
| 6 | Cerrar la sesión del operador al enviar a caja | Sugerencia 21 | ✅ |
| 7 | Nombre para llamar al cliente, y que se vea en la cola de la caja | Sugerencia 15 | ✅ |
| 8 | Pedir la cantidad al agregar un producto | Sugerencia 18 | ✅ |
| 9 | Columna de descuento en % por línea, con PIN | Sugerencia 19 | ✅ |
| 10 | Stock como entrada propia del menú | Sugerencia 2 | ✅ |

**Lo que hay que saber de cómo quedó cada una:**

**1 · El scroll.** Era el rebote elástico de Chromium. `overscroll-behavior: none` en la página y `contain` en cada lista que scrollea por dentro, más el color del papel declarado en la ventana de Tauri (`backgroundColor`) para que, si algo llega a asomar, asome del color correcto y no gris.

**2 · Los diálogos.** Eran **dieciséis** `window.prompt` y `window.confirm` repartidos por el sistema, no sólo el de la caja. Se reemplazaron todos por un diálogo propio ([`Dialogo.tsx`](../app/src/components/Dialogo.tsx)). Además de sacar el "tauri localhost dice", eso permite tres cosas que el diálogo del navegador no puede: validar mientras se escribe, ofrecer una lista en vez de un campo libre, y no congelar la aplicación mientras está abierto.

**3 · El umbral.** Sección *"Avisarme cuando queden pocos"* adentro de Stock, en la ficha del producto. Muestra el que rige aunque no tenga uno propio —heredado de la categoría o el general— porque un campo vacío haría creer que no hay ninguno. La casilla lo convierte en propio; apagarla lo borra y vuelve a heredar, que es la única forma de deshacer uno puesto por error.
> ⚠️ **Un error que se encontró antes de que llegara al local.** El guardado se había escrito con `upsert` sobre `producto_id`, que es lo natural. **No funciona**: la unicidad la da un índice *parcial* y PostgREST no emite el predicado que Postgres necesita para inferirlo. Se probó contra la base y contestó *"there is no unique or exclusion constraint matching the ON CONFLICT specification"*. Habría fallado al guardar el primer producto con umbral. Se resolvió con `definir_umbral_producto()`, verificada con cinco casos contra la base real.

**5 · El descuento de la caja.** Panel propio con dos formas de decir lo mismo —un porcentaje, o dejar el total en un número— y el resultado a la vista mientras se decide: cuánto queda y cuánto se está regalando. El porcentaje sin el peso al lado no dice nada: 8% puede ser cuatrocientos pesos o cuarenta mil. El motivo sale de una lista ([`motivos.ts`](../app/src/lib/motivos.ts)) con los tres que pidió Lucas, más *Redondeo al cliente*, más la opción de escribir uno.

**6 · El PIN al enviar a caja.** Se cierra la sesión del operador **después** de que la venta salió, no al apretar el botón: si se cerrara antes, un error de la base dejaría la venta sin enviar y al vendedor afuera.

**7 · El nombre para llamar.** Columna propia `venta.nombre_para_llamar`, no `observaciones`. Son dos cosas distintas: `observaciones` se anota sobre la venta y viaja al comprobante; esto es cómo se llama a una persona en voz alta durante los diez minutos que espera, y deja de importar apenas se cobra. En la cola de la caja va primero y en negrita, con el cliente de la ficha debajo y chico — porque en el mostrador ese renglón dice casi siempre "Consumidor Final" y no sirve para llamar a nadie. Se puede dejar vacío y la venta sale igual; Cancelar vuelve a la venta.

**8 · La cantidad al agregar.** Es una **configuración**, no una decisión fija: cambia el ritmo de la venta entera y cuál conviene depende de qué se vende. Cinco bolsas de alimento agradecen la pregunta; doce collares distintos la sufren. Arranca encendida porque es lo que pidió Lucas, y se apaga desde **Configuración → Ritmo del mostrador** sin llamarnos. Era además la única sugerencia donde el propio documento decía *"conviene probarlo con un vendedor antes de dejarlo fijo"*.

**9 · El descuento por línea y su PIN.** Botón `%` al lado del precio. Pide el porcentaje, el motivo de la lista, y después **el PIN que lo autoriza** — y la rebaja se aplica recién cuando alguien se identifica. Al revés (aplicar y después pedir el PIN) la rebaja quedaría hecha si la persona cierra el cartel, que es justo lo que el PIN existe para impedir. Quien pone el PIN queda como responsable de la rebaja, **que puede no ser el vendedor**: eso es lo que permite que un encargado se acerque al mostrador y autorice. Se reusa la misma pantalla de PIN del mostrador, así la verificación —servidor con conexión, verificador local sin ella— vive en un solo lugar.

**10 · Stock en el menú.** Pantalla nueva, entre Productos e Inventario. **No es el catálogo con otra columna**: arranca filtrada en lo que está por debajo del umbral y ordenada por urgencia, porque la pregunta que contesta es *qué hay que pedir*. Cuatro números arriba para leer de un vistazo, y un botón que copia la lista en texto para pegarla en un WhatsApp al proveedor — hoy eso se escribe en un papel. Usa `vista_stock`, la misma que pinta los estados en el catálogo: dos fuentes para el mismo semáforo terminarían dando dos respuestas.

**Verificado:** el sistema compila sin errores de tipos, las **131 pruebas automáticas** pasan, y la página carga sin un solo error de consola. La `definir_umbral_producto()` se probó contra la base real con cinco casos (define, redefine sin duplicar, la vista lo toma, rechaza crítico > bajo, y borra), sin dejar filas.
⚠️ **Falta recorrerlo con sesión iniciada**, que es donde vive casi todo esto.

### Tanda 2 · Remitos y líneas libres — ✅ HECHA el 09/09

| | Qué | De dónde viene | |
|---|---|---|---|
| 11 | El remito imprime sin precios | 07/09 (a) | ✅ |
| 12 | Remito de cero desde la página de Remitos | 07/09 (b) | ✅ |
| 13 | Elegir si el remito descuenta stock | 07/09 (c) | ✅ |
| 14 | Línea libre —producto comodín— en venta, remito y presupuesto | 07/09 | ✅ |

**11 · Sin precios.** Vale para los tres formatos —rollo de 80 mm, hoja A4 y los bytes que salen por la impresora—, con la condición escrita igual en los tres. Los precios **se siguen guardando** en la base: son lo que permite valorizar lo que salió sin cobrarse, que es de lo que vive el panel de *"entregado y sin cobrar"*. Lo que no se hace es imprimirlos.
> El remito cierra ahora con **TOTAL DE UNIDADES** en vez de un total en pesos. Sin ningún número, el papel no tendría con qué verificarse al recibir; los bultos son justamente lo que se cuenta en la puerta.
> De paso salió el total en pesos del listado de Remitos, que invitaba a leerlo como si el papel lo dijera. En su lugar hay una columna **Stock** que dice si ese remito descontó o no.

**12 y 13 · El remito de cero, y la marca de stock.** Van juntos porque **el caso que motiva uno es el que necesita el otro**: el remito para la municipalidad es de mercadería que todavía no entró al local, así que no puede salir de una venta (no la hay) ni descontar stock (no está).

> **La regla vieja no se contradice, se afina.** Seguía siendo *"el stock sigue al hecho físico y sale una sola vez"*. Lo que se agrega es que **hay remitos que documentan una salida y hay remitos que documentan un compromiso**, y la marca dice cuál es cuál.

**La propiedad que hizo seguro tocar esto:** la reconciliación de `cobrar_venta()` lee el **libro de movimientos**, no las líneas del remito. Un remito que no descuenta simplemente no deja movimiento, y la cuenta le da bien **sin saber que esta marca existe**. Lo mismo la anulación.

**Y la marca sólo puede apagar, nunca encender.** En true sigue rigiendo la regla de siempre —descuenta sólo si la venta no lo hizo ya—. Si pudiera encender, alguien podría descontar dos veces la misma mercadería marcando una casilla, que es exactamente el error que la migración del 04/09 existe para hacer imposible.

**14 · La línea libre.** Lo mejor de la reunión, y **el esquema ya lo permitía**: `venta_linea.producto_id` y `comprobante_no_fiscal_linea.producto_id` son anulables desde el principio, y toda la maquinaria de stock ya filtra `producto_id is not null`. No hubo que cambiar el modelo — había que usar una puerta que ya estaba abierta.

Se escribe desde el botón **Escribir**, al lado del buscador del mostrador (ahí y no escondida en un menú: el momento en que hace falta es justo cuando el buscador no encontró nada), y desde el remito de cero.

> **Se le pregunta el IVA, y es lo único no obvio del formulario.** Esa línea puede terminar en una factura, y en una agroveterinaria conviven el 21% y el 10,5% todo el tiempo. Dejarla fija en 21 sería facturar mal la mitad de las veces, en silencio.

⚠️ **El límite, escrito una vez:** una línea libre **no reemplaza al catálogo**. No mueve stock, no entra al inventario y no tiene costo, así que no aparece en ningún margen. Es para lo que pasa una vez. Si algo se vende dos veces, va al catálogo.

🟡 **Lo que quedó afuera a propósito:** desde la **caja** no se puede *agregar* una línea libre a una venta que ya llegó (sí se la puede editar en cantidad o quitarla, eso ya funciona). Se puede sumar después; se dejó afuera para no construir una pantalla más sin haber visto si hace falta.

#### Verificado contra la base real, en transacciones que se revierten

| Qué | Resultado |
|---|---|
| Remito de cero que descuenta | −5 |
| Anularlo devuelve la mercadería | neto 0 |
| Remito de cero que **no** descuenta | delta 0, **cero movimientos** |
| Línea libre en un remito | código `LIBRE`, total correcto, **cero movimientos** |
| Línea sin producto y sin descripción | rechazada por la base |
| Un presupuesto pidiendo no descontar | rechazado — sólo el remito mueve stock |
| Reintentar la misma emisión con el mismo id | descuenta **una** vez, no dos |
| Venta de 4 con remito de 3 que descuenta, después cobrada | −3 y después −4 |
| Venta de 2 con remito que **no** descuenta, después cobrada | 0 y después −2 ← **el caso nuevo** |

**Y el que más importaba, porque toca una factura:** una venta con un producto del catálogo **más** una línea libre al 10,5%. El comprobante cerró con **neto + IVA = total de la venta**, exacto, y se registró **un solo** movimiento de stock —el del producto—. Si `vista_venta_iva` hubiera dejado afuera la línea libre, la factura habría salido por menos de lo cobrado.

#### Verificado también desde la pantalla

Se emitió un remito real desde la interfaz: cliente *Veterinaria del Alto*, una línea escrita a mano (*"Comedero de acero inoxidable 40 cm — pedido municipalidad"*, 12 unidades), con la casilla de stock apagada. En la base quedó con `venta_id` nulo, `descuenta_stock = false` y **cero movimientos de stock**; y el papel salió **sin un solo precio**, con *TOTAL DE UNIDADES: 12*. Sirve para mostrarle el circuito a Lucas.

Y la **línea libre en el punto de venta**, recorrida con el PIN puesto: se escribió *"Balanza colgante 300 kg — pedido especial"*, 2 unidades a $185.000 con IVA 10,5%, y el resumen del cartel calculó $370.000 antes de agregarla. La venta salió a la caja con el nombre *"Marta · la de la balanza"* y **el PIN se cerró solo** al enviarla, como pide la sugerencia 21. En la base quedó `MOS1-000008` con la línea en `producto_id` nulo, código `LIBRE`, alícuota 10,5% y **cero movimientos de stock**.

**Pruebas automáticas: 135**, cuatro nuevas. Las dos que importan se verificaron **rompiendo el código a propósito**: sacar el filtro de `producto_id` en el cobro sin conexión hace fallar el cobro entero en el mostrador (detectado), y hacer que el remito imprima precios rompe la prueba del papel (detectado).

### Tanda 3 · Impresión por impresora de Windows

Desbloqueada por las fotos. Es lo único que traba el mostrador.

### Tanda 4 · Métricas de venta en Inicio

Lo último visible que falta de V1-A.

---

## 5. Lo que sigue esperando a terceros

Sin cambios desde el 04/09, y todo esto sigue trabando:

- 🔴 El **Excel con la columna de IVA**.
- 🔴 El **alta del punto de venta CAEA** — el estudio contable se ofreció, falta que Lucas lo autorice.
- 🔴 El **certificado de producción de ARCA**.
- 🔴 **Dónde se cobra la percepción de IIBB**: en la caja o a la cuenta corriente.
- 🟡 Qué es un **"comprobante de percepción"** (sugerencia 9).
