# Sugerencias de Lucas — clasificadas

**Origen:** documento y fotos del 03/09/2026, después de la primera demostración.
**Para qué sirve este documento:** que ninguna quede sin respuesta, y que quede claro cuáles cambian una regla del negocio —que hay que resolver ya— y cuáles son comodidad, que se juntan en una tanda.

> **El criterio.** No importa el tamaño, importa el tipo. Una regla del negocio mal entendida contamina todo lo que se construya encima: arreglarla en septiembre cuesta el arreglo, en octubre cuesta el arreglo más todo lo que se apoyó en ella. Una comodidad de pantalla no se pudre por esperar.

---

## A · Ya existe — hay que mostrárselo, no construirlo

Cuatro de sus pedidos ya están hechos. Vale mostrárselos en la próxima reunión: es la forma más barata de sacarlos de la lista.

| # | Lo que pidió | Dónde está |
|---|---|---|
| 7 | Artículos en punto crítico / umbral de stock bajo | Tabla `umbral_stock`, con **dos niveles** —bajo y crítico— y se puede definir por producto **o por categoría entera** |
| 1 (parte) | Salidas y entradas de stock con motivo | `movimiento_stock` con ocho tipos: carga inicial, compra, venta, devolución, ajuste, inventario, apertura y merma |
| 22 (parte) | Descripción del producto para sincronizar con la web | El campo `descripcion` existe desde el principio, pensado para eso. **Falta mostrarlo en el editor de producto** — eso sí es trabajo, pero de pantalla |
| 19 (parte) | Cambiar el precio de una línea de la venta | Ya se puede, y queda registrado **quién lo cambió y por qué** (`precio_original`, `precio_acordado`, `modificado_por`, `motivo_modificacion`). Lo que falta es la columna de descuento en % y el PIN |

---

## B · Reglas del negocio — hay que decidirlas ahora

Estas tres no son tareas: son decisiones. Aunque el trabajo venga después, la respuesta hace falta ya.

### B1 · ¿La caja edita la venta? *(puntos 13 y 14)* — ✅ DECIDIDO 04/09: sí, con límites

> *"La caja puede editar la venta, cambiar la cantidad, eliminar o agregar un producto. Porque el cliente a veces cambia las decisiones en la caja."*

Es real y pasa todo el tiempo. Pero toca el corazón del modelo vendedor/caja de V1-A, así que conviene decidirlo con la cabeza fría.

**Recomendación: que la caja pueda editar, con dos límites.**

- **Quitar y cambiar cantidades, sí.** Es lo que pasa de verdad: el cliente se arrepiente de una bolsa. Obligar a devolver la venta al mostrador con la persona esperando es peor que el problema.
- **Agregar productos, también** — si no, el cajero termina armando una segunda venta por un chicle.
- **Los precios acordados no se tocan.** Si el vendedor cotizó un precio, la caja no lo cambia sin dejar rastro: para eso está el registro de quién y por qué, que ya existe.
- **Todo cambio queda con el nombre del cajero.** El vendedor armó una cosa y se cobró otra: eso tiene que poder mirarse después.

### B2 · Factura o comprobante no fiscal antes de cobrar *(punto 20)* — ✅ DECIDIDO 04/09: entra

> *"Antes de cobrar, marcar si es factura (arca) o proforma (en negro) […] tener un conteo de lo que se factura y lo que es en negro en todo el sistema."*

Acá hay dos pedidos distintos metidos en uno, y conviene separarlos.

**Lo que sí corresponde y falta:** un **documento no fiscal** —presupuesto o proforma— para lo que todavía no es una venta facturada. Es normal, es legal, y su sistema actual ya lo tiene: imprime *"DOCUMENTO NO VÁLIDO COMO FACTURA"*. Un presupuesto que el cliente se lleva a pensar, un remito de un reparto. Eso lo construimos sin problema, y de hecho hace falta (ver el punto 24).

**Y el listado con su exportación, también.** Ver y exportar los comprobantes no fiscales es lo que cualquier sistema hace con sus presupuestos: seguirlos, convertirlos en factura, saber cuántos quedaron abiertos.

**Cómo se llama en el código y en los documentos:** *comprobante no fiscal*. No es un eufemismo, es lo que técnicamente es — el mismo documento sirve para un presupuesto que el cliente se lleva a pensar, para un remito de reparto y para una venta que se factura más adelante. Nombrarlo por su uso más angosto lo volvería menos útil dentro de seis meses.

**El argumento de ingeniería, que juega a favor de tenerlo:** si el sistema no ofrece ese documento, la venta simplemente no se carga. Ahí se pierde el stock, se pierde quién vendió qué, y el inventario deja de servir. Un comprobante no fiscal con su propia numeración es estrictamente mejor para Gross que el agujero.

**Sobre las compras sin factura**, que es de donde viene el problema: el stock ya entra sin depender de ninguna factura de compra. `movimiento_stock` tiene ocho tipos y ninguno exige comprobante. Eso ya está resuelto.

> **El único límite, y queda escrito una vez.** No se construye nada que **borre o esconda lo que pasó**: eliminar ventas del historial, un modo que oculte datos, o algo que haga pasar un comprobante no fiscal por fiscal. Eso deja de ser registrar la realidad y pasa a ser fabricar otra. Todo lo demás del pedido entra.

### B3 · Proveedor en el producto *(punto 5)* — ✅ DECIDIDO 04/09: entra en V1-A

Lucas lo sospechó solo: *"esto requiere crear un módulo de proveedores"*. Tiene razón, y es más importante de lo que parece, porque **de esto dependen los puntos 1, 4, 6 y 10**.

De todo eso, hay uno que duele todos los días y es barato: **el aumento de precios por proveedor** (punto 4). En la foto que mandó se ve la pantalla: elegís proveedor, ponés +7%, listo. Sin eso, actualizar precios cuando aumenta un laboratorio es producto por producto.

**Recomendación:** un proveedor mínimo —nombre, CUIT, contacto— más el campo en el producto y el aumento masivo por proveedor y por rubro. Es lo único de esta lista que propondría meter dentro de V1-A. El resto de compras queda en V1-B, como está firmado.

⚠️ **Es agregar alcance**, contra el supuesto 7 del contrato. **Lucas asumió el riesgo de fecha, avisado.** Queda anotado acá porque si el 26 de octubre se mueve, esta es una de las razones.

---

## C · Pantalla y comodidad — una tanda antes de la próxima muestra

Ninguna cambia una regla. Se hacen juntas, se prueban juntas.

| # | Qué | Nota |
|---|---|---|
| 2 | Stock como entrada propia del menú | Hoy vive adentro de Productos e Inventario |
| 15 | Nombre del cliente en la venta, para llamarlo en la caja | Después del botón "Enviar a caja". Más lindo que un numerito |
| 18 | Pedir la cantidad al agregar un producto | Cambia el ritmo de la venta: conviene probarlo con un vendedor antes de dejarlo fijo |
| 19 | Columna de descuento en % por línea | El mecanismo ya está; falta la columna y el PIN que autoriza |
| 21 | Cerrar la sesión al enviar a caja | Cada vendedor vuelve a poner su PIN. Mejora el registro de quién hizo qué |
| 22 | Mostrar la descripción en el editor de producto | El campo ya existe |

---

## D · Fuera de V1-A — con su lugar en el plan

Buena noticia: **la mayor parte ya estaba prevista**. No es alcance nuevo, es confirmación de que V1-B apunta a donde él necesita.

### Ya firmado en V1-B *(arranca al día siguiente del corte)*

| # | Qué pidió | Dónde estaba |
|---|---|---|
| 1, 6, 10 | Cargar facturas de compra, pedidos por proveedor, registro de comprobantes de compra | **V1-B punto 11 — Compras a proveedores** |
| 11 (parte) | IVA Ventas, IVA Compras | **V1-B punto 12 — Libro de IVA** |

> Su frase *"una cosa es cargar facturas y otra es subir stock"* es exactamente la distinción que el módulo de compras hace: la recepción de mercadería mueve stock, la factura de compra registra el costo y el IVA. Vale decírselo así.

### Ya en el backlog

| # | Qué pidió | Dónde estaba |
|---|---|---|
| 8 | Aviso de reposición según la venta media mensual | **V3 — Sugerencia automática de reposición según ventas históricas y estacionalidad** |
| 12 | *"Registro, veo y exporto"* | No es un pedido: es un criterio de diseño, y es bueno. Vale adoptarlo explícitamente |
| 16 | Todo con teclado, menos mouse | Él mismo lo puso para lo último antes del 26/10. **Coincido: es de lo que más va a cambiar la velocidad del mostrador** |

### Nuevo — no estaba en ningún lado

| # | Qué | Comentario |
|---|---|---|
| 3 | Depósitos y transferencias | ✅ **DECIDIDO 04/09 → V1-B.** Hoy tienen uno, el segundo local abre pronto y piensan expandirse. ⚠️ **Pero conviene reservar el concepto de depósito en el modelo de stock desde ahora**, aunque haya uno solo y no se vea en ninguna pantalla: agregarlo después obliga a tocar cada movimiento histórico |
| 9 | Comprobantes de percepción | **Hay que aclarar qué es.** Si la percepción va en la factura, la factura es el comprobante. Puede estar pidiendo un listado para el contador |
| 11 (parte) | Exportar Rentas (Misiones), Centro de Costos, IVA a Pagar | Exportar Rentas es concreto y probablemente necesario. Centro de Costos es un módulo entero |
| 17 | Mandar la factura por email al cobrar | Necesita servicio de correo. Chico si se hace con el circuito ya armado |
| 23 | Comparador de productos en la pantalla de venta | Idea buena para el mostrador. Nueva |
| 24 | Remitos, para repartos y envíos | ✅ **Confirmado 04/09: repartan 2 a 3 veces por semana, y van a salir todos los días con servicios nuevos.** Deja de ser accesorio: es circuito diario. Se apoya en la misma base que el comprobante no fiscal de B2, así que se hacen juntos. *(La optimización de recorrido con IA que mencionó queda para mucho después.)* |

---

## Decisiones tomadas el 04/09

| # | Decisión |
|---|---|
| 13, 14 | La caja **edita** la venta: quita, cambia cantidades y agrega. Los precios acordados no se tocan sin dejar rastro. Todo queda con el nombre del cajero |
| 20 | **Entra** el comprobante no fiscal, con su elección antes de cobrar, su listado y su exportación. Con el límite escrito en B2 |
| 3 | Depósitos **a V1-B**, pero reservando el concepto en el modelo de stock ahora |
| 4, 5 | Proveedor y aumento masivo **entran en V1-A**, con el riesgo de fecha asumido por Lucas |
| 24 | Remitos **suben de prioridad**: reparten 2 a 3 veces por semana |
| 16 | Todo con teclado: **para lo último**, antes del 26/10 |

## Lo único que queda sin respuesta

**¿Qué es un "comprobante de percepción"** en su cabeza? (punto 9) — Lucas quedó en consultarlo. Si la percepción va en la factura, la factura es el comprobante; puede estar pidiendo un listado para el contador.
