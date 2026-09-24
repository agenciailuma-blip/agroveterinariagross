# Guía de pantallas — Sistema Gross

**Para qué sirve:** recorrer el menú de punta a punta y saber, de cada sección, **qué contiene, qué se hace, qué se ve y qué se exporta**. Sirve para mostrarlo, para explicarlo y para entrenar a quien lo va a usar.

**Al 9 de septiembre de 2026.** Lo que todavía no está construido se marca 🔜 en lugar de omitirse: es la única forma de que esta guía no prometa de más.

---

## Cómo leerla

- **Contiene** — qué vive en esa pantalla.
- **Qué hago** — las acciones que se pueden ejecutar ahí.
- **Qué veo** — la información que devuelve.
- **Qué exporto** — qué sale de ahí en papel o en archivo.

> **Sobre exportar.** Hoy el sistema exporta **dos** archivos —las **ventas del mes para el contador** y el listado de **comprobantes no fiscales**— más **cinco** cosas a papel. Lo que falta —Rentas de Misiones y los reportes de venta— está previsto para **V1-B**, después del corte del 26 de octubre. Está anotado en cada sección donde corresponde.

**Quién ve qué.** Cada sección del menú aparece sólo si el usuario tiene el permiso que la abre. Un vendedor no ve Facturación ni Usuarios; un cajero no ve Configuración. Los permisos se manejan desde **Usuarios**.

---

## 1 · Inicio

El tablero que se ve al entrar. Contesta *"¿hay algo que mirar hoy?"* sin que haya que abrir nada.

| | |
|---|---|
| **Contiene** | El resumen del día: catálogo, alertas de stock, comprobantes y terminales. |
| **Qué hago** | Nada — se mira. Cada número es un enlace a la pantalla que lo resuelve. |
| **Qué veo** | Cuántos productos hay en el catálogo · cuántos están bajos, críticos o sobrevendidos · cuántos comprobantes esperan resolución de ARCA · cuántas terminales hay y cuántas están sin sincronizar. Más avisos cuando algo pide atención (por ejemplo, terminales que hace rato no suben datos). |
| **Qué exporto** | Nada. |

🔜 **Falta lo que más se va a mirar:** las **métricas de venta** —del día, de la semana, del mes, los más vendidos y el ranking por vendedor—. Es lo único visible que queda de V1-A.

---

## 2 · Productos

El catálogo. Es la pantalla donde se carga y se corrige todo lo que se vende.

| | |
|---|---|
| **Contiene** | Los 2.261 productos, con su ficha completa. |
| **Qué hago** | Buscar por código, nombre o código de barra · **filtrar por categoría y por marca** · abrir la ficha y editarla · crear uno nuevo · **importar la planilla de Excel** · dar de baja de a uno o en masa · restaurar los dados de baja · filtrar por "sólo los que faltan revisar" · **prender «Vender online»** de a uno, a un grupo marcado o a una categoría entera. |
| **Qué veo** | Listado con precio, stock y el semáforo (*En stock / Stock bajo / Crítico / Sobrevendido*) · la marca **Web** en los que se venden online, en ámbar si están prendidos pero no salen · el **avance del operativo de carga**: cuántos productos ya revisó una persona sobre el total. |
| **Qué exporto** | Nada. 🔜 La exportación del catálogo entra con los reportes de V1-B. |

**Lo que tiene la ficha del producto:**

- **Identificación** — código, unidad, nombre interno (el que ve el vendedor), nombre público (el que ve el cliente en la tienda) y **descripción** para la tienda web.
- **Precio y rentabilidad** — precio de venta con IVA, costo, margen objetivo y el margen real que está dando. Muestra el margen **sobre el costo** y **sobre la venta**, porque "margen" significa las dos cosas según quién lo diga.
- **Impuestos** — alícuota de IVA y rubro de ARCA (el que le sirve al contador para separar ventas por actividad).
- **Stock** — cuánto dice el sistema, cuánto se contó, y el **aviso de stock bajo**: los dos niveles, bajo y crítico. Si no se le pone uno propio, hereda el de su categoría o el general.
- **Proveedor** — a quién se le compra. Es lo que permite ajustarle el precio a todos los productos de ese laboratorio de una sola vez, desde Proveedores.
- **Clasificación** — rubro, marca, presentación, animal y etapa de vida.
- **Códigos de barra** — todos los que tenga.
- **Tienda online** — el interruptor **Vender online** y el **colchón** de ese producto, y una línea que dice qué ve la tienda: *"Se vende online: la tienda ve 3 unidades a $6.900"*, o *"Prendido, pero no sale: le falta el nombre público"*.
- **Trazabilidad y normativa** — producto veterinario, requiere receta, fitosanitario, controla vencimiento.

> **Vender online.** Nada sale a la tienda web hasta que alguien lo prende. Se prende en la ficha, a un grupo marcado, o **a una categoría o marca entera** —eligiéndola en el filtro, que muestra la cantidad y la prende toda, no sólo los primeros 100 de la lista—. Prendido, sale sólo si tiene **nombre público** y **precio**; si le falta algo, la ficha lo dice y el aviso cuenta cuántos quedaron afuera. Con qué lista de precios se publica se elige en **Precios → Tienda online**.

> **Importar la planilla** (`Productos → Importar planilla`) acepta `.xlsx` y `.csv`. El sistema propone a qué campo corresponde cada columna y la persona confirma, viendo un dato de ejemplo — porque los encabezados mienten: una columna que dice "Precio" puede tener el costo. **Reimportar no duplica**: reconoce por código y actualiza. Una celda vacía no borra lo que ya había; un valor distinto sí lo pisa.

---

## 3 · Stock

Contesta **qué hay que pedir**. No es el catálogo con otra columna: arranca filtrado en lo que necesita una decisión.

| | |
|---|---|
| **Contiene** | Los productos que están por debajo de su umbral, ordenados por urgencia. |
| **Qué hago** | Filtrar por estado · buscar · **copiar la lista** para pegarla en un WhatsApp al proveedor · saltar a contar inventario. |
| **Qué veo** | Cuatro números arriba (sobrevendidos, críticos, bajos, en stock) que se leen de un vistazo · por producto: cuánto queda, con cuánto avisa, en qué estado está y **cuánto costaría reponerlo** hasta el umbral. |
| **Qué exporto** | La lista de faltantes **al portapapeles**, en texto, lista para pegar. |

> **El umbral de cada producto se configura en su ficha**, dentro de Productos. Si no tiene uno propio, hereda el de su categoría; y si la categoría tampoco, el general de Configuración.

---

## 4 · Inventario

El conteo físico por sectores, con el local abierto.

| | |
|---|---|
| **Contiene** | Las tomas de inventario: abiertas, cerradas y anuladas. |
| **Qué hago** | Abrir una toma por sector · **contar escaneando** (el foco vuelve solo al buscador después de cada Enter) · recontar un producto · anular la toma · **cerrarla**, que genera los ajustes de stock. |
| **Qué veo** | Por toma: cuántos productos se contaron, cuántos tienen diferencia y **cuánto representa esa diferencia valorizada al costo**. |
| **Qué exporto** | Nada. El ajuste queda como movimiento de stock, con quién contó y cuándo. |

> **Se puede contar con el local abierto.** El ajuste usa la diferencia detectada **al momento de contar**, no al momento de cerrar: si se cuentan 10 a las 10:00 y a las 11:00 se vende 1, al cerrar queda 9 y no 10.

---

## 5 · Precios

Cómo se arma el precio final según con qué paga el cliente.

| | |
|---|---|
| **Contiene** | Las listas de precios y los medios de pago. |
| **Qué hago** | Crear, editar y dar de baja **listas** (Contado, Tarjeta…) con su porcentaje de ajuste · crear, editar y dar de baja **medios de pago**, cada uno atado a su lista · definir **cuotas y recargos** por medio · cargar precios masivamente. |
| **Qué veo** | Qué lista usa cada medio y qué porcentaje aplica. |
| **Qué exporto** | Nada. |

> **El precio que se cotiza es el de tarjeta**, y el efectivo se presenta como descuento. No es un detalle estético: define qué número lee el vendedor en voz alta. Si dice el de contado y la caja cobra más, queda pegado con el cliente adelante.

**El recargo por cuotas, que es lo que Lucas edita.** Cada medio de pago que admite cuotas tiene un casillero por plan: *1 cuota*, *2 cuotas*, *3 cuotas*, cada uno con su porcentaje. Se escribe el número y se guarda solo al salir del casillero. Debajo, la pantalla dice cuánto se cobra una venta de $100.000 con cada plan: es para comparar contra lo que cobra el posnet, sin sacar la cuenta.

Hoy están cargados **0% a 1 cuota, 10% a 2 y 15% a 3** (17/09, dicho por Lucas).

> **Dónde aparece ese recargo:** en el **precio**. Al elegir el plan en la caja, el total de la venta sube y la factura sale por ese importe. **No va como un renglón aparte al pie del ticket**, y no es una decisión estética: un "costo financiero" discriminado es otro régimen, con sus propias reglas, y Gross no lo usa. Lo confirmó el contador.
>
> **Cómo se lo explicás a Lucas:** es lo mismo que hacés hoy con la lista de tarjeta, pero por cantidad de cuotas y sin cargar el producto tres veces. Vos ponés el porcentaje una vez, y el sistema se lo suma al precio cuando el cajero elige el plan.

---

## 6 · Proveedores

A quién se le compra cada producto. Y, sobre todo, **cómo cambiarle el precio a todos los de un laboratorio de una sola vez**.

| | |
|---|---|
| **Contiene** | Los proveedores, con su ficha corta: nombre, CUIT, contacto. |
| **Qué hago** | Crear, editar y dar de baja · **ajustar precios en masa** por proveedor y/o por rubro · **deshacer un ajuste**. |
| **Qué veo** | Por proveedor: CUIT, contacto y **cuántos productos tiene asignados** — que es a cuántos les va a pegar un ajuste. |
| **Qué exporto** | Nada. |

**El ajuste masivo, que es para lo que existe la pantalla:**

1. Se elige **proveedor** y/o **rubro**. Se puede dejar los dos en "Todos", y ahí le pega al catálogo entero — pero exige escribir por qué.
2. El sistema dice **a cuántos productos les va a pegar, antes de aplicar**. Es la última verificación: si dice 1.800 cuando esperabas 40, algo se eligió mal.
3. Se pone el porcentaje: **7** sube un 7%, **-8** baja un 8% — igual que en el sistema que usan hoy. Y si toca el **precio de venta**, el **costo**, o **los dos**: cuando se mueve la lista de un laboratorio suelen moverse los dos.

> **Se puede deshacer, y eso es lo importante.** Un +70% tipeado donde iba +7% arruina el mostrador entero y se descubre con el primer cliente. El sistema guarda el precio anterior de **cada** producto, y abajo de la pantalla está el historial con el botón para volver atrás.
>
> Al deshacer, cada producto vuelve al precio **exacto** que tenía — no se aplica el porcentaje inverso, que por redondeo dejaría centavos corridos para siempre. Y **los productos que alguien corrigió a mano después se dejan como están**: esa corrección es más nueva y más deliberada.

> La ficha del proveedor es corta a propósito. No lleva cuenta corriente ni condiciones de pago: eso es el módulo de compras, que llega en V1-B.

---

## 7 · Ventas (punto de venta)

El mostrador. Arma la venta y la manda a la caja.

| | |
|---|---|
| **Contiene** | La venta en curso. |
| **Qué hago** | Identificarme con **PIN** · buscar o escanear productos · **escribir una línea que no está en el catálogo** · cambiar cantidades · **rebajar el precio de una línea, por monto o por porcentaje** · elegir el cliente · anticipar con qué va a pagar · **enviar a caja** o **hacer un presupuesto** · descartar la venta. |
| **Qué veo** | El detalle con precios y subtotal · **el total en efectivo y con tarjeta al mismo tiempo** · aviso si no hay stock suficiente · el borrador se conserva si la pantalla se refresca por accidente. |
| **Qué exporto** | El **presupuesto impreso**, en ticket de 80 mm o en hoja A4, para que el cliente se lo lleve. |

**Tres cosas que conviene explicar:**

- **El PIN se cierra al enviar la venta.** Cada vendedor vuelve a identificarse. No es seguridad de contraseña —son cuatro dígitos tipeados en un mostrador lleno de gente—: es **atribución**. Sin esto, el primero que pone su PIN a la mañana queda como autor de todo lo que carga cualquiera.
- **Pide un nombre para llamar al cliente.** Se puede dejar vacío. Aparece en la cola de la caja, para que el cajero llame a la persona en vez de cantar un número.
- **Rebajar un precio pide motivo y PIN.** El motivo sale de una lista (*descuento por cantidad, vencimiento próximo, bonificación especial*) para que después se pueda contar. Y **quien pone el PIN queda como responsable de la rebaja, que puede no ser el vendedor** — eso es lo que permite que un encargado se acerque y autorice.

> **La línea escrita a mano** ("producto comodín") es para lo que se pide especialmente y se vende una vez: no se crea nada en el catálogo, no mueve stock y no tiene costo. Se le pregunta el IVA porque puede terminar en una factura. **Si algo se vende dos veces, va al catálogo.**

**Sin internet el mostrador sigue funcionando**: busca en la copia local, arma la venta y la guarda. ⚠️ Lo que hoy no puede es hacérsela llegar a la caja hasta que vuelva la conexión — las terminales sólo se hablan a través del servidor. Está previsto resolverlo con la sincronización por red local.

---

## 8 · Caja

Cobra lo que el mostrador armó, y cierra el turno.

| | |
|---|---|
| **Contiene** | La cola de ventas esperando cobro, y la caja del turno. |
| **Qué hago** | **Abrir la caja** con el monto inicial · elegir una venta de la cola · **corregir la venta** (quitar, cambiar cantidades, agregar) · elegir el medio de pago y las cuotas · **hacer un descuento**, por porcentaje o llevando el total a un número, con motivo de lista · elegir **con factura o sin factura** · **cobrar** · cobrar cuenta corriente · **cerrar la caja** con el arqueo. |
| **Qué veo** | La cola con el nombre para llamar a cada cliente · el detalle de la venta · el total actualizado según el medio de pago · el saldo de cuenta corriente del cliente y su límite · al cerrar, lo esperado contra lo declarado y **la diferencia**. |
| **Qué exporto** | El **comprobante impreso** —factura, ticket no fiscal o comprobante interno— en ticket de 80 mm o A4. |

**Lo que hay que saber:**

- **Al cobrar se factura solo.** Si ARCA falla, **la venta queda cobrada igual** y el comprobante espera en la cola: hacer fallar el cobro por una caída de ARCA dejaría al cliente parado con la mercadería en la mano. El cajero ve un aviso ámbar con enlace a Facturación.
- **"Sin factura" tiene permiso propio**, que no tienen ni el Cajero ni el Vendedor. Y **a un Responsable Inscripto no se le ofrece**: compra para descargar IVA.
- **Se cobra sin internet.** Lo que sí necesita conexión es **abrir** y **cerrar** la caja — arquear con la mitad de las ventas sin registrar produce una diferencia que no existe y que después alguien tiene que explicar.

---

## 9 · Clientes

La ficha del cliente y su cuenta corriente.

| | |
|---|---|
| **Contiene** | Todos los clientes, con sus datos fiscales y su saldo. |
| **Qué hago** | Buscar · crear y editar · definir si tiene **cuenta corriente** y con qué **límite de crédito** · fijarle un **descuento por defecto** y una lista de precios propia · cargar la **exclusión de percepción de IIBB** con su certificado y vigencia · ver y cobrar la cuenta corriente. |
| **Qué veo** | Datos fiscales (condición de IVA, CUIT/DNI, domicilio) · **saldo actual** · movimientos de la cuenta corriente con su origen. |
| **Qué exporto** | Nada. |

---

## 10 · Facturación

El semáforo de todo lo que se le informa a ARCA.

| | |
|---|---|
| **Contiene** | Los comprobantes fiscales: facturas, notas de crédito y su estado ante ARCA. |
| **Qué hago** | **Pedir el CAE** de un comprobante pendiente · **reintentar** los rechazados · **emitir por contingencia con CAEA** cuando ARCA no responde · **devolver una venta** (reingresa el stock, saca la deuda y emite la nota de crédito, todo junto) · imprimir. |
| **Qué veo** | El semáforo por comprobante (pendiente, autorizado, impreso, rechazado) · **el motivo exacto del rechazo** · el aviso de la ventana de 5 días para pedir el CAE · el **panel rojo** de ventas cobradas sin comprobante, que es el caso grave: la plata entró y no hay respaldo fiscal · el **panel de contingencia** con el CAEA vigente, qué falta informarle a ARCA y cuántos días quedan. |
| **Qué exporto** | La **factura impresa** con QR de ARCA, en ticket de 80 mm o A4 · ✅ **el Excel de ventas del mes, para el contador**. |

**Lo emitido durante un corte de internet** aparece en su propio recuadro, debajo del panel de contingencia: qué facturó la caja mientras no había conexión, con **Reimprimir** y con cuáles ya llegaron al servidor. No hay botón para informarle a ARCA — eso lo hace la tarea diaria sola, porque un botón que alguien tiene que acordarse de apretar no es una obligación cumplida.

**El archivo para el contador** está en esta misma pantalla: se elige el mes y se baja. Antes de bajarlo muestra los totales —comprobantes, neto gravado, IVA y total— para poder controlar que el mes sea el correcto.

> **No armamos el Libro de IVA: lo arma el contador.** Y **las facturas de compra las baja él de ARCA**, de *Mis Comprobantes*. Lo único que Gross le tiene que dar son sus ventas.
>
> El archivo lleva **una fila por alícuota**: una factura con 21% y 10,5% ocupa dos renglones, cada uno con su neto y su impuesto, que es como lo espera un contador. Las **notas de crédito van en negativo**, así sumar la columna da el neto del mes. Y sólo entran los comprobantes **autorizados por ARCA** — un rechazado no tiene CAE y no puede ir en un libro.

🔜 **Faltan:** las **devoluciones parciales** (hoy la devolución es de la venta entera) y la **nota de débito**. Y 🔜 **mandar la factura por email al cobrar**, que pidió Lucas.

---

## 11 · Remitos

La mercadería que sale del local, con su comprobante de entrega.

| | |
|---|---|
| **Contiene** | Los remitos emitidos y los que salieron sin cobrarse. |
| **Qué hago** | Emitir un remito **desde una venta** · emitir un remito **de cero**, eligiendo cliente y escribiendo las líneas · elegir **si descuenta stock o no** · imprimir · anular. |
| **Qué veo** | **Entregado y sin cobrar**, arriba y en ámbar: mercadería que salió y plata que no entró, con cuántos días lleva · el listado con destino, transporte, **si descontó stock o no**, y a qué venta corresponde. |
| **Qué exporto** | El **remito impreso**, en ticket de 80 mm o A4, con espacio para "recibí conforme". |

**Las dos reglas del remito:**

- **En el remito no van precios**, sólo cantidades. El remito acompaña a la factura, o la factura sale después si es cuenta corriente. Cierra con **total de unidades**, que es lo que se cuenta al recibir.
- **El stock sale una sola vez.** Si la venta ya se cobró, el remito sólo documenta el traslado. Si todavía no, el remito descuenta y al cobrar la caja reconcilia: lo que vuelve en la camioneta reingresa solo.

> **El remito que no descuenta** es para mercadería que **todavía no entró al local** — la que se pide especialmente para un cliente, muchas veces la municipalidad. Documenta el compromiso y no toca el inventario.

---

## 12 · Presupuestos

El archivo de todos los comprobantes que numera Gross, no ARCA.

| | |
|---|---|
| **Contiene** | Presupuestos, remitos y comprobantes internos, juntos. |
| **Qué hago** | Filtrar por tipo · **mandar un presupuesto a la caja** para cobrarlo · imprimir · anular con motivo · **exportar**. |
| **Qué veo** | Número, fecha, cliente, total y estado · los presupuestos **vencidos** marcados. |
| **Qué exporto** | ✅ **Un archivo Excel (CSV)** con todo lo listado — con punto y coma como separador y coma decimal, para que abra bien en el Excel de Gross. |

> Un presupuesto **no se convierte en factura acá**: se manda a la cola de la caja y la factura sale al cobrarlo por el camino de siempre. Tener dos caminos a la facturación sería tener dos lugares donde se decide lo mismo.

---

## 13 · Usuarios

Quién entra, qué puede hacer y con qué PIN.

| | |
|---|---|
| **Contiene** | Los usuarios del sistema, sus roles y los permisos de cada rol. |
| **Qué hago** | Dar de alta · asignar rol · **definir o quitar el PIN** de mostrador · dar de baja · **encender y apagar permisos por rol**. |
| **Qué veo** | 37 permisos agrupados, 4 roles, y qué usuario tiene cuál. |
| **Qué exporto** | Nada. |

> **Dar de alta a alguien no lo habilita solo.** La cuenta y el usuario del sistema se unen **en su primer ingreso**, que es el único momento en que las dos puntas existen. Requisitos: correo confirmado y que esa persona no tenga ya otro usuario.

---

## 14 · Configuración

Lo que puede cambiar sin depender de una actualización del programa.

| | |
|---|---|
| **Contiene** | Seis bloques. |
| **Qué hago** | Ver abajo. |
| **Qué veo** | Ver abajo. |
| **Qué exporto** | Nada. |

| Bloque | Para qué |
|---|---|
| **Percepción de IIBB — Misiones** | Alícuota y mínimo no sujeto a percepción. Los fija la DGR y cambian por resolución. |
| **Ritmo del mostrador** | Si al agregar un producto se pregunta la cantidad. Se prueba unos días y se deja como le sirva al mostrador. |
| **Diagnóstico de la terminal** | Qué terminal es esta máquina, si tiene copia local, si hay operaciones sin subir. Es lo primero que se mira cuando una PC "no anda". |
| **Datos del emisor** | Razón social, CUIT, domicilio, IIBB, inicio de actividades y **el logo** que sale en los comprobantes. |
| **Impresora del mostrador** | Dirección y puerto de la impresora, con un botón para imprimir una prueba. 🔜 Va a cambiar a **elegir de una lista de impresoras de Windows** (ver más abajo). |
| **Puntos de venta de ARCA** | Cuáles están habilitados y cuál está dado de alta bajo el régimen CAEA. |

---

## Lo que se imprime, en resumen

| Documento | Dónde se emite | Formatos |
|---|---|---|
| **Factura / Nota de crédito** | Caja (al cobrar) y Facturación | Ticket 80 mm · Hoja A4 · con QR de ARCA |
| **Presupuesto** | Ventas | Ticket 80 mm · Hoja A4 |
| **Remito** | Remitos | Ticket 80 mm · Hoja A4 · sin precios |
| **Comprobante interno** | Caja (cobrando "sin factura") | Ticket 80 mm · Hoja A4 |
| **Arqueo de caja** | Caja (al cerrar) | En pantalla |

⚠️ **Hoy todo se imprime por el navegador** (elegir impresora, o guardar como PDF). 🔜 **Falta la impresión directa a la impresora del mostrador**, que es lo único que traba el mostrador hoy y lo que sigue en el plan.

---

## Lo que hay que saber para explicarlo

**Dos archivadores, a propósito.** Los comprobantes **fiscales** (Facturación) y los **no fiscales** (Remitos y Presupuestos) viven separados. En uno van los papeles que ARCA numera y controla; en el otro los que numera Gross. Comparten la impresora y la pantalla, **nunca los números**. Es lo que hace imposible que un presupuesto se cuele en una declaración.

**Nada se borra.** Dar de baja un producto, anular una venta o anular un remito no borra nada: queda el registro con quién lo hizo y por qué. El historial de ventas y movimientos siempre queda.

**El stock son movimientos, no un número.** El saldo es la suma de lo que entró y salió. Por eso **puede quedar negativo a propósito**: si dos terminales sin conexión venden la última unidad, entran las dos y el saldo queda en −1 — que es una alerta visible, no un dato perdido.

**Identidad en dos capas.** La **máquina** se autentica una vez y queda abierta todo el día. La **persona** se identifica con PIN por operación. Resuelve las dos cosas a la vez: cero fricción en el mostrador y saber quién hizo qué.
