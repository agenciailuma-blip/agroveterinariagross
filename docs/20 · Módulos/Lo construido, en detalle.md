---
origen: ESTADO.md
actualizado: 2026-09-09
---

# Lo construido, en detalle

> El detalle de cada módulo: qué se construyó, con qué criterio y cómo se verificó. Es el archivo de referencia — se abre cuando hace falta tocar uno, no al empezar una sesión.

> Se movió acá desde `ESTADO.md` el 09/09, sin tocar una palabra. Empezá por [[AHORA]].

---

## 5. Lo que falta para el 26 de octubre

Por orden de riesgo:

### 🟡 1. Facturación ARCA — emitiendo en homologación, falta impresión y contingencia
Era el bloqueante principal del proyecto. **Ya emite comprobantes con CAE real** contra homologación, con pantalla propia y enganchada al cobro de la caja. Lo que queda es acotado y no depende de terceros.

La capa de datos está entera: comprobantes, numeración, CAEA, cola de contingencia, semáforo de estados, registro de intentos exigido por la RG 5852/2026.

✅ **Certificado de homologación obtenido el 21/08/2026**, a nombre del CUIT de Gross (20146369767). Par completo en `secrets/`: `gross_homologacion.key` (clave privada, no sale de acá), `gross_homologacion.csr` (la solicitud) y `gross_homologacion.crt` (el certificado que devolvió ARCA, emisor `Computadores Test / AFIP`, vence 20/08/2028). Verificado con `openssl` que el certificado corresponde a la clave privada.

✅ **Circuito completo de emisión, andando en homologación (21/08/2026).**

- `arca-wsaa`: autentica contra ARCA (firma el TRA como CMS con `node-forge`, sin depender de OpenSSL) y cachea el token 12 h en `arca_ticket_acceso`.
- `arca-wsfe-solicitar-cae`: toma un comprobante `pendiente`, arma el `FECAESolicitar` con sus alícuotas y tributos, y guarda el resultado.
- **Probado de punta a punta con datos reales**: se preparó un comprobante desde una venta DEMO (`preparar_comprobante`), se le pidió el CAE, y ARCA lo autorizó: `CAE 86340778898271`, vence `2026-08-31`. Quedó en `comprobante` (estado `autorizado`) y el intento en `intento_arca` (678 ms, `ok`), como exige la RG 5852/2026.
- Los secretos `ARCA_CERT_PEM` y `ARCA_KEY_PEM` están cargados en el proyecto (Edge Functions → Secrets).

✅ **Pantalla y enganche con la Caja (21/08/2026).**

- Pantalla **Facturación** con el semáforo, el aviso de ventana de 5 días para el CAE, reintento de rechazados, y un panel rojo aparte para **ventas cobradas sin comprobante** (el caso grave: la plata entró y no hay respaldo fiscal).
- El botón **Cobrar** de la Caja ahora factura solo. Si ARCA falla, **la venta queda cobrada igual** y el comprobante espera en la cola: fallar el cobro por una caída de ARCA dejaría al cliente parado en el mostrador con la mercadería en la mano. El cajero ve un aviso ámbar que no se va solo, con enlace a Facturación.

✅ **Percepción de IIBB calculándose (21/08/2026).** `calcular_percepcion_iibb()` aplica la regla acordada: solo Factura A, salvo cliente con certificado de exclusión, y solo si la percepción supera el mínimo configurado. Probada con 7 casos incluido el borde exacto ($24.000 → no se practica). **ARCA aceptó una Factura A con percepción**: `CAE 86340779425050` sobre un neto de $1.007.441,76, percepción $33.346,32.

⚠️ **Pendiente de definición, no de código:** la percepción va *arriba* del precio, y hoy la caja no la cobra — el comprobante queda $33.346 por encima de lo cobrado. Hay que definir con Lucas si se cobra en la caja o va a la cuenta corriente. Ejemplo numérico redactado en [`mensajes-lucas-2026-08-21.md`](mensajes-lucas-2026-08-21.md).

🔧 **Corregido el 24/08 gracias a una descripción de Lucas.** Él contó cómo sale hoy su factura: *"cuando facturo me tira todos los precios sin IVA, después abajo me tira las percepciones, el IVA... y al final el total de todo"*. En la Factura A los renglones iban con IVA incluido mientras el subtotal mostraba el neto: sobre $1.200.000 los renglones sumaban 1.200.000 y el subtotal decía 1.007.441. **Ahora la A muestra los precios sin IVA** (que además es como debe estar hecha) y los renglones cierran exactamente con el neto gravado. La B sigue con IVA incluido, como corresponde.

✅ **Comprobante imprimible con QR (21/08/2026).** Pantalla `/comprobante/:id` con el formato de una factura argentina (letra en su recuadro, encabezado del emisor, discriminación de IVA en la A, leyenda de la Ley 27.743 y "IVA contenido" en la B, pie con CAE y QR). El QR sigue la RG 4892: **verificado contra el ejemplo oficial de ARCA, produce el mismo Base64 byte a byte**. Se imprime desde el navegador a cualquier impresora o a PDF, y al imprimir el semáforo pasa a verde.

✅ **Verificado con sesión iniciada el 04/09.** Se recorrieron Caja, Facturación y la impresión del comprobante. Quedó el comprobante `00001-00000002` pendiente, con fecha de hoy, para probar "Pedir CAE", y el `00001-00000001` autorizado para probar la impresión.

✅ **Devoluciones con nota de crédito (24/08/2026).**

Botón **Devolver** en Facturación. Una sola llamada —`anular_venta_con_nota_credito()`— hace las tres cosas que componen una devolución dentro de la misma transacción: reingresa el stock, le saca la deuda al cliente y arma la nota de crédito. Si se hicieran por separado y fallara la del medio, quedaría mercadería reingresada sin documento, o una nota de crédito de mercadería que nunca volvió.

La nota copia los importes de la factura **con la percepción de IIBB incluida**, tal como pidió el contador por escrito: sin eso, Gross le habría cobrado al cliente una percepción por una venta que no existió.

**ARCA autorizó una nota de crédito real**: `CAE 86340791943873`, Nota de Crédito A asociada a la Factura A 00001-00000001, con percepción de $33.346,32. Para eso hubo que agregar el bloque `CbtesAsoc` al pedido — ARCA rechaza toda nota que no diga qué factura corrige.

Verificado además: el stock vuelve a entrar (17 → 20 en la prueba), no se puede devolver dos veces la misma venta, y una venta sin facturar se anula sin generar nota (no hay nada que anular ante ARCA).

**Lo que falta:**
- ~~Contingencia con CAEA~~ — construida el 24/08, ver más abajo. El alta del punto de venta llegó el 16/09; lo que falta ahora es el certificado de producción.
- **Devoluciones parciales**: hoy la devolución es de la venta entera. Si el cliente devuelve 1 de 3 unidades, hay que anular todo y rehacer la venta. Nota de débito tampoco está.
- El certificado de **producción**: trámite aparte, en otro portal (Administración de Certificados Digitales, no WSASS). Se hace cuando el servicio ya esté probado en homologación, y hay que acordarse de autorizarlo al servicio `wsfe` igual que en homologación — es el paso que todo el mundo olvida.

### 🟡 1b. Contingencia con CAEA — construida el 24/08, con el punto de venta cargado el 16/09 y esperando el certificado de producción

El CAE se pide comprobante por comprobante y exige que ARCA conteste. El CAEA es al revés: ARCA lo entrega **por adelantado**, una vez por quincena, y habilita a emitir mientras el servicio está caído. Después hay que informarle qué se emitió con él, antes de una fecha tope.

**Lo que quedó construido:**

- Edge Function `arca-wsfe-caea` con las cuatro operaciones: `FECAEASolicitar`, `FECAEAConsultar`, `FECAEARegInformativo` y `FECAEASinMovimientoInformar` (esta última es obligatoria aunque no se haya emitido nada).
- `emitir_con_caea()` — el único camino para que un comprobante salga por contingencia.
- Panel de contingencia en Facturación: el código vigente, qué falta informarle a ARCA y cuántos días quedan para hacerlo. Se muestra siempre, no sólo durante un corte: un panel que aparece cuando ARCA se cae llegaría tarde por definición, porque el código hay que haberlo pedido antes.
- Sección de puntos de venta en Configuración, para registrar cuál está habilitado bajo el régimen CAEA.

**Las condiciones las verifica la base, no la pantalla.** La RG 5852/2026 reservó el CAEA a indisponibilidad real, y eso hay que poder demostrarlo. `emitir_con_caea()` exige tres cosas y las tres se chequean del lado del servidor, donde un navegador con la consola abierta no llega:

1. Que haya un CAEA vigente para hoy.
2. Que el comprobante **no** esté rechazado. Un rechazo es ARCA contestando "tus datos están mal": el servicio anda, y el CAEA no arregla un comprobante mal armado — sólo manda el mismo error con otro código encima.
3. Indisponibilidad demostrable: la cantidad configurada de intentos fallidos por caída en la última hora en ese punto de venta, y al menos uno de ese comprobante.

Para que la condición 3 pueda cumplirse hubo que arreglar algo que faltaba: **cuando ARCA no respondía, no quedaba ningún registro**. El intento sólo se anotaba si ARCA contestaba algo — justo al revés de lo que hace falta. Ahora toda llamada que falle por caída se anota en `intento_arca`, y las llamadas tienen límite de espera (`arca.timeout_segundos`), que antes no tenían.

**Verificado contra la base**, con las condiciones rotas a propósito: sin CAEA vigente no deja; sin intentos fallidos no deja; sobre un comprobante rechazado no deja; sin punto de venta del régimen CAEA no deja y dice por qué; con todo en orden emite y el comprobante queda en `contingencia` con el código; emitirlo dos veces no se puede; y la alineación posterior no le pisa el número.

⚠️ **Lo que NO está verificado y no puede estarlo todavía:** que ARCA acepte lo informado (`FECAEARegInformativo` y `FECAEASinMovimientoInformar`). El pedido sí anda desde el 03/09. El XML del informativo lo parseó ARCA, pero **nunca lo aceptó entero**. Y ya se sabe que **en homologación no se va a poder**: ese ambiente no ve el punto de venta 9 (ver la trampa más abajo). Queda para el día que se pase a producción: [`certificado-produccion.md`](../certificado-produccion.md).

⚠️ **Esta contingencia cubre "ARCA está caído", no "no hay internet".** Con internet cortado la terminal tampoco llega a Supabase, y el comprobante ni siquiera se puede armar. Eso es parte del trabajo de sincronización por red local + Tauri, no de esto.

### ✅ 1c. Los dos formatos de impresión, y el logo (25/08)

Lucas mandó los dos comprobantes que entrega hoy con OBTech: el **ticket** que sale por la Hasar, con el logo arriba, y la misma factura en **A4**, que es la que le manda por mail al cliente de cuenta corriente. Pidió las dos.

Ahora la pantalla del comprobante tiene un selector: **Ticket 80 mm** y **Hoja A4**. La elección se recuerda por terminal —la caja imprime tickets todo el día y la oficina imprime A4— y el tamaño de página se declara por formato, porque si no el navegador mete un ticket de 80 mm en el medio de una hoja A4.

El ticket sigue el orden y las etiquetas del que Gross entrega hoy, a propósito: los clientes del local leen ese papel desde hace años. Lo que sí cambia es lo que estaba mal — en la Factura A los precios van sin IVA y los renglones cierran con el neto gravado.

**El logo** se carga desde Configuración y viaja embebido en el comprobante (data URI), no desde un servidor: una imagen que se baja de la red saldría en blanco justo el día que se corta internet. Se achica solo en el navegador antes de guardarse.

**Verificado con pruebas que renderizan el ticket de verdad** (7 casos: encabezado, identificación, B con IVA, A sin IVA cerrando con el neto, percepción al pie, CAEA en vez de CAE, y sin logo cargado). La de la Factura A se verificó rompiendo el cálculo a propósito.

La lógica de cómo se muestran los importes según la clase quedó en `lib/comprobante/presentacion.ts`, compartida por los dos formatos: si cada uno la calculara por su lado, serían dos versiones del mismo comprobante con números distintos.

### ✅ 1d. La planilla de Lucas entra entera (25/08)

Mandó los primeros 86 productos categorizados sobre los 2.261. Al probar con el archivo real aparecieron tres cosas:

**El importador estaba roto para cualquier `.xlsx`.** `read-excel-file` devuelve un arreglo de **hojas**, no de filas, y el código lo trataba como lo segundo: la primera "fila" era en realidad la primera hoja entera. Con un archivo de una sola hoja pasaba desapercibido; con esta planilla —listas en la primera hoja, productos en la segunda— no se importaba nada. Ahora se leen todas las hojas, se elige sola la que tiene pinta de productos, y se puede cambiar a mano.

**La tabla no arranca en A1.** Título en la fila 1, encabezado en la 2, ejemplo en la 3. Se detecta el encabezado por la fila que reconoce más campos. De paso, el informe de errores ahora manda al número de fila correcto de Excel, que es lo único que le sirve a quien tiene el archivo abierto.

**Se perdían cuatro de los siete niveles con los que clasificó.** El importador sabía de una categoría plana; Lucas usó Rubro > Subrubro > Grupo > Subgrupo, más Marca, Animal y tres banderas de SI/NO. La tabla `categoria` ya era un árbol (`padre_id`) desde el principio: lo que faltaba era que el importador supiera caminarlo. Ahora la categoría viaja como ruta y `app.categoria_de_ruta()` crea los niveles que falten, con el slug de la ruta entera (`alimentos-pequenos-animales-alimentos-secos-adulto`) porque el slug es único en toda la tabla. Las tres banderas van a `es_producto_veterinario`, `requiere_receta` y `es_fitosanitario`, que ya existían.

**Probado contra el archivo real**: 2 hojas, elige "Productos", encabezado en la fila 2, mapea 11 de 13 columnas solas, **2.262 filas sin un solo error**, 86 categorizados. Quedan sin mapear `Precio tarjeta` y `Animal`, que no tienen dónde ir todavía.

⚠️ **Cuidado con reimportar:** una celda vacía no borra lo que ya estaba, pero un valor distinto sí lo pisa. Es lo que se quiere (corregir en el Excel y volver a importar), pero conviene saberlo.

### 🟡 1e. El sistema como programa instalable — arrancado el 01/09

Hasta ahora el sistema era una página web. Lo que va a usar la gente de Gross es un programa en el escritorio de cada PC, y eso es lo que habilita las dos cosas que faltan: la impresión directa a la Hasar y la sincronización por la red del local.

**Por qué Tauri y no Electron.** El instalador pesa **1,7 MB** y el programa 3,7 MB, porque usa el WebView2 que Windows 11 ya trae. Con Electron, cada una de las 4 PC cargaría con unos 150 MB de navegador propio. En máquinas de mostrador eso se nota al abrir.

El entorno de esta máquina ya estaba a medias: MSVC 14.51 y el SDK de Windows 10.0.26100 estaban instalados; sólo faltó Rust (1.98).

**Qué quedó andando:**

- `npm --prefix app run escritorio` — abre el programa **sin instalarlo**, desde el código. Es para probar mientras se construye. No deja nada en el menú de inicio de Windows.
- `npm --prefix app run escritorio:instalador` — **genera el archivo instalador**, en `app/src-tauri/target/release/bundle/nsis/`. Genera el archivo; no instala nada. Para que la aplicación aparezca en Windows hay que ejecutar ese `.exe` (doble clic), como cualquier programa.

> Esa distinción confundió la primera vez: se generó el instalador y se buscó la aplicación en el buscador de Windows, donde no estaba porque nadie la había instalado todavía.
- Instalador NSIS **en español y en modo "usuario actual"**: no pide contraseña de administrador, que es lo que permite instalarlo en las 4 PC sin depender de nadie.
- Icono tomado del isotipo de la marca, sobre fondo blanco: el magenta de Gross sobre la barra de tareas oscura de Windows queda apagado, y sobre una clara desaparece.

**Decisiones que no conviene revisar:**

*El service worker se apaga adentro del programa.* En la web es lo que hace que el sistema abra sin internet. Adentro del programa los archivos ya están en el disco: guardaría una copia de una copia, y el día de una actualización la terminal seguiría abriendo la versión vieja sin que nadie entienda por qué. Se apaga solo, mirando una variable que pone el propio Tauri.

*La ventana sólo puede hablar con Supabase.* Hay una CSP explícita en `tauri.conf.json`. Un programa instalado que puede conectarse a cualquier lado es superficie de ataque que no necesitamos.

*Permisos mínimos.* `capabilities/default.json` arranca con lo básico más dos permisos, cada uno con su motivo escrito. Todo lo que se agregue después va a ser porque una pantalla lo necesita.

### ✅ 1h. Impresión directa en el mostrador (03/09, rehecho el 09/09)

El alcance decía *"Impresión en la Hasar P-HAS-181 **por red**, con QR de ARCA"*, y así se construyó primero: contra una dirección y un puerto. **El relevamiento del 07/09 mostró que la realidad del local es otra.** No hay ninguna Hasar de red: hay una **impresora térmica POS80 conectada por USB** a la PC de la caja y compartida desde ahí para los mostradores, con el controlador `POS80ENG` en formato **RAW**.

**Lo que se salvó y lo que cambió.** ESC/POS era el protocolo correcto —todo `escpos.ts` sirvió tal cual— y los importes también. Lo que no servía era el transporte. Ahora el ticket sale por la **cola de impresión de Windows**, eligiendo la impresora por nombre.

**Es la razón principal por la que el sistema se empaqueta.** Una página web no puede mandarle bytes crudos a una impresora del local; el programa instalado sí.

- Dos comandos nuevos en Rust ([`src-tauri/src/impresora.rs`](../app/src-tauri/src/impresora.rs)): uno le pregunta a Windows qué impresoras hay instaladas en esa PC, y el otro le manda el ticket a una de ellas como trabajo **RAW** — que es lo que hace que Windows le pase los bytes a la impresora sin traducirlos, y por eso se le puede mandar ESC/POS por la cola en vez de por red.
- **La impresora se elige de una lista, no se escribe.** Es la decisión que salió de la reunión, y no es comodidad: los nombres reales no se adivinan. En la caja es `POS80 Printer`; en un mostrador, la misma, es `POS80 Printer(2)` colgada de `DESKTOP-O4R9STD`. Un nombre tipeado a mano se guarda sin protestar y falla recién el día que hay que entregarle un comprobante a alguien.
- **El nombre se guarda por terminal, no para todo el comercio** (`terminal.impresora_windows`). La impresora es un dato de la máquina, y la terminal ya *es* la máquina. Además la fila entera viaja al almacenamiento local al elegirla, así que el nombre está disponible sin internet — que es justo cuando el mostrador más necesita imprimir.
- **Una sola regla decide por dónde sale** ([`lib/comprobante/destino.ts`](../app/src/lib/comprobante/destino.ts)): primero la impresora de Windows de esta terminal, después la de red del comercio, y si no hay ninguna, el diálogo de impresión de siempre. La usan la caja, el remito y la prueba de Configuración: si cada pantalla decidiera por su cuenta, la prueba saldría por un camino y el ticket de verdad por el otro.
- **El camino de red no se borró.** No sirve en ninguna de las dos cajas de Gross, pero es el único posible si algún día ponen una impresora de red, y sacarlo no gana nada. Quedó en Configuración, en una sección plegada que dice que Gross no lo usa.
- El **diagnóstico de la terminal** ahora compara el nombre guardado con lo que Windows informa en esa PC. Es la falla que va a aparecer en el local: si la máquina de la caja está apagada, la compartida deja de existir para los mostradores y el ticket no sale, sin que nada lo hubiera anunciado antes. El texto que se copia y se pega en el chat dice qué impresora falta y cuáles ve la PC.
- El ticket se arma en ESC/POS ([`lib/comprobante/escpos.ts`](../app/src/lib/comprobante/escpos.ts)), con el QR dibujado por la propia impresora —sale nítido y rápido, mucho mejor que mandarlo como imagen— y el corte de papel al final.
- Botón **Imprimir en el mostrador** en el comprobante, al lado del de siempre. Si falla, lo dice y ofrece imprimir por el diálogo de Windows: una impresora apagada no puede dejar a nadie sin comprobante.

**Los importes salen de `presentacionDe()`**, el mismo lugar del que salen los del ticket en pantalla y los de la hoja A4. Si cada formato los calculara por su lado, el día que se toque uno los tres dejarían de coincidir.

**Probado con 9 casos** que leen los bytes que se le mandarían a la impresora: los datos del emisor, la Factura A sin IVA cerrando con el neto, la percepción al pie, CAEA en vez de CAE, el QR presente sólo si hay, y el corte de papel al final.

Uno de esos casos merece mención: **los acentos van en latin1, no en UTF-8**, que es lo que entienden estas impresoras. Con la codificación equivocada, "Bagó" sale impreso "BagÃ³" en un comprobante fiscal.

**Qué se pudo verificar sin la impresora delante (09/09).** La POS80 está en Oberá, no en la máquina donde se programa. Así que se verificó lo que sí se puede, y no es poco: que la lista de impresoras de Windows se lea bien —13 en la PC de desarrollo, ninguna cortada ni con basura adentro— y, la que importa, que **cada nombre que devuelve la lista sea un nombre que Windows después acepta al abrirla**. Es exactamente la falla que el desplegable existe para evitar. Se sumaron 7 pruebas de la regla de destino, y las pruebas nuevas se rompieron a propósito para ver que fallan: sin el cero al final del texto UTF-16, Windows no encuentra ninguna impresora; con la prioridad invertida, una PC con la POS80 elegida se iría por una IP vieja.

⚠️ **Falta el papel, y sólo eso.** Lo único que no se puede verificar desde acá es que la POS80 imprima el ticket. Es una prueba de dos minutos en el local: Configuración → Impresora del mostrador → elegir `POS80 Printer` → *Imprimir una prueba*.

### ⚠️ Trampa: `target="_blank"` no existe adentro de Tauri

El botón **Imprimir comprobante** de la caja abría el comprobante en una pestaña nueva. Adentro del programa instalado no habría hecho **absolutamente nada**: sin error, sin aviso, sin nada en la consola. Tauri bloquea esas aperturas.

Ahora abre una ventana aparte, y en el navegador sigue siendo una pestaña. La diferencia vive en [`lib/escritorio.ts`](../app/src/lib/escritorio.ts), en un solo lugar, y no desparramada por las pantallas.

Es la única suposición de navegador que tenía el sistema: se buscaron también manipulaciones de `window.location`, descargas y registros de service worker a mano, y no hay ninguna.

### ⚠️ Trampa: Vite vigilaba la carpeta donde compila Rust

`npm run escritorio` moría siempre con `EBUSY: resource busy or locked`. La carpeta `src-tauri/target` tiene miles de archivos que aparecen y quedan bloqueados mientras cargo trabaja; el vigilante de Vite se caía y se llevaba puesto el modo desarrollo entero, con un error que no mencionaba a Rust por ningún lado.

Se excluye esa carpeta en `vite.config.ts`.

### ✅ 1f. Las actualizaciones llegan solas a las 4 PC (01/09)

Sin esto, corregir algo después del corte significaba ir máquina por máquina con un pendrive. Ahora se publica una vez y las cuatro terminales se enteran.

**Cómo se ve del lado de quien atiende.** Una franja arriba de la pantalla: *"Hay una versión nueva del sistema (0.2.0). Se instala en menos de un minuto y el programa se reinicia"*, con **Actualizar ahora** y **Más tarde**.

Tres decisiones que valen más que el código:

- **Es una franja, no un cartel.** Una actualización no puede taparle la pantalla a alguien que está cobrando.
- **Si falla la consulta, no se dice nada.** Que no haya internet no es un problema del cajero y no tiene por qué enterarse.
- **Actualiza cuando la persona lo decide.** El programa se cierra y vuelve a abrir para terminar, y eso no puede pasar solo en el medio de un cobro.

**Cómo se publica una corrección:**

1. Subir el número de versión en `app/src-tauri/tauri.conf.json`
2. `npm --prefix app run escritorio:publicar`
3. Ya no hace falta arrastrar nada: **el comando sube solo a Cloudflare** con `wrangler`, autenticado el 07/09 con la cuenta de Gross

> ⚠️ Corré ese comando desde **Git Bash**. En PowerShell falla con *"la ejecución de scripts está deshabilitada"*, que es una política de Windows y no del proyecto. Alternativa: `npm.cmd` en vez de `npm`.

> **Por qué no se conecta el repositorio a Cloudflare Pages.** Sería lo primero que uno intenta, y es una trampa: Cloudflare correría `npm run build` en sus servidores, que genera la aplicación web pero **no** la carpeta de actualizaciones. Cada push dejaría a las cuatro terminales sin recibir correcciones, en silencio. Para que saliera bien habría que compilar Tauri allá y subirles la clave privada de firma, y esa clave no sale de la máquina de ILUMA.

Ese comando genera las dos cosas juntas: la aplicación web y, adentro de `dist/actualizaciones/`, el instalador firmado que las terminales consultan. Antes de compilar, le pregunta a Cloudflare qué versión está publicada y se niega a repetir el número — si no cambia, las terminales no se enteran de nada.

> ⚠️ **De acá en más el deploy sale siempre de este comando, no de `npm run build`.** Las dos cosas viven en la misma carpeta: si alguna vez se sube un `dist` generado con el build común, la carpeta de actualizaciones desaparece de Cloudflare y las cuatro PC dejan de recibir correcciones, sin ningún error visible.

El mismo archivo firmado sirve para instalar en una máquina nueva: está en `app/dist/actualizaciones/`.

✅ **Circuito estrenado el 04/09/2026.** Francisco subió `app/dist` a Cloudflare con lo último e instaló la **0.1.1** a mano una vez. Desde acá las terminales se actualizan solas: la instalación manual es sólo la primera, la que le enseña a la máquina a quién consultarle.

### 🔴 La clave de firma no se puede perder

Cada versión se firma con una clave privada, y **el programa instalado sólo acepta actualizaciones firmadas con esa clave**. Es lo que impide que alguien que pueda responder en esa dirección le instale lo que quiera a las cuatro máquinas del local.

La clave está en [`secrets/actualizador-gross.key`](../secrets/) y **no está en el repositorio**. Si se pierde:

> Las máquinas ya instaladas **nunca más** pueden recibir una actualización. Hay que reinstalarlas a mano, una por una, con un instalador generado con una clave nueva.

✅ **Copia guardada por Francisco el 04/09/2026**, fuera del repositorio. No se regenera: si esa copia se pierde también, no hay segunda oportunidad.

### 🟡 1i. Comprobantes no fiscales y remitos — la base entera, y la caja eligiendo (04/09)

Punto 20 y punto 24 de las sugerencias de Lucas. Presupuesto, remito y comprobante interno.

**Tabla aparte, no un tipo más de `comprobante`.** Es la decisión de fondo y la que hay que poder defender. Sería más corto agregar "Presupuesto" y "Remito" a `tipo_comprobante` y reusar lo que ya tiene numeración, impresión y listado. Tres razones para no hacerlo, y las tres ya costaron tiempo antes:

1. **Los id de `tipo_comprobante` son los códigos de ARCA, no nuestros.** Inventar un `900 = Remito` es ocupar un espacio de numeración ajeno — exactamente el error de mapeo que esa decisión existe para evitar.
2. **Un no fiscal adentro de `comprobante` se filtra solo al `FECAEARegInformativo`.** Hay varias consultas que dicen "comprobantes"; la que se olvide de excluirlo una vez le informa a ARCA un documento que para el fisco no existe. Es un problema de cumplimiento, no un bug de pantalla.
3. **La serie fiscal no tolera huecos y ya nos mordió** con el error 703 al rendir el CAEA.

> **Cómo se lo explicás a Lucas:** son dos archivadores distintos a propósito. En uno van los papeles que ARCA numera y controla; en el otro los que numera Gross. Comparten la impresora y la pantalla, pero nunca los números. Es lo que hace imposible que un presupuesto se cuele en una declaración.

**El límite vive en el esquema, no en una intención.** `comprobante_no_fiscal` no tiene columna de CAE, ni de clase A/B, y sus líneas no tienen alícuota de IVA. No es que la pantalla evite mostrarlos: **es que no existen**. Y anular exige motivo por restricción de la base, no por validación de formulario. Verificado con `insert` directos.

**Numeración propia, a prueba de cortes.** Serie por terminal (`REM CAJA1-00000045`), reusando el prefijo que ya usa `venta.codigo`. Dos terminales sin internet no pueden chocar porque el prefijo las separa. El contador toma el mayor usado + 1 y no su propio valor anterior — la lección que dejó la numeración fiscal.

#### El remito mueve el stock

Confirmado con Lucas el 04/09: **a veces la mercadería sale con remito antes de que la venta esté cobrada.** Eso rompió el supuesto que tenía el sistema, que era uno solo y cómodo.

> **La regla:** el stock sigue al hecho físico, no al comercial. Sale cuando sale la mercadería, y **una sola vez**.

- El remito descarga stock **sólo si la venta todavía no lo descargó**. El caso de todos los días en Gross —cobran y después reparten— no cambia en nada.
- **`cobrar_venta()` ya no descuenta a ciegas: reconcilia.** Compara lo vendido contra lo que ya salió por remito. Si el remito llevó 3 bolsas y el cliente se quedó con 2, la que volvió en la camioneta reingresa sola.
- **`anular_venta()` dejó de mirar el estado y mira el libro de movimientos.** Antes sólo reingresaba si la venta estaba cobrada; con remitos eso dejaba mercadería afuera para siempre.

"Lo remitido" se lee del libro y no de las líneas del remito, y eso importa: un remito anulado tiene su salida y su retorno anotados, el neto da cero, y la cuenta lo toma bien sin saber nada de estados.

**La propiedad que hizo seguro tocar `cobrar_venta()`:** sin remitos de por medio, la reconciliación da exactamente lo mismo que la resta anterior. Una venta común se cobra igual que antes. *(Única diferencia visible en el libro: antes un movimiento por línea de venta, ahora uno por producto. El saldo es idéntico.)*

⚠️ **Falta la pantalla.** La base reconcilia sola, pero hoy no hay dónde emitir un remito ni dónde corregir la venta al volver el reparto.

#### La caja elige antes de cobrar

Selector **Con factura / Sin factura** al lado del botón de cobrar. Tres candados, **todos del lado del servidor**, donde un navegador con la consola abierta no llega:

1. **Permiso propio** `facturacion.vender_sin_factura`, que no tienen ni el Cajero ni el Vendedor. Emitir un presupuesto o un remito es operación diaria; decidir que una venta no lleve factura es del dueño.
2. **A un Responsable Inscripto no se le entrega otra cosa.** Compra para descargar el IVA; darle un interno es un problema para el cliente. La base lo rechaza por nombre y motivo.
3. **Sólo antes de cobrar.** Cambiar la marca después sería decir que pasó algo distinto de lo que efectivamente pasó.

**El panel rojo dejó de mentir.** `ventasSinFacturar()` filtra `documentacion = 'fiscal'`. Sin eso, el panel de "cobradas sin comprobante" —que existe para el caso grave— se llenaría de casos normales y en dos semanas nadie lo mira.

⚠️ **Sin conexión sólo se cobra con factura**, y si internet se corta con "sin factura" ya elegido vuelve solo a "con factura". Marcar la venta necesita servidor, y sin esa vuelta atrás fallaría **el cobro entero**, no la marca. Prefiere cobrar de más con factura que no cobrar. Se levanta con la emisión sin conexión.

#### Verificado contra la base real

En transacciones que se revierten, confirmando después que no quedó ni una fila:

- Venta común sin remitos: se cobra igual que antes.
- Remito antes de cobrar descuenta; cobrar después **no vuelve a descontar**.
- Remito de 5 con la venta corregida a 3: neto −3, con su `retorno_remito`.
- Anular una venta `en_caja` con remito devuelve el stock entero.
- Cobrar y después remitir no mueve nada.
- Los tres candados de la caja, simulando sesiones reales con `request.jwt.claims`.
- El panel rojo incluye la fiscal sin facturar y excluye la no fiscal.

**Roto a propósito:** con el bloque de stock anterior salen **8 unidades por una venta de 4**. El doble descuento era real y la prueba lo detecta.

**Encontrado probando:** `emitir_comprobante_no_fiscal()` descartaba en silencio los parámetros ajenos al tipo — una fecha de validez en un remito se perdía sin error. Corregido en la migración `20260904100200`.

✅ **Verificado con sesión iniciada el 04/09**, de punta a punta:

- El selector aparece y arranca en "Con factura". **No aparece** con un Responsable Inscripto; **sí aparece** con un Monotributo, que es lo correcto — a un monotributista le corresponde B y no hay obligación de A.
- Cobrado sin factura: el botón cambia a "Cobrar sin factura", sale el aviso gris con el número, y el registro queda con `documentacion = 'no_fiscal'` y el nombre de quien lo hizo.
- El ticket y la hoja A4 salen con datos reales, con la leyenda arriba y abajo, sin CAE ni QR ni discriminación de IVA.
- El panel rojo **no** lista esa venta — y se verificó que sea por la razón correcta, no porque la consulta esté rota.
- Remito sobre una venta sin cobrar: domicilio, localidad y contacto se precargan del cliente, aparece el aviso de descuento de stock, y el stock **se descuenta de verdad**.

Quedan en la base un comprobante interno y un remito reales, que sirven para mostrarle el circuito a Lucas.

---

### 🟡 2. Cobro sin conexión — construido y probado, falta verlo en el local

**El criterio:** no se reescribió `cobrar_venta()` en JavaScript. Dos implementaciones de la misma regla en dos lenguajes se separan con el tiempo, y el día que se separen nadie sabe cuál tiene razón. Se partió en dos mitades:

- **Validar acá**: las mismas cuatro condiciones que el servidor (pagos que sumen el total con un centavo de tolerancia, cuenta corriente habilitada, límite de crédito). Un cobro que el servidor va a rechazar se frena en el mostrador y no tres horas después con el cliente en la casa.
- **Escribir allá**: los pagos y la llamada a `cobrar_venta()` van a la bandeja de salida, en ese orden y en el mismo lote. El servidor sigue siendo la única autoridad.

Lo local es un adelanto de lo que va a pasar, no la verdad: la venta sale de la cola, se descuenta el stock y sube la deuda para que el mostrador vea números coherentes, y cuando baja el dato real lo pisa sin drama.

**Qué necesita internet igual, a propósito:** *abrir* y *cerrar* la caja. El cierre además exige que no queden operaciones sin subir — arquear con la mitad de las ventas sin registrar produce una diferencia que no existe y que después alguien tiene que explicar.

**Cubierto por pruebas automáticas** (`npm --prefix app run prueba`): validaciones, orden de la bandeja de salida, idempotencia, descuento de stock, y que volver de la lista Tarjeta a Contado no acumule recargos. Incluido el peor error posible —que al volver la conexión reaparezca una venta ya cobrada— cubierto por `conciliarCola()`, que es una función pura justamente para poder probarla.

Las pruebas se verificaron rompiendo el código a propósito: sacar la validación del límite de crédito, no descontar el stock, recalcular desde el último precio en vez del acordado, y hacer que la sincronización resucite una venta cobrada. Las cuatro roturas fueron detectadas.

⚠️ **Sin verificar en el local.** La prueba fue de la lógica, no de la experiencia: nadie cortó internet en una máquina real y cobró. Es el punto 3 de la definición de terminado y hay que hacerlo con las PC de Gross.

### 🔴 2b. Las terminales son islas cuando se corta internet

Descubierto el 21/08 al construir lo anterior. **Las 4 PC sólo se hablan a través de Supabase**: no hay sincronización por red local. Consecuencia operativa:

- Si se corta internet, una venta armada por un vendedor **no tiene camino para llegar a la caja** hasta que vuelva la conexión.
- La caja puede cobrar lo que alcanzó a bajar antes del corte (se sincroniza cada 60 segundos) y lo que ella misma arme.

**No es un bug, es la arquitectura** — pero cambia lo que significa "el mostrador sigue funcionando sin internet".

✅ **Decidido el 21/08: la sincronización por red local entra a V1**, no queda para V2. El razonamiento del usuario: lo comprometido con el cliente es que el mostrador siga funcionando sin internet, y sin esto se cumple a medias. Va **al final de V1**, después de todo lo demás, porque es lo único que puede esperar sin bloquear el corte del 26 de octubre. Incorporado al alcance como punto 2-bis en [`alcance-v1.md`](alcance-v1.md).

### ✅ 2c. La red del local — la venta llega a la caja sin internet (10/09)

El punto 2-bis del alcance, entero: el camino y la venta viajando por él. ⚠️ **Falta probarlo con dos máquinas de verdad**, que es algo que sólo se puede hacer en el local.

**La decisión de fondo, que ya está en [[10 · Las decisiones que no se revisan]]:** una terminal escucha —la de la caja— y las demás le hablan. No es una red de pares. El negocio ya tiene un lugar donde todo converge.

**Qué quedó construido** ([`red_local.rs`](../../app/src-tauri/src/red_local.rs)):

- La terminal de la caja **abre un punto de encuentro** en el puerto 8737 y avisa a la ventana cada vez que le llega algo.
- Las demás **le hablan**: una línea de JSON va, una línea de JSON vuelve.
- **No es HTTP a propósito.** Los dos extremos son nuestros y el mensaje es uno solo por conexión. HTTP traería encabezados, keep-alive y codificación por trozos para no usar nada de eso, y cada una de esas cosas es una forma de equivocarse.
- **Hay una clave compartida.** El local puede tener wifi para clientes; cualquiera parado en la vereda no tiene por qué poder mandarle ventas a la caja. La clave viaja sola con el resto de la configuración cuando la terminal sincroniza, así que no hay nada que configurar a mano.
- El puerto **no se configura**: un puerto configurable es un campo más que puede quedar distinto en una de las cuatro máquinas, y el síntoma sería "a veces no llega la venta".

**Probado de punta a punta, con un punto de encuentro de verdad levantado en la prueba:** contesta que está, las operaciones llegan enteras —y los importes llegan como números, no como texto, que es como se pierde un centavo—, rechaza a quien no sabe la clave **y además no le entrega nada**, y cuando la caja está apagada lo dice en castellano diciendo qué mirar. Las cuatro se rompieron a propósito para ver que fallan.

✅ **La otra mitad, hecha el mismo día.** El mostrador le entrega a la caja lo que todavía no pudo subir; la caja lo guarda, le muestra la venta al cajero y lo pone en su propia cola para subirlo. **Las dos lo suben**, y es a propósito: si la máquina del mostrador no vuelve a encenderse, la venta sube igual desde la caja. La segunda copia choca contra la clave primaria y se descarta sola.

**Nadie configura una dirección IP.** La terminal que escucha publica sola el nombre que tiene esa computadora en Windows, y las demás la buscan por ese nombre. Una IP la reparte el router y cambia; el nombre no. Y en el local los nombres ya se resuelven entre máquinas — la impresora compartida se llama justamente «POS80 Printer(2) en DESKTOP-O4R9STD».

**Dos reglas de las que se equivocan en silencio, probadas aparte** ([`lib/local/red.ts`](../../app/src/lib/local/red.ts)):

- **Una venta que esta caja ya cobró no se resucita.** El mostrador reenvía sus operaciones —para él siguen pendientes hasta llegar al servidor— y traerla de vuelta la pondría otra vez en la pantalla del cajero, con la plata ya cobrada. Es el mismo peligro que ya tenía la cola y la misma respuesta.
- **Lo que no viene a cobrarse no aparece en la cola de la caja**, pero viaja igual para subir. Un presupuesto o un remito no son algo que el cajero tenga que cobrar.

**En Configuración hay una sección para el día de la instalación**: quién escucha, con qué nombre se la encuentra, si está escuchando ahora, y un botón para probar la conexión desde un mostrador.

⚠️ **Y un detalle de instalación que hay que saber antes de ir:** la primera vez que la caja abra el punto de encuentro, **Windows va a preguntar si permite que el programa se comunique en redes privadas**. Hay que decir que sí. Es una sola vez y sólo en la máquina de la caja.

### ✅ 3b. Toma de inventario por sectores — hecha (24/08)

Pantalla **Inventario**. Se abre una toma por sector, se cuenta escaneando (el foco vuelve solo al buscador después de cada Enter, que sobre 3.000 productos es lo que hace la diferencia), y al cerrar se generan los ajustes de stock.

**Se corrigió un error que estaba en `cerrar_inventario()` desde la migración de stock.** Calculaba el ajuste contra el saldo del momento del cierre, lo que borraba las ventas ocurridas mientras se contaba:

> Se cuentan 10 a las 10:00 (el sistema decía 12). A las 11:00 se vende 1 → el sistema queda en 11. Al cerrar a las 12:00 se forzaba a 10. Pero físicamente quedan 9.

La unidad vendida reaparecía en el stock y se descubría en el conteo siguiente, cuando ya nadie se acuerda. Ahora el ajuste usa la diferencia detectada **al contar** (`contada - cantidad_sistema`), y el resultado da 9. Verificado con ese escenario exacto contra la base. Importa porque Gross va a contar con el local abierto, como se acordó en el alcance.

Otras decisiones: recontar un producto pisa el conteo anterior en vez de sumar una línea (dos líneas harían un ajuste del doble), no se puede contar sobre una toma cerrada, y las diferencias se muestran valorizadas al costo para saber cuánto representa el faltante.

### ⚠️ Trampa: la numeración se separa de ARCA apenas falla un pedido

Descubierto el 24/08 probando desde el navegador. Síntoma: *"ARCA rechazó el comprobante"*, código **10016** — *"el número o fecha del comprobante no se corresponde con el próximo a autorizar"*.

**Por qué pasa.** `preparar_comprobante()` reserva el número al armar el comprobante, pero el CAE se pide después y puede fallar. Si se arman los comprobantes 2, 3 y 4 y se pide primero el CAE del 4, ARCA esperaba el 2 y lo rechaza. A partir de ahí los dos contadores quedan separados y **todo lo que sigue se rechaza en cadena**.

**La solución.** Antes de cada pedido se consulta `FECompUltimoAutorizado` y se usa ese número + 1 — es literalmente lo que dice el mensaje de error de ARCA. La numeración se corrige sola después de cualquier rechazo. Al comprobante que ocupaba ese número se lo corre al final, no se lo anula: sigue esperando su turno.

Además: el índice único de numeración ahora **excluye los anulados**. Un comprobante sin CAE no existe para el fisco, así que su número se puede reutilizar; antes lo bloqueaba para siempre.

**Y la fecha.** Una venta de hace once días no se puede facturar con su fecha: ARCA acepta hasta 5 días de diferencia. Ahora se corrige a la fecha de emisión, que es la única que ARCA toma.

**Y el contador local tiene que mirar la realidad.** El primer arreglo destapó un segundo: `siguiente_numero_comprobante()` sólo le sumaba uno a su propio valor, sin mirar qué números existían. Como la alineación mueve números —es su trabajo—, el contador quedaba atrás y entregaba uno ocupado: *"duplicate key value violates unique constraint"*. Ahora toma el mayor entre su valor y el último número realmente usado, así no puede entregar uno ocupado sin importar cómo haya quedado la numeración.

> **Lección de fondo:** con ARCA no alcanza con llevar bien la numeración propia. Hay que preguntarle a ARCA cuál es la suya antes de cada emisión, y ningún contador puede confiar sólo en sí mismo.

### ⚠️ Trampa: ARCA informa los rechazos en dos lugares

`<Obs>` va adentro del detalle del comprobante, `<Err>` en un bloque `<Errors>` aparte. Los rechazos por numeración usan el segundo. Como sólo se leía el primero, el comprobante quedaba "rechazado" **sin ningún motivo** y no había forma de saber qué corregir. Ahora se leen los dos.

### ✅ 1g. El CAEA se pide y se rinde solo (03/09)

El contador lo pidió por escrito el 01/09: ARCA quiere un lote de CAEAs pedido por adelantado todos los meses, y quiere que se informe lo que se usó **y lo que no**. Si no se informa, no vuelve a habilitar CAEAs.

Hasta ahora las tres cosas dependían de que alguien apretara un botón, y eso no sirve para una obligación: un CAEA que nadie pidió es exactamente igual a no tener contingencia, y una fecha tope puede caer un domingo.

**Ahora hay una tarea diaria** (`pg_cron`, todos los días a las 9 de Misiones) que:

1. Pide los CAEA que falten y que ARCA aceptaría hoy
2. Informa todo lo emitido con CAEA, apenas se puede — no cerca del vencimiento
3. Avisa "sin movimiento" los CAEA que terminaron sin usarse

**La decisión vive en la base y la ejecución en la Edge Function.** La base es la que tiene el estado; la Edge Function es la que tiene el certificado. Ninguna hace el trabajo de la otra.

**Cómo se identifica la tarea.** No es una persona: no tiene sesión ni permisos. Se identifica con un secreto que vive cifrado en el Vault de Supabase y que sólo la Edge Function puede leer. La comparación es en tiempo constante, para que el tiempo de respuesta no vaya delatando el secreto de a un carácter.

### ✅ ARCA otorgó un CAEA de verdad (03/09)

Corriendo la tarea a mano, ARCA devolvió el **CAEA 86360849219971**, vigente del 01/09 al 15/09, con fecha tope de informe el 20/09.

Esto es distinto de lo que pasaba el 24/08, cuando rechazaba con el 15003 por falta de punto de venta del régimen CAEA. **El pedido ahora funciona sin ese alta**; lo que sigue necesitándolo es emitir y rendir.

### ⚠️ Trampa: la rendición también exige numeración sin huecos

Probando la rendición contra ARCA por primera vez, contestó:

> **703** — El numero de comprobante informado debe ser mayor en 1 al ultimo informado para igual punto de venta y tipo de comprobante.

Dos cosas importantes salen de ahí:

**La buena:** ARCA *parseó* el XML del `FECAEARegInformativo` y lo rechazó por una regla de negocio, no por formato. El armado del XML —que nunca había sido validado por ARCA— está bien.

**La que hay que resolver:** un comprobante emitido con CAEA **ya se le entregó al cliente con su número impreso**. No se puede renumerar después, como sí se hace con los que esperan CAE. O sea que el número tiene que estar bien *en el momento de emitir*, sin poder consultarle nada a ARCA porque justamente está caída.

Hoy `app.siguiente_numero_comprobante()` toma el mayor número usado + 1, así que no deja huecos. Pero hay un caso que sí los deja: **un comprobante que reservó número y terminó anulado**. Si el 13 queda anulado y el 14 sale con CAEA, ARCA espera el 13 y nunca va a aceptar el 14.

✅ **Resuelto el 03/09:** antes de rendir, la Edge Function compara contra `FECompUltimoAutorizado` y, si hay un hueco, no manda nada y lo dice con un mensaje claro, en vez de reintentar un 703 todos los días sin que nadie entienda por qué. *(Acá figuraba como pendiente hasta el 16/09; el código ya estaba publicado.)*

### ⚠️ Trampa: homologación no ve los puntos de venta reales

Con el punto de venta 9 ya dado de alta en ARCA (11/09) y cargado en el sistema (16/09), homologación rechazó el aviso de «sin movimiento»:

> **1204** — El PtoVta debe corresponder a un punto de venta CAEA

Preguntado con `FEParamGetPtosVenta` —la Edge Function lo hace con `accion: 'puntos_venta'`—, contestó **602 — Sin Resultados**: para el CUIT de Gross, homologación no tiene **ningún** punto de venta, ni el 9 ni el 1. El alta se hace en la ARCA real y el ambiente de pruebas no la recibe.

Con el CAE no se nota porque en homologación no controla el punto de venta. Con el CAEA sí lo controla, así que **el aviso de «sin movimiento» y el informativo sólo se pueden verificar en producción**. No tiene arreglo de nuestro lado.

**Y dejó a la vista un error que sí era nuestro:** el paso 3 de `app.mantenimiento_caea()` buscaba los CAEA sin informar **sin mirar el ambiente**. El día del cambio a producción, los CAEA de pruebas que homologación nunca aceptó habrían seguido en la lista, y la tarea le habría mandado a la ARCA real, todos los días, códigos que la ARCA real nunca otorgó. Corregido en `20260916170000_el_caea_no_mezcla_ambientes.sql`. Verificado con la consulta vieja contra la nueva: con el ambiente en `produccion`, la vieja agarraba el CAEA de pruebas y la nueva no agarra ninguno.

🟡 **Queda uno igual, sólo de pantalla:** `vista_caea_estado` tampoco filtra por ambiente, así que en la quincena del cambio el panel mostraría dos CAEA vigentes. Emitir no se confunde —`caea_vigente()` sí filtra—. No se tocó el 16/09 porque en homologación la vista da exactamente lo mismo; está en la lista de antes del cambio.

### ⚠️ Trampa: el CAEA no cuelga del punto de venta normal

Probando el pedido contra ARCA el 24/08, contestó:

> **15003** — Campo CUIT debera poseer al menos un punto de venta activo correspondiente al regimen CAEA

El CAEA no es una modalidad del punto de venta que ya está habilitado para Web Service: ARCA lo trata como un régimen aparte y exige que el CUIT tenga dado de alta al menos un punto de venta bajo él. Es un trámite en el portal de ARCA, no algo que se resuelva con código, y **habría aparecido recién el día del primer corte real** si no se lo hubiera probado antes.

Por eso `punto_venta` tiene ahora `regimen_caea`, y la contingencia emite en ese punto de venta con su propia numeración.

De la misma prueba salió la ventana exacta para pedirlo, que ARCA informa en el error 15006: **desde 5 días corridos antes del inicio de la quincena hasta el último día de la quincena**. Para la quincena que arranca el 1/9, se puede pedir desde el **27/08**.

### ⚠️ Trampa: mientras un lote de CAEA no está informado, ARCA no lo ve

`FECompUltimoAutorizado` devuelve el número anterior al corte, porque los comprobantes emitidos con CAEA todavía no le fueron informados. Alinear contra ese número le asigna al siguiente comprobante un número que ya está usado.

La serie es **una sola** por punto de venta y tipo, la compartan CAE y CAEA. `alinear_numeracion_comprobante` toma ahora el mayor entre lo que dice ARCA y el mayor número emitido con CAEA. Verificado: con ARCA diciendo 12 y un comprobante de CAEA en el 13, el siguiente toma el 14.

### ⚠️ Trampa: dar de alta un usuario no le daba acceso

Aparecido el 28/08 con la cuenta de Lucas. Iniciar sesión y ser usuario del sistema son dos cosas distintas —`auth.users` y `public.usuario`— y se unen por `usuario.auth_user_id`.

La pantalla de Usuarios nunca completaba ese campo, y **no puede**: cuando das de alta a alguien, esa persona todavía no inició sesión nunca. La única forma de unirlas era una función que sólo corre desde el editor SQL. Resultado: cada persona dada de alta chocaba contra *"tu cuenta no está vinculada a ningún usuario del sistema"*.

Ahora se vinculan solas en el primer ingreso, que es el único momento en que las dos puntas existen a la vez. La base exige correo confirmado y que ese usuario no tenga ya otra cuenta.

⚠️ **Esto convierte al correo en la llave del alta**, así que el registro público en Supabase (Authentication → Providers → *Allow new users to sign up*) tiene que quedar **apagado**.

De paso se corrigió `app.vincular_usuario()`, que buscaba sólo por `auth_user_id` y por lo tanto creaba un **segundo** usuario cuando ya existía uno con ese correo sin vincular.

### ⚠️ Trampa: las Edge Functions necesitan CORS

Descubierto el 24/08 en la primera prueba desde el navegador. Las funciones andaban perfecto por consola y fallaban desde la aplicación con *"Failed to send a request to the Edge Function"* — un mensaje que no dice nada de la causa.

El navegador manda un `OPTIONS` antes del `POST` preguntando si tiene permiso. Si nadie le contesta, bloquea la llamada. **Toda Edge Function nueva tiene que manejar `OPTIONS` y devolver las cabeceras de CORS en todas sus respuestas**, incluidas las de error — si el error no las lleva, el navegador tampoco puede leer el mensaje.

Probarlas con `curl` no alcanza: curl no hace CORS.

### 🟡 Impresión: hoy es a un clic, no automática

Al cobrar se emite la factura sola y aparece un aviso con el CAE y el botón **Imprimir comprobante**, que abre el comprobante en otra pestaña. No se abre solo porque el navegador bloquea las ventanas que no abrió una persona.

Cuando esté la Hasar conectada por Tauri, ese paso desaparece: imprime directo.

### ✅ 2c. Las métricas de venta en Inicio (10/09)

Lo último visible que le faltaba a V1-A. Al abrir el sistema, arriba de todo: cuánto se vendió **hoy**, en los **últimos 7 días** y en el **mes en curso**, **lo más vendido** del mes y **cuánto vendió cada uno**. Antes había que entrar a Facturación y sumar a ojo.

**Sale de una sola función** ([`metricas_de_venta`](../../supabase/migrations/20260910100000_metricas_de_venta_en_inicio.sql)) y no de cinco consultas: Inicio es la primera pantalla que se abre, varias veces por día y en cuatro máquinas.

**Las tres decisiones que definen si el número está bien:**

- **El día es el de Oberá, no el del servidor.** La base guarda los momentos en UTC y el servidor vive en UTC. Sin convertir, todo lo cobrado después de las 21:00 contaría como del día siguiente: el cajero cierra la caja y las ventas de la última hora ya figuran en el total de mañana. **Verificado contra la base real:** preguntando a las 22:00 del 8 de septiembre, la versión ingenua en UTC devuelve 0 ventas y la buena devuelve las 2 que hubo. Lo mismo con el mes: a las 22:00 del 31 de agosto, el mes en curso sigue siendo agosto.
- **Sólo cuentan las cobradas, por el momento en que se cobraron.** Un borrador o una venta esperando en la caja todavía no es plata, y una anulada dejó de serlo. Es el mismo criterio con el que el mostrador contesta "¿cuánto hicimos hoy?".
- **Cada uno ve lo suyo.** La función es `security invoker`, así que las mismas políticas que gobiernan la tabla de ventas gobiernan estos números: quien no tiene `ventas.ver_todas` recibe únicamente las suyas. Por eso la respuesta dice **con qué alcance se calculó** y el título cambia a *"Tus ventas"*. Un número propio presentado como si fuera el del local no es un número incompleto: es uno equivocado, y nadie tendría forma de notarlo.

**Detalles que se ven poco y se notan:** las etiquetas dicen *"últimos 7 días"* y no *"esta semana"*, porque el lunes a la mañana son dos cosas muy distintas; un día sin ventas se lee "sin ventas todavía" y no un cero suelto; y *"lo más vendido"* se agrupa por la foto de texto de la línea, así que también cuentan las líneas escritas a mano, que son ventas igual.

**Verificado contra la base real (10/09):** los tres períodos, los más vendidos y el total por vendedor cuadran con las 26 ventas cobradas que hay cargadas — la suma por vendedor da exactamente el total del mes. Seis pruebas nuevas cubren la parte que la base no puede cubrir: de quién son los números y cómo se leen. Se rompieron a propósito para ver que fallan.

De paso se sacó de Inicio la tarjeta *"Estado del proyecto"*, que era de la primera semana y seguía diciendo que faltaban el punto de venta y la conexión con ARCA.

### ✅ Coherencia visual y menú achicable (10/09)

**Los botones tenían dos familias sin querer.** Las mismas clases estaban copiadas a mano en más de cuarenta lugares y tres se habían desviado: *Nuevo producto* tenía el magenta invertido respecto de los otros treinta y nueve, y *Importar planilla* y *Dados de baja* usaban el gris de Tailwind (`slate`, azulado) en vez del de la identidad de Gross (`piedra`, sacado del `#d1e2e8` de la marca, que tira a verde). Puestos al lado del resto se leían como menos importantes de lo que son — que fue exactamente lo que se notó al mirarlos.

Ahora hay un solo lugar donde están definidos ([`estilos.ts`](../../app/src/estilos.ts)), con la jerarquía escrita: principal, secundario, suave y peligro. Las tres pantallas que usaban `slate` pasaron al gris de la marca, y la barra de avance dejó de ser un magenta más claro que el botón principal: van del mismo color porque dicen lo mismo.

**El menú se achica a sólo íconos**, con un botón abajo de todo. La decisión se guarda **en la computadora y no en el usuario**: la PC de la caja tiene un monitor chico y necesita el espacio para la venta; la de la oficina no. Achicado, el nombre de cada sección aparece al pasar el mouse — sin eso habría que aprenderse quince íconos.

### ✅ 12a. Las percepciones de IIBB, para Rentas (10/09)

Segundo archivo en **Facturación → Ventas para el contador**: el detalle de lo percibido en el mes, una fila por percepción con el CUIT del cliente, la base, la alícuota y el importe.

**Salió de una pregunta que se contestó sola con lo que ya estaba escrito.** Francisco preguntó si Gross usa las pantallas de *retención de IIBB* de OBTech: no sabía, pero sí sabía que **lo necesitan para el contador** y que hoy es manual.

**No son retenciones.** El contador confirmó por escrito —y está en la nota regulatoria— que Gross es **agente de percepción** de IIBB en Misiones, **régimen 14** (RG DGR 012/93), número de agente = su CUIT, alícuota 3,31%. **No es agente de retención**, así que no practica retenciones ni emite comprobantes de retención. Lo que sí presenta todos los meses es el detalle de lo percibido.

> Construir "comprobantes de retención" porque la pantalla de OBTech se llama así habría sido construir lo que no es. Son dos regímenes que se parecen en el nombre y en nada más.

**No hizo falta tocar la base:** `comprobante_tributo` guarda cada percepción con su base y su alícuota desde agosto, y el comprobante tiene el CUIT, la fecha y el número.

**Por qué es un archivo aparte y no una columna más:** el de ventas lleva la percepción como un total por comprobante, que es lo que un libro de IVA necesita. Rentas pide otra cosa — una fila por percepción, con la base sobre la que se calculó y a quién se le hizo.

**La regla que se probó aparte, porque se equivoca en silencio:** la nota de crédito **devuelve** la percepción y por lo tanto resta. La base guarda los importes siempre positivos y el signo lo pone el tipo de comprobante. Si no se aplicara, la declaración diría que se percibió el doble — y esa diferencia se paga.

> La primera versión de esa prueba no servía: armaba las filas a mano con importes ya negativos, así que probaba la suma y no la regla. Se sacó la regla a una función aparte y recién ahí la prueba empezó a fallar cuando se rompe el signo a propósito.

⚠️ **Falta confirmar el formato, no el contenido.** Se entrega en Excel, igual que el de ventas, porque la presentación la hace el contador. El archivo oficial de la aplicación de Rentas no se produce: hacerlo sin tenerlo confirmado sería adivinar un ancho de campo.

### ✅ 11a. La factura de compra (10/09)

Pantalla **Compras**, entre Proveedores y Ventas. Se carga la cabecera de la factura que emitió el proveedor: quién, cuál, cuándo, el **desglose por alícuota de IVA** y las percepciones. **Sin líneas de producto.**

**Por qué subió a V1-A**, decidido el 10/09: el 26/10 Gross deja OBTech, que es donde carga sus facturas de compra hoy. Sin esto, desde ese día no hay dónde registrarlas — y las compras siguen entrando igual.

⚠️ **El otro argumento no vale y no hay que volver a usarlo.** No es que el contador necesite estas facturas para el IVA: las baja de *Mis Comprobantes* de ARCA. Se corrigió el 09/09 en [`compras-e-iva.md`](../compras-e-iva.md) y quedó escrito arriba de la migración, porque es de las cosas que vuelven.

**Las tablas no se inventaron.** `compra`, `compra_alicuota` y `compra_tributo` son el espejo de `comprobante`, `comprobante_alicuota` y `comprobante_tributo`, que ya funcionan y ya pasaron por ARCA. Donde allá hay receptor, acá hay proveedor.

**Las decisiones que se ven poco:**

- **El total no se carga: es la suma.** Es una columna generada, y los subtotales los mantienen disparadores desde el detalle — el mismo mecanismo que mantiene los totales de una venta desde sus líneas. Así la cabecera **no puede** discrepar con su propio detalle. La pantalla calcula el mismo número mientras se carga, para compararlo con el papel antes de guardar: es la única comprobación que hace la persona.
- **El IVA se sugiere, no se impone.** Al escribir el neto se completa solo, y se puede corregir. Manda el papel: una factura real trae un peso de diferencia por redondeo, y si el sistema insistiera con su cuenta, el total no cerraría con el del proveedor.
- **La misma factura no entra dos veces** (proveedor + tipo + punto de venta + número), y el aviso dice cuál: quien la está cargando tiene el papel en la mano y necesita saber si es esa misma.
- **Todo en una transacción.** Cabecera, alícuotas y percepciones se guardan con una sola llamada (`registrar_compra`). En tres viajes, un corte en el segundo dejaría una factura cargada con cero de IVA, y eso no se nota mirando la lista.
- **La Factura C se puede cargar aunque esté marcada como inactiva.** El `activo` de `tipo_comprobante` significa *"de los que Gross emite"*, y una compra es la dirección contraria: Gross no emite C —es responsable inscripto— pero la recibe de cualquier proveedor monotributista. Filtrar por `activo` habría dejado esas facturas sin poder cargarse.
- **Baja lógica con motivo**, como todo lo que documenta plata. La factura deja de contar pero no desaparece.
- Los permisos ya existían desde el primer día: `compras.ver` y `compras.registrar`, en Administrador y Encargado. No hubo que crear ninguno.

**Verificado de punta a punta el 10/09**, contra la base real y con la pantalla abierta: se cargó una Factura A 0003-00045678 de Bagó por $100.000 + $21.000 de IVA, el IVA se autocompletó al escribir el neto, el total dio $121.000 antes de guardar, y quedó en la base con esos mismos números y con el usuario que la cargó. La factura de prueba se borró después. También se comprobó que la misma factura dos veces se rechaza con su mensaje, y que un importe imposible **deshace todo** en vez de dejar la cabecera sin detalle.

> **Un hallazgo de usarlo:** ese último caso mostraba en pantalla *"numeric field overflow"*. Ahora los errores del sistema pasan por [`lib/errores.ts`](../../app/src/lib/errores.ts), que los dice en castellano y con qué hacer. Es la misma familia del *"tauri localhost dice"* que Lucas marcó el 07/09.

### ✅ 3c. Los depósitos: reservados y administrables (10/09)

**Cada movimiento del libro de stock dice en qué depósito ocurrió** ([migración](../../supabase/migrations/20260910110000_reservar_el_concepto_de_deposito.sql)), y hay una sección en **Configuración → Depósitos** para darlos de alta, renombrarlos, elegir el principal y darlos de baja ([migración](../../supabase/migrations/20260910140000_administrar_depositos.sql)).

**El módulo sigue en V1-B**: mover mercadería entre depósitos y ver el stock separado por depósito. Poder nombrarlos no es lo mismo que poder mover entre ellos, y la propia pantalla lo dice para que no se busque.

**El dato que ordenó todo esto llegó el 10/09.** Hoy Gross tiene **un** depósito y en breve son **dos**, cuando abra el segundo local. Los cinco de OBTech **no son referencia** —pueden ser los que ese sistema trae de fábrica—, así que la primera versión de esta nota, que se apoyaba en ellos, quedó corregida. La conclusión no cambia; el argumento sí: se reserva por el segundo local, no por los cinco.

**Por qué reservar antes del módulo.** El libro de movimientos es inmutable y es la verdad del stock — el saldo es una foto derivada que se reconstruye de cero cuando haga falta. Por eso alcanza con reservar el concepto **en el libro**: lo que se escriba de acá en adelante ya sabe dónde pasó. Un movimiento escrito hoy sin depósito es uno al que hay que inventarle uno el día que abra el segundo local.

**El principal no se puede desactivar, y lo impide la base.** Sin principal, el disparador que completa los movimientos empieza a rechazar toda venta, con un error que no menciona depósitos por ningún lado. Para dar de baja uno, primero se elige otro. Y cambiar cuál es el principal va por una sola función (`marcar_deposito_principal`): son dos escrituras —apagar el anterior, prender el nuevo— y en dos viajes, un corte en el medio deja al local sin principal.

**Qué no cambió: nada de lo que se ve.** El saldo se sigue calculando sumando todos los movimientos del producto, sin separar por depósito. `stock_saldo`, su disparador y `vista_stock` quedaron intactos. Y ninguno de los dieciséis lugares que escriben en el libro tuvo que enterarse de la columna nueva: **si el movimiento llega sin depósito, un disparador le pone el principal**. Ahí estaba el riesgo real de esta migración —tocar los caminos que hoy andan— y se evitó entero.

**El fraccionamiento no se copió como depósito.** En OBTech, abrir una bolsa para vender suelto se registra como una transferencia al depósito "FRACCIONAMIENTO". Acá eso ya existe como lo que es: un tipo de movimiento (`apertura`). Queda anotado porque al migrar los datos de OBTech hay que saber que ese "depósito" no es un lugar.

**Verificado contra la base real, y lo que importaba era no romper:**

- Las 61 filas del histórico quedaron con su depósito, y la columna pasó a ser obligatoria recién después del relleno.
- Los 28 saldos siguen cuadrando **exactamente** con la suma del libro.
- Un movimiento nuevo insertado como los inserta hoy el sistema —sin decir depósito— recibe el principal.
- **El libro sigue siendo inmutable.** El relleno obligó a apagar ese disparador por el rato exacto que duró, y se comprobó después que volvió a estar encendido: una edición de un movimiento vuelve a ser rechazada con su mensaje de siempre.
- Sin depósito principal, un movimiento **falla ruidoso** en vez de entrar sin depósito. Se probó dejando el principal en falso a propósito: un libro a medias es peor que una operación que no se completa, porque el agujero aparece meses después.

### 🟡 3. Pantallas que faltan
Reportes. *(El panel de comprobantes con semáforo, la configuración general, el inventario por sectores y las métricas de Inicio ya están hechos.)*

### ✅ 4. Importador del Excel — hecho, esperando la planilla

Pantalla **Productos → Importar planilla** (`/productos/importar`). Acepta `.xlsx` y `.csv`.

**No hace falta que la planilla tenga un formato exacto.** El sistema propone a qué campo corresponde cada columna y la persona confirma con un desplegable, viendo un dato de ejemplo de cada una — porque los encabezados mienten: una columna que dice "Precio" puede tener el costo. Eso quita la dependencia de acordar un formato con Lucas de antemano.

Decisiones que importan:
- **Idempotente**: se reconoce por código, así que reimportar la misma planilla actualiza en vez de duplicar. La carga real es importar → mirar → corregir → reimportar.
- **Una celda vacía no borra lo que ya había.** Si la planilla no trae costo y alguien lo cargó a mano, se respeta. Lo contrario es irreversible.
- **No marca los productos como revisados.** Que un dato venga de una planilla no significa que alguien lo haya mirado; el avance del operativo sigue midiendo trabajo humano.
- **"Bagó" y "bago" son la misma marca.** Sin normalizar acentos y mayúsculas, el catálogo se llenaría de marcas repetidas desde el día uno.
- Valida antes de escribir y **muestra los errores con el número de fila de Excel**, para poder corregir con el archivo abierto al lado.
- Sube de a 200 filas con barra de avance: 3.000 en una sola llamada se corta por tiempo y nadie sabe qué entró.

**74 pruebas automáticas** cubren la lectura. La que más importa: `"12.500"` se lee como doce mil quinientos y no como doce con cinco — un precio mil veces más barato entrando al mostrador sin dar ningún error. **Ese error existía y lo encontró la prueba.**

⏳ Falta la planilla de Lucas. El importador ya está probado de punta a punta contra la base con un archivo desprolijo de ejemplo.

### ✅ 13a. La API de la tienda: leer el catálogo (18/09)

Primera pieza de V1-B, adelantada para que Zubu arranque la tienda en paralelo. Los dos caminos de lectura: productos con nombre público, precio, clasificaciones, stock con el colchón y la frescura. Los pedidos están abajo, en 13b. Para Zubu: [`api-tienda.md`](../api-tienda.md). El diseño se aprobó antes de construir, con una página propia.

**Cómo entra Zubu.** Con una clave atada al canal «Tienda online» (`clave_api`), que se guarda como huella SHA-256 y nunca en claro. **No es un usuario del sistema.** La puerta es la Edge Function `api-tienda` (`verify_jwt = false`, porque la clave no es un token de Supabase), y entra a la base con la **llave pública**, no con la de servicio: `anon` no lee ninguna tabla, y lo único que puede ejecutar son `api_tienda_catalogo` y `api_tienda_clasificaciones`. Si la puerta tuviera un error, no tiene con qué llegar a los costos. Sin CORS, a propósito: la clave tiene que vivir en el servidor de Zubu.

**Qué se publica: «Vender online» es la decisión, las condiciones son el control.** Nada sale hasta que se prende (`canal_producto.publicar`, ahora con el sentido de *sí, vender*). Prendido, sale sólo si está activo, tiene nombre público y precio mayor a cero. **Los fitosanitarios no salen** hasta que Gross lo decida: la ley XVI-144 de Misiones pide receta agronómica y la tienda no tiene cómo pedirla. La regla está en un solo lugar (`app.motivo_para_no_publicar`), que devuelve el *motivo* en palabras para que la ficha lo muestre tal cual.

**El precio sale de la lista que se elija para la tienda** (`canal.lista_precio_id`, arranca con Contado), con la misma cuenta que `calcular_precio`. Una lista elegida para un canal **no se puede dar de baja**: la tienda quedaría publicando con una lista que no existe.

**La lista de campos es cerrada**, escrita a mano en la función. Una prueba compara las claves de cada producto contra la lista: un campo nuevo no llega a la tienda sin que alguien lo decida.

**La marca de agua**, que es lo delicado. Zubu pide «lo que cambió desde la marca», y una fecha de modificación es el *comienzo* de la transacción que escribió, no su final. Sin cuidado, un precio que se está guardando mientras Zubu consulta queda con fecha anterior a la marca y **no llega nunca**. La marca que se devuelve es el comienzo de la transacción abierta más vieja (`app.marca_de_agua`, que lee `pg_stat_activity`), así que nunca pasa por delante de un guardado en curso. A cambio, a veces un producto llega dos veces.

**Cualquier cosa que cambie lo que ve la tienda le mueve la fecha al producto**: los animales, las etapas, los códigos de barra, el interruptor y el precio fijo en una lista no la movían. Se agregó con disparadores (`app.tocar_producto`). El único efecto sobre el local es que las terminales vuelven a bajar ese producto.

**La frescura no es la de Inicio.** Aquella toma la terminal más atrasada y una PC apagada la traba. La de la tienda: confiable si **alguna** terminal sincronizó dentro de la tolerancia y **ninguna** tiene un error de sincronización sin resolver. De noche dice «no confiable», y eso lo deciden Gross y Zubu.

**Cómo se verificó:**

- **64 comprobaciones contra la base real** ([`supabase/pruebas/api-tienda.sql`](../../supabase/pruebas/api-tienda.sql)), dentro de una transacción que se deshace sola.
- **30 pruebas de la puerta** en la suite de la app y **27 comprobaciones por internet** contra la función publicada ([`api-tienda-http.mjs`](../../supabase/pruebas/api-tienda-http.mjs)).
- **Se rompió a propósito de siete maneras y las siete fueron atrapadas.** En la base: el stock sin colchón, el costo en la respuesta, una clave anulada que entra y un producto apagado que sale. En la puerta: un límite sin tope y un pedido sin clave.
- **La séptima, la marca de agua, con dos sesiones a la vez.** Se guardó un cambio con la transacción abierta 25 segundos mientras la «tienda» consultaba. Con el código bien, la marca devuelta fue *exactamente* el comienzo de ese guardado y el cambio llegó en la consulta siguiente. Con la marca rota, el cambio **se perdió**.
- **Punto 16 de la definición de terminado:** una salida de stock en el local y la tienda pasó de ver 9 a ver 8 en la consulta siguiente. Se hizo con un ajuste de −1 y otro de +1 en DEMO-051, que quedan en su historial con el motivo.

### ✅ 13b. La API de la tienda: recibir pedidos (24/09)

Segunda pieza de V1-B. `POST /pedidos` por la misma puerta y con la misma clave: la tienda registra la compra y el sistema la convierte en una venta. Para Zubu: [`api-tienda.md`](../api-tienda.md).

**Entra por el camino del mostrador, no por uno propio.** `app.registrar_pedido_de_la_tienda` inserta `venta` + `venta_linea` —los totales los hace el disparador `venta_linea_totales`— y, si el pedido viene pagado, `venta_pago` y `public.cobrar_venta(venta, null, null)`, sin caja ni cajero porque no hubo ninguno. El descuento de stock, el IVA y la numeración salen del mismo código que usa la caja: **no hay una segunda manera de vender**.

**El medio de pago de la tienda** (`canal.medio_pago_id`) es «Tienda online», creado inactivo y con `afecta_caja = false`: no se ofrece en el mostrador y no entra al arqueo, porque esa plata no está en el cajón. Un disparador impide darlo de baja mientras un canal lo use.

**La idempotencia es el número del pedido de la tienda.** `pedido_tienda` tiene `unique (canal_id, numero_externo)`: si llega repetido, se devuelve la respuesta de la primera vez con `repetido: true`, sin crear otra venta. Un error habría dejado a la tienda sin saber si el pedido entró.

**Tres reglas de la base enseñaron el diseño**, y cada una salió de una prueba que falló:

- **`venta_linea_modificacion_justificada`**: una línea con un precio distinto del de lista exige quién lo cambió y por qué. En un pedido web no hay ningún quién, así que **el precio que informa la tienda es el precio de lista de la línea**; la diferencia contra el precio del sistema —si pasa `tienda.tolerancia_precio_porcentaje`, 5 por defecto— queda anotada en `pedido_tienda.revisar`.
- **`cliente_ri_requiere_cuit`**: quien se declara responsable inscripto pero manda un DNI entra como consumidor final y queda marcado. Perder el pedido de alguien que ya pagó sería peor.
- **`venta_pago_importe_check`**: un pago de cero no existe, así que un pedido pagado de total cero no registra cobro.

**Nada se rechaza por falta de stock**: el pedido entra marcado. Lo que sí se rechaza, con `PT400` y un nombre estable, es un pedido mal armado: sin número, sin productos, sin comprador, con una entrega que no existe, con un producto desconocido, con cantidades o precios inválidos. **Un rechazo no deja media venta**: la función corre en una sola transacción.

**La puerta.** `reglas.ts` acepta `POST` sólo en `/pedidos` y `GET` sólo en los otros dos caminos, y contesta el método que va en el encabezado `Allow`. El cuerpo se lee **después** de validar clave y camino —un pedido sin clave se rechaza sin leer un byte— y de él sólo se comprueba que sea un objeto JSON de menos de 200.000 caracteres: qué campos lleva lo decide la base, porque dos lugares decidiendo lo mismo se contradicen solos. De los errores de la base sale el código, nunca el detalle interno; la única excepción es el identificador del producto desconocido, que lo mandó la tienda.

> ⚠️ **Al desplegar: `verify_jwt = false`.** Viene prendida por omisión y, prendida, la plataforma rechaza la clave de la tienda antes de llegar a la función: la API contesta «Invalid JWT» a todo. Pasó en el primer despliegue del 24/09 y lo encontraron las pruebas por internet en el minuto siguiente.

**La facturación no es automática, y es una decisión, no una limitación.** El pedido entra con `documentacion = 'fiscal'` y espera: el encargado lo revisa, arma el paquete y recién entonces factura, para que el comprobante diga lo que realmente se entrega. Facturar primero y corregir después significa notas de crédito.

**Cómo se verificó:**

- **43 comprobaciones contra la base real** ([`supabase/pruebas/pedidos-de-la-tienda.sql`](../../supabase/pruebas/pedidos-de-la-tienda.sql)), en una transacción que se deshace sola.
- **55 comprobaciones por internet** contra la función publicada, incluido un pedido que entra de verdad y su reintento. Ese tramo va detrás de `API_TIENDA_ESCRIBIR=1` porque escribe una venta real; lo que dejó se borró después.
- **25 pruebas nuevas de la puerta** en la suite de la app, que pasó de 353 a 378.
- **Se rompió a propósito de siete maneras y las siete fueron atrapadas:** sin idempotencia, con lo no pagado descontando stock, con la puerta sin mirar la clave, sin avisar del precio raro, sin avisar de la falta de stock, deshaciendo el arreglo del precio de la línea, y desarmando el guardián del medio de pago. Y otras tres en la puerta: `/pedidos` aceptando `GET`, una lista pasando por pedido, y el detalle interno de Postgres saliendo al exterior.

### 🟢 5. Deploy y empaquetado
Cloudflare Pages (10 minutos cuando haya algo que publicar) y Tauri para las 4 PC del mostrador, con impresión ESC/POS a la Hasar por red.

---

