# Sistema de gestión híbrido (nube + local)

**Documento base.** Describe un sistema de gestión comercial completo para negocios con mostrador, caja, depósito y uno o varios locales: ventas, stock, facturación electrónica, compras, cuentas corrientes y administración. Sirve como punto de partida para relevar y presupuestar un sistema nuevo para cualquier empresa del rubro comercio.

**Híbrido** quiere decir: los datos viven en la nube, pero cada computadora del local guarda una copia y **sigue vendiendo, cobrando y facturando sin internet**. Cuando vuelve la conexión, todo sube solo.

---

## Índice

1. [El sistema en una página](#1-el-sistema-en-una-página)
2. [Cómo funciona lo híbrido](#2-cómo-funciona-lo-híbrido)
3. [Usuarios, terminales y permisos](#3-usuarios-terminales-y-permisos)
4. [Los módulos, uno por uno](#4-los-módulos-uno-por-uno)
5. [Qué se imprime y qué se exporta](#5-qué-se-imprime-y-qué-se-exporta)
6. [Reglas de negocio de fondo](#6-reglas-de-negocio-de-fondo)
7. [Cómo se construye](#7-cómo-se-construye)
8. [Trampas conocidas](#8-trampas-conocidas)
9. [Checklist para relevar una empresa nueva](#9-checklist-para-relevar-una-empresa-nueva)
10. [Glosario](#10-glosario)

---

## 1. El sistema en una página

| Sección | Pantallas | Para qué |
|---|---|---|
| **Inicio** | Tablero | Lo que pide atención hoy |
| **Ventas** | Mostrador · Caja · Pedidos online | Vender, cobrar y despachar |
| **Clientes** | Clientes | Datos fiscales, cuenta corriente y cobranzas |
| **Productos** | Productos · Precios | Catálogo, listas de precios y medios de pago |
| **Stock** | Stock · Avisos · Inventario · Transferencias | Cuánto hay, dónde, y cuándo reponer |
| **Compras** | Compras · Cuentas de proveedores · Proveedores · Costos · Órdenes internas · Pedidos | Comprar, recibir, pagar y controlar costos |
| **Tesorería** | Cheques · Calendario | Valores en cartera y lo que entra y sale |
| **Comprobantes** | Facturación · Remitos · Presupuestos | Todo lo emitido, fiscal y no fiscal |
| **Reportes** | Reportes | Cómo viene el negocio |
| **Administración** | Usuarios · Configuración | Quién entra, qué puede hacer, y los datos del comercio |

**Dónde corre:**
- **Programa de escritorio** en cada PC del local (caja y mostradores): funciona con y sin internet, imprime directo y se actualiza solo.
- **Aplicación web** para la oficina o cualquier computadora con conexión.
- **Versión celular** para consultar stock, precios y reportes desde el depósito o fuera del local.

---

## 2. Cómo funciona lo híbrido

### La idea en tres frases

- **La nube es la fuente de verdad.** Ahí están todos los datos, y ahí se controlan permisos y reglas.
- **Cada PC tiene una copia local** de lo que necesita para trabajar: productos, precios, clientes, stock, numeración. Vender no espera a internet.
- **Lo que se hace sin conexión queda en una bandeja de salida** y sube solo cuando vuelve la conexión, en orden y sin duplicarse.

### Sin internet, en el local

| Pasa | Qué hace el sistema |
|---|---|
| Se corta internet | Cada PC sigue con su copia local. Un indicador arriba dice *Sin conexión* y cuántas operaciones esperan subir. |
| El mostrador manda una venta a la caja | Viaja por la **red del local**: la PC de la caja escucha y las demás le hablan. La caja es el punto de encuentro porque es donde todo termina. |
| La caja cobra y factura | Emite con el **código de contingencia** del organismo fiscal (en Argentina, CAEA) y el ticket sale igual, con todos los datos legales. |
| Vuelve internet | Todo sube solo. Lo que llegó dos veces —por la red local y por internet— se descarta solo, porque cada operación tiene su propio identificador. |
| Se vende la última unidad en dos PC a la vez | Entran las dos ventas y el stock queda en negativo: es una **alerta visible**, no una venta perdida. |

> **Para decirlo en una reunión:** «Si se corta internet, el local no se entera: se vende, se cobra y se factura igual. Cuando vuelve, todo se sube solo y no se duplica nada.»

### La sincronización

- Cada PC baja **lo que cambió desde la última vez** (por fecha de modificación de cada registro).
- **Nada se borra**: se marca como dado de baja, y la marca viaja. Un registro borrado no tendría cómo avisarle a una PC que estuvo tres días apagada.
- Cuando se suman columnas a lo que baja, cada PC **vuelve a bajar esa tabla entera una vez**. Si no, los registros viejos quedan sin el dato nuevo en esa máquina.
- La copia local está **cifrada**: si roban la PC, los datos no se leen.

### La red del local

- Una pantalla (*La red del local*) dice qué PC escucha, cuáles le hablan, si se ven entre sí y **el motivo real** cuando no se ven.
- Botón *Probar la conexión* entre el mostrador y la caja.
- Requisito operativo: **la PC de la caja tiene que estar prendida**. Ya lo está, porque es donde se cobra.

### Las actualizaciones

- El programa de escritorio consulta si hay una versión nueva y la ofrece: **Actualizar ahora**, sin desinstalar nada.
- Cada versión va **firmada**: el programa sólo acepta actualizaciones firmadas con la clave del desarrollador. Nadie puede instalarle otra cosa a las PC del local.

---

## 3. Usuarios, terminales y permisos

### Dos capas de identidad

| Capa | Qué es | Cómo se identifica |
|---|---|---|
| **Terminal** | La PC: *Caja 1*, *Mostrador 2* | Se configura una vez y queda abierta todo el día |
| **Operador** | La persona que vende o cobra | **PIN de 4 a 6 dígitos** por operación |

Así hay cero fricción (nadie inicia sesión veinte veces por día) y cada venta queda atribuida a quien la hizo.

### Roles y permisos

- **Roles de base:** Administrador, Encargado, Cajero, Vendedor. Se pueden crear otros.
- **Permisos por rol, que se encienden y apagan**: ver costos, cobrar, anular, hacer descuentos, ajustar stock, configurar avisos, registrar compras, pagar a proveedores, gestionar usuarios, etc.
- **Los permisos los controla la base de datos, no la pantalla.** Esconder un botón es comodidad; la regla vive en el servidor.
- El PIN se bloquea tras varios intentos fallidos; un encargado lo desbloquea.

### Todo deja rastro

Cada movimiento de stock, cobro, anulación o cambio de precio guarda **quién, cuándo, desde qué terminal y si se hizo sin conexión**.

---

## 4. Los módulos, uno por uno

Cada módulo dice **qué hago**, **qué veo** y **qué exporto**.

### 4.1 Inicio

- **Qué veo:** productos en el catálogo · cuántos están bajos, críticos o sobrevendidos · comprobantes esperando respuesta del organismo fiscal · terminales sin sincronizar · ventas del día · pedidos online por preparar.
- **Qué hago:** cada número es un enlace a la pantalla que lo resuelve.
- **Qué exporto:** nada.

### 4.2 Productos

**La ficha del producto:**
- Código interno, **varios códigos de barra**, nombre interno (el del vendedor) y nombre público (el de la tienda online), descripción.
- **Categorías en árbol** (rubro › subrubro › grupo › subgrupo), marca, presentación.
- Precio de venta **con IVA**, costo **con IVA**, **margen objetivo** y margen real, sobre el costo y sobre la venta.
- Alícuota de IVA y condición (gravado, exento, no gravado).
- Proveedor habitual, **unidades por bulto** y **peso**, para armar pedidos.
- Productos regulados: requiere receta, controla lote, controla vencimiento.
- **Venta fraccionada (caja y suelta):** la suelta dice de qué envase sale y cuántas trae (caja › tableta › unidad, o bolsa › kilo). Cuando se vende una suelta y no quedan, **el sistema abre un envase solo**.
- **Aviso de stock propio** (bajo y crítico).
- **Historial de costos**: cada compra con fecha, proveedor, factura y variación.
- **Historial de movimientos de stock**: cada entrada y salida, quién, cuándo y cuánto quedó.
- Si se vende online: interruptor *Vender online* y stock reservado que la tienda no ve.

**Qué hago:** buscar por código, nombre o escaneando · filtrar por categoría, marca o estado · crear, editar, dar de baja y restaurar · cambios masivos · **importar el catálogo desde Excel o CSV** · marcar como revisado (para operativos de carga inicial).

**Qué veo:** listado con precio, stock y semáforo (en stock · bajo · crítico · sobrevendido) · avance de la carga inicial (cuántos revisados sobre el total).

**Qué exporto:** el catálogo en Excel.

**La importación desde planilla:**
- El sistema **reconoce las columnas solo** por su nombre («Precio contado», «Cód.», «Stock mínimo»…) y muestra un dato de ejemplo de cada una para confirmar.
- Lee números en formato local (`12.500,50`) sin confundir miles con decimales.
- Encuentra el encabezado aunque arriba haya un título, y la hoja correcta aunque el archivo tenga varias.
- **Avisa antes de importar** qué filas están mal y por qué, con el número de fila del Excel.
- **Reimportar no duplica**: reconoce por código y actualiza. Una celda vacía no borra lo que había.
- Trae también: categoría en sus niveles, marca, IVA, códigos de barra, aviso de stock, envase de la suelta, peso y bulto.

### 4.3 Precios

- **Listas de precios** (Contado, Tarjeta, Mayorista…) con su porcentaje de ajuste sobre el precio base.
- **Medios de pago**, cada uno atado a una lista.
- **Cuotas y recargos** por medio de pago, con una simulación de cuánto se cobra en cada plan.
- **Aumento masivo** por proveedor y/o categoría, sobre precio, costo o ambos: dice **a cuántos productos le va a pegar antes de aplicar**, y **se puede deshacer** (cada producto vuelve a su precio exacto anterior; los que alguien corrigió a mano después no se tocan).
- **Precio sugerido por margen**: cuando cambia el costo, el sistema propone el precio que corresponde, y alguien lo aplica.

**Qué exporto:** nada (las listas se ven en pantalla y en el mostrador).

### 4.4 Stock

- **Stock por depósito** y total, con **lo disponible contando lo que se puede abrir** en productos fraccionados («0 cajas · 9 tabletas · 9 sueltas»).
- **Avisos en tres niveles:** general, por categoría y por producto. **Gana el más específico.** Dos umbrales: *bajo* (amarillo, hay que ir pidiendo) y *crítico* (rojo).
- **Faltantes ordenados por urgencia**, con cuánto costaría reponer cada uno hasta su umbral.
- **Historial de movimientos** de cada producto: ventas, compras, ajustes, aperturas de envase, devoluciones, transferencias, cada uno con el saldo que quedó.

**Qué hago:** filtrar por estado y depósito · buscar · configurar los avisos · ajustar stock con motivo · **copiar la lista de faltantes** para mandarla por WhatsApp.

**Qué exporto:** la lista de faltantes en texto · el stock valorizado en Excel.

### 4.5 Inventario

- **Tomas por sector** (góndola, depósito, vitrina): se abre una toma, se **cuenta escaneando** y se cierra.
- El conteo se hace **con el local abierto**: el ajuste usa la diferencia detectada al contar, no el stock al cerrar, así las ventas del medio no se pierden.
- Al cerrar se generan los ajustes, con quién contó y cuándo.

**Qué veo:** por toma, productos contados, diferencias y **cuánto representa la diferencia valorizada al costo**.

### 4.6 Transferencias entre depósitos

- Mover mercadería de un depósito o local a otro, con renglones escaneados.
- Sale de uno y entra en el otro en una sola operación; se anula con motivo.
- Cada PC sabe de qué depósito vende; el stock del mostrador es el de su depósito.

### 4.7 Mostrador (ventas)

- El vendedor se identifica con **PIN**.
- Busca o **escanea** productos; agrega líneas que no están en el catálogo; cambia cantidades.
- **Rebaja una línea** por monto o porcentaje (con permiso).
- Elige el cliente (o lo da de alta con sólo el CUIT, trayendo los datos del padrón fiscal).
- Ve **el total en efectivo y con tarjeta al mismo tiempo**, y aviso si no hay stock.
- **Envía a caja** o **hace un presupuesto**.
- El borrador se conserva si la pantalla se refresca por accidente.
- Atajos de teclado para todo: buscar, elegir cliente, enviar, cobrar.

**Qué exporto:** el presupuesto impreso, en ticket o A4.

### 4.8 Caja

- **Abrir la caja** con el monto inicial; **cerrarla** con lo declarado contra lo esperado y la diferencia.
- **Cola de ventas** que mandan los mostradores, con el nombre para llamar a cada cliente.
- **Corregir la venta** antes de cobrar (quitar, cambiar cantidades, agregar).
- **Medios de pago**, combinados en un mismo cobro (parte efectivo, parte tarjeta, parte cheque), con cuotas y recargos.
- **Descuento** por porcentaje o llevando el total a un número, con motivo.
- **Con factura o sin factura** (comprobante interno), y **factura después** para las ventas que el cliente pide facturar más tarde.
- **Cuenta corriente**: cobrar a cuenta, con el saldo y el límite del cliente a la vista.
- **Percepciones de impuestos provinciales** cuando corresponden por el cliente y el monto; se respetan las exclusiones con certificado y vigencia.
- **Cheques** recibidos como medio de pago, que entran a la cartera.
- **Impresión automática** del comprobante al cobrar.

**Qué exporto:** el comprobante impreso (factura, ticket no fiscal o interno), en ticket de 80 mm o A4 · el arqueo del turno.

### 4.9 Pedidos online

- La tienda web lee el catálogo, el precio y el stock **por una API propia**, con su clave.
- Los pedidos de la tienda **entran como ventas**, con su estado: nuevo, preparando, listo, entregado, cancelado.
- **Facturar, preparar, entregar o cancelar** desde una pantalla; la cancelación de un pedido cobrado deja el reintegro pendiente a la vista.
- La tienda puede preguntar en qué está cada pedido.
- Qué se publica lo decide el comercio, producto por producto o por categoría; un **stock de reserva** que la tienda no ve evita vender lo último que se vende en el mostrador.
- Si el comprador declara una condición fiscal, se verifica contra el padrón.

### 4.10 Clientes

- **Datos fiscales:** condición frente al IVA, tipo y número de documento, domicilio. **Se traen del padrón fiscal con el CUIT**, y una verificación masiva corrige la condición de todos los clientes de una vez.
- **Cuenta corriente** con **límite de crédito** y días de plazo.
- **Descuento por defecto** y lista de precios propia.
- **Exclusión de percepciones** con certificado y vigencia.
- **Cobranzas** de la cuenta corriente: en efectivo, transferencia o **con varios cheques**.
- **Resumen de cuenta** con cada movimiento y su origen (factura, nota de crédito, cobranza, cheque rechazado).

**Qué exporto:** el resumen de cuenta corriente en PDF, para mandarle al cliente · la lista de deudores en Excel.

### 4.11 Comprobantes

**Facturación electrónica:**
- Facturas A, B y C, notas de crédito y de débito, con **CAE** pedido en línea al organismo fiscal (en Argentina, ARCA).
- **Contingencia con CAEA**: cuando el organismo no responde o no hay internet, se factura igual con el código de contingencia y se informa después.
- **Semáforo por comprobante:** pendiente, autorizado, impreso, rechazado, con **el motivo exacto del rechazo** y botón de reintento.
- **Panel de ventas cobradas sin comprobante**: el caso grave, plata que entró sin respaldo fiscal.
- **Devoluciones**, totales o parciales: reingresan el stock, sacan la deuda y emiten la nota de crédito, todo junto. La percepción se devuelve en proporción.
- QR fiscal en el comprobante impreso.

**Remitos:**
- Desde una venta o de cero; **eligiendo si descuenta stock o no**.
- Panel de **entregado y sin cobrar**, con cuántos días lleva.

**Presupuestos y comprobantes internos:**
- Con vencimiento; un presupuesto **se manda a la caja** para cobrarlo.

**Qué exporto:** comprobantes impresos (ticket o A4) · **Libro de IVA Ventas** en Excel para el contador · presupuestos y remitos en CSV.

### 4.12 Compras

**La factura de compra:**
- Proveedor, tipo, punto de venta, número, fecha y **vencimiento**.
- **Desglose por alícuota de IVA**, percepciones y otros tributos; el total se arma solo para compararlo con el papel.
- La misma factura no entra dos veces (proveedor + tipo + número).

**Recibir la mercadería** (en el momento o después, por otra persona):
- Se escanea cada producto; se copia la cantidad y el **costo unitario como está impreso** (sin IVA en una factura A, con IVA en B o C); el sistema calcula el costo con IVA y muestra cuánto cambió.
- **Si hay un pedido a ese proveedor esperando**, se trae: carga los productos con lo que falta llegar.
- Lo que no está en el catálogo se da de alta ahí mismo.
- Al confirmar: entra al stock, **el costo del producto pasa a ser el de esta factura**, y se propone el precio de venta por margen (alguien lo aplica).
- Si la factura traía un pedido: dice si llegó completo o **qué no vino**, y **a qué cliente avisarle** si algo era para él.
- Dar de baja una factura recibida **saca su mercadería** con un ajuste.

**Costos:**
- Cuánto costó cada producto a cada proveedor, la variación entre compras, y **si otro proveedor lo tiene más barato**.

**Qué exporto:** **Libro de IVA Compras** en Excel · el listado de costos por proveedor.

### 4.13 Proveedores y cuentas de proveedores

- **Ficha:** razón social, CUIT, condición, contacto, **CBU/CVU y alias** (el CBU se valida con sus dígitos verificadores), **pedido mínimo** (en pesos, bultos o kilos).
- **Cuenta corriente del proveedor:** facturas, pagos, notas de crédito y saldo; **saldo inicial** al empezar a usar el sistema.
- **Pagos** con varios medios a la vez: efectivo, transferencia (con los datos bancarios listos para copiar), **cheques de la cartera** (endosados) o **cheques propios** (de chequera o electrónicos); imputados a una o varias facturas.
- Anular un pago con motivo; una factura con pagos imputados no se da de baja hasta anularlos.

**Qué exporto:** el estado de cuenta del proveedor · la orden de pago impresa.

### 4.14 Órdenes internas y pedidos a proveedor

**Orden de compra interna** (un sector le pide a otro lo que hay que comprar, en papel y no de palabra):
- Emite y recibe de una lista de sectores (Depósito, Ventas, Compras…).
- Renglones con código, descripción, **el proveedor de la ficha ya puesto** y cantidad; renglones libres para lo que no está en el catálogo.
- Observación y, si es para un cliente, el cliente y su contacto.
- La hace **cualquier puesto, sin ver costos**; queda *pendiente*, *pedida* o *anulada*.
- **Qué exporto:** la hoja A4 con la firma del responsable.

**Pedido a proveedor:**
- Se elige el proveedor y aparecen **todos sus productos**: stock, aviso, último costo, bulto, peso, y **lo que pidieron las órdenes internas**.
- *Pedir* arranca con lo de las órdenes y se completa a mano.
- Arriba, **el mínimo del proveedor y cuánto falta**, en su unidad («faltan 55 kg», «faltan 2 bultos», «faltan $ 120.000»).
- El pedido se guarda como borrador mientras se arma.
- Al hacerlo, las órdenes internas que entraron **quedan pedidas solas** (una orden con renglones de dos proveedores, cuando se pidieron los dos).
- **Estados:** por recibir · llegó en parte · recibido · anulado. Se **da por terminado** si lo que falta no viene.
- **Qué exporto:** la nota de pedido A4 **sin precios** · el texto para WhatsApp.

### 4.15 Tesorería

**Cheques:**
- **Cartera** de cheques recibidos, ordenados por fecha de cobro, con **cuántos días quedan para depositarlos**; al día y diferidos; físicos y electrónicos.
- **Depositar** de a varios · **endosar** al pagarle a un proveedor · **devolver** al cliente.
- **Rechazado:** se marca con motivo y gastos del banco, y la deuda vuelve sola al cliente (o al proveedor, si se le había endosado).
- **Propios:** emitidos al pagar, se marcan **debitados** cuando salen del banco.
- Deshacer un depósito o un débito marcado por error.
- El cheque nunca va al arqueo de caja: al cerrar, se listan los cheques del turno para entregarlos.

**Calendario:** día por día, para 7, 15, 30 o 60 días, **lo que entra** (cheques a cobrar, vencimientos de clientes) y **lo que sale** (facturas de proveedores, cheques propios).

**Qué exporto:** el calendario y la cartera en Excel.

### 4.16 Reportes

- **Ventas** por período, por vendedor, por caja, por medio de pago, por categoría y por producto.
- **Rentabilidad:** margen por producto y por categoría.
- **Quién tiene plata del negocio en la calle:** deudores con antigüedad de la deuda.
- **Stock valorizado** al costo y a precio de venta.
- **Movimientos de caja** por turno.
- **Percepciones** cobradas, por período, para declarar.

**Qué exporto:** cada reporte en Excel (CSV con punto y coma y coma decimal, para que abra bien en Excel en español) · el Libro de IVA Ventas y Compras · percepciones.

### 4.17 Administración

**Usuarios:** alta, rol, **PIN de mostrador**, baja · permisos por rol, que se encienden y apagan.

**Configuración**, en pestañas:
- **Datos del comercio:** razón social, CUIT, condición, domicilio, ingresos brutos, inicio de actividades, logo (sale en tickets y hojas A4).
- **Cajas y mostradores:** alta de terminales, punto de venta fiscal de cada caja, depósito de cada PC.
- **Depósitos y locales.**
- **Facturación:** puntos de venta, certificado del organismo fiscal, contingencia.
- **Impresión:** impresora de cada PC (térmica por red o impresora de Windows), ancho de papel, impresión automática al cobrar.
- **Stock:** el aviso general.
- **Esta computadora:** qué terminal es, atajos de teclado, estado de la copia local, diagnóstico.

### 4.18 Importaciones del arranque

Para dejar el sistema anterior el día del cambio:
- **Catálogo** desde Excel (ver 4.2).
- **Clientes con su saldo** a una fecha: el saldo queda igual al de la planilla, no se suma al reimportar; un CUIT con el dígito verificador mal no entra.
- **Saldos de proveedores** a una fecha; los proveedores que no existen se crean.
- Antes de importar, **la suma de todos los saldos**, para compararla con el total del sistema anterior.

---

## 5. Qué se imprime y qué se exporta

| Documento | Dónde | Formato |
|---|---|---|
| Factura / nota de crédito | Caja · Facturación | Ticket 80 mm o A4, con QR fiscal |
| Ticket no fiscal / comprobante interno | Caja | Ticket 80 mm o A4 |
| Presupuesto | Mostrador · Presupuestos | Ticket 80 mm o A4 |
| Remito | Remitos | Ticket 80 mm o A4, con «recibí conforme» |
| Resumen de cuenta corriente | Clientes | PDF |
| Orden de compra interna | Órdenes internas | A4, con firma del responsable |
| Nota de pedido a proveedor | Pedidos | A4 sin precios · texto para WhatsApp |
| Orden de pago | Cuentas de proveedores | A4 |
| Lista de faltantes | Stock | Texto para pegar |
| Libro de IVA Ventas y Compras | Facturación · Compras | Excel |
| Reportes, stock valorizado, deudores, cheques | Reportes · Tesorería | Excel (CSV) |
| Manual del sistema | — | PDF |

---

## 6. Reglas de negocio de fondo

Son las decisiones que sostienen todo lo demás. Cambiar una obliga a rehacer varios módulos.

| Regla | Por qué |
|---|---|
| **El stock se guarda como movimientos, no como un número.** El saldo es la suma, y **puede quedar negativo a propósito.** | Si dos PC sin internet venden la última unidad, con un número que se pisa una venta desaparece; con movimientos entran las dos y el negativo avisa. |
| **Nada se borra:** baja lógica con fecha. | Lo borrado no tiene cómo viajar a una PC que estuvo apagada, ni deja rastro para una auditoría. |
| **Los precios incluyen IVA.** Al facturar se desarma el neto. | El número de la góndola es el que cobra la caja. |
| **El costo se guarda con IVA.** El de una factura A se convierte; el de una B o C va como está. | Si no, el margen muestra 21 puntos que no existen. |
| **Tres precios por línea de venta:** el de lista, el acordado y el cobrado. | Cambiar de medio de pago recalcula desde el acordado y no pisa la rebaja del vendedor. |
| **El último costo pisa; el precio de venta no cambia solo.** Se propone y alguien lo aplica. | Un costo no puede mover un precio sin que nadie lo vea. |
| **Los códigos fiscales son los oficiales** (alícuotas, tipos de comprobante, documentos, condiciones de IVA). | Al facturar no hay traducción, y sin traducción no hay error de mapeo. |
| **Un punto de venta fiscal por caja que factura**, más uno de respaldo. | Los mostradores no facturan; si muere la PC de la caja, hay otro. |
| **Cada operación lleva un identificador generado por la pantalla.** | Reintentar no duplica: si llega dos veces, la segunda se descarta sola. |
| **La numeración se reserva antes de usarse**, en una operación indivisible. | Deducirla de lo último usado repite números cuando algo se corta a la mitad. |
| **Lo que no se puede deshacer pide motivo:** anulaciones, bajas, cierres. | Queda escrito por qué, y no sólo quién. |
| **En los avisos de stock gana el más específico:** producto, después categoría, después general. | Un número para todo el local y excepciones donde hace falta. |
| **Una devolución prorratea la percepción, no la recalcula.** | Recalcularla sobre lo devuelto puede caer bajo el mínimo y devolver cero. |
| **El cheque no va al arqueo.** | Es un valor, no efectivo; se entrega aparte con la lista del turno. |
| **Una suelta sin stock abre su envase sola**, en la misma venta. | Nunca se ve una caja que ya no está. |
| **El precio que se dice en voz alta es el de tarjeta**; el efectivo se presenta como descuento. | Si se dice el de contado y la caja cobra más, el problema queda con el cliente adelante. |

---

## 7. Cómo se construye

### Arquitectura de referencia

| Pieza | Con qué | Por qué |
|---|---|---|
| Base de datos y servidor | PostgreSQL gestionado (por ejemplo, Supabase) | Reglas, permisos y cálculos en un solo lugar, cerca de los datos |
| Pantallas | React + TypeScript | Una sola base de código para web, escritorio y celular |
| Programa de escritorio | Tauri (Rust) | Liviano, imprime directo, escucha en la red del local, se actualiza firmado |
| Copia local | IndexedDB, cifrada | Trabajo sin internet en cada PC |
| Publicación web y actualizaciones | Hosting estático (por ejemplo, Cloudflare Pages) | La web y el archivo de actualizaciones en la misma dirección |
| Facturación electrónica | Servicios web del organismo fiscal, desde funciones del servidor | El certificado nunca sale del servidor |

### Reglas de construcción

- **Las reglas de negocio viven en la base de datos:** funciones que controlan el permiso de quien llama y hacen todo en una transacción (la venta, el stock y la cuenta corriente juntos, o nada). La pantalla no escribe tablas sensibles directo.
- **Seguridad por fila (RLS)** en todas las tablas; las funciones con permisos elevados fijan su `search_path` y controlan el permiso a mano. **Ninguna función se puede llamar sin sesión**, salvo las públicas a propósito (la API de la tienda, con su clave).
- **Todo en español**, también el código: tablas, columnas, funciones y comentarios. Los comentarios explican **por qué**, no qué.
- **Pantallas que no se desplazan hacia el costado**: cada pantalla se revisa a 375 px de ancho (un celular). Las tablas anchas pasan a tarjetas en el celular.
- **Mensajes en castellano llano**: un error de la base se traduce a lo que la persona tiene que hacer («El crítico tiene que ser menor que el bajo»), nunca el nombre de una restricción.

### Procedimiento por cada cambio

1. **Leer lo que ya hay** antes de escribir: la tabla, la función que la usa, la pantalla que la muestra.
2. **Migración nueva** (nunca editar una ya aplicada), con un encabezado que dice qué resuelve y qué se decidió.
3. **Prueba contra la base real** en un archivo de comprobaciones que termina siempre con un error a propósito, así **todo se deshace**: «OK: n comprobaciones» o la primera «FALLA» con el motivo. Se prueba **como un usuario de cada rol y sin sesión**, no como dueño de la base.
4. **Correr la migración en seco** junto con la prueba antes de aplicarla.
5. **Romper a propósito**: sacar la regla nueva y ver que la prueba falle. Una prueba que nunca falló no prueba nada.
6. **Pruebas automáticas de la pantalla** para los cálculos (números, formatos, órdenes) y revisión de tipos.
7. **Verlo en pantalla** con datos de prueba, en computadora y a 375 px; después **dar de baja los datos de prueba**.
8. **Documentar** en el mismo movimiento: qué cambió, cómo se le cuenta al usuario, qué se verificó.
9. **Publicar una versión** (número nuevo, firmada) y confirmar que las PC la ven.

### Publicar

- Un solo comando arma el programa de escritorio, lo firma, arma la web y sube las dos juntas. **Nunca subir la web armada por separado**: le faltaría el archivo de actualizaciones y las PC dejarían de recibir correcciones sin mostrar ningún error.
- La **clave de firma** no sale de la computadora del desarrollador y tiene copia de seguridad: sin ella, las PC instaladas no aceptan ninguna versión nueva.
- Después de publicar, **verificar** que el archivo de actualizaciones diga la versión nueva.

### La documentación del proyecto

- **Una página de estado** que se lee primero: qué está publicado, qué está construido sin verificar, qué falta y de quién depende.
- **Las decisiones de fondo** y **las trampas aprendidas**, cada una en su página.
- **El manual del usuario**, por pantalla (para qué sirve, qué veo, qué hago, qué exporto), que **sólo describe lo que funciona** y se regenera en PDF con cada versión.
- Por cada entrega, **cómo se le cuenta al cliente**, en dos o tres frases sin tecnicismos.

---

## 8. Trampas conocidas

Costaron horas. Conviene no repetirlas.

**Trabajo sin conexión**
- **Nada del arranque puede depender del servidor.** El usuario, la terminal y la configuración se guardan localmente; si no, sin internet la aplicación no abre.
- **Las peticiones necesitan un límite de espera** (unos 12 segundos). Sin él, cuando se corta internet pero la PC cree que hay red, la pantalla espera para siempre.
- **La librería de consultas pausa todo sin red** si no se le dice lo contrario: el código ni se ejecuta.
- **Nunca borrar un dato local porque la consulta vino vacía.** Sin conexión siempre viene vacía.
- **Lo creado sin conexión tiene que existir en su propia máquina**, no sólo en la bandeja de salida.
- **Un dato compartido (qué terminal soy) vive en un solo lugar** que todos miran; si cada pantalla guarda su copia, se desincronizan.
- **La base local se bloquea en silencio** si otra pestaña la tiene abierta con una versión anterior: avisar y trabajar con una sola pestaña.
- **Mostrar en la pantalla en qué paso está una operación**: nadie en el mostrador abre la consola del navegador.

**Red del local**
- Windows contesta primero con la dirección IPv6 de una PC; el que escucha tiene que escuchar en las dos, y el que busca tiene que probar todas.
- Al reabrir la escucha, el puerto queda tomado unos milisegundos: esperar antes de volver a escuchar.

**Base de datos**
- **Dos movimientos en el mismo instante** (abrir un envase y vender la suelta) necesitan un desempate explícito, o el historial muestra saldos imposibles.
- **Un índice único parcial** no lo puede usar un «insertar o actualizar» desde la API: va por función.
- **Las corridas de prueba gastan números** de las secuencias aunque se deshagan: la primera factura o pedido real no empieza en 1. Si importa, reiniciar la secuencia antes de salir a producción.

**Planillas**
- `12.500` en una planilla en español son doce mil quinientos, no doce con cinco. Confundirlo pone un precio mil veces más barato.
- Excel en español exporta CSV con punto y coma.
- Una columna «Envase» suele decir «Bidón»; «Unidades por caja» es el bulto del proveedor. No adivinar significados: si no está claro, preguntar en la pantalla.

**Computadoras del cliente**
- **Antivirus que revisan HTTPS** ponen su propio certificado: las herramientas de línea de comandos fallan con «unable to verify the first certificate». Se resuelve usando los certificados de Windows.
- **Varios antivirus a la vez** se pisan, hacen fallar compilaciones y bloquean procesos legítimos. Uno solo.
- PowerShell puede tener bloqueados los scripts: usar los ejecutables `.cmd`.

---

## 9. Checklist para relevar una empresa nueva

**El negocio**
- [ ] Rubro, cantidad de locales y depósitos.
- [ ] Cuántas cajas y cuántos mostradores; quién factura.
- [ ] Horarios, picos de venta, cuántos vendedores por turno.
- [ ] Qué sistema usan hoy, qué les sirve y qué no; desde cuándo; si pueden exportar datos.
- [ ] Fecha de cambio comprometida y si habrá semana en paralelo.

**Fiscal**
- [ ] Condición frente al IVA del comercio; tipos de comprobante que emiten.
- [ ] Puntos de venta habilitados; certificado digital; contingencia.
- [ ] Percepciones y retenciones que aplican (y a quiénes se excluye).
- [ ] Qué necesita el contador y en qué formato.
- [ ] Productos regulados (recetas, lotes, vencimientos, organismos de control).

**Productos y stock**
- [ ] Tamaño del catálogo; si hay planilla y con qué columnas.
- [ ] Códigos de barra propios y de fábrica.
- [ ] Venta fraccionada (caja/unidad, bolsa/kilo).
- [ ] Cómo arman los pedidos a proveedores; mínimos de cada proveedor.
- [ ] Cómo cuentan el inventario; si lo hacen con el local abierto.

**Precios y cobros**
- [ ] Listas de precios; qué precio se dice en voz alta.
- [ ] Medios de pago, cuotas y recargos.
- [ ] Cuentas corrientes de clientes: cuántos, límites, plazos.
- [ ] Cheques: si reciben, depositan, endosan, emiten propios, físicos o electrónicos.

**Compras y proveedores**
- [ ] Cómo cargan las facturas de compra y quién recibe la mercadería.
- [ ] Si llevan cuenta corriente con proveedores; cómo pagan.
- [ ] Órdenes internas entre sectores.

**Infraestructura**
- [ ] PC disponibles: sistema operativo (las muy viejas pueden no servir), memoria, antivirus.
- [ ] Impresoras: térmicas por red o USB, A4.
- [ ] Lectores de código de barra.
- [ ] Calidad de internet y red interna del local.

**Personas**
- [ ] Roles y quién puede qué (costos, descuentos, anulaciones, ajustes).
- [ ] Quién va a cargar el catálogo y en cuánto tiempo.
- [ ] Quién decide en el cliente y por dónde se comunica (audios, planillas, fotos).

---

## 10. Glosario

| Término | Qué es |
|---|---|
| **Terminal** | Una PC del local configurada como caja o mostrador. |
| **Operador** | La persona que usa la terminal, identificada con PIN. |
| **Copia local** | Los datos que cada PC guarda para trabajar sin internet. |
| **Bandeja de salida** | Lo hecho sin conexión que espera subir. |
| **Punto de encuentro** | La PC de la caja, que recibe las ventas de los mostradores por la red del local. |
| **CAE** | Código de autorización que el organismo fiscal da a cada factura en línea. |
| **CAEA** | Código de autorización anticipado, para facturar en contingencia y informar después. |
| **Percepción** | Impuesto que el comercio cobra junto con la venta y después deposita al fisco. |
| **Suelta** | Producto que sale de abrir un envase (la tableta de la caja, el kilo de la bolsa). |
| **Aviso bajo / crítico** | Umbrales de stock: amarillo para ir pidiendo, rojo para no quedarse sin. |
| **Orden interna** | Pedido de compra de un sector a otro dentro del comercio. |
| **Pedido a proveedor** | Lo que se le pide a un proveedor en un envío, armado con todos sus productos a la vista. |
| **Baja lógica** | Un registro marcado como dado de baja, que no se borra. |
| **Migración** | Un cambio en la estructura de la base de datos, numerado y aplicado una sola vez. |
| **RLS** | Seguridad por fila: la base decide qué filas puede ver y tocar cada usuario. |
