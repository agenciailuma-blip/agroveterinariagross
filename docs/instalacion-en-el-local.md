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

### ✅ CONFIRMADO EL 07/09: USB a la caja, compartida a las demás

Es **impresora compartida de Windows**, no una impresora con IP propia: la POS80 va por USB a la caja y las otras PC la usan desde ahí.

Eso dejó sin uso el camino por red que tenía el sistema —no hay ninguna IP que poner— y por eso el 09/09 se construyó el camino por **impresora de Windows**: la caja imprime a la local por USB, las demás a la compartida, **las dos por nombre y con el mismo mecanismo**. Dejó de ser "más cómodo" y pasó a ser el único que sirve para cómo está armado el local.

### ✅ Los datos de las impresoras — traídos el 07/09, y el camino ya construido

Las fotos de la visita (en [`referencias/el-local/`](referencias/el-local/)) contestaron todo:

| Dónde | Qué hay |
|---|---|
| **En la caja** | **`POS80 Printer`** · puerto **USB** (`USB00x`) · controlador **`POS80ENG`** · formato de datos **RAW** |
| **En los mostradores** | **`POS80 Printer(2)` en `DESKTOP-O4R9STD`** — la misma, compartida desde la caja |

Lo que confirma: **no es un controlador fiscal**, es una térmica de 80 mm común, así que **ESC/POS es correcto**. Y el formato **RAW** es la pieza clave: Windows le pasa a la impresora exactamente los bytes que se le den, sin traducirlos, que es lo que permite mandarle ESC/POS por la cola de impresión en vez de por red.

> **El camino por impresora de Windows está construido desde el 09/09.** La impresora se elige de una lista en Configuración —no se escribe— y se guarda por terminal, porque la misma POS80 se llama distinto en cada PC. Lo único que falta es apretar el botón con el papel puesto: ver el **Paso 5**.

### 🟢 Dos cajas, dos Hasar

Confirmado en la última visita: hay **dos puestos con la misma Hasar**. Uno es el de siempre y el otro lo usa Lucas para trabajos de facturación que no son atención al público.

Las **PC de mostrador no usan la Hasar**: arman ventas y las mandan a la caja. Sólo las terminales de tipo `caja` imprimen tickets, y el sistema ya está así.

Con lo confirmado el 07/09, la de la caja va por USB. Falta ver en la reunión cómo está la segunda: si también por USB a esa PC, o si usa la compartida de la primera.

### 🟡 Cuántas PC y cuál es la caja

> ¿Cuántas computadoras vamos a instalar, y cuál va a ser la que cobra y factura? Las demás quedan como mostrador (arman ventas y las mandan a la caja).

---

## 1-bis. La IP de la impresora ya no hace falta

Estaba acá cómo averiguarla sin ejecutar comandos. **Ya no se necesita:** la impresión va por la cola de Windows, eligiendo la impresora de una lista por nombre. No hay IP que cargar en ninguna PC.

Y era, además, el camino frágil: una IP que reparte el router automáticamente **cambia**, y el día que cambia imprimir deja de andar sin ningún aviso claro.

---

## 2. Lo que tiene que estar listo de nuestro lado

- [x] **Versión 0.2.2 publicada el 09/09** en Cloudflare. Sube sola con `npm --prefix app run escritorio:publicar` (**no** `npm run build` — ver la advertencia de ESTADO).
- [ ] **Publicar la versión con la impresión por impresora de Windows**, que se construyó el 09/09 y todavía no está publicada. Sin eso, en el local no hay lista de impresoras para elegir.
- [ ] El instalador para las 4 PC, de la versión que se publique. Se baja de
      `https://gross-sistema.pages.dev/actualizaciones/` — el nombre del archivo lleva el número de versión.
- [ ] **Cargar el logo** en Configuración → Datos del emisor. Sin logo, los remitos y presupuestos salen sin nada que identifique al comercio, porque ya no llevan los datos del emisor.
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
- **si la impresora elegida existe de verdad en esa PC** — no sólo si hay un nombre guardado. Si la compartida no aparece porque la PC de la caja está apagada, lo dice ahí y no cinco minutos después con un cliente adelante.

**Cada punto que falla trae escrito qué hacer.** Se resuelven en ese orden y se vuelve a correr.

### Paso 4 · Asignar la terminal

Si el diagnóstico dijo que falta: **Ventas** → elegir cuál es esta máquina.

✅ **Sale bien si:** el diagnóstico ahora dice el nombre de la terminal y su prefijo.

### Paso 5 · La impresora — **ahora sí, y es de dos minutos**

**Configuración → Impresora del mostrador.** Hay un desplegable con las impresoras que tiene instaladas **esa** computadora. Se elige la que corresponde, se aprieta **Guardar**, y después **Imprimir una prueba**.

| En qué PC | Qué elegir |
|---|---|
| La caja | `POS80 Printer` |
| Los mostradores | `POS80 Printer(2)` — la compartida, aparece con el nombre del equipo de la caja |

✅ **Sale bien si:** sale un papel que dice "Si estás leyendo esto, la impresora está bien configurada".

❌ **Si la impresora no está en la lista:** apretar **Actualizar la lista** con la impresora prendida. Si es la compartida, la PC de la caja tiene que estar encendida — es de ella. Si sigue sin aparecer, no está instalada en esa PC y eso se arregla en Windows, no en el sistema.

❌ **Si sale un papel con símbolos raros:** el controlador no está en RAW. Se corrige en Windows: propiedades de impresora → Opciones avanzadas → formato de datos → RAW. En el relevamiento del 07/09 ya estaba en RAW.

> **Se guarda por terminal, así que hay que hacerlo en cada PC.** No es una vez para todo el local: el nombre de la impresora es distinto en cada máquina, y por eso cada una elige la suya. Se hace mientras esa PC está delante, que es cuando se puede ver la lista de verdad.

> **Si esto falla, nadie queda sin comprobante.** El botón "Imprimir" de la pantalla del comprobante sigue usando el diálogo de Windows y no depende de nada de esto.

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

### Paso 8 · La actualización sola — ⚠️ **el arreglo está publicado pero sin probar de punta a punta**

**El problema, del 07/09.** Al apretar **Actualizar ahora** aparecía:

> *Error abriendo archivo para escritura: `…\Sistema Gross\sistema-gross.exe`*
> *Presione abortar…, reintentar…, u omitir…*

El instalador no llegaba a reemplazar el programa porque el programa todavía lo tenía abierto. No rompía nada: apretando *Omitir* todo quedaba en la versión anterior, coherente.

**El arreglo, en la 0.2.2 (09/09).** Un gancho propio del instalador ([`instalador.nsh`](../app/src-tauri/instalador.nsh)) que corre **antes** que todo: intenta abrir el `.exe`, espera hasta 10 segundos, y si sigue tomado mata lo que quedó. El chequeo que trae Tauri no alcanzaba porque busca el proceso **por nombre** y los procesos hijos de WebView2 —que son los que retienen el archivo— se llaman distinto.

⚠️ **Sigue sin verificarse.** El 09/09 se actualizó una PC a la 0.2.2, pero desinstalando la versión vieja primero, así que **el camino del actualizador no se recorrió**. Está verificado que el gancho compila y queda dentro del instalador; no que resuelva el archivo tomado.

**Lo que se hace en la sesión**, hasta que alguna vez se pruebe:

1. **Desinstalar** la versión que esté.
2. Bajar el instalador nuevo y ejecutarlo.

> **Cuándo importa de verdad.** Hoy no: con la PC delante, desinstalar e instalar es un minuto. Importa **después del 26/10**, cuando haya que hacer llegar una corrección a 4 PC sin ir hasta Oberá. Ese día el actualizador es el único camino, así que conviene probarlo una vez antes — con la próxima versión, en una sola PC, sin desinstalar nada.

---

## 4. Si hay que corregir algo en el momento

1. Subir el número en `app/src-tauri/tauri.conf.json`.
2. `npm --prefix app run escritorio:publicar` — compila, firma **y sube solo a Cloudflare**. Ya no hay que arrastrar nada.
3. En cada PC: **desinstalar** y ejecutar el instalador nuevo. (Apretar "Actualizar ahora" *debería* funcionar desde la 0.2.2, pero eso todavía no se probó — ver paso 8.)

> ⚠️ **Correr eso desde Git Bash, no desde PowerShell.** PowerShell tiene bloqueada la ejecución de scripts en esta máquina y `npm`/`npx` fallan con *"la ejecución de scripts está deshabilitada"*. Alternativa rápida: usar `npm.cmd` en vez de `npm`.

> ⚠️ El paso 3 es a mano **hasta que el actualizador esté probado de verdad** (ver paso 8). Cuando lo esté, vuelve a ser apretar "Actualizar ahora".

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
| "Error abriendo archivo para escritura: sistema-gross.exe" | El actualizador no puede reemplazar el programa mientras corre | Debería estar arreglado en la 0.2.2. Si vuelve a aparecer: Omitir, desinstalar y ejecutar el instalador a mano. Ver paso 8 |
| La impresora elegida no está en la lista de esa PC | Suele ser la compartida: la PC de la caja está apagada, o la impresora | Prender lo que falte y apretar "Actualizar la lista". El diagnóstico también lo dice, con el nombre |
| `npm` o `npx` fallan con "ejecución de scripts deshabilitada" | Política de PowerShell | Usar Git Bash, o `npm.cmd` / `npx.cmd` |

---

## 6. Lo que NO se resuelve en esta sesión

- **El actualizador automático** — ver paso 8. El arreglo está publicado pero sin probar de punta a punta; hasta entonces, cada corrección se instala desinstalando primero.
- **El punto de venta del régimen CAEA** — trámite en el portal de ARCA. Sin eso no hay contingencia.
- **El certificado de producción** — hoy todo corre contra homologación. Los comprobantes emitidos **no son válidos** hasta que esté.
- **La sincronización por red local** — si se corta internet, las terminales no se hablan entre sí. Una venta armada en el mostrador no llega a la caja hasta que vuelva la conexión. Está en el plan, va al final.
