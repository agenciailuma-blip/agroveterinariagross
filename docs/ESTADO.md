# Estado del proyecto — leer esto primero

> # 👉 Empezá por [[AHORA]]
>
> Este archivo tenía 766 líneas y se leía entero para usar una quinta parte. El 09/09 se partió: **[`AHORA.md`](AHORA.md)** es la entrada de una página —qué se está haciendo, qué bloquea, qué sigue— y acá quedó lo que no cambia: qué es el proyecto, el estado por módulo, las convenciones y los datos de prueba.
>
> Nada se perdió: cada bloque que se movió dejó su puntero.

**Última actualización:** 9 de septiembre de 2026
**Para qué sirve este documento:** retomar el trabajo sin reconstruir el contexto. Si empezás una sesión nueva, leé esto antes que cualquier otra cosa.

> 📌 **Lo último que pasó:** la visita al local del 07/09. Todo lo que salió de ahí —las fotos de las impresoras, el error de Windows 7, y los nueve pedidos nuevos de Lucas— está en [`reunion-lucas-2026-09-07.md`](reunion-lucas-2026-09-07.md), con el orden de trabajo que quedó decidido.

---

## 🎯 Dónde retomar — al 08/09/2026

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
| 8 | Emisión sin conexión | ✅ 07/09 — **probada con internet cortado de verdad** |
| 9 | Pruebas de lo que decide con plata y con stock | ✅ 130 automáticas |
| **+** | **La caja edita la venta** — subió desde el punto 3 de esta lista | ✅ 04/09 |

> **Por qué "la caja edita la venta" se mudó adentro de este bloque.** Era comodidad: el cliente se arrepiente de una bolsa. Con el remito descargando stock antes del cobro, pasó a ser **el mecanismo que cierra el reparto**: el repartidor vuelve con lo que el cliente no quiso, y la única forma de que el stock aterrice bien es que el cajero corrija la venta a lo entregado. La base ya lo reconcilia sola (probado); falta la pantalla que lo permita.

> ⚠️ **Lo que dejó la reunión del 07/09, y hay que tenerlo en cuenta al ordenar lo que sigue.**
> Francisco reportó que **se avanzó con poco *visible***. Es cierto y es un problema de percepción real, no de trabajo: casi todo lo del bloque anterior fue infraestructura y corrección —emisión sin conexión, reconciliación de stock del reparto, dos bugs que habrían roto la instalación—. Nada de eso se demuestra en una pantalla.
>
> **Consecuencia para el orden de lo que sigue:** conviene adelantar lo que se ve. La impresión por Windows desbloquea el mostrador, pero después de eso el bloque C y las métricas de Inicio valen más que seguir puliendo lo invisible.

**Después de ese bloque, en orden — reordenado el 08/09 después de la visita al local:**

2. ✅ **Tanda 1 — todo lo que se ve. HECHA el 08/09.** Las diez cosas de la tabla en [`reunion-lucas-2026-09-07.md`](reunion-lucas-2026-09-07.md) §4: el scroll que no frena, los diálogos propios, el umbral de stock en el editor, la descripción, el descuento por porcentaje con motivo de lista, cerrar el PIN al enviar a caja, el nombre para llamar al cliente, el modal de cantidad, la columna de descuento con PIN y stock en el menú.
3. ✅ **Tanda 2 — remitos y líneas libres. HECHA el 09/09.** Remito sin precios, remito de cero, elegir si descuenta stock, y la línea libre (*producto comodín*) en venta, remito y presupuesto.
4. 🔴 **Impresión por impresora de Windows. ← ACÁ ESTAMOS.** Lo único que bloquea el mostrador. **Ya no le falta información**: las fotos del 07/09 trajeron el nombre, el controlador y el formato. Ver la sección de terceros.
5. **Métricas de venta en Inicio** — lo último visible que falta de V1-A.
6. ✅ ~~**Proveedor mínimo + aumento de precios por proveedor y por rubro.**~~ **HECHO el 09/09**, junto con la exportación de ventas para el contador. Ver [`compras-e-iva.md`](compras-e-iva.md).
7. **Reservar el concepto de depósito** en el modelo de stock, aunque haya uno solo. Media hora ahora contra tocar todo el histórico en diciembre.
8. **Sincronización por red local** y **cifrado de la base local**.
9. **Todo con teclado** — lo último antes del 26/10, decidido con Lucas.
10. **El actualizador automático** — ver el pendiente propio más abajo.

🔴 **Pendiente propio, antes de la próxima corrección:** el **actualizador automático** falla al reemplazar el programa —*"Error abriendo archivo para escritura: sistema-gross.exe"*— porque el programa todavía lo tiene abierto. Aparecido el 07/09 al publicar la 0.2.0. No rompe nada y hoy no molesta (las 4 PC se instalan de cero con el `.exe`), pero **cada corrección posterior hay que instalarla a mano con el programa cerrado** hasta resolverlo. Detalle y plan en [`instalacion-en-el-local.md`](instalacion-en-el-local.md), paso 8.

**Esperando a terceros:**

- 🔴 El **Excel con la columna de IVA** — sigue siendo lo que más bloquea.
- 🔴 El **alta del punto de venta CAEA**: el estudio contable se ofreció a hacerlo, falta que Lucas lo autorice. Cuando esté, hace falta el **número** del punto de venta.
- 🔴 El **certificado de producción de ARCA**.
- 🟡 Qué es un **"comprobante de percepción"** para Lucas (punto 9 de sus sugerencias).
- 🟡 **Probar la impresora del mostrador** y las 4 PC en el local, con el programa instalado. Guion listo en [`instalacion-en-el-local.md`](instalacion-en-el-local.md).
- ✅ **El modelo de la Hasar, resuelto el 04/09.** Lucas mandó la foto de la etiqueta: `P-HAS-181-STD-3I-N`, **IMPRESOR TERMICO** (no controlador fiscal) con USB/RS232/Ethernet. **ESC/POS es el protocolo correcto y lo construido sirve tal cual** — el riesgo de rediseño quedó descartado.
- ✅ **Los datos de la impresora, resueltos el 07/09 con las fotos del local.** Nombre en la caja **`POS80 Printer`**; en las otras PC **`POS80 Printer(2)` en `DESKTOP-O4R9STD`** (compartida de Windows). Controlador **`POS80ENG`** tipo 3, puerto **USB**, formato de datos **RAW**, papel 80 mm, corte automático. Detalle en [`reunion-lucas-2026-09-07.md`](reunion-lucas-2026-09-07.md) §1.
  **Lo que confirma:** no es un controlador fiscal ni un driver de Hasar — es el POS80 genérico, así que **ESC/POS es correcto y lo construido sirve tal cual**. Y el formato **RAW** es la pieza clave: Windows le entrega a la impresora exactamente los bytes que se le den, sin traducirlos, que es lo que permite mandarle ESC/POS por la cola de impresión.
- 🔴 **Falta construir la impresión por impresora de Windows.** Mandarle los bytes a una impresora instalada, **elegida de un desplegable que lista las instaladas** — nunca escrita a mano: los nombres cambian (`(2)`, `Copia 1`, el nombre del equipo) y un nombre mal tipeado falla en silencio. Cubre el USB de la caja y la compartida de las demás con un solo camino. Es lo único que sirve para cómo está armado el local. ~1 día, y no se puede verificar sin la impresora delante.
  ✅ **Es viable**: la caja NO es la máquina con Windows 7, así que ahí sí corre el programa instalado y se le puede hablar a la impresora.

### 🖥️ Las PC del local — relevado el 07/09 en el local

| | |
|---|---|
| PC con **Windows 7** | **Una sola**: la de ventas. `winver` → 6.1 build 7601 SP1 |
| ¿La **caja** es Windows 7? | **No.** Es la buena noticia del día: la impresión directa de tickets sigue siendo posible |
| ¿Van a **actualizar** esa PC? | **No.** Decisión de Gross, avisada |

**Qué significa.** En esa máquina el **programa instalado no puede correr** —Microsoft dejó de soportar WebView2 en Windows 7 en 2023; el instalador falla con `0x8007007F`— y no hay versión nuestra que lo arregle.

**Esa PC usa la versión web**, y Francisco confirmó que **funciona mejor así**. Es un puesto de mostrador: no imprime tickets ni participa de la sincronización por red local, así que no pierde nada de lo que necesita. Lo único degradado es cosmético: los 46 usos de `color-mix()` de Tailwind 4 no existen en Chrome 109, así que algunos fondos con transparencia salen sin color.

⚠️ **No se corrió el diagnóstico en esa máquina.** Queda pendiente para la próxima visita.

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

## → 10 · Las decisiones que no se revisan

Se mudó a **[`10 · Las decisiones que no se revisan.md`](10%20·%20Las%20decisiones%20que%20no%20se%20revisan.md)**. Las decisiones de fondo. Cambiar cualquiera obliga a rehacer varios módulos.

## 4. Estado por módulo

| Módulo | Base | Pantalla | Notas |
|---|---|---|---|
| Usuarios, roles y permisos | ✅ | ✅ | 33 permisos, 4 roles |
| **Registro de auditoría** | 🟡 | ❌ | ⚠️ Revisado el 14/09: la tabla `auditoria` existe desde el principio pero **está vacía y nada escribe en ella**. Lo sensible sí deja rastro en su propia tabla —quién cambió un precio, quién anuló, cada movimiento de stock con usuario—, pero no hay un registro central. Comprometido en el alcance §1 |
| **Cifrado de la base local** | ✅ | 🟡 | Hecho el 14/09 (0.4.0). Nombre, documento, domicilio y operaciones pendientes, cifrados con AES-GCM; la llave la guarda Windows. **Falta instalarlo limpio en las 4 PC** — ver paso 9 de `instalacion-en-el-local.md` |
| Catálogo y clasificación | ✅ | ✅ | Facetada, copiada de la tienda |
| Dar de baja productos | ✅ | ✅ | De a uno y en masa, con restaurar. Baja lógica: **se revocó el borrado físico** |
| Importación de la planilla | ✅ | ✅ | Con mapeo de columnas. Falta el archivo de Lucas |
| Toma de inventario por sectores | ✅ | ✅ | Contar escaneando, recontar, cerrar y ajustar |
| Stock, umbrales, inventario | ✅ | ✅ | Carga por conteo con movimientos |
| Precios y medios de pago | ✅ | ✅ | **ABM completo**: crear/editar/dar de baja listas y medios, cuotas por desplegable |
| Punto de venta | ✅ | ✅ | Con PIN y offline |
| Caja, cobro y arqueo | ✅ | ✅ | Cobra sin conexión. Preselecciona el medio que anotó el vendedor y deja el comprobante a un clic |
| Clientes y cuenta corriente | ✅ | ✅ | Cobranza integrada a la caja |
| Anulación y devolución | ✅ | ✅ | "Devolver" (entera) y, desde el 11/09, **"Devolver parte"** en Facturación: reingresa stock, saca la deuda y emite la nota de crédito. **Falta la nota de débito** |
| Sincronización offline | ✅ | ✅ | Lectura, venta y cobro. **Desde el 10/09 también entre las PC del local sin internet** (la caja escucha, los mostradores le entregan). Falta probarlo con dos PC reales |
| Canales de venta | ✅ | — | Diseñado, se enciende en V1-B |
| **Facturación ARCA** | ✅ | ✅ | Emite CAE real en homologación, con pantalla y enganchada al cobro. Falta impresión |
| **Contingencia CAEA** | ✅ | 🟡 | Circuito completo construido y probado contra la base. **Bloqueado por un trámite**: ARCA exige un punto de venta del régimen CAEA (error 15003) |
| **Comprobantes no fiscales y remitos** | ✅ | ✅ | Presupuesto, remito e interno con numeración propia. La caja elige antes de cobrar. Remito **sin precios**, **de cero** y con la opción de **no descontar stock**; **línea libre** sin producto del catálogo |
| Compras a proveedores | 🟡 | 🟡 | **La factura de compra se carga desde el 10/09** (subió a V1-A). Queda en V1-B: órdenes, recepción de mercadería con stock, costos. Sin definir: cuenta corriente de proveedores y cheques |
| **Stock** | ✅ | ✅ | Pantalla propia desde el 08/09: ordenada por urgencia, con el umbral editable en la ficha del producto |
| **Proveedores** | ✅ | ✅ | Ficha mínima + campo en el producto + **ajuste masivo de precios** por proveedor y rubro —sube y baja—, con deshacer |
| **Ventas para el contador** | ✅ | ✅ | Exportación mensual a Excel, una fila por alícuota. **El Libro de IVA lo arma el contador**, y las compras las baja de ARCA |
| Métricas de Inicio y Reportes | ✅ | ✅ | Ventas del día, 7 días y mes (10/09), comparadas contra el período anterior y con la deuda por antigüedad en **Reportes** (11/09). Resumen de cuenta corriente en PDF (14/09) |
| Empaquetado Tauri (4 PC) | ✅ | 🟡 | **Instalador andando**, con actualizador propio. Falta probar el actualizador de punta a punta |
| Versión para el celular | ✅ | ✅ | 14/09: menú en panel, fichas a pantalla completa, íconos para instalarla. Falta probarla en un teléfono de verdad |
| Impresión del ticket | ✅ | 🟡 | Por la cola de impresión de Windows, eligiendo la impresora de una lista en cada PC (09/09). **Falta probarla con el papel puesto** |

**Números al 08/09:** 58 migraciones · 58 tablas · 13 vistas · 158 políticas de seguridad · 69 funciones · 3 Edge Functions · 40 permisos · 135 pruebas automáticas. **Al 14/09:** 75 migraciones · 248 pruebas en la app y 11 en el programa.

---

## → Lo construido, en detalle

Se mudó a **[`20 · Módulos/Lo construido, en detalle.md`](20%20·%20Módulos/Lo%20construido,%20en%20detalle.md)**. El detalle de cada módulo: qué se construyó, con qué criterio y cómo se verificó. Es el archivo de referencia — se abre cuando hace falta tocar uno, no al empezar una sesión.

## → Las del trabajo sin conexión

Se mudó a **[`30 · Trampas/Las del trabajo sin conexión.md`](30%20·%20Trampas/Las%20del%20trabajo%20sin%20conexión.md)**. Costaron varias vueltas. Están todas corregidas; conviene no repetirlas.

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

## → Pendientes con terceros

Se mudó a **[`50 · Terceros/Pendientes con terceros.md`](50%20·%20Terceros/Pendientes%20con%20terceros.md)**. Lo que no depende de nosotros, y a quién hay que pedírselo.

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
| [`guia-de-pantallas.md`](guia-de-pantallas.md) | **Recorrido del menú, pantalla por pantalla**: qué contiene, qué se hace, qué se ve y qué se exporta. Para mostrar y para entrenar |
| [`compras-e-iva.md`](compras-e-iva.md) | **Facturas de compra y Libro de IVA**: por que el pedido quedo sin desarrollar, las tres piezas que hay adentro, y la decision pendiente de subir dos a V1-A |
| [`pedidos-de-lucas-estado.md`](pedidos-de-lucas-estado.md) | **El tablero de los 24 puntos de Lucas más los del 07/09**, con su estado real. El papel para llevar a la próxima reunión |
| [`reunion-lucas-2026-09-07.md`](reunion-lucas-2026-09-07.md) | Lo que dejó la visita al local del 07/09: las impresoras, el error de Windows 7 y los pedidos nuevos |
| [`marca/`](marca/) | Kit de identidad: logos, patterns, tipografía, colores |

