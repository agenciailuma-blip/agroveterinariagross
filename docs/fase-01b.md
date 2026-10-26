---
actualizado: 2026-10-26
estado: diseño — falta que Lucas conteste las preguntas del final
---

# Fase 01 B — lo que pidió Lucas el 26/10

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
| **6. Orden de traslado** | Función | Remitos (o Reparto) | Nada | Mediano |
| **7. Fiado** | **Sección nueva** | Menú → *Fiados* | Nada | Mediano |
| **8. Proforma que se factura desde la misma pantalla** | Función | Comprobantes | El comprobante interno | Chico |
| **9. Mensajes masivos por WhatsApp** | **CRM** — fase siguiente | — | — | — |

> 📏 **Chico** son días, **mediano** una semana, **grande** más de una. Sumado da **más de un mes**. Si hay que entrar en el mes, lo que se puede pasar a la fase siguiente sin dejar nada a medias está al final, en *Si el mes no alcanza*.

---

## 1. Venta en cuenta corriente normal

*Lámina 01. Lucas no la explicó en el audio: es lo que ya está.*

El cliente de siempre: la persona que lleva el alimento del perro, la oficina. Se factura con el precio de lista, sale con el **remito de entrega** firmado y queda en la cuenta corriente con su vencimiento.

| Paso de Lucas | Hoy | Lo que falta |
|---|---|---|
| ① Alta de cliente con datos y límite | ✅ Ficha con límite de crédito y días de vencimiento | — |
| ② Factura + remito de entrega | ✅ La caja factura a cuenta corriente; el remito se emite desde la venta | — |
| ③ Baja de stock y registro en la cuenta, con vencimiento | ✅ Lo hace el cobro, con los días de la ficha | — |
| ④ Factura por mail automática | 🟡 Hoy hay botón *Mandar por mail*, y el envío solo es sólo para la tienda | **Que salga sola al facturar a cuenta corriente**, si el cliente tiene mail |
| ④ ¿Adjuntar el remito firmado? | ❌ | **Subir la foto del remito firmado** al remito (desde el celular o la PC), y que quede a la vista en la venta y en la cuenta corriente. Esa es la trazabilidad: quién firmó, cuándo. No va en el mail de la factura, porque la factura sale antes de que firmen |
| ⑤ Resumen de vencidos por cliente | 🟡 Está la deuda por antigüedad; no hay un listado de «qué comprobantes vencieron, de quién» | **Pestaña *Vencidos*** en Clientes, por cliente, con total y días |
| ⑤ Alerta al vender a quien debe | ❌ | **Aviso en el mostrador y en la caja** al elegir un cliente con comprobantes vencidos. Ver la pregunta 7 |

> Nota sobre el orden de Lucas: en su lámina la factura «acredita la venta pero no descarga stock» y el stock baja en el paso siguiente. En el sistema pasa todo en el mismo momento, al cobrar a cuenta corriente, y es mejor así: no hay un rato en el que la mercadería salió y el stock no lo sabe.

---

## 2. Venta en cuenta corriente especial — el remito interno

*Lámina 02.*

**Quiénes:** las municipalidades, clientes de muchos años, amigos. Les hace los precios su papá, cada vez distintos («hay mucho por vencer, llevalo a tanto»). **No se puede estandarizar** y Lucas no quiere que en el mostrador estén preguntando a qué precio.

**El circuito:**

1. **Sale la mercadería con un remito interno (Xi).** Descuenta stock. Lleva cliente, productos y cantidades; **los precios quedan para después**. Se imprime y el cliente firma.
2. **Queda en una pestaña nueva, *Pendientes de facturar*.** Es un registro provisorio en la cuenta corriente: se ve que el cliente se llevó eso, todavía sin importe.
3. **El hijo entra, pone los precios y aprieta *Facturar*.** Sale la factura (o el comprobante interno) a la cuenta corriente, con su vencimiento —suele ser 30 días—. **No vuelve a descontar stock**: ya lo descontó el remito. El remito pasa a *Facturado*.
4. Mail automático y vencidos, igual que el punto 1.

**Cómo se construye, en criollo:** el sistema ya sabe hacer la mitad. Hoy un remito sobre una venta todavía sin cobrar **descuenta stock, y cuando se cobra la venta no vuelve a descontar** (está probado desde el 04/09). El remito interno es eso mismo con dos cosas nuevas: **la venta queda esperando precios** en vez de ir a la caja, y **una pantalla para ponerlos de una vez** —una grilla con el producto, la cantidad, el precio de lista sugerido y el casillero para el precio de verdad—.

**Cómo los separo**, preguntó Lucas: con una marca en la ficha del cliente, **«Precio a convenir»**. Cuando el vendedor elige ese cliente, el mostrador le ofrece el remito interno en lugar de mandar a la caja. Lo puede hacer igual con cualquier cliente.

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

### El remito logístico: es CAI, no CAE

Lucas habló de un «talonario con CAE». **Para remitos lo que existe es el CAI** —el Código de Autorización de Impresión—, que ARCA le da a la imprenta o a quien imprime sus propios comprobantes. El CAE es sólo para facturas electrónicas. Por eso Armando le dijo lo de la imprenta: es correcto.

Hay **dos caminos**, y conviene que Armando elija:

| | **Talonario de la imprenta** (lo que dijo Armando) | **Autoimpresor** |
|---|---|---|
| Cómo | La imprenta de Tucumán imprime 200 remitos en blanco con el CAI; el sistema imprime adentro de los recuadros | Gross se inscribe como autoimpresor y saca el CAI para un punto de venta; **el sistema imprime el remito entero**, y desde 2025 puede ser digital, mostrado en el celular (RG 5678/2025) |
| Lo que hacemos nosotros | **Una plantilla que encaje en el papel preimpreso** —hay que tener el talonario en la mano para medirlo— | El remito completo, con el CAI y la numeración |
| Ventaja | Rápido de arrancar | Sin papel especial ni encuadrar. Es como lo hacen sus proveedores |
| Contra | Si la impresora corre un milímetro, sale fuera del recuadro | Trámite en ARCA; Armando tiene que confirmar que Gross cumple los requisitos |

### ¿Cuándo baja el stock? — la regla, para que no cambie según el caso

Lucas lo preguntó y en el audio llegó solo a la respuesta: **«lo que certifica la salida de mercadería es el remito»**. La regla del sistema queda así, para todos los casos:

> **Si hay remito, el stock baja con el remito. Si no hay remito, baja con la factura o el comprobante interno. Nunca dos veces.**

Ya funciona así desde el 04/09 para el remito de entrega. Sirve también para el mayorista que no quiere factura: lleva su remito logístico, el stock baja ahí, y la proforma no vuelve a bajar nada.

---

## 5. Venta mayorista — la sección *Mayorista*

*Láminas 03 y 07. Lo usa **Facundo**, el vendedor de calle.*

Lucas la pidió como módulo aparte **porque quiere que Facundo entre sólo ahí**. Eso se resuelve con **un rol nuevo, *Vendedor de calle***, que al entrar ve únicamente la sección *Mayorista*, desde el celular. Facundo ya está armando algo propio con una IA gratuita; Lucas quiere que **los datos queden en el sistema y no en lo de Facundo**.

### 5.1 El cliente mayorista

**Recomendación: la misma lista de clientes, con una marca *Mayorista*. No una lista aparte.** Lucas dio el ejemplo en contra de partirla: el cliente que tiene una empresa de fumigación y a la vez le compra Livra. Con dos listas sería dos clientes, con dos deudas que nadie suma.

Lo nuevo de la ficha, sólo para los mayoristas:
- **Ciudad, zona y ruta** (ruta 12, ruta 14…), para ordenar y filtrar.
- **Un pin en el mapa.** Lucas: «con el pin es lo mejor, no necesito tan avanzado ahora». Se hace con mapas libres (OpenStreetMap), sin costo por uso; Mapbox no hace falta.
- **Lo que Facundo necesita antes de salir a la ruta**: si debe, cuánto y desde cuándo, su último pedido, si hay que contactarlo.

### 5.2 La lista de precios mayorista

Lucas quiere que Facundo pida «tres bolsas de cachorro» y que al llegar **el precio ya esté**, sin preguntar. Francisco le propuso **una tercera lista, *Mayorista***, y él aceptó probarlo.

**Un dato para corregir lo que se dijo en el audio:** las listas **no son sólo por porcentaje**. La base guarda desde agosto **un precio fijo por producto en cada lista**, que le gana al porcentaje. **Lo que falta es la pantalla** para cargarlo —y la planilla para cargarlo de a muchos—. Son pocos productos (Livra, por ahora), así que alcanza con eso. **Facundo sólo ve y elige los productos que tienen precio en esa lista.**

### 5.3 La orden de pedido

Facundo arma el pedido desde el celular: cliente, productos, cantidades, con el precio de la lista mayorista. **Al cliente le llega por mail.** En el local aparece en *Mayorista → Pedidos* y desde ahí, **en la misma pantalla**:

1. **Depósito** confirma que está todo (Agustín).
2. **Facturar** —o **proforma**, para el que no quiere factura—, con un clic. Va a la cuenta corriente.
3. **Remito logístico**, con otro clic, asociado a esa factura o proforma. Descuenta stock.
4. **Mail automático** con la factura.

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
- **Calendario de visitas**: va en la fase siguiente, junto con lo de CRM.

### 5.6 Mensajes masivos por WhatsApp → fase siguiente

**Va con el CRM** (fase siguiente, *Campañas y comunicaciones* en el alcance). Mandar a muchos por WhatsApp de verdad necesita la API oficial, que **cobra por mensaje y pide aprobar cada plantilla**; hacerlo «a mano» desde un número común termina con el número bloqueado. Para esta fase alcanza con el aviso manual del fiado (punto 7), que sirve igual para un mayorista: un botón que abre WhatsApp con el mensaje escrito.

---

## 6. Orden de traslado

*Lámina 04. No la explicó en el audio.*

Un papel para cada salida: **fecha, hora, motivo, dirección, nombre completo, teléfono, descripción, monto total, facturas y remito asociados**. Con:

- **Estados**: pendiente, en camino, finalizada. **Se puede modificar** mientras no esté finalizada.
- **Resumen de órdenes**, imprimible: lo que sale hoy, para el que maneja.
- **Estadísticas de distancias, costos y tiempo de viaje.** En esta fase se cargan a mano al finalizar (kilómetros, costo, cuánto tardó) y se suman. Calcular la distancia sola desde el mapa va después.

Vive al lado de Remitos: hoy esa pantalla ya contesta «qué sale hoy». Ver la pregunta 6.

---

## 7. Fiado — la sección *Fiados*

*Lámina 08 y el final del segundo audio.*

**No es cuenta corriente, y Lucas insiste por algo concreto:** si lo carga como cuenta corriente, el listado de cuentas se le llena de gente que vino una vez con el perro chocado y no tiene nada que ver con los clientes de cuenta. **Es otro registro, con su propia pantalla.** Tampoco da de alta un cliente.

| Pidió | Cómo queda |
|---|---|
| Nombre, DNI, domicilio, teléfono | La ficha del fiado, buscada **por DNI** |
| Descripción, cantidad, precio | Los renglones —ver la pregunta 4— |
| Fecha de pago, modificable | Sí, con historia de los cambios |
| **Más de una fecha de cobro** | Un cronograma: «el 15 una entrega, el 18 otra» |
| Cronograma de vencimientos | La pantalla ordena por la próxima fecha, con lo vencido arriba |
| **Aviso por WhatsApp, manual** | Botón que abre WhatsApp con el mensaje armado y el número del fiado. Sin API, sin costo |
| **Historial de cobros de la misma venta** | Cada pago parcial, con fecha y quién lo cobró |
| **Recibo e imputación** | Al cobrar sale el recibo (el mismo del punto 5.4) y entra a la caja |
| **Alerta de reincidencia** | Al cargar un DNI que ya tuvo un fiado: «ojo, este DNI ya tiene una carga anterior», con lo que debe o debió. **También en la caja y el mostrador** |
| Estadísticas | Cuántos hay, por cuánto, promedio, cuánto se cobró |

> El fiado guarda DNI, domicilio y teléfono de personas que no son clientes. Es un registro propio del negocio sobre su propia deuda y está bien tenerlo; lo que no se hace es compartirlo con otros comercios. Entra en la misma base de datos personales que ya hay que tener inscripta.

---

## 8. La proforma que se factura desde la misma pantalla

*Lámina 07, punto 4.* Un comprobante interno (proforma) que después hay que facturar: hoy hay que rehacer la venta. **Un botón *Facturar* en el comprobante interno**, que emite la factura con los mismos renglones y deja los dos asociados. El stock no se toca dos veces.

---

## Lo que se anota aparte: la auditoría de integralidad

Lucas pidió algo que es más grande que estos pedidos y que no se resuelve punto por punto: **menos saltos entre pantallas**. Hoy, para un pedido de Facundo habría que mirarlo en una pantalla, hacer el remito en otra, ir a facturar a una tercera y volver a elegir el cliente. Él quiere: **el pedido llega, depósito da el ok ahí mismo, un clic arma el remito, otro clic factura**, y que después ese remito igual se vea, se busque y se exporte desde Remitos.

Eso pide **recorrer el sistema entero** con esa vara —cada circuito de punta a punta, contando pantallas y veces que se elige lo mismo— y no sólo lo nuevo. **Se hace como un trabajo propio**, después de diseñar esta fase, porque los circuitos nuevos (pedido mayorista, remito interno) tienen que nacer ya integrados y sirven de modelo para corregir los viejos.

---

## Las preguntas para Lucas

Cambian el diseño; sin respuesta se construye con la opción que va primero.

1. **Remito interno:** a la municipalidad, ¿se le factura **cada remito por separado o varios juntos** en una factura a fin de mes? *(Se construye para poder juntar varios.)*
2. **Remito interno:** al poner precios, ¿sale **siempre factura**, o a veces comprobante interno? *(Las dos.)*
3. **Remito logístico:** ¿**talonario de la imprenta o autoimpresor**? Es para Armando. *(Hasta que conteste, se arranca por la plantilla del talonario: hace falta uno en la mano para medirlo.)*
4. **Fiado:** lo que se lleva, ¿**sale por la caja** como cualquier venta —con su ticket y descontando stock— y la deuda queda en Fiados? ¿O es sólo una anotación, por ejemplo una cirugía? *(Por la caja, con un medio de pago *Fiado*: si no, el stock y la caja no cierran.)*
5. **Facundo**, en el celular: ¿ve el **stock**? ¿Ve **la deuda** del cliente? ¿Puede **ofrecer otro precio** o sólo el de la lista? *(Ve stock y deuda; precio sólo el de la lista.)*
6. **Orden de traslado:** ¿es **el reparto propio** del local, o también otros viajes (ir a buscar mercadería, trámites)? ¿Quién la carga?
7. **Cliente con vencidos:** el aviso al venderle, ¿**sólo avisa o frena** la venta hasta que alguien con permiso la deje pasar? *(Avisa; el encargado puede frenar.)*
8. **Productos asociados:** ¿cuáles son los **conceptos fijos**? Dijo Repuestos pulverizadora, Fumigación, Veneno «y algo más».

---

## El orden de construcción

Por lo que se usa todos los días primero, y por lo que una pieza le presta a la siguiente:

| # | Qué | Por qué en este lugar |
|---|---|---|
| 1 | **Recibo numerado** | Lo necesitan el fiado, la orden de recibo y el mostrador |
| 2 | **Remito interno + *Pendientes de facturar*** | Municipalidades: es diario |
| 3 | **Productos asociados** | Diario, y le arregla el stock hoy |
| 4 | **Cuenta corriente normal**: mail automático, foto del remito, vencidos, aviso al vender | Chicos, y los usan los puntos 2, 5 y 7 |
| 5 | **Proforma → factura** | Chico, y lo usa el mayorista |
| 6 | **Fiados** | Independiente; usa el recibo |
| 7 | **Mayorista**: cliente con ruta y mapa, lista con precios fijos, rol de Facundo, pedido, orden de recibo | El más grande; usa todo lo anterior |
| 8 | **Remito logístico** | Espera la respuesta de Armando y el talonario |
| 9 | **Orden de traslado** | Espera la pregunta 6 |
| 10 | **Estadísticas** de mayorista, fiado y traslados | Necesitan datos cargados para tener sentido |

### Si el mes no alcanza

Lo que se puede pasar a la fase siguiente **sin dejar nada a medias**: las **estadísticas** (10), la **orden de traslado** (9) y el **mapa** del mayorista —la ruta y la ciudad sí, el pin después—. Lo que **no conviene partir** es el circuito del mayorista: un pedido que no se puede facturar desde donde llega no le sirve a nadie.

## Lo que va en la fase siguiente

- **Mensajes masivos por WhatsApp**, con ofertas, imágenes y videos — CRM.
- **Calendario de visitas** de Facundo — CRM.
- **Distancias y tiempos calculados desde el mapa** para los traslados.
- **Estadísticas cruzadas** más allá de los cortes por cliente, ciudad, ruta y zona.
- **La auditoría de integralidad** —ver arriba—, si no se hace dentro de esta fase.
