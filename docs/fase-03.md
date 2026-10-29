---
actualizado: 2026-10-28
estado: en construcción — Mayorista, primera entrega hecha el 28/10; contestadas siete de las ocho preguntas, falta la de los conceptos fijos
---

# Fase 03 — lo que pidió Lucas el 26/10

> **Fase 03** (decidido el 28/10): las fases 1 y 2 son lo ya construido —el sistema y la tienda online—, que en noviembre pasan a soporte. Esta fase se desarrolla en paralelo, **empezando por Mayorista**: Facundo sale a la calle la semana del 2/11. Lo que antes era V2, V3 y cumplimiento normativo queda como **fases futuras, sin número**, para diciembre o enero.
>
> Lo que salió de la visita al local del **26 de octubre**, el día que tenía que ser el corte. No se llegó: se pidió **una semana más** y en noviembre se pasa a soporte. Lo que sigue **se cobra aparte, como un mes más de desarrollo**, para que el sistema les quede completo.
>
> Fuentes: el cuaderno de Lucas, las láminas pasadas en limpio y dos audios en [`referencias/pedidos-lucas-2026-10-26/`](referencias/pedidos-lucas-2026-10-26/). La transcripción está en [`transcripcion.md`](referencias/pedidos-lucas-2026-10-26/transcripcion.md).

---

## La respuesta corta: ¿módulo aparte o función?

**Nada de esto es un sistema aparte.** Todo usa los mismos productos, el mismo stock, los mismos clientes, las mismas listas de precios y la misma facturación. Cuando Lucas dice «módulo aparte» quiere decir **una sección propia en el menú, con una persona que entra sólo ahí**. Y eso sí se puede, sin partir nada.

La frase para la reunión: **«Es una sección nueva del mismo sistema, no un sistema nuevo. Si fuera aparte, el stock que vende Facundo y el que se vende en el mostrador serían dos números que no coinciden nunca.»**

| Pedido | Qué es | Dónde vive | Ya existe | Tamaño |
|---|---|---|---|---|
| **1. Cuenta corriente normal** | Funciones | Caja, Clientes, Comprobantes | Casi todo | Chico |
| **2. Cuenta corriente especial** (remito interno) | Funciones | Remitos, con una pestaña nueva | La base del remito | Mediano |
| **3. Productos asociados** | Función | Mostrador y Caja | El producto comodín | Mediano |
| **4. Tres tipos de remito** | Funciones | Remitos | El de entrega | Mediano |
| **5. Venta mayorista** | **Sección nueva** + un rol | Menú → *Mayorista* | Clientes, listas, facturación | **Grande** |
| **6. Orden de traslado** (de animales) | Función | Pantalla propia, *Traslados* | Nada | Mediano |
| **7. Fiado** | **Sección nueva** | Menú → *Fiados* | Nada | Mediano |
| **8. Proforma que se factura desde la misma pantalla** | Función | Comprobantes | El comprobante interno | Chico |
| **9. Mensajes masivos por WhatsApp** | **CRM** — fases futuras | — | — | — |

> 📏 **Chico** son días, **mediano** una semana, **grande** más de una. Sumado da **más de un mes**. Si hay que entrar en el mes, lo que se puede pasar a las fases futuras sin dejar nada a medias está al final, en *Si el mes no alcanza*.

---

## 1. Venta en cuenta corriente normal

*Lámina 01. Lucas no la explicó en el audio: es lo que ya está.*

El cliente de siempre: la persona que lleva el alimento del perro, la oficina. Se factura con el precio de lista, sale con el **remito de entrega** firmado y queda en la cuenta corriente con su vencimiento.

| Paso de Lucas | Hoy | Lo que falta |
|---|---|---|
| ① Alta de cliente con datos y límite | ✅ Ficha con límite de crédito y días de vencimiento | — |
| ② Factura + remito de entrega | ✅ La caja factura a cuenta corriente; el remito se emite desde la venta | — |
| ③ Baja de stock y registro en la cuenta, con vencimiento | ✅ Lo hace el cobro, con los días de la ficha | — |
| ④ Factura por mail automática | ✅ Sale sola al facturar a cuenta corriente, si el cliente tiene mail (29/10): desde la caja, Facturación y *Por facturar*; no se repite. La emitida sin conexión con CAEA se manda con el botón | — |
| ④ ¿Adjuntar el remito firmado? | ✅ Foto del remito firmado (29/10): se sube desde Remitos, con el celular o la PC, con quién firmó y cuándo; se ve en el remito y en la cuenta corriente. Privada, y no se borra | — |
| ⑤ Resumen de vencidos por cliente | ✅ Pestaña *Vencidos* en Clientes (29/10): por cliente, con el total, los días y cada comprobante con lo que le queda impago | — |
| ⑤ Alerta al vender a quien debe | ✅ Frena en el mayorista, el mostrador y la caja (29/10): aviso al elegir el cliente, y la venta a cuenta corriente no avanza hasta que un encargado la autoriza con su PIN; queda anotado quién la dejó pasar. También sin conexión | — |

> Nota sobre el orden de Lucas: en su lámina la factura «acredita la venta pero no descarga stock» y el stock baja en el paso siguiente. En el sistema pasa todo en el mismo momento, al cobrar a cuenta corriente, y es mejor así: no hay un rato en el que la mercadería salió y el stock no lo sabe.

---

## 2. Venta en cuenta corriente especial — el remito interno

*Lámina 02.*

**Quiénes:** las municipalidades, clientes de muchos años, amigos. Les hace los precios su papá, cada vez distintos («hay mucho por vencer, llevalo a tanto»). **No se puede estandarizar** y Lucas no quiere que en el mostrador estén preguntando a qué precio.

**El circuito:**

1. **Sale la mercadería con un remito interno (Xi).** Descuenta stock. Lleva cliente, productos y cantidades; **los precios quedan para después**. Se imprime y el cliente firma.
2. **Queda en una pestaña nueva, *Pendientes de facturar*.** Es un registro provisorio en la cuenta corriente: se ve que el cliente se llevó eso, todavía sin importe.
3. **El hijo entra, pone los precios y aprieta *Facturar*.** Sale la factura **o el comprobante interno** —las dos, según el cliente— a la cuenta corriente, con su vencimiento —suele ser 30 días—. **Se puede facturar un remito solo o juntar varios del mismo cliente** en un comprobante: depende de cuántos pedidos haya hecho. **No vuelve a descontar stock**: ya lo descontó el remito. Cada remito pasa a *Facturado* y queda asociado a su comprobante.
4. Mail automático y vencidos, igual que el punto 1.

**Cómo se construye, en criollo:** el sistema ya sabe hacer la mitad. Hoy un remito sobre una venta todavía sin cobrar **descuenta stock, y cuando se cobra la venta no vuelve a descontar** (está probado desde el 04/09). El remito interno es eso mismo con dos cosas nuevas: **la venta queda esperando precios** en vez de ir a la caja, y **una pantalla para ponerlos de una vez** —una grilla con el producto, la cantidad, el precio de lista sugerido y el casillero para el precio de verdad—.

**Cómo los separo**, preguntó Lucas: con una marca en la ficha del cliente, **«Precio a convenir»**. Cuando el vendedor elige ese cliente, el mostrador le ofrece el remito interno en lugar de mandar a la caja. Lo puede hacer igual con cualquier cliente.

### Lo que ya está — 29/10

- **En el Mostrador**, con un cliente de cuenta corriente: **Remito interno · precio después**. Descuenta stock, se imprime para firmar y no pasa por la caja. Sólo productos del catálogo. Con deuda vencida, PIN de un encargado.
- **En Facturación, *Pendientes de facturar***: se eligen uno o varios remitos del cliente, se ponen los precios en una grilla —el de lista viene escrito— y sale la **factura o el comprobante interno** a cuenta corriente. No vuelve a descontar stock y cada remito queda asociado a su venta. La factura sale sola por mail.
- **En la cuenta corriente del cliente**, los remitos todavía sin precio, arriba de los movimientos.
- **Falta la marca «Precio a convenir»** en la ficha: por ahora el botón se ofrece a todo cliente de cuenta corriente.

---

## 3. Productos asociados a una factura

*Lámina 05.*

**El caso:** un secadero o una empresa de fumigación se lleva repuestos y, además, alimento y medicamentos para los perros de los dueños. **Quieren una sola factura que diga «Repuestos pulverizadora»** o «Fumigación». Hoy eso le deja el stock mal —lo que salió no se descuenta— o lo obliga a hacer presupuesto y después proforma, y le duplica la caja.

**Lo que pide:** cargar los productos reales, decir **«bajo qué concepto»** se muestran, y que:

- **la factura muestre sólo el concepto**, por el total de los productos (en su ejemplo, Octaderm $15.000 + Royal Canin $65.000 = *Repuestos pulverizadora* $80.000);
- **el stock descuente los productos reales**, uno por uno;
- **la caja reciba la plata** una sola vez;
- y **se pueda ver después qué se llevó de verdad**, con un tilde o un ícono en la factura. «Viene la gente de la oficina y me pregunta quién llevó y qué llevó.»

**Cómo se construye:** los conceptos son **3 o 4 productos comodín fijos** (Repuestos pulverizadora, Fumigación, Veneno, y el que diga Lucas), que **no llevan stock**. En el mostrador, una tecla —él propuso **F11**— abre *Asociar productos*: se marcan los renglones, se elige el concepto, y los renglones quedan agrupados debajo. Lo que se guarda es la venta real; lo que se imprime es el concepto. Ya existe el producto comodín desde el 09/09: lo nuevo es el agrupamiento.

### Lo que ya está — 29/10

- **En el Mostrador, F11**: se marcan los renglones y se elige el concepto. La venta guarda los productos reales —stock, caja e IVA salen de ellos— y cada renglón dice bajo qué concepto se imprime.
- **La factura, el comprobante interno y el presupuesto** muestran un renglón por concepto, por el total; en la factura, uno por alícuota si el concepto mezcla. **El remito** sigue mostrando lo que se llevó.
- **Al abrir la factura en pantalla**, debajo del concepto se ve cada producto real con un ✓. No sale impreso.
- **Los conceptos** se editan en Configuración. Arrancan con Repuestos pulverizadora, Fumigación y Veneno, hasta que Lucas conteste la pregunta 8.
- **Sobre el IVA:** como a ARCA le van los totales por alícuota de los productos reales, el IVA declarado coincide siempre. Lo que sigue en pie del aviso de abajo es que el texto de la factura describe otra cosa.

> ⚠️ **Para decirlo una vez, antes de construirlo.** Una factura que dice «Repuestos pulverizadora» por alimento de perro **describe otra cosa de la que salió**. Y este diseño guarda la prueba: el stock dice Royal Canin y la factura dice repuesto. Además, si los productos reales tienen **otra alícuota de IVA** que el concepto (un 10,5 % metido en un renglón de 21 %), el IVA declarado no coincide. Es decisión de Lucas y es una práctica común; **conviene que Armando la mire** antes de usarla, y que el concepto tome la alícuota de los productos que agrupa.

---

## 4. Los tres tipos de remito

*Lámina 06. «Te puse tres tipos de remito.»*

| | **Remito de entrega (XE)** | **Remito interno (Xi)** | **Remito logístico (R)** |
|---|---|---|---|
| **Para** | Cuenta corriente normal | Cuenta corriente especial | Mayorista que viaja por la provincia |
| **Precios** | No lleva | Se ponen después, para facturar | No lleva (se le pueden poner) |
| **Firma del cliente** | Sí | Sí | Sí |
| **Descuenta stock** | Si la venta no lo descontó | Sí, siempre | Sí, siempre —ver abajo— |
| **Va asociado a** | Su factura | La factura que sale después | Su factura o su proforma |
| **Autorización fiscal** | No (documento interno) | No (documento interno) | **Sí, con CAI** |
| **Hoy** | ✅ Es el remito que ya existe | Nuevo (punto 2) | Nuevo |

### El remito logístico: es CAI, no CAE — con hojas de imprenta

Lucas habló de un «talonario con CAE». **Para remitos lo que existe es el CAI** —el Código de Autorización de Impresión—. El CAE es sólo para facturas electrónicas, y **ARCA no autoriza remitos uno por uno** (sólo tiene remito electrónico para carne y harina). Por eso Armando le habló de la imprenta.

**Decidido el 26/10: sin talonarios de imprenta.** Gross pide el CAI en ARCA **una vez**, para un punto de venta exclusivo de remitos y una cantidad de números, y **el sistema imprime el remito entero** —en hoja en blanco o en PDF al celular, que la RG 5678/2025 permite desde 2025—. Es como lo hacen sus proveedores. El paso a paso para Lucas y Armando está en [`tramite-remito-r.md`](tramite-remito-r.md).

**Cambió el 29/10, con la respuesta de Armando: hojas de imprenta.** Para imprimir el remito entero hay que ser **autoimpresor**, y ARCA lo da con un volumen de comprobantes A al año que Gross no tiene —pide unos 3.000 y Gross emite cerca de la mitad—. Armando tampoco lo recomienda. Lo que propone: **pedir a una imprenta las hojas A4 del remito R, con CAI, por duplicado, e imprimir el sistema sobre ellas.** Con eso el paso a paso de [`tramite-remito-r.md`](tramite-remito-r.md) ya no se sigue: el CAI lo gestiona la imprenta.

**Cómo queda:**

- **La imprenta trae lo fijo**: la letra R, el número de cada hoja, el CAI y su vencimiento, los datos de Gross y *Documento no válido como factura*.
- **El sistema imprime lo que cambia**, en el espacio libre de la hoja: fecha, destinatario y su domicilio, quién lleva la carga, los renglones y la factura o proforma asociada. Conviene pedirle a la imprenta **el cuerpo de la hoja en blanco**, sin cuadrícula, así el sistema lo acomoda sin depender de líneas preimpresas.
- **El número lo pone la hoja.** En Configuración se cargan el CAI, su vencimiento y el rango de números de las hojas que entregó la imprenta. El sistema propone el número de la hoja siguiente y lo guarda con el remito; si una hoja se arruina, se anula ese número y se usa la próxima. No deja pasar del último número ni del vencimiento, y avisa antes, para encargar hojas a tiempo.
- **Por duplicado:** original para el que recibe y duplicado para Gross. Si la imprenta entrega hojas sueltas y no en papel autocopiativo, el sistema imprime dos veces.
- **Sin PDF al celular:** el remito R es la hoja de imprenta.

**Lo que falta para hacerlo:** **una hoja de muestra de la imprenta** —o el diseño que vaya a usar—, para acomodar la impresión al espacio libre, y el CAI con el rango de números de la primera tanda.

### ¿Cuándo baja el stock? — la regla, para que no cambie según el caso

Lucas lo preguntó y en el audio llegó solo a la respuesta: **«lo que certifica la salida de mercadería es el remito»**. La regla del sistema queda así, para todos los casos:

> **Si hay remito, el stock baja con el remito. Si no hay remito, baja con la factura o el comprobante interno. Nunca dos veces.**

Ya funciona así desde el 04/09 para el remito de entrega. Sirve también para el mayorista que no quiere factura: lleva su remito logístico, el stock baja ahí, y la proforma no vuelve a bajar nada.

---

## 5. Venta mayorista — la sección *Mayorista*

*Láminas 03 y 07. Lo usa **Facundo**, el vendedor de calle.*

Lucas la pidió como módulo aparte **porque quiere que Facundo entre sólo ahí**. Eso se resuelve con **un rol nuevo, *Vendedor de calle***, que al entrar ve únicamente la sección *Mayorista*, desde el celular.

**Qué ve y qué puede hacer Facundo lo decide Lucas desde Configuración** (respuesta 5), con los mismos permisos por rol que ya tiene el sistema. Arranca con un punto medio:

| Permiso | Arranca |
|---|---|
| Ver el stock disponible | ✅ Sí |
| Ver el saldo y los vencidos del cliente | ✅ Sí |
| Ver el costo de los productos | ❌ No |
| Cambiar el precio de la lista | ❌ No |
| Ver clientes que no son mayoristas | ❌ No |
| Armar pedidos y órdenes de recibo | ✅ Sí — siempre sujetos a confirmación del local | Facundo ya está armando algo propio con una IA gratuita; Lucas quiere que **los datos queden en el sistema y no en lo de Facundo**.

### Lo que ya está — primera entrega, 28/10

Para que Facundo salga a la calle la semana del 2/11. Va en la **0.18.0**.

- **El rol *Vendedor de calle*** y seis permisos que Lucas tilda desde *Usuarios → Roles y permisos*: armar pedidos, cargar clientes, ver el stock, ver la deuda, pedir a otro precio, y atender los pedidos (el del local). El rol arranca con los cuatro primeros. Encargado y Administrador tienen todos.
- **La sección *Mayorista***, con tres pestañas: **Pedidos**, **Clientes** y **Lista de precios**. Facundo ve sólo las dos primeras; al entrar, va directo a Pedidos.
- **El cliente mayorista**: la misma ficha, con la marca *Lo atiende el vendedor de calle*, la ruta y la zona (en *Clientes*, sección *Venta mayorista*). Desde el teléfono, Facundo da de alta clientes —con el CUIT trae los datos de ARCA, y si el documento ya estaba no lo duplica: le pone la marca— y guarda **la ubicación parado en el local del cliente**. Un cliente nuevo nace con cuenta corriente a 30 días y la lista mayorista. **De uno que ya existe, Facundo sólo toca el contacto y la ubicación**: los datos fiscales se corrigen en el local.
- **Los clientes, por ruta**: con lo vencido y desde cuándo, el último pedido, y botones para **llamar, escribir por WhatsApp y abrir el mapa** («Cómo llegar»).
- **La lista de precios mayorista**: precio fijo por producto, se carga en *Mayorista → Lista de precios*. Facundo ve sólo esos productos.
- **El pedido**: Facundo elige el cliente, busca los productos y manda. **Sin señal, el pedido queda en el teléfono y sale solo cuando vuelve**, sin duplicarse. En el local, el número de pedidos esperando se ve en el menú. Depósito corrige lo que falte y lo marca **corroborado**; después **Facturar** o **Sin factura** (comprobante interno), a la cuenta corriente —es la venta de siempre: baja el stock, anota la deuda con su vencimiento y controla el límite de crédito—. La factura sale por mail al cliente si tiene mail. Después, **Remito**.

- **La orden de recibo** (*Mayorista → Cobros*, y el botón *Cobro* en cada cliente): Facundo anota cuánto le pagaron, cómo —transferencia, efectivo o cheque— y un detalle. **Sin señal queda en el teléfono y sale sola cuando vuelve**, sin duplicarse. **No baja la deuda.** En el local, el número de órdenes esperando se ve en el menú; **«Entró la plata: emitir el recibo»** abre la cobranza con lo que dijo Facundo ya puesto, para corregirlo si entró otra cosa. Recién ahí sale el recibo y baja la deuda. O **Rechazar**, con el motivo, que Facundo ve.
- **El recibo numerado**, el mismo para toda cobranza de cuenta corriente: el de la ficha del cliente también sale con número (0001-00000001 en adelante). Hoja A4 para imprimir con el importe en letras y el saldo que queda, y **por mail en PDF**: al aceptar una orden se manda solo si el cliente tiene mail; desde la hoja, *Mandar por mail* a cualquier dirección. **El registro de recibos** está en *Clientes → Recibos*, por cliente o por número.
- **Marcar a un cliente como mayorista le abre la cuenta corriente** a 30 días (si no la tenía): sin eso no se le puede vender por pedido ni aceptar sus cobros.
- **El mail del pedido**: apenas el pedido llega al local, al cliente le llega el detalle —productos, cantidades, precios y total, y la nota de Facundo si dejó una—, si tiene mail cargado. En la ficha del pedido se ve si salió, y se manda de nuevo desde ahí, también a otra dirección.
- **El freno al cliente con deuda vencida** (respuesta 7): Facundo arma y manda el pedido igual, con el aviso a la vista. En el local, el pedido de un cliente con vencido dice cuánto y desde cuándo, y **no se factura ni sale sin factura hasta que un encargado lo autoriza**: con un clic si es el encargado quien está en la computadora, o con **su PIN** si se acerca. Queda anotado quién lo autorizó y cuánto debía. El permiso nuevo, *Autorizar la venta a cuenta corriente de un cliente con deuda vencida*, lo tienen Encargado y Administrador.

**Lo que falta del mayorista**, en este orden:
1. **El pin en el mapa** con todos los clientes (hoy cada uno tiene su «Cómo llegar») y **las estadísticas** (5.5).
2. **La planilla** para cargar la lista mayorista de a muchos.
3. **Anular un recibo**: hoy un recibo emitido por error se compensa a mano en la cuenta corriente.

### 5.1 El cliente mayorista

**Recomendación: la misma lista de clientes, con una marca *Mayorista*. No una lista aparte.** Lucas dio el ejemplo en contra de partirla: el cliente que tiene una empresa de fumigación y a la vez le compra Livra. Con dos listas sería dos clientes, con dos deudas que nadie suma.

Lo nuevo de la ficha, sólo para los mayoristas:
- **Ciudad, zona y ruta** (ruta 12, ruta 14…), para ordenar y filtrar.
- **Un pin en el mapa.** Lucas: «con el pin es lo mejor, no necesito tan avanzado ahora». Se hace con mapas libres (OpenStreetMap), sin costo por uso; Mapbox no hace falta.
- **Lo que Facundo necesita antes de salir a la ruta**: si debe, cuánto y desde cuándo, su último pedido, si hay que contactarlo.

### 5.2 La lista de precios mayorista

Lucas quiere que Facundo pida «tres bolsas de cachorro» y que al llegar **el precio ya esté**, sin preguntar. Francisco le propuso **una tercera lista, *Mayorista***, y él aceptó probarlo.

**Un dato para corregir lo que se dijo en el audio:** las listas **no son sólo por porcentaje**. La base guarda desde agosto **un precio fijo por producto en cada lista**, que le gana al porcentaje. **La pantalla ya está** (*Mayorista → Lista de precios*); falta la planilla para cargarlo de a muchos. Son pocos productos (Livra, por ahora), así que alcanza con eso. **Facundo sólo ve y elige los productos que tienen precio en esa lista.**

### 5.3 La orden de pedido

Facundo arma el pedido desde el celular: cliente, productos, cantidades, con el precio de la lista mayorista. **Al cliente le llega por mail.** En el local aparece en *Mayorista → Pedidos* y desde ahí, **en la misma pantalla**:

1. **Depósito** confirma que está todo (Agustín).
2. **Facturar** —o **proforma**, para el que no quiere factura—, con un clic. Va a la cuenta corriente.
3. **Remito logístico**, con otro clic, asociado a esa factura o proforma. Descuenta stock.
4. **Mail automático** con la factura.

**Ya está (29/10), la proforma:** el botón se llama **Proforma** —antes decía «Sin factura»— y la ficha del cliente mayorista tiene la marca **Pide proforma**. Con la marca, el pedido lo dice en la lista y en el detalle, y *Proforma* pasa a ser el botón principal; *Facturar* queda al lado para el día que pida factura. Facundo ve el aviso al armarle el pedido.

Es el ejemplo exacto de lo que Lucas llamó *integralidad*: un pedido que se recibe, se controla, se factura y se remite sin cambiar de pantalla, y que **igual aparece en Remitos y en Comprobantes** con todo lo demás.

### 5.4 La orden de recibo

El cliente le transfiere y le muestra el comprobante a Facundo; Facundo no sabe si la plata llegó. **Facundo no emite recibos: arma una *orden de recibo*.** En el local la ven, confirman que entró la plata («¿te llegó, papá?»), aprietan **Aceptar** y recién ahí:

- se emite el **recibo** de verdad, numerado,
- **baja la deuda** de la cuenta corriente,
- y **se le manda por mail** al cliente.

Lucas lo dijo claro: si el vendedor puede bajar deuda, el día que es amigo del de la veterinaria le da de baja algo que no se pagó. **Todo lo que hace Facundo queda sujeto a confirmación del local.** Y hay un **registro de recibos** para buscarlos después.

> Hoy la cobranza de cuenta corriente se registra, pero **no sale un recibo numerado e imprimible**: el número se escribe a mano en el concepto. El recibo hace falta igual para el fiado y para el mostrador, así que se hace una vez y sirve para todo.

### 5.5 Vencimientos y estadísticas

- **Avisos de vencimiento** de la cuenta corriente: el mismo listado de vencidos del punto 1, filtrado por mayoristas y por ruta.
- **Estadísticas**: comprobantes vencidos, porcentaje cobrado, último pedido, ventas totales, cantidades, más vendidos — **por cliente, ciudad, ruta y zona**. Lucas: «estadística de todo, no te preocupes ahora, lo vamos viendo». En esta fase va un tablero con esos cortes; los cruces más finos van después.
- **Calendario de visitas**: va en las fases futuras, junto con lo de CRM.

### 5.6 Mensajes masivos por WhatsApp → fases futuras

**Va con el CRM** (una fase futura, *Campañas y comunicaciones* en el alcance). Mandar a muchos por WhatsApp de verdad necesita la API oficial, que **cobra por mensaje y pide aprobar cada plantilla**; hacerlo «a mano» desde un número común termina con el número bloqueado. Para esta fase alcanza con el aviso manual del fiado (punto 7), que sirve igual para un mayorista: un botón que abre WhatsApp con el mensaje escrito.

---

## 6. Orden de traslado — de animales

*Lámina 04. No la explicó en el audio; aclarado el 26/10 (respuesta 6).*

**No es el reparto de mercadería: es ir a buscar o llevar un animal**, vivo o muerto —para una eutanasia, para una operación—. Es un servicio del consultorio, con su propia pantalla, *Traslados*.

Cada orden lleva **fecha, hora, motivo** (eutanasia, cirugía, retiro, devolución…), **dirección, nombre completo y teléfono** del dueño, **descripción** —el animal: especie, tamaño, si está vivo—, **monto total** y **las facturas asociadas**. Con:

- **Estados**: pendiente, en camino, finalizada. **Se puede modificar** mientras no esté finalizada.
- **El cobro va por la caja**, como un servicio más (un producto *Traslado* sin stock), y la factura queda asociada a la orden.
- **Resumen de órdenes**, imprimible: lo que hay que buscar hoy, para el que maneja.
- **Estadísticas de distancias, costos y tiempo de viaje.** En esta fase se cargan a mano al finalizar (kilómetros, costo, cuánto tardó) y se suman. Calcular la distancia sola desde el mapa va después.
- **La dirección se abre en el mapa del celular** con un toque, para el que maneja.

Quién la carga: cualquiera con el permiso; arranca con encargados y consultorio.

**Ya está (29/10):** la pestaña **Traslados** en Ventas. La orden con fecha, hora, motivo, dirección, dueño y teléfono, el animal y el monto; los estados pendiente, en camino y finalizada, y se corrige hasta finalizarla. **Mandar a caja** deja la venta en la cola con un renglón *Traslado* sin stock, y la orden muestra la factura cuando se cobra. **Mapa** abre la dirección en Google Maps. La **hoja del día** se imprime para el que maneja. Al finalizar se anotan kilómetros, costo y tiempo, y arriba salen los totales del mes con el promedio. Los permisos van a administrador y encargado; no hay un rol de consultorio, se dan desde *Usuarios*.

---

## 7. Fiado — la sección *Fiados*

*Lámina 08 y el final del segundo audio.*

**No es cuenta corriente, y Lucas insiste por algo concreto:** si lo carga como cuenta corriente, el listado de cuentas se le llena de gente que vino una vez con el perro chocado y no tiene nada que ver con los clientes de cuenta. **Es otro registro, con su propia pantalla.** Tampoco da de alta un cliente.

**Pasa por la caja** (respuesta 4): se vende como cualquier venta —ticket, stock, todo— y se cobra con un medio de pago nuevo, **Fiado**, que pide el DNI. La deuda no va a la cuenta corriente: va a *Fiados*, que es **la cuenta de cada persona**, con todas sus ventas fiadas y sus pagos parciales. Cuando paga, el cobro entra a la caja del día.

| Pidió | Cómo queda |
|---|---|
| Nombre, DNI, domicilio, teléfono | La ficha del fiado, buscada **por DNI** |
| Descripción, cantidad, precio | Los renglones de la venta que pasó por la caja |
| Fecha de pago, modificable | Sí, con historia de los cambios |
| **Más de una fecha de cobro** | Un cronograma: «el 15 una entrega, el 18 otra» |
| Cronograma de vencimientos | La pantalla ordena por la próxima fecha, con lo vencido arriba |
| **Aviso por WhatsApp, manual** | Botón que abre WhatsApp con el mensaje armado y el número del fiado. Sin API, sin costo |
| **Historial de cobros de la misma venta** | Cada pago parcial, con fecha y quién lo cobró |
| **Recibo e imputación** | Al cobrar sale el recibo (el mismo del punto 5.4) y entra a la caja |
| **Alerta de reincidencia** | Al cargar un DNI que ya tuvo un fiado: «ojo, este DNI ya tiene una carga anterior», con lo que debe o debió. **También en la caja y el mostrador** |
| Estadísticas | Cuántos hay, por cuánto, promedio, cuánto se cobró |

> El fiado guarda DNI, domicilio y teléfono de personas que no son clientes. Es un registro propio del negocio sobre su propia deuda y está bien tenerlo; lo que no se hace es compartirlo con otros comercios. Entra en la misma base de datos personales que ya hay que tener inscripta.

**Ya está (29/10):** el medio de pago **Fiado** en la caja pide DNI, nombre, domicilio, teléfono y la fecha en que paga; anda también sin conexión. La sección **Fiados** del menú ordena por lo vencido y la próxima fecha, con las estadísticas arriba. En la ficha de cada persona: sus ventas fiadas con los renglones, **Cobrar** (recibo del mismo talonario y a la caja del día, a las ventas más viejas o a la que se elija), **Cambiar fechas** en una o varias, con la historia de cada cambio, y **WhatsApp** con el mensaje armado. El aviso del DNI sale en la caja y, al marcar *Fiado* en el mostrador, también ahí.

---

## 8. La proforma que se factura desde la misma pantalla

*Lámina 07, punto 4.* Un comprobante interno (proforma) que después hay que facturar: hoy hay que rehacer la venta. **Un botón *Facturar* en el comprobante interno**, que emite la factura con los mismos renglones y deja los dos asociados. El stock no se toca dos veces.

**Ya está (29/10):** *Facturar* en cada comprobante interno de una venta cobrada, en *Comprobantes no fiscales*. La factura sale con fecha de hoy; stock y caja no se tocan; el interno queda «facturado» y enlazado a la factura. La percepción de IIBB, si corresponde, se carga a la cuenta corriente.

---

## Lo que se anota aparte: la auditoría de integralidad

Lucas pidió algo que es más grande que estos pedidos y que no se resuelve punto por punto: **menos saltos entre pantallas**. Hoy, para un pedido de Facundo habría que mirarlo en una pantalla, hacer el remito en otra, ir a facturar a una tercera y volver a elegir el cliente. Él quiere: **el pedido llega, depósito da el ok ahí mismo, un clic arma el remito, otro clic factura**, y que después ese remito igual se vea, se busque y se exporte desde Remitos.

Eso pide **recorrer el sistema entero** con esa vara —cada circuito de punta a punta, contando pantallas y veces que se elige lo mismo— y no sólo lo nuevo. **Se hace como un trabajo propio**, después de diseñar esta fase, porque los circuitos nuevos (pedido mayorista, remito interno) tienen que nacer ya integrados y sirven de modelo para corregir los viejos.

---

## Las preguntas, contestadas el 26/10

| # | Pregunta | Respuesta | Dónde cambió el diseño |
|---|---|---|---|
| 1 | Remito interno: ¿cada remito por separado o varios juntos? | **Las dos**, según cuántos pedidos haya | Punto 2 |
| 2 | Remito interno: ¿factura o comprobante interno? | **Las dos** | Punto 2 |
| 3 | Remito logístico: ¿imprenta o autoimpresor? | **Sin imprenta**: Gross pide el CAI en ARCA y el sistema imprime el remito entero | Punto 4 y [`tramite-remito-r.md`](tramite-remito-r.md) |
| 4 | Fiado: ¿pasa por la caja? | **Sí**, y la deuda va a *Fiados*: la cuenta de cada persona, con pagos parciales | Punto 7 |
| 5 | ¿Qué ve Facundo? | **Un punto medio, y Lucas lo ajusta desde Configuración** | Punto 5 |
| 6 | Orden de traslado: ¿qué es? | **Traslado de animales**, vivos o muertos: eutanasia, operación | Punto 6 |
| 7 | Cliente con vencidos: ¿avisa o frena? | **Avisa y frena**; el encargado autoriza con su PIN | Punto 1 |
| 8 | Productos asociados: ¿qué conceptos fijos? | 🟡 **Pendiente**: Francisco se lo pregunta en detalle | Punto 3 — no frena el resto; los conceptos se cargan como productos y se pueden sumar después |

**Quedan dos cosas abiertas:** la 8, y que **Armando confirme la modalidad del punto de venta de remitos** (primer paso de [`tramite-remito-r.md`](tramite-remito-r.md)).

---

## El orden de construcción

Por lo que se usa todos los días primero, y por lo que una pieza le presta a la siguiente. **Mayorista se adelantó** (28/10): Facundo arranca la semana del 2/11, así que su circuito —sin la orden de recibo— salió primero.

| # | Qué | Por qué en este lugar |
|---|---|---|
| 1 | **Recibo numerado** | Lo necesitan el fiado, la orden de recibo y el mostrador |
| 2 | **Remito interno + *Pendientes de facturar*** | Municipalidades: es diario |
| 3 | **Productos asociados** | Diario, y le arregla el stock hoy |
| 4 | **Cuenta corriente normal**: mail automático, foto del remito, vencidos, aviso al vender | Chicos, y los usan los puntos 2, 5 y 7 |
| 5 | **Proforma → factura** | Chico, y lo usa el mayorista |
| 6 | **Fiados** | Independiente; usa el recibo |
| 7 | **Mayorista**: cliente con ruta y mapa, lista con precios fijos, rol de Facundo, pedido, orden de recibo | El más grande; usa todo lo anterior |
| 8 | **Remito logístico** | Espera el CAI: lo pide Gross en ARCA. Se puede construir antes con un CAI de prueba |
| 9 | **Traslados de animales** | Independiente; usa la caja como cualquier servicio |
| 10 | **Estadísticas** de mayorista, fiado y traslados | Necesitan datos cargados para tener sentido |

### Si el mes no alcanza

Lo que se puede pasar a las fases futuras **sin dejar nada a medias**: las **estadísticas** (10), la **orden de traslado** (9) y el **mapa** del mayorista —la ruta y la ciudad sí, el pin después—. Lo que **no conviene partir** es el circuito del mayorista: un pedido que no se puede facturar desde donde llega no le sirve a nadie.

## Lo que va en las fases futuras

- **Mensajes masivos por WhatsApp**, con ofertas, imágenes y videos — CRM.
- **Calendario de visitas** de Facundo — CRM.
- **Distancias y tiempos calculados desde el mapa** para los traslados.
- **Estadísticas cruzadas** más allá de los cortes por cliente, ciudad, ruta y zona.
- **La auditoría de integralidad** —ver arriba—, si no se hace dentro de esta fase.
