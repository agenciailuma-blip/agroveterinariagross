# Alcance del proyecto — Sistema de Gestión Agroveterinaria Gross

**Versión del documento:** 2.0
**Fecha:** 12 de agosto de 2026
**Estado:** borrador para revisión y firma con el cliente
**Cambios respecto de la v1.0:** se incorporan a V1 la sincronización con la tienda, el lector de códigos de barra y el módulo de compras. Se reorganiza V1 en dos entregas. Se elimina la dependencia de OBTech.

---

## Cómo se organiza el proyecto

El sistema se entrega **por versiones**, y cada versión es un proyecto con principio y final.

Cada versión tiene alcance escrito, fecha de entrega, definición de terminado verificable, y una entrega formal después de la cual se cierra.

| Para Gross | Para ILUMA |
|---|---|
| Recibe valor en tandas, no espera un año para ver algo | Cada versión tiene un final, no es trabajo indefinido |
| Sabe qué está pagando y hasta dónde llega | Puede planificar sin absorber pedidos infinitos |
| Puede reordenar prioridades entre versiones | Cada versión nueva se acuerda por separado |
| Si quiere parar, tiene un sistema completo funcionando | — |

**Regla de trabajo:** todo pedido nuevo que surja durante una versión se anota en el backlog de la siguiente. No se agrega a la versión en curso. Esto es lo que protege las fechas.

---

# V1 — SISTEMA BASE

V1 se entrega en **dos tandas**, por una razón práctica: hay cosas sin las cuales no se puede dejar OBTech, y hay cosas importantes que pueden llegar poco después sin frenar ese corte.

| | **V1-A — El corte** | **V1-B — Completar** |
|---|---|---|
| **Objetivo** | Operar el mostrador sin OBTech | Cerrar el circuito comercial y contable |
| **Fecha** | 26 de octubre de 2026 | ~5 semanas después |
| **Criterio de admisión** | Sin esto no se puede cortar OBTech | Importante, pero el negocio funciona un mes sin ello |

**V1 se considera cerrada al terminar V1-B.**

---

# V1-A — EL CORTE

> **Objetivo: que el 26 de octubre Gross opere el mostrador completo sin OBTech.**

## 1. Base del sistema

- Usuarios individuales con **PIN de operación** sobre sesión de terminal
  *(la PC queda abierta todo el día; cada vendedor se identifica con 4 dígitos para registrar su operación — sin login/logout constante, pero con trazabilidad de quién hizo qué)*
- Roles y permisos por módulo: vendedor, cajero, encargado, administrador
- Registro de auditoría de toda operación sensible
- Base local cifrada en las terminales de mostrador

## 2. Funcionamiento offline (Nivel 3)

**Topología real del local:** 4 PC de mostrador en red. En el esquema nuevo, **3 son de vendedores y 1 es la caja**, que es la única que emite comprobantes y la única conectada a la impresora.

- Las 4 PC con la aplicación instalada como programa de Windows *(necesario para operar sin conexión y para hablarle a la impresora)*
- Oficina, celulares y reportes: la misma aplicación desde el navegador
- Motor de sincronización: lo hecho sin conexión se envía al reconectar
- **El stock se sincroniza como movimientos, no como saldos** — si dos terminales venden la última unidad estando offline, el sistema lo detecta y avisa en lugar de perder una venta
- Indicador visible de estado: conectado / sin conexión / sincronizando / con pendientes

> **Consecuencia buena de esta topología:** como solo la caja factura, alcanza con **un único punto de venta de ARCA**, el que ya tienen. Se sugiere dar de alta un segundo de respaldo, sin uso habitual, por si falla esa PC.

## 3. Productos, categorías y precios

### Catálogo
- Importación inicial desde el Excel exportado de OBTech
- Código interno, nombre interno, alícuota de IVA, unidad de medida
- **Código de barras** por producto, con soporte para más de uno por artículo
- Venta fraccionada *(se da de baja la unidad completa y se vende por porción)*
- Campos de lote, vencimiento, principio activo y certificado SENASA **creados pero no obligatorios** *(preparación para SIGTRAZAVET, sin impacto en la operación diaria)*

### Categorización
Se adopta el mismo esquema que la tienda online, que **no es un árbol de categorías sino varias clasificaciones simultáneas**:

| Eje | Ejemplos |
|---|---|
| Categoría | Farmacia, Alimentos, Higiene y cuidado, Accesorios, Antiparasitarios |
| Animal | Perros, Gatos, Bovinos |
| Etapa de vida | *(a definir con Gross)* |
| Marca | Bagó, Bravecto, NexGard, Pro Plan, Royal Canin, Total Max, Vetoquinol, Zoetis |
| Presentación | Bolsa, Unidad, Frasco |

Un producto puede pertenecer a varios ejes a la vez. Esto es lo que después habilita las métricas y los umbrales por categoría, y hace que la sincronización con la tienda no requiera traducir nada.

### Precios
- **Precio base** por producto
- **Reglas por medio de pago**: contado y tarjeta de crédito hasta 2 cuotas con porcentaje de recargo *(las dos "listas" que usan hoy)*
- **El sistema permite crear listas y reglas adicionales** sin depender del desarrollo
- **Descuentos y recargos por cliente**
- **Modificación manual del precio final en el momento de la venta**, tal como lo permite el sistema actual — con permiso por rol y registro de quién lo modificó, cuánto y cuándo

## 4. Stock

- Movimientos de entrada, salida y ajuste, con motivo y responsable
- Stock disponible calculado, con historial de cómo llegó a ese número
- **Toma de inventario por sectores**, con planilla de conteo y ajuste automático
- **Umbrales de stock bajo y crítico configurables en tres niveles**: general, por categoría y por producto específico *(el más específico gana)*
- Alertas de stock bajo en el panel

## 5. Lector de códigos de barra

- Búsqueda y carga de productos por escaneo en la venta
- Escaneo en la toma de inventario y en los ajustes
- Alta de código de barras desde la propia pantalla de producto
- Funciona con lectores USB estándar, sin instalación adicional

## 6. Clientes y cuenta corriente

- Ficha de cliente con datos fiscales para facturación
- Cuenta corriente: saldo, movimientos, límite de crédito
- Registro de cobranzas y aplicación a comprobantes
- Vencimientos y deuda por antigüedad
- **Repetir pedido** — traer la última compra del cliente

## 7. Ventas — modelo vendedor / caja

- El **vendedor** arma la venta con su PIN desde cualquier terminal de mostrador
- La venta se **envía a caja**
- El **cajero** cobra, factura e imprime
- Medios de pago: efectivo, tarjeta, transferencia, cuenta corriente, mixto
- Anulación y devolución con permiso de encargado
- Cierre de caja por turno y por cajero

## 8. Facturación electrónica ARCA

- Facturas A, B y C; notas de crédito y débito
- **Múltiples alícuotas de IVA en un mismo comprobante** (21%, 10,5%, 27%, exento)
- Leyenda y discriminación del Régimen de Transparencia Fiscal (Ley 27.743)
- Percepciones de Ingresos Brutos de Misiones
- **Contingencia con CAEA**: cuando ARCA no responde, la venta se completa igual y el comprobante queda en cola
- **Panel de estados con semáforo**: autorizado e impreso / autorizado sin imprimir / pendiente de autorización / rechazado
- Registro de cada intento fallido con fecha, causa y responsable (RG 5852/2026)
- Impresión en la **Hasar P-HAS-181** por red, con QR de ARCA

## 9. Métricas simples

- Ventas del día, semana y mes, con comparación contra el período anterior
- Productos más vendidos
- Ventas por vendedor
- Productos con stock bajo o crítico
- Saldos de cuenta corriente y deuda vencida
- Estado de la facturación

## 10. Carga inicial de datos

- Importación del catálogo desde el Excel de OBTech
- **Pantallas de carga y edición masiva** para que el personal de Gross cargue stock, categorías, códigos de barra y datos faltantes directamente sobre el sistema nuevo
- Carga de clientes y saldos iniciales de cuenta corriente
- Prueba en paralelo antes del corte
- Capacitación del equipo

> ⚠️ **Estas pantallas se entregan antes que el resto de V1-A.** El personal contratado por Gross va a empezar a cargar datos mientras el sistema todavía se está construyendo, así que la carga no puede esperar al final.

---

# V1-B — COMPLETAR

*Arranca al día siguiente del corte. Entrega estimada: ~5 semanas después.*

## 11. Compras a proveedores

- Ficha de proveedor
- Órdenes de compra
- Recepción de mercadería con ingreso automático de stock
- Registro de facturas de compra
- Costos y márgenes por producto
- **Umbrales de stock por proveedor**

## 12. Libro de IVA

- Libro de IVA Ventas
- Libro de IVA Compras
- Exportación en el formato que requiera el contador

## 13. Sincronización con la tienda online

- **API propia**: la tienda consulta stock y precios, y nos informa los pedidos
- **Publicación de stock por canal** (mostrador, tienda propia, y en el futuro MercadoLibre), cada uno con su colchón configurable
- Consulta de disponibilidad en vivo al momento del pago
- Indicador de frescura del dato, para que la tienda sepa cuándo el mostrador lleva rato sin sincronizar
- **Nombre interno vs nombre público**: el sistema maneja el nombre del vendedor (`ALIM BAL LIVRA 1KG`) y la tienda el nombre comercial, sin pisarse
- Las categorías se comparten sin traducción, porque se adopta la misma estructura

> ⚠️ **Por qué esto va en V1-B y no en V1-A:** depende de que Zubu haga su parte, y son un tercero cuya agenda no controlamos. Poner una dependencia externa en el camino crítico de una fecha comprometida es la forma más común de romper esa fecha. La **capa de integración se diseña en V1-A** —por eso el stock se modela por canal desde el principio— y se enciende en V1-B.

---

## ❌ Lo que V1 NO incluye

- CRM de tareas diarias
- Calendario de recibos completo *(V1 sí incluye vencimientos de cuenta corriente)*
- Integración con MercadoLibre
- Funciones con inteligencia artificial
- Métricas predictivas y de tendencia
- Libro de expendio de fitosanitarios y receta agronómica
- Reporte a SIGTRAZAVET

---

## ✅ Definición de terminado

### V1-A — se cumple en las máquinas de Gross, con datos reales:

1. Un vendedor arma una venta con su PIN, la manda a caja, el cajero cobra y **emite una factura con CAE de ARCA impresa en la Hasar**.
2. Esa venta **descuenta stock** y el movimiento queda con usuario y hora.
3. Se **desconecta internet**, se hacen tres ventas, se reconecta y **las tres aparecen** sin duplicarse ni perderse.
4. Se **simula una caída de ARCA**, se factura con CAEA, y al restablecerse los comprobantes se informan correctamente.
5. Se emite una **factura con productos de 21% y 10,5%** en el mismo comprobante y ARCA la autoriza.
6. Se vende un producto **escaneando su código de barra**.
7. Se cambia **manualmente el precio final** de una línea y queda registrado quién lo hizo.
8. Se registra una **venta en cuenta corriente**, se cobra parcialmente, y el saldo refleja ambas operaciones.
9. Se hace un **cierre de caja** y los totales coinciden con las ventas del turno.
10. Un usuario **sin permiso** intenta anular una venta y el sistema lo impide.
11. Un **umbral de stock por categoría** dispara una alerta.
12. Todos los productos, clientes y saldos **están cargados** y verificados.

### V1-B:

13. Se registra una **compra a proveedor** y la mercadería ingresa al stock automáticamente.
14. Se exporta el **Libro de IVA** en el formato que pidió el contador.
15. La **tienda online consulta el stock** por la API y recibe el dato correcto con su colchón aplicado.
16. Se hace una venta en el mostrador y **la tienda ve el stock actualizado** en la siguiente consulta.
17. Entra un **pedido desde la tienda** y descuenta stock en el sistema.

---

# BACKLOG — VERSIONES SIGUIENTES

## V2 — Comercial y clientes
- CRM de tareas diarias por usuario
- Calendario de recibos completo *(alcance a definir según lo que confirme Lucas)*
- Historial y perfil de compra del cliente
- Campañas y comunicaciones
- **Integración con MercadoLibre** — se enchufa como un canal más al esquema ya construido
- Reportes avanzados y exportaciones

## V3 — Inteligencia
- Sugerencia automática de reposición según ventas históricas y estacionalidad
- Predicción de quiebre de stock
- Detección de anomalías en ventas, ajustes y márgenes
- Asistente de búsqueda de productos en lenguaje natural
- Sugerencia de productos relacionados en el mostrador

## Vc — Cumplimiento normativo
*No tiene fecha propia: se activa cuando la norma lo exija. Su momento lo definen SENASA y la Provincia, no el proyecto.*

- **SIGTRAZAVET**: reporte de movimientos de productos veterinarios y receta electrónica *(la base ya queda preparada en V1)*
- **Libro de expendio de fitosanitarios** y receta agronómica (Ley XVI-144 de Misiones)
- Trazabilidad por lote y vencimiento en la operación diaria

---

# SUPUESTOS Y DEPENDENCIAS

Condiciones sobre las que se apoya la fecha del 26 de octubre. **Si alguna falla, la fecha se mueve.**

| # | Supuesto | Responsable | Estado |
|---|---|---|---|
| 1 | El Excel de productos llega con **alícuota de IVA por artículo** | Lucas | 🔴 Crítico |
| 2 | Gross contrata al personal de carga y **empieza a cargar en septiembre** | Gross | 🔴 Sin confirmar |
| 3 | El contador responde los tres puntos bloqueantes de su agenda | Armando Monje | Sin agendar |
| 4 | El certificado de ARCA se emite en tiempo | Lucas | Solicitud generada |
| 5 | Se confirman los dos no negociables con objeciones | Lucas | En revisión |
| 6 | Zubu responde y acuerda la integración *(afecta a V1-B, no a V1-A)* | Zubu | Avisados |
| 7 | Durante V1-A no se agregan funciones nuevas al alcance | Ambos | — |

> **OBTech ya no figura como dependencia.** La relación comercial está cortada: no responden llamados ni correos, aunque el software sigue operando mientras se abone. Lo único que se toma de ahí es un Excel de productos que Lucas exporta por su cuenta. Todo el resto lo carga el personal de Gross directamente sobre el sistema nuevo.

---

# LA CARGA INICIAL DE DATOS

**Definido con el cliente:** Gross va a contratar personal fuera de horario para cargar stock y datos faltantes **directamente sobre el sistema nuevo**, no sobre OBTech. Es un trabajo que nunca se hizo y que se decidió hacer bien de una vez.

Consecuencias para el desarrollo:

1. **Las pantallas de carga se entregan primero**, no al final. El personal necesita poder trabajar mientras el resto del sistema se construye.
2. **Se prioriza la carga masiva**: edición en lote, importación por planilla, y escaneo con lector para no tipear códigos.
3. **La carga se puede hacer por sectores** y el sistema marca qué productos ya fueron contados y cuáles no.
4. **El lector de códigos de barra conviene tenerlo antes de empezar la carga.** Cargar 3.000 productos escaneando en vez de tipeando cambia la duración del operativo por un factor grande, y después queda para el mostrador.

🔴 **Riesgo asociado:** este trabajo es de semanas y no se puede rehacer. Ver la nota sobre el plan de la base de datos más abajo.

---

# COSTOS DE INFRAESTRUCTURA

Las cuentas están a nombre de Gross (`lucasgross.cuentas@gmail.com`) y se pagan directamente al proveedor.

**Arrancamos todo con los planes gratuitos** y se va pagando a medida que haga falta.

| Concepto | Hoy | Cuándo pasa a pago |
|---|---|---|
| Base de datos y backend | Gratis | 🔴 **Antes de que el personal empiece a cargar datos reales** |
| Hosting de la aplicación | Gratis | No previsto |
| Dominio | — | Al definirlo |
| Certificado de ARCA | Gratis | Nunca |

> 🔴 **El único punto donde no se puede estirar el plan gratuito:** el plan gratis de la base de datos **no tiene copias de seguridad recuperables** y se suspende sola si el proyecto queda inactivo una semana. Mientras estemos desarrollando con datos de prueba, no importa. Pero el día que el personal contratado empiece a cargar el inventario real, esa base pasa a contener semanas de trabajo imposible de rehacer. **El cambio a plan pago tiene que ocurrir antes de ese día** — son unos USD 25 mensuales y es la mejor plata del proyecto.

No hay licencias por usuario ni por terminal. Agregar PC no aumenta el costo.

---

# FIRMAS

Este documento define el alcance de V1. Los pedidos que surjan durante su desarrollo se registran en el backlog de V2 y se acuerdan por separado.

**Por Agroveterinaria Gross:** ___________________________ Fecha: ___/___/______

**Por ILUMA:** ___________________________ Fecha: ___/___/______
