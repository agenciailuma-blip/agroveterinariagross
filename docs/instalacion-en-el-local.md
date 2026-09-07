# Instalación en las PC de Gross — guion

**Para qué sirve:** que la sesión con Lucas dure media hora y no tres. Está escrito para leerse mientras se hace, no antes.

**La regla de oro:** cada corrección que haya que publicar durante la sesión son **varios minutos** (subir versión, compilar, subir a Cloudflare, que Lucas apriete Actualizar). Así que lo que se pueda averiguar antes, se averigua antes.

---

## 1. Antes de conectarse — dos preguntas a Lucas

Estas dos van por WhatsApp con días de anticipación. **Ninguna se resuelve con él esperando del otro lado.**

### ✅ La impresora — resuelto el 04/09 con la foto de la etiqueta

**`P-HAS-181-STD-3I-N` · HASAR IMPRESOR TERMICO · USB/RS232/E…**

Lo que dice la etiqueta y por qué importa:

- **"IMPRESOR TERMICO"**, no "impresor fiscal". Es una impresora de tickets, así que **ESC/POS es el protocolo correcto y el circuito construido sirve tal cual**. Era el único riesgo de la instalación que podía ser un rediseño, y quedó descartado.
- **`-3I-`** son tres interfaces: USB, RS232 y una tercera que empieza con "E" —cortada en la foto— casi con seguridad **Ethernet**. Tiene puerto de red.

### 🔴 HOY EL SISTEMA SÓLO IMPRIME POR RED

**Esto hay que tenerlo claro antes de empezar.** El programa abre una **conexión de red** contra la impresora (`impresora.rs` usa TCP). **No habla por USB.**

O sea:

| Cómo está conectada | Qué pasa hoy |
|---|---|
| Cable de red, con IP | ✅ Imprime |
| USB a una PC | ❌ **No imprime, y no hay nada que hacer en la sesión** |

Tener puerto Ethernet no es lo mismo que estar conectada por Ethernet. Si están por USB, el paso de la impresora **se saltea** y se sigue con el resto: todo lo demás del sistema funciona igual, y el comprobante se puede imprimir desde el navegador a cualquier impresora mientras tanto.

> **Decisión pendiente de Francisco:** agregar el camino por USB —mandándole los bytes a una impresora instalada de Windows, elegida de una lista— cubriría USB y red con un solo camino y sacaría la IP de la configuración. Es alrededor de un día de trabajo y no se puede verificar sin la impresora delante. **No está hecho.**

### 🟢 Dos cajas, dos Hasar

Confirmado en la última visita: hay **dos puestos con la misma Hasar**. Uno es el de siempre y el otro lo usa Lucas para trabajos de facturación que no son atención al público.

Las **PC de mostrador no usan la Hasar**: arman ventas y las mandan a la caja. Sólo las terminales de tipo `caja` imprimen tickets, y el sistema ya está así.

Si van por red, **cada impresora necesita su propia IP** y cada caja se configura con la suya.

### 🟡 Cuántas PC y cuál es la caja

> ¿Cuántas computadoras vamos a instalar, y cuál va a ser la que cobra y factura? Las demás quedan como mostrador (arman ventas y las mandan a la caja).

---

## 1-bis. Cómo saber la IP sin ejecutar ningún comando

Todo con clics. **El primer camino contesta las dos preguntas de una vez** —si está por USB o por red, y cuál es la IP— así que empezá por ahí.

### A · La pestaña Puertos de Windows ← empezar acá

1. Menú de inicio → escribir **Panel de control** → **Dispositivos e impresoras**.
   *(En Windows 11: Configuración → Bluetooth y dispositivos → Impresoras y escáneres.)*
2. Clic derecho en la Hasar → **Propiedades de impresora**.
3. Pestaña **Puertos**. Mirar cuál está tildado:

| Lo que dice el puerto | Qué significa |
|---|---|
| `USB001`, `USB002`… | Está por **USB**. No tiene IP, y hoy no podemos imprimir desde el sistema |
| `192.168.x.x` o similar | **Esa es la IP.** Copiala tal cual |
| `IP_192.168.x.x` | Lo mismo: la IP es lo que va después del guion bajo |

Si la columna no se ve entera, se ensancha arrastrando el borde. Una foto de esa pantalla alcanza.

### B · La hoja de configuración de la impresora

Apagarla y prenderla **manteniendo apretado el botón de avance de papel**. Suele imprimir una hoja con su configuración, y ahí figura la IP. Una foto de la hoja sirve.

### C · El router

Entrar a la administración del router (suele ser `192.168.0.1` o `192.168.1.1` en el navegador) y buscar la lista de equipos conectados. La impresora aparece por nombre o por marca.

> ⚠️ **Si la IP la reparte el router automáticamente, puede cambiar** — y el día que cambie, imprimir deja de andar sin ningún aviso claro. Si van por red, conviene fijarla. Es otro argumento a favor de resolver el camino por USB.

---

## 2. Lo que tiene que estar listo de nuestro lado

- [ ] La versión publicada en Cloudflare con `npm --prefix app run escritorio:publicar` (**no** `npm run build` — ver la advertencia de ESTADO).
- [ ] El instalador a mano: está en `app/dist/actualizaciones/`.
- [ ] Las terminales creadas en el sistema, con su prefijo y —la caja— con su punto de venta de ARCA.
- [ ] Saber los PIN de los operadores que van a usar las PC.

---

## 3. El orden de la sesión

Cada paso tiene una forma de saber que salió bien. **Si un paso falla, no se sigue al siguiente**: casi todos dependen del anterior.

### Paso 1 · Instalar

Lucas ejecuta el `.exe`. No pide contraseña de administrador (está en modo "usuario actual", a propósito).

✅ **Sale bien si:** aparece "Sistema Gross" en el menú de inicio de Windows y abre.

> ⚠️ Windows puede mostrar un aviso de "editor desconocido". Es esperable: el instalador no está firmado con un certificado comercial. Se le da a **Más información → Ejecutar de todas formas**.

### Paso 2 · Entrar

Lucas pone el correo y la contraseña de Gross.

✅ **Sale bien si:** aparece "Buenas tardes, ..." con su nombre.

> Si dice *"tu cuenta no está vinculada a ningún usuario del sistema"*, es que el correo con el que entró no coincide con ninguno dado de alta. Se resuelve dándolo de alta con **ese mismo correo**.

### Paso 3 · **Correr el diagnóstico** ← el paso que ahorra la sesión

**Configuración → Diagnóstico de esta terminal → Revisar ahora → Copiar para mandar.**

Lucas pega el texto en el chat. Ahí se ve, de una sola vez:

- si está en el programa instalado o en el navegador,
- si llega al servidor y en cuánto tiempo,
- si la terminal está asignada y de qué tipo,
- si la caja tiene punto de venta de ARCA,
- cuántos productos bajó a la máquina,
- si hay operaciones sin subir,
- si la impresora está configurada.

**Cada punto que falla trae escrito qué hacer.** Se resuelven en ese orden y se vuelve a correr.

### Paso 4 · Asignar la terminal

Si el diagnóstico dijo que falta: **Ventas** → elegir cuál es esta máquina.

✅ **Sale bien si:** el diagnóstico ahora dice el nombre de la terminal y su prefijo.

### Paso 5 · La impresora — **saltear si están por USB**

**Si la pestaña Puertos dijo `USB001`, este paso no se hace hoy.** Seguí al 6: todo lo demás funciona igual y el comprobante se imprime desde el navegador mientras tanto.

Si están por red: **Configuración → Impresora del mostrador.** Se carga la IP y el puerto (9100 salvo que la hoja de configuración diga otro) y se aprieta **Imprimir prueba**.

✅ **Sale bien si:** sale un papel que dice "Si estás leyendo esto, la impresora está bien configurada".

❌ **Si no sale nada:** o la IP está mal, o la impresora no está encendida, o no escucha en ese puerto. El modelo es el correcto, así que no es eso.

> **Cada caja se configura con la IP de SU impresora.** Son dos puestos con una Hasar cada uno.

### Paso 6 · Una venta de punta a punta

1. **Ventas** → escanear o buscar un producto → **Enviar a caja**.
2. **Caja** → PIN → elegir la venta → elegir cómo paga → **Cobrar**.
3. Que salga el CAE y que el ticket imprima.

✅ **Sale bien si:** el comprobante sale con número, CAE y QR.

### Paso 7 · Cortar internet ← lo que nunca se probó

**Este es el paso que más importa y el que nunca hicimos en una máquina real.**

1. Desconectar el wifi o el cable de la PC.
2. Armar una venta y mandarla a caja.
3. Cobrarla.
4. Volver a conectar.

✅ **Sale bien si:**
- La venta se puede armar y cobrar sin conexión.
- Arriba a la derecha aparece el contador de "sin subir".
- Al volver la conexión, ese contador baja a cero solo.
- La factura sale sola cuando vuelve internet.

**Y desde el 07/09, también sin conexión:**
- Se puede **hacer un presupuesto** y el papel sale igual.
- Se puede **emitir un remito** desde la pantalla de Remitos.
- Los dos salen con su número, y ese número no se repite cuando vuelve la conexión.

> Es lo último que se construyó y **nunca se probó con internet cortado de verdad**. Si algo va a fallar hoy, lo más probable es que sea acá. Vale la pena hacerlo con tiempo y mirar el contador de "sin subir" antes y después.

> **Lo que sí necesita internet a propósito:** abrir y cerrar la caja. Si Lucas prueba eso sin conexión, el sistema lo va a rechazar y **está bien**: arquear con la mitad de las ventas sin registrar produce una diferencia que después alguien tiene que explicar.

### Paso 8 · La actualización sola

Con las 4 PC instaladas, publicar una versión nueva y ver que aparezca la franja arriba de la pantalla.

✅ **Sale bien si:** aparece *"Hay una versión nueva del sistema"* y al apretar **Actualizar ahora** el programa se reinicia con la versión nueva.

---

## 4. Si hay que corregir algo en el momento

1. Subir el número en `app/src-tauri/tauri.conf.json`.
2. `npm --prefix app run escritorio:publicar`
3. Arrastrar `app/dist` a Cloudflare Pages, proyecto `gross-sistema`.
4. Lucas aprieta **Actualizar ahora** en la franja.

> ⚠️ **Nunca subir un `dist` hecho con `npm run build`.** Le falta la carpeta de actualizaciones y las 4 PC dejan de recibir correcciones sin ningún error visible. Si pasa, adentro de `dist` queda un archivo `NO-SUBIR-ESTA-CARPETA.txt` avisando.

---

## 5. Lo que ya sabemos que puede aparecer

| Síntoma | Qué es | Qué hacer |
|---|---|---|
| "Cargando…" para siempre en la Caja | La máquina no tiene terminal asignada | Ventas → elegir la terminal. *(Corregido el 04/09: ahora lo dice en vez de quedarse cargando)* |
| El botón de imprimir no hace nada | Pasaba adentro del programa por `target="_blank"` | Corregido el 03/09. Si vuelve a pasar, avisar |
| Acentos raros en el ticket | Codificación | Corregido: va en latin1 |
| ARCA rechaza con 10015 / 10243 | El CUIT del cliente no existe en los padrones | Es del dato del cliente, no del sistema. Corregir el CUIT |
| ARCA rechaza con 10016 | La numeración se desfasó | Se corrige sola en el siguiente intento |

---

## 6. Lo que NO se resuelve en esta sesión

- **La impresión por USB**, si resulta que están así conectadas. No está construido: es alrededor de un día de trabajo y hay que decidirlo.
- **El punto de venta del régimen CAEA** — trámite en el portal de ARCA. Sin eso no hay contingencia.
- **El certificado de producción** — hoy todo corre contra homologación. Los comprobantes emitidos **no son válidos** hasta que esté.
- **La sincronización por red local** — si se corta internet, las terminales no se hablan entre sí. Una venta armada en el mostrador no llega a la caja hasta que vuelva la conexión. Está en el plan, va al final.
