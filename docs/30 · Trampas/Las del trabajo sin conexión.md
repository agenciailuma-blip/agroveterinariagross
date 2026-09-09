---
origen: ESTADO.md
actualizado: 2026-09-09
---

# Las del trabajo sin conexión

> Costaron varias vueltas. Están todas corregidas; conviene no repetirlas.

> Se movió acá desde `ESTADO.md` el 09/09, sin tocar una palabra. Empezá por [[AHORA]].

---

## 6. Trampas aprendidas peleando con el offline

Costaron varias vueltas. Están todas corregidas, pero conviene no repetirlas.

### Una consulta deshabilitada de React Query informa `isPending` para siempre

Aparecido el 04/09, la primera vez que se entró a la Caja con sesión en una máquina sin terminal asignada. La pantalla se quedaba en **"Cargando…" eternamente**, y el mensaje que explicaba qué hacer —*"Esta máquina todavía no tiene terminal asignada"*— no se mostraba nunca.

La consulta de la caja tiene `enabled: !!terminal`. Cuando `enabled` es falso, React Query no informa "inactiva": informa `isPending: true`. **No está cargando — nunca va a arrancar.** Como la guarda preguntaba primero por `caja.isPending`, el `if (!terminal)` de abajo quedaba muerto.

> **La regla:** cuando una consulta tiene `enabled`, la condición que la deshabilita se pregunta ANTES que su estado de carga. Si no, el aviso que explica el problema queda tapado justo por el problema.

Es el peor final posible para un aviso: la máquina no está rota, hay una sola cosa que hacer, y la pantalla no la dice. Y habría aparecido **el día de la instalación en las 4 PC de Gross**, que es cuando ninguna tiene terminal todavía.

### La terminal elegida no llegaba al motor de sincronización

Aparecido el 07/09 probando la emisión sin conexión, y es el que más cerca estuvo de arruinar el día de la instalación.

Cada componente que preguntaba «qué terminal soy» se guardaba **su propia copia** del dato: `useTerminal()` era un `useState` por componente. Elegirla en Ventas actualizaba la de esa pantalla, y la del motor de sincronización seguía en `null` **hasta reiniciar el programa**.

Consecuencia: en una PC recién instalada se elige la terminal y se empieza a trabajar, pero el motor no se entera y **no alinea la numeración con la del servidor**. El primer comprobante sale con el número uno, que ya está usado, y la operación no puede subir.

> Habría pasado en las **cuatro PC el mismo día**, y el síntoma —"la venta no sube"— no señala en ninguna dirección útil.

Ahora el valor vive en un solo lugar (`useSyncExternalStore`) y todos lo miran. **Verificado como se descubrió:** máquina sin contadores y sin terminal, se elige, y los cuatro contadores se alinean solos sin recargar.

### Una venta creada sin conexión no existía en su propia máquina

Del mismo día y de la misma prueba. `enviarACaja()` sólo mandaba la venta a la bandeja de salida; las filas locales las traía la sincronización **desde el servidor**. Sin conexión, la máquina que acababa de crear la venta no la encontraba.

Se descubrió porque el presupuesto se arma sobre la venta, y la venta no estaba: *"La venta no está en esta computadora"*. Ahora se guarda también localmente al crearla, con su lista de precios aplicada con el mismo criterio que va a usar el servidor.

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

