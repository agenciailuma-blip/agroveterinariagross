# Estado del proyecto — leer esto primero

**Última actualización:** 14 de agosto de 2026
**Para qué sirve este documento:** retomar el trabajo sin reconstruir el contexto. Si empezás una sesión nueva, leé esto antes que cualquier otra cosa.

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

**Usuario de prueba:** `agencia.iluma@gmail.com`. PINs sembrados: Francisco `1111`, Marcela `2222`, Diego `3333`, Silvina (cajera) `4444`.

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
| Catálogo y clasificación | ✅ | ✅ | Facetada, copiada de la tienda |
| Stock, umbrales, inventario | ✅ | ✅ | Carga por conteo con movimientos |
| Precios y medios de pago | ✅ | ✅ | Listas + recargo por cuotas |
| Punto de venta | ✅ | ✅ | Con PIN y offline |
| Caja, cobro y arqueo | ✅ | ✅ | **Todavía requiere internet** |
| Clientes y cuenta corriente | ✅ | ✅ | Cobranza integrada a la caja |
| Sincronización offline | ✅ | ✅ | Lectura y venta. No el cobro |
| Canales de venta | ✅ | — | Diseñado, se enciende en V1-B |
| **Facturación ARCA** | ✅ | ❌ | Datos completos. **Falta el servicio** |
| Compras y Libro de IVA | ❌ | ❌ | V1-B |
| Reportes | ❌ | ❌ | Métricas simples en Inicio |

**Números:** 21 migraciones · 49 tablas · 8 vistas · 142 políticas de seguridad · 34 funciones.

---

## 5. Lo que falta para el 26 de octubre

Por orden de riesgo:

### 🔴 1. Servicio de ARCA — bloqueado
La capa de datos está entera: comprobantes, numeración, CAEA, cola de contingencia, semáforo de estados, registro de intentos exigido por la RG 5852/2026.

**Falta la Edge Function** que habla con el web service: autenticarse contra WSAA con el certificado, pedir el CAE por WSFEv1, guardar la respuesta.

⏳ **Espera el certificado.** El `.csr` está en `secrets/gross_homologacion.csr` y hay que mandárselo a Lucas para que lo suba a WSASS con su clave fiscal. Se puede desarrollar contra homologación con el CUIT de ILUMA sin depender de nadie.

### 🔴 2. Cobro sin conexión
El mostrador ya vende offline, pero la caja necesita internet: `cobrar_venta()` hace tres cosas atómicas en el servidor —validar pagos, descontar stock, registrar deuda— que la terminal tiene que replicar localmente.

**Es la mitad más delicada del offline.** Un error acá significa stock mal descontado o deuda duplicada, que es peor que una venta que no sube.

### 🟡 3. Pantallas que faltan
Inventario por sectores, panel de comprobantes con el semáforo, configuración general, reportes.

### 🟡 4. Importador del Excel
Lucas está llenando una plantilla con categorías y costos. Cuando la devuelva, hay que escribir el importador.
⚠️ El Excel original ya no está en Descargas — pedirlo de nuevo para regenerar la plantilla con la columna de Costo.

### 🟢 5. Deploy y empaquetado
Cloudflare Pages (10 minutos cuando haya algo que publicar) y Tauri para las 4 PC del mostrador, con impresión ESC/POS a la Hasar por red.

---

## 6. Trampas aprendidas peleando con el offline

Costaron varias vueltas. Están todas corregidas, pero conviene no repetirlas.

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

## 8. Pendientes con terceros

| Con quién | Qué | Estado |
|---|---|---|
| **Lucas** | Certificado de ARCA (subir el `.csr` a WSASS) | 🔴 Bloquea facturación |
| **Lucas** | Plantilla de categorías y costos completada | En curso |
| **Lucas** | Excel original de precios (se perdió) | Pedido |
| **Lucas** | Qué es el "calendario de recibos" | Sin definir |
| **Lucas** | Cuántas cajas van a facturar | Sin definir |
| **Lucas** | Dónde corre OBTech (¿se pierde el histórico al cortar?) | 🔴 Ventana cerrándose |
| **Contador** | Modalidad de los puntos de venta (¿Web Service?) | 🔴 Bloquea facturación |
| **Contador** | Régimen de percepciones de IIBB Misiones | 🔴 Bloquea facturación |
| **Contador** | ¿Todo al 21%? El listado no tiene nada al 10,5% | Llamada coordinada |
| **Contador** | Orden del descuento del cliente sobre el recargo | Antes de la 1ª factura |
| **Zubu** | Acuerdo de integración (exponemos nosotros) | Avisados |
| **Gross** | Plan del inventario inicial (~3.000 productos) | 🔴 Sin planificar |
| **Supabase** | Activar protección de contraseñas filtradas | 30 segundos |

---

## 9. Convenciones

- **Todo en español**, incluido el código: nombres de tablas, columnas, funciones, variables y comentarios.
- **Migraciones** en `supabase/migrations/`, con marca de tiempo. Se aplican con `apply_migration` del conector. Cada una lleva arriba un comentario explicando **por qué**, no qué.
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
| [`marca/`](marca/) | Kit de identidad: logos, patterns, tipografía, colores |
