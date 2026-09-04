# Instalación en las PC de Gross — guion

**Para qué sirve:** que la sesión con Lucas dure media hora y no tres. Está escrito para leerse mientras se hace, no antes.

**La regla de oro:** cada corrección que haya que publicar durante la sesión son **varios minutos** (subir versión, compilar, subir a Cloudflare, que Lucas apriete Actualizar). Así que lo que se pueda averiguar antes, se averigua antes.

---

## 1. Antes de conectarse — dos preguntas a Lucas

Estas dos van por WhatsApp con días de anticipación. **Ninguna se resuelve con él esperando del otro lado.**

### 🔴 La impresora — es el único riesgo que no es un bug

El sistema le manda el ticket a la impresora **por la red**, hablándole en ESC/POS. Eso funciona si la Hasar es una impresora de tickets. Si resultara ser un **controlador fiscal**, el protocolo es otro y no es un ajuste: es rehacer la impresión.

Lo que hay que pedirle, tal cual:

> Lucas, para dejar lista la impresión necesito dos datos de la impresora del mostrador:
>
> 1. **El modelo exacto**, como figura en la etiqueta de atrás o abajo del aparato. Una foto de la etiqueta me sirve.
> 2. **Si está conectada a la red** (cable de red o wifi) o si va por USB a una sola PC. Si está en la red, necesito la **dirección IP** que tiene.
>
> Si no sabés dónde ver la IP, muchas imprimen una hoja de prueba con los datos si se las apaga y se las prende manteniendo apretado el botón de avance de papel.

**Por qué importa:** con eso sabemos antes de conectarnos si el circuito de impresión que está construido sirve tal cual, o si hay trabajo por delante.

### 🟡 Cuántas PC y cuál es la caja

> ¿Cuántas computadoras vamos a instalar, y cuál va a ser la que cobra y factura? Las demás quedan como mostrador (arman ventas y las mandan a la caja).

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

### Paso 5 · La impresora

**Configuración → Impresora del mostrador.** Se carga la IP y el puerto (9100 salvo que el modelo diga otra cosa) y se aprieta **Imprimir prueba**.

✅ **Sale bien si:** sale un papel que dice "Si estás leyendo esto, la impresora está bien configurada".

❌ **Si no sale nada:** la impresora no está en esa dirección o no habla ESC/POS por ese puerto. Ahí entra lo que se averiguó en el punto 1.

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

- **El punto de venta del régimen CAEA** — es un trámite en el portal de ARCA. Sin eso no hay contingencia.
- **El certificado de producción** — hoy todo corre contra homologación. Los comprobantes emitidos **no son válidos** hasta que esté.
- **La sincronización por red local** — si se corta internet, las terminales no se hablan entre sí. Una venta armada en el mostrador no llega a la caja hasta que vuelva la conexión. Está en el plan, va al final.
