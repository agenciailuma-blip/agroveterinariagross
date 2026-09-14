---
actualizado: 2026-09-14
estado: en curso
---

# AHORA

> **Empezá por acá.** Una página. Todo lo demás se lee **sólo si hace falta**, siguiendo un enlace.
> Corte comprometido: **26 de octubre de 2026**, el día que Gross deja OBTech.

---

## Dónde está todo, hoy

**Publicado: 0.4.1** (14/09), con Reportes, devoluciones parciales, el resumen de cuenta corriente, la base local cifrada y la versión para el celular. **Falta instalarla limpia en el local esta semana** —la hace Francisco a mano, borrando los datos con 0 pendientes: [paso 9](instalacion-en-el-local.md). **248 pruebas verdes en la app y 11 en el programa**, 75 migraciones aplicadas.

⚠️ **Lo que está construido pero NO verificado.** Un chat nuevo no puede darlo por probado:

| Qué | Cómo se verifica |
|---|---|
| La impresión por impresora de Windows | Con el papel puesto, en el local. Dos minutos por PC |
| La red del local con dos máquinas | En el local, Paso 5-bis del guion de instalación |
| El actualizador de punta a punta | Apretando *Actualizar ahora* en una PC, sin desinstalar antes |
| ~~Las pantallas de **La red del local** y **Percepciones**~~ | ✅ **Vistas el 11/09.** Percepciones entera, con datos de agosto y el caso de la nota de crédito. De La red del local sólo se puede ver en el navegador el aviso de que hace falta el programa instalado: es así a propósito |

🟡 **`cargo test` falla en esta máquina, y ya se sabe por qué: hay tres antivirus instalados.** Norton Security y Avast conviven con Windows Defender —que quedó desactivado, porque los otros dos le sacaron el control—. Cada `.exe` que el compilador crea lo intercepta el antivirus antes de que termine de escribirse, y el enlazador falla con `LNK1104`, «no se puede abrir el archivo». El archivo, efectivamente, no está: lo hicieron desaparecer.

> **Por eso engaña:** el mensaje hace pensar que algo tiene tomado el ejecutable, y no hay nada tomado. Se descartaron una por una: espacio en disco, permisos, procesos abiertos, el reparto de trabajo del compilador y el modo release. **Las 9 pruebas pasan** —se corrieron hoy dos veces— pero hay que reintentar hasta que el antivirus deje pasar una.
>
> 🔧 **Se arregla en un minuto y no lo puede hacer el sistema:** agregar `app/src-tauri/target` a las exclusiones de Norton y de Avast. **Y conviene desinstalar dos de los tres**: tres antivirus a la vez se pisan entre ellos, no protegen más y hacen lenta la máquina.

## Lo primero de todo

🔴 **Probar la impresión en el local, con el papel puesto.** Es lo último que traba el mostrador. Está **publicada en la 0.2.3** desde el 09/09 y probada hasta donde se puede probar sin la impresora delante; la prueba que falta es de dos minutos, con la PC de la caja adelante: Configuración → Impresora del mostrador → elegir de la lista → *Imprimir una prueba*. En **cada** PC, porque cada una elige la suya.

🟡 **El actualizador sigue sin probarse de punta a punta.** La 0.2.2 entró bien, pero desinstalando la versión vieja primero, así que **el arreglo del archivo tomado no se ejercitó**. Hoy no molesta: en el local se desinstala e instala con la máquina delante. Molesta **después del 26/10**, cuando una corrección tenga que llegar a las 4 PC sin viajar a Oberá. Conviene probarlo una vez con la próxima versión, en una sola PC, sin desinstalar nada.

---

## Lo último que pasó — 14 de septiembre

**Se publicó la 0.3.1** con las devoluciones parciales, verificada en el sitio.

**Y está el resumen de cuenta corriente**, que Lucas pidió en un audio esa misma mañana: el documento que le manda a fin de mes al cliente que no pagó. Detalle y cómo se usa en [`pedidos-de-lucas-estado.md`](pedidos-de-lucas-estado.md).

> **Cómo se lo contás a Lucas:** en la ficha del cliente, o directo desde la tabla de quién debe en Reportes, hay un botón *Resumen*. Sale una hoja como la de un resumen del banco —saldo anterior, facturas, pagos y notas de crédito con el saldo renglón por renglón, y el saldo final—, se elige el mes y se guarda como PDF para adjuntarlo al mail. El archivo ya sale con el nombre del cliente.
>
> **Es una hoja que se guarda como PDF, igual que la factura en A4:** no hizo falta sumar una biblioteca ni un servicio, y lo que se ve en pantalla es lo que sale en el archivo.

Verificado contra la base: en los cinco clientes el saldo final del resumen es el de la ficha, la cuenta cierra a mano (anterior + debe − haber = final), y un período partido en dos encadena solo. Una cobranza del 31 a las 22:30 cae en ese mes y no en el siguiente. Se rompió el código a propósito de cinco maneras y las pruebas atraparon las cinco.

🟡 **Lo del mail automático sigue sin decidir** (punto 17): el resumen y la factura se adjuntan a mano. Mandarlos solos necesita contratar un servicio de correo.

**Y está el cifrado de la base local** (0.4.0, sin publicar). Era el punto 3 de la lista, comprometido en el alcance §1 y exigido por la Ley 25.326.

> **Cómo se lo contás a Lucas:** para vender sin internet, cada PC guarda los clientes. Ahora los guarda cifrados: si alguien se lleva la computadora o copia la carpeta del programa, no puede leer ni un nombre. La llave la guarda Windows, atada a la cuenta de usuario de esa PC, así que copiar los archivos a otra máquina no sirve de nada. **No protege contra alguien sentado frente al sistema abierto**: para eso están el usuario y los PIN.

Lo que se cifra: nombre, documento, la búsqueda de clientes (que es una copia del nombre), el nombre para llamar y las observaciones de la venta, todo lo del receptor y la entrega de los remitos, y **las operaciones pendientes enteras**. Lo que queda en claro —límites, saldos, importes— está atado a un código interno que sin el nombre no dice de quién es.

Tres cosas que definen si esto sirve de verdad:

- **Si la llave se pierde, el sistema frena y no crea otra.** Crear otra en silencio dejaría ilegibles para siempre las ventas que no subieron. Un *testigo* —una palabra conocida cifrada con la llave— distingue «primera vez» de «llave perdida». Arriba de todo aparece un aviso que dice qué hacer, y el botón para rehacer la base desde el servidor **sólo aparece si no hay ventas sin subir**.
- **Lo que el mostrador le manda a la caja por la red del local viaja abierto**, porque cada PC tiene su propia llave: cifrado con la del mostrador, la caja no lo podría leer nunca. Era el error más fácil de cometer y el más difícil de ver —la venta no aparecía en la caja, sin ningún mensaje—, y tiene su prueba.
- **Los campos cifrados tienen otro tipo en el código**, así el compilador marca cada lugar que intenta usarlos sin descifrar. Encontró 41. Y revisando a mano lo que el compilador no ve, aparecieron **dos lugares que guardaban el nombre para llamar y las observaciones en claro**, escondidos detrás de un `as never`.

Verificado: las 2 pruebas nuevas del programa pasan contra el **Administrador de credenciales real de Windows**; el programa de escritorio, abierto en esta PC, **creó la credencial** *Sistema Gross - base local*; y en el navegador, la base vieja de las sesiones anteriores **se migró sola**: 8 clientes y 3 ventas, ninguno quedó legible, y la búsqueda, la cola de la caja y la sincronización siguen andando con los nombres descifrados. Siete roturas a propósito, las siete atrapadas.

🔴 **Y apareció algo que cambia cómo se instala.** Migrando en el lugar, el motor de la base **no borra en el momento** lo que reemplaza: se comprobó que después de migrar los nombres seguían legibles en su archivo interno, y ahí se quedan hasta que el motor limpia solo, días después. **Por eso la 0.4.0, aunque está publicada, se instala limpia PC por PC**, borrando la carpeta de datos con 0 pendientes —Francisco la instala a mano esta semana—. El procedimiento está en el [paso 9](instalacion-en-el-local.md).

> **Lo que queda afuera, dicho para no prometer de más:** la red del local sigue sin cifrar por el cable (es la red interna, con su clave), y el perfil del usuario que entra —nombre, mail y permisos, para poder entrar sin internet— sigue guardado en claro en el navegador. Son datos de los empleados, no de los clientes.

**Y la versión móvil**, que era lo que seguía.

> **Cómo se lo contás a Lucas:** desde el celular entra a la misma dirección y la agrega a la pantalla de inicio; queda un ícono de Gross y se abre como una aplicación. El menú se esconde en un botón arriba a la izquierda. Sirve para lo que le prometimos: mirar el stock, ver los reportes y cambiar un precio parado en el depósito. Vender sigue siendo en la PC.

Lo que hubo que cambiar, porque la app estaba pensada para una pantalla ancha:

- **El menú** ocupaba dos tercios del teléfono. Ahora es un panel que se abre con un botón y se cierra solo al elegir. En tablet y PC queda la barra de siempre.
- **Tocar un producto o un cliente parecía no hacer nada**: la ficha se abría a la derecha de la lista, fuera de la pantalla. Ahora, en pantallas angostas, la ficha reemplaza a la lista. De paso se arregló en tablet, donde tampoco entraba.
- **Las fichas** tenían los campos en cuatro columnas: el tipo de persona se leía «Pers». En el teléfono van en dos.
- **Las tablas** muestran lo que se mira parado: en Stock, producto, cuánto queda y estado; en Productos, precio y stock con el código bajo el nombre; en la deuda de Reportes, cliente, vencido y **un teléfono que se toca para llamar**.
- **El ícono**: había sólo un SVG, que el iPhone ignora. Ahora hay íconos PNG, uno adaptable para Android y el del iPhone. Y el color de la barra del teléfono era un verde viejo: ahora es el violeta de la marca.

Verificado simulando un teléfono (375 px): las 16 pantallas entran de ancho, y se recorrieron a mano Stock, Productos con su ficha, Clientes y Reportes. En PC (1280 px) y tablet (768 px) todo queda como estaba, salvo la ficha en tablet, que ahora sí entra. ⚠️ **Falta probarla en un celular de verdad**, sobre todo la instalación.

## Lo que pasó el 11 de septiembre

**Está la pantalla de Reportes, la última de V1-A que faltaba.** Con eso, el punto 9 del alcance —«métricas simples»— queda cubierto entero.

> **Salió mucho más barata de lo que parecía, y conviene saber por qué:** casi todo estaba construido en la base desde agosto y sin usar. El permiso `reportes.ver` ya existía y ya lo tenían Administrador y Encargado; la vista que reparte la deuda por antigüedad también. Lo que faltaba era la pantalla y **una sola cosa nueva de cálculo**: contra qué comparar las ventas.

Lo que trae, y lo que deliberadamente **no** trae:

- **Las ventas comparadas contra el período anterior.** El importe ya estaba en Inicio; lo que faltaba era poder leerlo. Ahora dice *"+631% que los 7 previos"*.
- **Quién debe y desde hace cuánto**, que no estaba en ninguna pantalla. La ficha del cliente muestra un cliente por vez; nunca se veía el conjunto.
- **El stock bajo y el estado de la facturación van como enlace**, no copiados. Ya son las pantallas de Stock y Facturación, con sus filtros. Dos lugares para mirar lo mismo terminan no coincidiendo.

🔴 **Y apareció un error de plata que nadie había visto.** `vista_deuda_antiguedad` existía desde el principio y **ninguna pantalla la usaba**: al ponerla en Reportes salieron los números mal.

> **Cómo se lo explicás a Lucas:** la cuenta que dice cuánto debe cada cliente sumaba las facturas y **no restaba los pagos**. Un cliente que debía $281.600 y los pagó enteros seguía figurando con $281.600 vencidos, con saldo cero en la misma fila. Si eso salía a la pantalla, Gross llamaba a reclamarle plata a alguien que ya había pagado.
>
> **Cómo se arregló:** los pagos se aplican a la deuda más vieja primero, que es como trabaja cualquier cuenta corriente y lo que espera un contador. Ahora **la suma de los tramos da exactamente el saldo** en los cinco clientes, y eso se puede verificar de un vistazo.
>
> El error estuvo escondido porque la vista se construyó junto con la cuenta corriente y nunca se llegó a mirar. **Es un argumento para mirar lo que está construido y no se usa**, no sólo para construir lo que falta.

**El mes se compara por tramo y no contra el mes anterior entero.** Hoy es 11: comparar once días contra los treinta y uno de agosto haría que septiembre aparezca en baja todos los años, todos los meses, hasta el día 30. Se compara del 1 al 11 contra el 1 al 11, y **la pantalla dice contra qué días compara**, porque un "−12%" que no se puede rastrear no se discute con nadie.

**Se probaron las pruebas rompiendo el código a propósito**, y una no aguantó: la que decía proteger el parseo de fechas de la zona horaria pasaba igual con el código roto, porque un redondeo que está para otra cosa tapaba las tres horas de diferencia. **Se corrigió el comentario en vez de fingir que la prueba servía.** Las otras tres roturas sí fueron atrapadas.

**Y están las devoluciones parciales.** Hasta hoy devolver era todo o nada: el cliente traía una bolsa de tres y había que anular la venta entera y rehacerla.

> **Cómo se lo contás a Lucas:** en Facturación, al lado de *Devolver*, ahora hay *Devolver parte*. Se abre la lista de lo que el cliente se llevó, se marca cuánto vuelve de cada cosa, y el total de lo que hay que devolverle se ve **antes** de confirmar. La venta no se anula: queda como está, con lo devuelto restado.
>
> **Se puede devolver varias veces**, porque el cliente puede traer una bolsa hoy y otra la semana que viene. Cada devolución saca su propia nota de crédito, y el sistema lleva la cuenta de cuánto queda: nadie puede devolver cuatro de tres.

Tres decisiones que definen si los números salen bien:

- **El IVA se calcula por alícuota, no sobre el total.** Devolver una bolsa de alimento (10,5%) y un collar (21%) son dos bases distintas; un promedio daría mal.
- **La percepción de IIBB se prorratea, no se recalcula.** Si se recalculara, una devolución chica caería por debajo del mínimo de $24.000 y devolvería percepción cero, dejándole al cliente una percepción cobrada por mercadería que devolvió.
- **Los importes se prorratean sobre lo que se cobró**, no sobre el precio de lista. Una línea con descuento tiene que devolver lo que el cliente pagó; con el precio de lista se le devolvería de más, y la diferencia sale del mostrador.

🔴 **Y de paso se tapó un agujero que la devolución parcial abría.** Si alguien devolvía una bolsa y después anulaba la venta entera, el sistema reingresaba las tres —la anulación mira lo que salió por la venta y no descuenta lo que ya volvió—. **Ahora una venta con devoluciones parciales no se puede anular entera**, y el mensaje dice qué hacer en su lugar. Verificado: el stock queda con el +1 que corresponde, no con +2.

> **El efectivo lo sigue entregando el cajero.** El sistema descuenta de la cuenta corriente la parte que estaba en cuenta y emite la nota de crédito, pero no abre la caja — el mismo criterio que ya tenía la anulación entera.

**Se rompió el código a propósito otra vez**, y esta vez las tres roturas fueron atrapadas: prorratear sobre el precio de lista, sacar el redondeo al centavo y mirar lo vendido en vez de lo que queda.

## Lo que pasó el 10 de septiembre

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
3. ~~**Cifrado de la base local.**~~ ✅ **Hecho y publicado el 14/09 (0.4.0).** Se instala limpio, PC por PC, esta semana: [paso 9 del guion](instalacion-en-el-local.md).
4. ~~**Devoluciones parciales**~~ ✅ **Hechas el 11/09 y publicadas el 14/09** en la 0.3.1.
5. ~~**Reportes**~~ ✅ **Hecha y publicada el 11/09** en la 0.3.0.
6. ~~**La versión móvil**~~ ✅ **Hecha y publicada el 14/09 (0.4.1).** Lo prometido en la primera reunión: *consultar stock, ver reportes o pasar un precio desde el depósito*; vender sigue siendo en la PC con el lector. Cómo se instala en el celular: [paso 10](instalacion-en-el-local.md). **Falta probarla en un teléfono de verdad.**
7. **Todo con teclado** — **en espera**: Gross tiene que confirmar qué atajos prefiere. Cuando se haga, van definidos en un solo lugar del código y Configuración los **muestra** en una lista; que se puedan editar por PC, sólo si lo piden (cada máquina con teclas distintas complica capacitar y dar soporte).

> ✅ **Los desplegables de *Percepciones* ya usan el estilo común**, así que muestran el recuadro de foco como el resto del sistema — un paso menos para el punto 6. La pantalla tenía además el botón y la tarjeta escritos a mano; los tres ahora salen de [`estilos.ts`](../app/src/estilos.ts).

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

### Las preguntas para la próxima reunión, juntas

Seis, y todas cambian el tamaño de algo. Están desarrolladas en sus documentos; acá van para no tener que buscarlas:

1. ¿Le llevan **la cuenta a cada proveedor** en OBTech, o eso lo miran en otro lado? → [`plan-compras.md`](plan-compras.md)
2. En la grilla del IVA de compras, la columna **Centro de Costo**: ¿elegís algo o la dejás como viene? → [`compras-e-iva.md`](compras-e-iva.md)
3. Los cheques que reciben, **¿los depositan o se los endosan a proveedores?** → [`cheques.md`](cheques.md)
4. **¿Emiten cheques propios**, o pagan sólo con cheques de terceros?
5. **¿Hay cheques diferidos**, o son todos al día?
6. El **"calendario de recibos"** que pediste el 10/08, ¿es lo de los cheques?

Y dos para el contador: **qué columnas quiere** en los dos archivos, y si le sirven en Excel.

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
- **En la red del local, las dos terminales suben lo mismo, y es a propósito.** La operación no sale de la cola del mostrador cuando se le entrega a la caja. Si una de las dos máquinas no vuelve a encenderse, la venta sube igual desde la otra; la copia que llega segunda choca contra la clave primaria y se descarta sola.
- **Una venta que la caja ya cobró no se vuelve a guardar cuando el mostrador la reenvía.** Sin esa regla vuelve a la pantalla del cajero con la plata ya cobrada. Está en `loQueSeGuarda()`, con su prueba.
- **Una venta con devoluciones parciales no se anula entera.** La anulación reingresa el stock mirando lo que salió por la venta y no descuenta lo que ya volvió: sacar esa restricción hace que una venta con una bolsa devuelta reingrese las tres.
- **La percepción de IIBB de una devolución se prorratea, nunca se recalcula.** Recalcularla sobre el importe devuelto la hace caer bajo el mínimo no sujeto y devuelve cero, dejándole al cliente una percepción que no corresponde.
- **Sin llave, la base local frena y no crea otra.** El testigo existe para eso. Crear una llave nueva cuando ya hay datos cifrados deja ilegibles para siempre las ventas que no subieron.
- **Las operaciones viajan abiertas por la red del local.** Cada PC cifra con su propia llave; mandarlas cifradas deja a la caja sin poder leerlas, sin ningún error.
- **Se cifra antes de abrir una transacción de Dexie, nunca adentro.** Esperar el cifrado con la transacción abierta la cierra sola y la escritura falla.
- **Los pagos de cuenta corriente se imputan a la deuda más vieja primero.** Es lo que hace que la suma de los tramos de `vista_deuda_antiguedad` dé el saldo. Volver a sumar sólo las facturas —que es como estaba— hace que un cliente que ya pagó siga apareciendo como deudor vencido.
- **Las métricas de venta se comparan por tramo del mes, no contra el mes anterior completo.** Cambiarlo deja el mes en curso en baja permanente hasta el día 30, todos los meses.
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

📊 **16 de 24 pedidos de Lucas hechos** · 173 pruebas verdes en la app y 9 en el programa · 68 migraciones. *(Los números del 9 de septiembre; los de hoy están arriba.)*

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
