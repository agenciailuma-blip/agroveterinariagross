---
origen: ESTADO.md
actualizado: 2026-09-09
---

# Pendientes con terceros

> Lo que no depende de nosotros, y a quién hay que pedírselo.

> Se movió acá desde `ESTADO.md` el 09/09, sin tocar una palabra. Empezá por [[AHORA]].

---

## 8. Pendientes con terceros

| Con quién | Qué | Estado |
|---|---|---|
| **Lucas** | Certificado de ARCA (subir el `.csr` a WSASS) | ✅ Obtenido el 21/08 — homologación. Ver [`secrets/gross_homologacion.crt`](../secrets/gross_homologacion.crt) |
| **Contador** | **Alta del punto de venta del régimen CAEA** | ✅ **El 00009, dado de alta el 11/09** (constancia recibida el 16/09) y cargado en el sistema |
| **Lucas** | **Certificado de producción** — subir `gross_produccion.csr` y autorizarlo a Facturación Electrónica | 🔴 El pedido está armado desde el 16/09. Bloquea facturar de verdad y la última prueba del CAEA. Paso a paso: [`certificado-produccion.md`](../certificado-produccion.md) |
| **Lucas** | Plantilla de categorías y costos completada | En curso |
| **Lucas** | Excel original de precios (se perdió) | Pedido |
| **Lucas** | Qué es el "calendario de recibos" | Sin definir |
| **Lucas** | Cuántas cajas van a facturar | Sin definir |
| **Lucas** | Dónde corre OBTech (¿se pierde el histórico al cortar?) | 🔴 Ventana cerrándose |
| **Contador** | Modalidad de los puntos de venta (¿Web Service?) | ✅ Respondido: ya tienen uno habilitado para RECE |
| **Contador** | Régimen de percepciones de IIBB Misiones | ✅ Respondido: solo agente de percepción (no retención), régimen 14, alícuota 3,31%. Ver [[regulatorio-agroveterinaria-ar]] |
| **Contador** | Mínimo no sujeto a percepción: $14.000 (su respuesta escrita) vs $24.000 (Lucas) | 🟢 **Prácticamente resuelto a favor de $24.000.** El 24/08 Lucas dijo, sin que se lo preguntaran, que percibe "cada factura mayor a setecientos y pico mil". Con 3,31%, un mínimo de $24.000 se dispara a los **$725.075**; uno de $14.000 se dispararía a los $422.960. La cuenta cierra sola. Lo más probable es que la DGR haya subido el mínimo después de que el contador contestó. Confirmarlo igual con una línea, pero ya no bloquea |
| **Contador** | **Formato del Libro de IVA Digital**: ¿archivo oficial de ARCA, o una exportación en Excel que él procesa? | 🔴 **Preguntado desde el principio** ([`agenda-contador.md`](agenda-contador.md) §5, prioridad Alta) y sin respuesta. **La respuesta cambia el tamaño del trabajo**: un Excel con sus columnas es medio día; el formato oficial de ARCA son varios. Se había caído de esta tabla — repuesto el 09/09. Ver [`compras-e-iva.md`](compras-e-iva.md) |
| **Lucas** | **Las fotos de cómo cargan hoy las facturas de compra** | 🔴 Las mandó y **no están en el repositorio**. No son para copiar el modelo: son para saber qué campos usa y qué le falta del sistema actual. Sin eso, la pantalla se diseña adivinando |
| **Contador** | Criterio de alícuotas de IVA por producto | 🔴 Sin resolver — "al ser contador externo no está al tanto de cómo lo parametrizan"; Lucas lo está completando en el Excel, para septiembre |
| **Lucas** | **Dónde se cobra la percepción de IIBB**: en la caja junto con la venta, o a la cuenta corriente | 🔴 Bloquea cerrar el circuito de cobro de mayoristas. Ejemplo numérico redactado en [`mensajes-lucas-2026-08-21.md`](mensajes-lucas-2026-08-21.md) |
| **Contador** | Base de la percepción: ¿el neto gravado total, o solo el neto al 21%? Su planilla de ejemplo es ambigua | 🟢 **Resuelto en la práctica a favor del neto total.** El 24/08 Lucas describió cómo funciona hoy en OBTech: *"si el sistema detecta que esa factura es mayor al valor, digamos que son 700 y pico mil **netos**"* y *"lo que hace el sistema es ver **del total de la factura**"*. Es lo que está implementado |
| **Lucas / Contador** | **Número de Ingresos Brutos** y **fecha de inicio de actividades** de Gross | ✅ **Resueltos el 25/08.** Lucas mandó dos comprobantes reales (un ticket de la Hasar y una Factura A en A4) y los dos traen los mismos valores: IIBB `20-14636976-7` (es el CUIT) e inicio `16/06/1986`. Ya cargados |
| **Lucas** | Qué hacer con la columna **Animal** de la planilla (Perros, Gatos, Bovinos…) | 🟡 Es una dimensión aparte del árbol de rubros. Hoy no se importa. Importa para la tienda de V1-B |
| **Lucas** | La columna **Precio tarjeta** de la planilla | 🟡 Hoy el sistema lo calcula solo con el ajuste de la lista. Si sus precios de tarjeta no salen de un porcentaje fijo, hay que hablarlo |
| **Zubu** | Acuerdo de integración (exponemos nosotros) | 🟢 **La API de lectura está publicada desde el 18/09.** Falta darles la clave (por un canal privado) y el documento [`api-tienda.md`](../api-tienda.md). Que su proceso de compra pida desde ya DNI o CUIT, condición frente al IVA y email: lo necesitan los pedidos de la segunda etapa |
| **Lucas** | **La dirección desde la que salen los mails** (facturas de la tienda, y el pedido 17) | 🟡 El servicio ya está elegido: Resend. Falta la dirección y acceso al dominio para configurarla |
| **Gross** | Plan del inventario inicial (~3.000 productos) | 🔴 Sin planificar |
| **Supabase** | Activar protección de contraseñas filtradas | 30 segundos |

### Lo que se sumó el 21/08, a partir de las respuestas del contador y una reunión posterior con Lucas

- **Clasificación fiscal por rubro ARCA** (`rubro_arca`, `producto.rubro_arca_id`): eje separado de las categorías de la tienda, con los 7 códigos de la constancia de inscripción de Gross. Pedido de Lucas para que el contador pueda separar ventas por actividad. El **reporte y la exportación a Excel/CSV quedan para V1-B** junto con el Libro de IVA — no se sumaron hoy para no tocar la fecha del 26/10 (regla de trabajo de `alcance-v1.md`).
- **Percepción de IIBB, configurable sin depender del desarrollador**: `configuracion` tiene `arca.iibb_percepcion_alicuota` y `arca.iibb_percepcion_minimo`, editables desde la pantalla nueva Configuración → Percepción IIBB (permiso `configuracion.gestionar`).
- **Exclusión de percepción por cliente**: `cliente.iibb_percepcion_excluido` + número y vigencia de certificado, cargable desde la ficha del cliente (solo visible si es Responsable Inscripto).
- Todavía **no existe** la función que calcula y aplica la percepción al emitir un comprobante: es parte del servicio de facturación, bloqueado por el certificado.

---

