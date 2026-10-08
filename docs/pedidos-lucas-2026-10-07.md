---
fecha: 2026-10-07
actualizado: 2026-10-08
estado: la caja y la suelta, construida y publicada (0.14.0); las órdenes de compra, con el modelo de Lucas, sin construir
---

# Los audios de Lucas del 07/10 — caja y unidad, orden de compra interna, stock por proveedor

> Tres pedidos en cinco audios. **Uno ya estaba prometido para el corte y no estaba hecho** —la caja y la unidad—; los otros dos son de V1-B y aclaran qué quería decir el alcance.

## Lo que contestó Lucas el 08/10

- **La autorización de ARCA para traer los datos por CUIT: creada.** Verificada ese día contra ARCA de pruebas: con su CUIT devolvió el nombre y el aviso de que le falta el domicilio fiscal electrónico, y con el de una empresa, la constancia completa. Falta lo mismo para el certificado de producción.
- **La caja y la unidad: «me parece perfecto».** Hay **unos cinco productos de tres niveles** —se venden por caja, por tableta y por pastilla—, y la caja casi no se vende entera porque dura mucho. Pidió la misma lógica para los tres niveles, y así se construyó: la pastilla sale de la tableta y la tableta de la caja.
- **El precio de la suelta** no lo contestó en concreto; quedó como lo planteamos: lo pone él, y la ficha sugiere la división.
- **¿Son dos artículos en OBTech?** Tampoco lo contestó. Con pocos casos, se atan a mano en la ficha.
- **Mandó el modelo de la orden interna**, dibujado a mano, con tres audios. Está abajo, en el punto 2.

---

## 1. La caja y la unidad suelta

**Lo que pide.** Cargar el stock como le llega —en cajas— y que vender por unidad descuente de esa misma mercadería. Su ejemplo: tiene una caja de diez pastillas y vende una; tiene que quedar *«nueve unidades, ninguna caja»*, no *«una caja y nueve unidades»*. Lo que teme: dar de alta las cajas, vender sueltas, y que el sistema siga mostrando una caja cuando quedan tres pastillas.

🔴 **Esto ya estaba en V1-A y no está hecho.** El alcance, §3 Catálogo: *«Venta fraccionada (se da de baja la unidad completa y se vende por porción)»*. La base tiene los campos desde agosto (`permite_fraccionamiento`, `contenido`) y el tipo de movimiento `apertura`, pero nada los usa. El guion de la prueba del corte no lo vio porque los doce puntos de terminado no lo nombran.

Lo único que hay hoy: un producto por kilo se vende con decimales. Nada ata la bolsa cerrada a los kilos sueltos.

### ✅ Construida el 08/10 y publicada en la 0.14.0, como se propuso y con tres niveles

El detalle técnico y cómo se verificó está en [[Lo construido, en detalle]], §3e.

### La propuesta: la caja y la suelta, atadas, y la caja se abre sola

- **Dos productos, atados.** La caja —la que se compra, se recibe y se cuenta— y la unidad suelta, con su precio y, si tiene, su código de barras. Se atan desde la ficha de la caja: *Se vende también suelto*, cuántas trae, y el precio de la suelta.
- **El stock se carga como llega: en cajas.** Recepción, toma de inventario y carga inicial, igual que hoy.
- **Al vender una suelta cuando no quedan sueltas, el sistema abre una caja solo:** la caja baja una, las sueltas suben diez y la venta sale de ahí. Queda en el libro de stock como *Apertura de caja*, con quién, cuándo y por qué venta.
- **Se ven juntas.** En Stock, en la ficha y en el mostrador: *TOTAL MAX — 0 cajas cerradas + 9 sueltas*. Es el ejemplo de Lucas tal cual.
- **La caja entera se vende como siempre**, pasando el código de la caja.

> **Cómo se lo contás a Lucas:** cargás la caja como te llega. Cuando el vendedor vende una pastilla suelta y no quedan sueltas, el sistema abre una caja solo: te muestra cero cajas y nueve sueltas. Nunca vas a ver una caja que ya no existe, porque abrirla es parte de la misma venta.

Lo que decidimos de nuestro lado, con su porqué:

| Decisión | Por qué |
|---|---|
| La caja se abre sólo cuando no quedan sueltas | Es lo que pasa en el mostrador: no se abre una caja nueva con la otra a medias |
| Lo que vuelve —devolución o anulación— vuelve como suelto | La caja ya está abierta: no se puede volver a cerrar |
| El aviso de stock bajo cuenta las cajas cerradas | Es lo que se le pide al proveedor. Nueve sueltas son una caja que ya se está terminando |
| El costo de la suelta es el de la caja dividido lo que trae, y se actualiza solo con cada recepción | Si no, el margen de la suelta queda calculado con un costo viejo |
| Sin internet, el mostrador cuenta como disponibles las sueltas más lo que hay en cajas | Para que no diga «sin stock» habiendo una caja cerrada. La apertura la registra el servidor cuando sube la venta |
| La toma de inventario cuenta cajas cerradas y sueltas por separado | Es como se cuenta en el estante |
| El aumento por proveedor sube las dos | Ya pasa solo: las dos tienen el mismo proveedor |
| A la tienda web sale la que se prenda con *Vender online* | Cada una es un producto: la API no cambia |

Sirve igual para el alimento suelto: la bolsa de 15 kg y el kilo suelto.

**Por qué dos productos atados y no uno solo con el stock en pastillas.** Uno solo obliga a cambiar la venta, la factura, la copia sin internet, las devoluciones, los remitos y la API de la tienda —todo lo que ya está probado— a menos de tres semanas del corte. Con dos atados, nada de eso se entera. Y es como ya trabajan en OBTech —ahí abrir una caja es una transferencia al depósito *Fraccionamiento*—, así que los datos pasan como están.

**Tamaño: mediano.** Un disparador nuevo en el libro de stock —con el mismo cuidado que los depósitos: se corre en seco antes de aplicar, porque por ahí pasa cada venta—, la ficha, la vista conjunta en Stock y el mostrador, el costo, y las pruebas.

**Preguntas para Lucas** (cambian lo que se construye):
1. En OBTech, ¿la caja y la unidad son dos artículos distintos? Si es así, en la importación se atan los pares y no hay que cargar nada dos veces.
2. ¿Hay algo de dos niveles? Por ejemplo, una caja de blísters donde se vende el blíster y también el comprimido.
3. El precio de la suelta, ¿lo pone él, o es siempre «caja dividido lo que trae, más un porcentaje»? Mientras no conteste: lo pone él, y el sistema le sugiere la división.

---

## 2. La orden de compra interna

**Lo que pide.** Un papel, no de palabra: un sector le pide al sector de compras lo que hay que comprar. El caso: el de depósito ve que la semana que viene se quedan sin un alimento y le presenta la orden a Lucas. También sirve para mandar a un empleado a comprar algo a un comercio —Casa Burgo— o a sacarlo a cuenta corriente. **Es interna**: un pedido entre sectores, no va al proveedor.

Lo que tiene que decir —en sus palabras, «no mucho»—: arriba *Orden de compra interna*, el sector que la pide (depósito, ventas, compras, o el que se escriba), la fecha, y abajo los productos con su cantidad y, al lado, el proveedor que viene por defecto.

### El modelo que mandó el 08/10

Un dibujo a mano —«más o menos como una factura»— y tres audios. El dibujo: [`referencias/orden-de-compra-interna-lucas-2026-10-08.webp`](referencias/orden-de-compra-interna-lucas-2026-10-08.webp).

| Lugar | Qué va |
|---|---|
| Arriba, al centro | **Orden de compra interna**, escrito entero (en el dibujo puso «O.C.I.» para no escribir todo) |
| Arriba, al costado | **El número**, automático, y **la fecha** |
| Dos cuadros | **Emite** y **Recibe**, cada uno un desplegable con los mismos sectores: Depósito, Ventas, Venta mostrador, Administración, Consultorio… «no va a salir de esos cuatro o cinco». Por ejemplo, emite Depósito y recibe Compras |
| La tabla | **Código, descripción, proveedor y cantidad**, y se cargan varios renglones, como en una factura |
| Abajo | **Observación**: «urgente», o «se necesita para el 5 de marzo» |
| Abajo | **El contacto del cliente**, si es para un cliente: cuando llega, ya se sabe para quién es y se le avisa |
| Al pie | **Firma del responsable** que la emite, una vez impresa |

### La propuesta: Compras → Órdenes internas

Ajustada al modelo del 08/10:

- **Numeradas solas.** Fecha, **emite** y **recibe** —los dos de una lista de sectores que se arma una vez—, quién la cargó —lo pone el sistema—, una observación y, si es para un cliente, el cliente con su teléfono.
- **Renglones:** producto por buscador o lector —aparecen el código y la descripción—, cantidad, y el proveedor de la ficha ya puesto, que se puede cambiar. Y **renglones libres** para lo que no está en el catálogo (lo de Casa Burgo).
- **Se imprime en una hoja como la del dibujo**, con el renglón de la firma al pie. Los renglones, ordenados por proveedor: «tanto de éste, tanto del otro», que es como la quiere leer.
- **Estados:** *pendiente*, *pedida* —cuando entra en un pedido al proveedor, punto 3— y *anulada*.
- **Un permiso nuevo para hacerla** (*compras.solicitar*), que puede tener cualquier puesto **sin ver costos ni cuentas de proveedores**.

**Tamaño: chico a mediano.** Pantallas nuevas, no toca nada de lo que anda.

---

## 3. «Umbrales de stock por proveedor» — qué quería decir

El alcance de V1-B dice *Umbrales de stock por proveedor*. **Lucas aclaró que no es un umbral distinto por proveedor.** El mínimo es por producto —«cuando tenga dos bolsas de Evolution mordida grande, avisame que estoy en crítico»—, y lo que quiere es **armar el pedido mirando el stock de un proveedor entero**. El de depósito pide cinco bolsas, pero a ese proveedor —el de Buenos Aires— no se le puede pedir sólo eso; entonces Lucas mira todo lo que le compra y suma un poco de cada cosa al mismo envío.

**Lo que ya está:** el mínimo por producto, con dos niveles —bajo y crítico—, en la ficha: *Avisarme cuando queden pocos*. «Avisame con dos bolsas» se carga hoy. Stock ordena por urgencia y dice cuánto cuesta reponer; Inicio cuenta los críticos.

**Lo que falta de eso:** que la planilla de importación traiga el mínimo —dijo que lo va a poner al cargar los productos— y la pantalla del umbral general y por categoría, ya anotada como hueco del corte en [`AHORA.md`](AHORA.md).

### La propuesta: Compras → Pedido a proveedor

- Se elige el proveedor y aparecen **todos sus productos**: stock, mínimo, estado y lo que pidieron las órdenes internas pendientes.
- **Una columna *Pedir*** que arranca con lo que pidieron las órdenes y se completa a mano —«un poco de cada uno»—, con el costo de la última compra al lado y el total del pedido.
- Sale una **orden de compra al proveedor**, numerada, para imprimir o copiar como texto para WhatsApp. Las órdenes internas que entraron quedan *pedidas*.
- **Cuando llega la mercadería**, la recepción arranca desde esa orden con los productos y las cantidades puestos, y dice qué no vino. Es un segundo paso.

**Tamaño: mediano.** La recepción desde la orden, chica y aparte.

**Pregunta para Lucas:** el mínimo del proveedor —«no le puedo pedir sólo cinco bolsas»—, ¿es en plata, en bultos o en kilos? Si se carga en la ficha del proveedor, la pantalla dice cuánto falta para llegar.

---

## Dónde entra cada cosa

| | Alcance | ¿Bloquea el corte? | Riesgo para lo que anda |
|---|---|---|---|
| **Caja y suelta** | **V1-A**, §3 | **Sí**: está comprometido | Toca el libro de stock: se corre en seco antes de aplicar |
| Orden interna | V1-B, §11 *Órdenes de compra* | No | Ninguno: pantallas nuevas |
| Pedido a proveedor | V1-B, §11 *Órdenes de compra* y *Umbrales por proveedor* | No | Ninguno: pantallas nuevas |

Las dos de compras van al costado de lo que anda: se pueden hacer antes del corte si sobra tiempo, sin riesgo, pero no lo bloquean.
