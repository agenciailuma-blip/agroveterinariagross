# Estado del proyecto — leer esto primero

**Última actualización:** 4 de septiembre de 2026
**Para qué sirve este documento:** retomar el trabajo sin reconstruir el contexto. Si empezás una sesión nueva, leé esto antes que cualquier otra cosa.

---

## 🎯 Dónde retomar — al 04/09/2026

**Lo que sigue, en orden:**

**1. Comprobante no fiscal + remitos — EN CURSO.** Decisiones y límites en [`sugerencias-lucas-2026-09.md`](sugerencias-lucas-2026-09.md), bloque B2. Detalle de lo hecho en la sección 5-bis. El bloque por dentro:

| | Paso | Estado |
|---|---|---|
| 1 | Migración: tablas, tipos, numeración, RLS, permisos | ✅ 04/09 |
| 2 | Elección en la Caja + `venta.documentacion` + panel rojo | ✅ 04/09 |
| 3 | Impresión del no fiscal: ticket, A4, ESC/POS | ✅ 04/09 |
| 4 | Remito: domicilio, transporte, recibí conforme | ✅ 04/09 |
| 5 | Stock del remito: descarga, reconciliación y panel | ✅ 04/09 |
| 6 | Presupuesto: validez y conversión | ✅ 04/09 |
| 7 | Listado, exportación y convertir en factura | ✅ 04/09 |
| 8 | Emisión sin conexión | 🟡 07/09 — construida y probada; falta cortar internet en una máquina real |
| 9 | Pruebas de lo que decide con plata y con stock | ✅ 130 automáticas |
| **+** | **La caja edita la venta** — subió desde el punto 3 de esta lista | ✅ 04/09 |

> **Por qué "la caja edita la venta" se mudó adentro de este bloque.** Era comodidad: el cliente se arrepiente de una bolsa. Con el remito descargando stock antes del cobro, pasó a ser **el mecanismo que cierra el reparto**: el repartidor vuelve con lo que el cliente no quiso, y la única forma de que el stock aterrice bien es que el cajero corrija la venta a lo entregado. La base ya lo reconcilia sola (probado); falta la pantalla que lo permita.

**Después de ese bloque, en orden:**

2. **Proveedor mínimo + aumento de precios por proveedor y por rubro.** Entra en V1-A por decisión de Lucas, con el riesgo de fecha asumido.
3. **Tanda de comodidad** — bloque C del mismo documento: stock en el menú, nombre del cliente para llamarlo en caja, modal de cantidad, columna de descuento con PIN, cerrar sesión al enviar a caja, descripción en el editor.
4. **Reservar el concepto de depósito** en el modelo de stock, aunque haya uno solo. Media hora ahora contra tocar todo el histórico en diciembre.
5. **Métricas de venta en Inicio** — lo único visible que falta de V1-A.
6. **Sincronización por red local** y **cifrado de la base local**.
7. **Todo con teclado** — lo último antes del 26/10, decidido con Lucas.

**Esperando a terceros:**

- 🔴 El **Excel con la columna de IVA** — sigue siendo lo que más bloquea.
- 🔴 El **alta del punto de venta CAEA**: el estudio contable se ofreció a hacerlo, falta que Lucas lo autorice. Cuando esté, hace falta el **número** del punto de venta.
- 🔴 El **certificado de producción de ARCA**.
- 🟡 Qué es un **"comprobante de percepción"** para Lucas (punto 9 de sus sugerencias).
- 🟡 **Probar la impresora del mostrador** y las 4 PC en el local, con el programa instalado. Guion listo en [`instalacion-en-el-local.md`](instalacion-en-el-local.md).
- ✅ **El modelo de la Hasar, resuelto el 04/09.** Lucas mandó la foto de la etiqueta: `P-HAS-181-STD-3I-N`, **IMPRESOR TERMICO** (no controlador fiscal) con USB/RS232/Ethernet. **ESC/POS es el protocolo correcto y lo construido sirve tal cual** — el riesgo de rediseño quedó descartado.
- 🔴 **Falta confirmar que la impresora esté EN la red, y su IP.** Tener puerto Ethernet no es estar conectada: en la foto se ve un solo cable. Si está por USB, el programa no la alcanza —abre una conexión de red, no habla USB— y hay que pasarla a la red antes de la sesión. Texto para pedírselo en el guion.

**Sin verificar todavía:** el ingreso real contra Supabase desde adentro del **programa instalado**, y la impresión con la **Hasar delante**.

✅ **La interfaz ya se recorrió con sesión iniciada (04/09).** Caja, Facturación, Remitos e impresión, de punta a punta. Salió un bug real: ver la trampa de las consultas deshabilitadas en la sección 6.

---

## 1. Qué es

Sistema de gestión a medida para **Agroveterinaria Gross** (Oberá, Misiones), desarrollado por **ILUMA**.

- **CUIT** 20146369767 · **Razón social** ERNESTO HUGO GROSS · **Responsable Inscripto**
- Contacto del cliente: **Lucas** · Contador: **Armando Monje** (3755581543)
- **Modelo comercial:** fee mensual hasta terminar. **No es una suscripción** — el sistema y los datos son de Gross.

**Fecha de corte comprometida: 26 de octubre de 2026.** Ese día dejan de usar OBTech.

### El alcance en una línea

Reemplazar OBTech (facturación + caja) y sumar lo que hoy no tienen: control de stock real, CRM, cuenta corriente y sincronización con la tienda online que desarrolla Zubu.

📄 Alcance completo y firmable: [`alcance-v1.md`](alcance-v1.md)

---

## 2. Cómo arrancar

```bash
npm --prefix "D:/00 ILUMA/Dev Code/Sistema Gross/app" run dev
```

Queda en `http://localhost:5173`. Mientras esa consola esté abierta, el sistema funciona.

**Conector de Supabase:** hace falta uno apuntando al proyecto `ywggnhoifhtoncnxrodh`, con permisos de escritura.
⚠️ Verificar siempre a qué proyecto apunta antes de aplicar migraciones. Ya pasó de tener dos conectores y casi escribir el esquema en el proyecto equivocado.

**Cuentas:** todo bajo `lucasgross.cuentas@gmail.com` (Supabase y Cloudflare). El repo está en `agenciailuma-blip/agroveterinariagross` — **pendiente transferirlo a Gross al cerrar V1**.

**Usuario de prueba:** `agencia.iluma@gmail.com`.

**PINs de operador.** Los sembrados son los de los usuarios DEMO: Marcela `2222`, Diego `3333`, Silvina (cajera) `4444`. ⚠️ **Francisco y Lucas son usuarios reales, agregados después, y tienen PIN propio** — el `1111` que decía acá antes no funciona. Verificado el 04/09 recorriendo la caja.

---

## 3. Las decisiones que no se revisan

Están así por razones concretas. Cambiar cualquiera obliga a rehacer varios módulos.

### El stock se guarda como movimientos, no como saldo
El saldo es la suma. Si dos terminales sin conexión venden la última unidad, con un número que se pisa una venta desaparece sin dejar rastro; con movimientos entran las dos y el saldo queda negativo — que es una alerta visible, no un dato perdido. Por eso `stock_saldo` **puede ser negativo a propósito**.

### Los identificadores fiscales son los códigos de ARCA
Alícuotas de IVA, tipos de documento, condiciones de IVA del receptor y tipos de comprobante usan los códigos que publica ARCA, no numeración propia. Al facturar no hay traducción, y donde no hay traducción no hay error de mapeo.

### Los precios incluyen IVA
`producto.precio_venta` es el precio final de mostrador. Al facturar se desarma el neto. Está asentado en `configuracion.precios_incluyen_iva` para que el módulo fiscal no lo adivine.

### Tres precios por línea de venta
`precio_original` (lista) · `precio_acordado` (lo pactado, a nivel contado) · `precio_unitario` (lo que se cobra, ya ajustado por la lista). Recalcular parte **siempre del acordado**, así cambiar de medio de pago no pisa las rebajas del vendedor ni acumula redondeos.

### Nada se borra
Baja lógica con `eliminado_en` en todo lo sincronizable. Un registro que desaparece no deja rastro que viajar a una terminal que estuvo desconectada tres días.

### La identidad va en dos capas
La **terminal** se autentica una vez y queda abierta todo el día. El **operador** se identifica con PIN por operación. Resuelve las dos cosas que pidió Lucas sin que se contradigan: cero fricción y atribución real.

### Un punto de venta de ARCA por caja que factura
Los vendedores no facturan, así que alcanza con uno. Conviene dar de alta un segundo de respaldo por si muere la PC de la caja.

### El precio que se cotiza es el de tarjeta
El efectivo se presenta como descuento. Es marketing, pero define qué número lee el vendedor en voz alta: si dice el de contado y la caja cobra más, queda pegado con el cliente adelante.

---

## 4. Estado por módulo

| Módulo | Base | Pantalla | Notas |
|---|---|---|---|
| Usuarios, roles y permisos | ✅ | ✅ | 33 permisos, 4 roles |
| **Cifrado de la base local** | ❌ | — | ⚠️ Comprometido en el alcance §1 y exigido por Ley 25.326. La base local guarda `cliente` en claro |
| Catálogo y clasificación | ✅ | ✅ | Facetada, copiada de la tienda |
| Dar de baja productos | ✅ | ✅ | De a uno y en masa, con restaurar. Baja lógica: **se revocó el borrado físico** |
| Importación de la planilla | ✅ | ✅ | Con mapeo de columnas. Falta el archivo de Lucas |
| Toma de inventario por sectores | ✅ | ✅ | Contar escaneando, recontar, cerrar y ajustar |
| Stock, umbrales, inventario | ✅ | ✅ | Carga por conteo con movimientos |
| Precios y medios de pago | ✅ | ✅ | **ABM completo**: crear/editar/dar de baja listas y medios, cuotas por desplegable |
| Punto de venta | ✅ | ✅ | Con PIN y offline |
| Caja, cobro y arqueo | ✅ | ✅ | Cobra sin conexión. Preselecciona el medio que anotó el vendedor y deja el comprobante a un clic |
| Clientes y cuenta corriente | ✅ | ✅ | Cobranza integrada a la caja |
| Anulación y devolución | ✅ | ✅ | Botón "Devolver" en Facturación: reingresa stock, saca la deuda y emite la nota de crédito |
| Sincronización offline | ✅ | ✅ | Lectura, venta y cobro. ⚠️ Sólo contra el servidor: las terminales no se hablan entre sí sin internet |
| Canales de venta | ✅ | — | Diseñado, se enciende en V1-B |
| **Facturación ARCA** | ✅ | ✅ | Emite CAE real en homologación, con pantalla y enganchada al cobro. Falta impresión |
| **Contingencia CAEA** | ✅ | 🟡 | Circuito completo construido y probado contra la base. **Bloqueado por un trámite**: ARCA exige un punto de venta del régimen CAEA (error 15003) |
| **Comprobantes no fiscales y remitos** | ✅ | 🟡 | Presupuesto, remito e interno con numeración propia. La caja ya elige antes de cobrar. **Faltan impresión, listado y las pantallas de remito** |
| Compras y Libro de IVA | ❌ | ❌ | V1-B |
| Métricas de Inicio | ✅ | 🟡 | Muestra productos, alertas, comprobantes y terminales. **Faltan las de venta**: del día/semana/mes, más vendidos, por vendedor |
| Empaquetado Tauri (4 PC) | ✅ | 🟡 | **Instalador andando**, con actualizador propio. Falta probarlo en el local |
| Impresión en la Hasar | ✅ | 🟡 | Construida: manda el ticket por red. **Falta la impresora delante** |

**Números:** 52 migraciones · 55 tablas · 13 vistas · 152 políticas de seguridad · 63 funciones · 3 Edge Functions · 37 permisos · 85 pruebas automáticas.

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
- ~~Contingencia con CAEA~~ — construida el 24/08, ver más abajo. Lo que falta no es código: es el alta del punto de venta en ARCA.
- **Devoluciones parciales**: hoy la devolución es de la venta entera. Si el cliente devuelve 1 de 3 unidades, hay que anular todo y rehacer la venta. Nota de débito tampoco está.
- El certificado de **producción**: trámite aparte, en otro portal (Administración de Certificados Digitales, no WSASS). Se hace cuando el servicio ya esté probado en homologación, y hay que acordarse de autorizarlo al servicio `wsfe` igual que en homologación — es el paso que todo el mundo olvida.

### 🟡 1b. Contingencia con CAEA — construida el 24/08, esperando un trámite

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

⚠️ **Lo que NO está verificado y no puede estarlo todavía:** el ida y vuelta real con ARCA (`FECAEASolicitar` y `FECAEARegInformativo`). ARCA no otorga el código hasta que exista el punto de venta del régimen CAEA. El armado del XML del informativo, en particular, está escrito según el XSD pero **nunca lo aceptó ARCA**.

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

### ✅ 1h. Impresión directa en el mostrador (03/09)

El alcance dice *"Impresión en la Hasar P-HAS-181 **por red**, con QR de ARCA"*. Eso define la forma: la impresora está en la red del local escuchando en un puerto, y el programa le manda el ticket ya armado.

**Es la razón principal por la que el sistema se empaqueta.** Una página web no puede abrir una conexión de red contra un aparato del local; el programa instalado sí.

- Comando en Rust ([`src-tauri/src/impresora.rs`](../app/src-tauri/src/impresora.rs)) que abre la conexión y manda los bytes. Espera 5 segundos y se rinde: si la impresora está apagada, el cajero tiene que enterarse **ahora**, con el cliente adelante, no después de medio minuto con la pantalla trabada.
- El ticket se arma en ESC/POS ([`lib/comprobante/escpos.ts`](../app/src/lib/comprobante/escpos.ts)), con el QR dibujado por la propia impresora —sale nítido y rápido, mucho mejor que mandarlo como imagen— y el corte de papel al final.
- Sección **Impresora del mostrador** en Configuración, con dirección, puerto y un botón para imprimir una prueba.
- Botón **Imprimir en el mostrador** en el comprobante, al lado del de siempre. Si falla, lo dice y ofrece imprimir por el navegador: una impresora apagada no puede dejar a nadie sin comprobante.

**Los importes salen de `presentacionDe()`**, el mismo lugar del que salen los del ticket en pantalla y los de la hoja A4. Si cada formato los calculara por su lado, el día que se toque uno los tres dejarían de coincidir.

**Probado con 9 casos** que leen los bytes que se le mandarían a la impresora: los datos del emisor, la Factura A sin IVA cerrando con el neto, la percepción al pie, CAEA en vez de CAE, el QR presente sólo si hay, y el corte de papel al final.

Uno de esos casos merece mención: **los acentos van en latin1, no en UTF-8**, que es lo que entienden estas impresoras. Con la codificación equivocada, "Bagó" sale impreso "BagÃ³" en un comprobante fiscal.

⚠️ **Sin verificar con la impresora delante.** Falta confirmar con Lucas el modelo exacto y que responda ESC/POS por el puerto 9100. Si la Hasar resultara ser un controlador fiscal en vez de una impresora de tickets, el protocolo es otro — pero eso además chocaría con la factura electrónica, que ya numera y autoriza por su cuenta.

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
3. Arrastrar **`app/dist`** a Cloudflare Pages, al proyecto `gross-sistema`

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

**Pendiente:** antes de rendir, comparar contra `FECompUltimoAutorizado` y avisar el hueco con un mensaje claro, en vez de reintentar un 703 todos los días sin que nadie entienda por qué.

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

### 🟡 3. Pantallas que faltan
Reportes. *(El panel de comprobantes con semáforo, la configuración general y el inventario por sectores ya están hechos.)*

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

### 🟢 5. Deploy y empaquetado
Cloudflare Pages (10 minutos cuando haya algo que publicar) y Tauri para las 4 PC del mostrador, con impresión ESC/POS a la Hasar por red.

---

## 6. Trampas aprendidas peleando con el offline

Costaron varias vueltas. Están todas corregidas, pero conviene no repetirlas.

### Una consulta deshabilitada de React Query informa `isPending` para siempre

Aparecido el 04/09, la primera vez que se entró a la Caja con sesión en una máquina sin terminal asignada. La pantalla se quedaba en **"Cargando…" eternamente**, y el mensaje que explicaba qué hacer —*"Esta máquina todavía no tiene terminal asignada"*— no se mostraba nunca.

La consulta de la caja tiene `enabled: !!terminal`. Cuando `enabled` es falso, React Query no informa "inactiva": informa `isPending: true`. **No está cargando — nunca va a arrancar.** Como la guarda preguntaba primero por `caja.isPending`, el `if (!terminal)` de abajo quedaba muerto.

> **La regla:** cuando una consulta tiene `enabled`, la condición que la deshabilita se pregunta ANTES que su estado de carga. Si no, el aviso que explica el problema queda tapado justo por el problema.

Es el peor final posible para un aviso: la máquina no está rota, hay una sola cosa que hacer, y la pantalla no la dice. Y habría aparecido **el día de la instalación en las 4 PC de Gross**, que es cuando ninguna tiene terminal todavía.

### React Query pausa todo sin conexión
`networkMode` por defecto es `'online'`: pausa consultas y mutaciones cuando el navegador se declara sin red. El código **nunca llegaba a ejecutarse** — no se colgaba, no arrancaba. Está en `'always'` y tiene que quedar así.

### Las peticiones sin límite de espera se cuelgan para siempre
Cuando se corta internet pero el sistema operativo cree que hay ruta, el navegador espera en vez de fallar. Hay un límite de 12 s en `supabase.ts`. **No sacarlo.**

### Todo lo que el arranque necesite del servidor bloquea la aplicación entera
Pasó dos veces: el perfil del usuario y la terminal asignada. Los dos se cachean localmente ahora. **Regla: nada en el camino de arranque puede depender de una respuesta del servidor.**

### Nunca borrar estado local porque una consulta vino vacía
`useTerminal` borraba la terminal guardada si no la encontraba en la respuesta. Sin conexión la respuesta viene vacía, así que la borraba siempre. Distinguir "el servidor dijo que no está" de "el servidor no dijo nada".

### Los contadores se reservan, no se deducen
La numeración de ventas se deducía de la cola y se guardaba después de encolar. Eso dejaba una ventana donde el contador volvía a cero y repetía números, trabando la cola entera. Ahora se reserva antes de usarse, en una transacción indivisible, sobre una tabla que la sincronización no toca.

### IndexedDB se bloquea en silencio
Si otra pestaña tiene la base abierta con un esquema anterior, la apertura espera para siempre y todo queda encolado detrás. Hay detección y aviso. **Trabajar con una sola pestaña abierta.**

### Poner la traza en la pantalla, no en la consola
El botón de enviar muestra en qué paso está. Nadie en el mostrador va a abrir la consola del navegador, y eso convierte una llamada de media hora en una de treinta segundos.

---

## 7. Datos de prueba

Todo lo sembrado usa el prefijo `DEMO-`: 35 productos, 7 clientes (`DEMO-C0x`), 3 terminales, 4 usuarios, 8 ventas.

**Borrar antes de cargar el catálogo real.** Los movimientos de stock y de cuenta corriente son inmutables por diseño, así que hay que desactivar los disparadores para limpiarlos:

```sql
alter table public.movimiento_stock disable trigger movimiento_stock_inmutable;
alter table public.movimiento_cuenta_corriente disable trigger movimiento_cc_inmutable;
-- borrar
alter table public.movimiento_stock enable trigger movimiento_stock_inmutable;
alter table public.movimiento_cuenta_corriente enable trigger movimiento_cc_inmutable;
```

---

### Las 24 sugerencias de Lucas (03/09)

Después de la primera demostración mandó un documento con 24 puntos. Están clasificados en [`sugerencias-lucas-2026-09.md`](sugerencias-lucas-2026-09.md), separando lo que cambia una regla del negocio de lo que es comodidad de pantalla.

Tres cosas que conviene tener presentes:

- **Cuatro ya estaban hechas** — umbrales de stock bajo, movimientos con motivo, la descripción del producto y el cambio de precio con registro de quién y por qué. Mostrárselas es la forma más barata de sacarlas de la lista.
- **La mayor parte de lo grande ya estaba prevista en V1-B**: compras a proveedores y Libro de IVA. No es alcance nuevo, es confirmación de que el plan apunta a donde él necesita.
- **Las tres decisiones de fondo se tomaron el 04/09** y están anotadas en ese documento: la caja edita la venta con límites, los depósitos van a V1-B reservando el concepto ahora, y el proveedor entra en V1-A con el riesgo de fecha asumido por Lucas.
- **El punto 20 y el 24 están arrancados** — ver la sección 1i. La base entera y la elección en la caja quedaron el 04/09.
- ⚠️ **El punto 24 sumó alcance el 04/09.** Lucas confirmó que a veces la mercadería sale con remito antes de cobrarse. Eso obligó a tocar `cobrar_venta()` y `anular_venta()`, y subió el bloque de ~6½ a ~9 días. Es la segunda razón anotada, después del proveedor, si el 26/10 se mueve.

## 8. Pendientes con terceros

| Con quién | Qué | Estado |
|---|---|---|
| **Lucas** | Certificado de ARCA (subir el `.csr` a WSASS) | ✅ Obtenido el 21/08 — homologación. Ver [`secrets/gross_homologacion.crt`](../secrets/gross_homologacion.crt) |
| **Contador** | **Alta del punto de venta del régimen CAEA** | 🟡 **El estudio se ofreció a hacerlo** (mensaje del 01/09), *previa autorización de Lucas*. Es exactamente el bloqueo que apareció el 24/08 probando contra ARCA: error 15003. Sólo falta que Lucas lo autorice |
| **Lucas** | Plantilla de categorías y costos completada | En curso |
| **Lucas** | Excel original de precios (se perdió) | Pedido |
| **Lucas** | Qué es el "calendario de recibos" | Sin definir |
| **Lucas** | Cuántas cajas van a facturar | Sin definir |
| **Lucas** | Dónde corre OBTech (¿se pierde el histórico al cortar?) | 🔴 Ventana cerrándose |
| **Contador** | Modalidad de los puntos de venta (¿Web Service?) | ✅ Respondido: ya tienen uno habilitado para RECE |
| **Contador** | Régimen de percepciones de IIBB Misiones | ✅ Respondido: solo agente de percepción (no retención), régimen 14, alícuota 3,31%. Ver [[regulatorio-agroveterinaria-ar]] |
| **Contador** | Mínimo no sujeto a percepción: $14.000 (su respuesta escrita) vs $24.000 (Lucas) | 🟢 **Prácticamente resuelto a favor de $24.000.** El 24/08 Lucas dijo, sin que se lo preguntaran, que percibe "cada factura mayor a setecientos y pico mil". Con 3,31%, un mínimo de $24.000 se dispara a los **$725.075**; uno de $14.000 se dispararía a los $422.960. La cuenta cierra sola. Lo más probable es que la DGR haya subido el mínimo después de que el contador contestó. Confirmarlo igual con una línea, pero ya no bloquea |
| **Contador** | Criterio de alícuotas de IVA por producto | 🔴 Sin resolver — "al ser contador externo no está al tanto de cómo lo parametrizan"; Lucas lo está completando en el Excel, para septiembre |
| **Lucas** | **Dónde se cobra la percepción de IIBB**: en la caja junto con la venta, o a la cuenta corriente | 🔴 Bloquea cerrar el circuito de cobro de mayoristas. Ejemplo numérico redactado en [`mensajes-lucas-2026-08-21.md`](mensajes-lucas-2026-08-21.md) |
| **Contador** | Base de la percepción: ¿el neto gravado total, o solo el neto al 21%? Su planilla de ejemplo es ambigua | 🟢 **Resuelto en la práctica a favor del neto total.** El 24/08 Lucas describió cómo funciona hoy en OBTech: *"si el sistema detecta que esa factura es mayor al valor, digamos que son 700 y pico mil **netos**"* y *"lo que hace el sistema es ver **del total de la factura**"*. Es lo que está implementado |
| **Lucas / Contador** | **Número de Ingresos Brutos** y **fecha de inicio de actividades** de Gross | ✅ **Resueltos el 25/08.** Lucas mandó dos comprobantes reales (un ticket de la Hasar y una Factura A en A4) y los dos traen los mismos valores: IIBB `20-14636976-7` (es el CUIT) e inicio `16/06/1986`. Ya cargados |
| **Lucas** | Qué hacer con la columna **Animal** de la planilla (Perros, Gatos, Bovinos…) | 🟡 Es una dimensión aparte del árbol de rubros. Hoy no se importa. Importa para la tienda de V1-B |
| **Lucas** | La columna **Precio tarjeta** de la planilla | 🟡 Hoy el sistema lo calcula solo con el ajuste de la lista. Si sus precios de tarjeta no salen de un porcentaje fijo, hay que hablarlo |
| **Zubu** | Acuerdo de integración (exponemos nosotros) | Avisados |
| **Gross** | Plan del inventario inicial (~3.000 productos) | 🔴 Sin planificar |
| **Supabase** | Activar protección de contraseñas filtradas | 30 segundos |

### Lo que se sumó el 21/08, a partir de las respuestas del contador y una reunión posterior con Lucas

- **Clasificación fiscal por rubro ARCA** (`rubro_arca`, `producto.rubro_arca_id`): eje separado de las categorías de la tienda, con los 7 códigos de la constancia de inscripción de Gross. Pedido de Lucas para que el contador pueda separar ventas por actividad. El **reporte y la exportación a Excel/CSV quedan para V1-B** junto con el Libro de IVA — no se sumaron hoy para no tocar la fecha del 26/10 (regla de trabajo de `alcance-v1.md`).
- **Percepción de IIBB, configurable sin depender del desarrollador**: `configuracion` tiene `arca.iibb_percepcion_alicuota` y `arca.iibb_percepcion_minimo`, editables desde la pantalla nueva Configuración → Percepción IIBB (permiso `configuracion.gestionar`).
- **Exclusión de percepción por cliente**: `cliente.iibb_percepcion_excluido` + número y vigencia de certificado, cargable desde la ficha del cliente (solo visible si es Responsable Inscripto).
- Todavía **no existe** la función que calcula y aplica la percepción al emitir un comprobante: es parte del servicio de facturación, bloqueado por el certificado.

---

## 9. Convenciones

- **Todo en español**, incluido el código: nombres de tablas, columnas, funciones, variables y comentarios.
- **Migraciones** en `supabase/migrations/`, con marca de tiempo. Se aplican con `apply_migration` del conector. Cada una lleva arriba un comentario explicando **por qué**, no qué.
- **Pruebas automáticas** en archivos `*.prueba.ts`, al lado del código que prueban. Se corren con `npm --prefix app run prueba`. No se prueba todo: sólo lo que decide con plata, con stock o con obligaciones fiscales, que es donde un error no se ve hasta que ya pasó. Hoy son 74 sobre el cobro sin conexión, la conciliación de la cola, el QR de ARCA y la lectura de la planilla de productos.
- **RLS en todas las tablas** de `public`. Leer exige usuario activo; escribir exige un permiso concreto. Nunca `TO authenticated` solo.
- **Funciones privilegiadas** en el esquema `app`, que no se expone. Si alguna tiene que vivir en `public`, verifica el permiso adentro — hay cinco así y el linter las marca; es esperable y está documentado en cada migración.
- **Correr el linter de seguridad** después de cada cambio de esquema.
- **Commits en español**, explicando el porqué de la decisión y qué se verificó.
- **Verificar contra la base real** antes de dar algo por terminado. Todos los módulos tienen su prueba documentada en el mensaje de commit.

---

## 10. Otros documentos

| Archivo | Para qué |
|---|---|
| [`alcance-v1.md`](alcance-v1.md) | Qué entra en V1-A y V1-B, definición de terminado, backlog de V2/V3 |
| [`reunion-cliente-01.md`](reunion-cliente-01.md) | Relevamiento, no negociables, guion de reunión |
| [`agenda-contador.md`](agenda-contador.md) | Consultas fiscales pendientes, para mandarle tal cual |
| [`mensajes-lucas-2026-08-10.md`](mensajes-lucas-2026-08-10.md) | Mensajes redactados para el cliente |
| [`mensajes-lucas-2026-08-21.md`](mensajes-lucas-2026-08-21.md) | Pedido de la alícuota de IVA por producto y confirmación del mínimo de percepción |
| [`demostracion-lucas.md`](demostracion-lucas.md) | Guion de la demostración, cómo subirlo a Cloudflare y qué pedirle a Lucas |
| [`instalacion-en-el-local.md`](instalacion-en-el-local.md) | **Guion de la instalación en las 4 PC**: qué preguntarle a Lucas antes, el orden exacto de la sesión, y qué hacer cuando algo falla |
| [`marca/`](marca/) | Kit de identidad: logos, patterns, tipografía, colores |
