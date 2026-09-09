# Reorganizar la documentación — plan para Obsidian

**9 de septiembre de 2026. Documento de plan: no se ejecuta todavía.**
**Por qué existe:** la documentación creció bien pero sin estructura. Hoy son 245 KB en 13 archivos, y uno solo —`ESTADO.md`— se lleva 75 KB. Retomar el proyecto significa leerlo entero.

---

## El problema, medido

| Archivo | Tamaño | Líneas |
|---|---|---|
| **`ESTADO.md`** | **75 KB** | **766** |
| `reunion-cliente-01.md` | 26 KB | 419 |
| `reunion-lucas-2026-09-07.md` | 22 KB | 253 |
| `alcance-v1.md` | 19 KB | 361 |
| `demostracion-lucas.md` | 19 KB | 343 |
| `guia-de-pantallas.md` | 18 KB | 273 |
| `instalacion-en-el-local.md` | 15 KB | 254 |
| Los otros seis | 44 KB | 728 |
| **Total** | **245 KB** | **2.897** |

**Qué significa en la práctica.** `ESTADO.md` son unas **20.000 palabras de contexto** que se cargan al empezar cada sesión de trabajo. No porque haga falta todo: porque no hay forma de saber qué parte hace falta sin leerlo.

Es un costo que se paga **todas las veces**, y crece: el archivo nació como una página y hoy tiene el historial de dos meses de decisiones, trampas y verificaciones.

> **El problema no es que esté mal escrito.** Está bien escrito — por eso creció. El problema es que **un solo archivo tiene que contestar seis preguntas distintas**: qué es el proyecto, qué se decidió, cómo funciona cada módulo, qué trampas aparecieron, qué falta, y a quién se le debe qué.

---

## Cuándo hacerlo — mi recomendación, y difiere un poco de la tuya

**Francisco propuso dejarlo para después del 26/10.** Estoy de acuerdo con la mitad.

Hay que separar dos cosas que suenan iguales:

### 🟢 Partir `ESTADO.md` — conviene hacerlo ANTES, y es media sesión

**Se paga solo a la primera.** De acá al 26 de octubre quedan varias sesiones de trabajo; cada una arranca leyendo 75 KB para usar, en general, una quinta parte. Partirlo cuesta **una vez** y ahorra **en todas**.

No es refactor cosmético: es sacar un costo fijo que se paga en cada sesión y que además **crece solo** — cada corrección que documentamos lo agranda.

### 🟡 La bóveda completa de Obsidian — sí, después del 26/10

Tags, plantillas, notas por decisión, mapas de contenido, enlaces bidireccionales, la vista de grafo. Todo eso está bueno y **no urge**: mientras el sistema se mueve todos los días, una taxonomía fina se desactualiza más rápido de lo que se construye. Después del corte los documentos se estabilizan y la estructura aguanta.

> **En una línea:** partir el archivo grande ahora porque duele todas las semanas; ordenar la bóveda después, porque hoy sería ordenar algo que se sigue moviendo.

---

## Cómo quedaría la bóveda

Numerada para que Obsidian la ordene sola en la barra lateral.

```
Sistema Gross/
│
├── 00 · Entrada/
│   ├── AHORA.md                    ← ⭐ la única obligatoria
│   └── Mapa del proyecto.md        ← índice de todo
│
├── 10 · Decisiones/
│   ├── Las que no se revisan.md
│   ├── El stock son movimientos.md
│   ├── Los identificadores son de ARCA.md
│   ├── Los precios incluyen IVA.md
│   ├── Tres precios por línea.md
│   ├── Nada se borra.md
│   ├── La identidad va en dos capas.md
│   └── El precio que se cotiza es el de tarjeta.md
│
├── 20 · Módulos/
│   ├── Facturación ARCA.md
│   ├── Contingencia CAEA.md
│   ├── No fiscales y remitos.md
│   ├── Caja y cobro.md
│   ├── Punto de venta.md
│   ├── Stock e inventario.md
│   ├── Compras e IVA.md
│   ├── Sincronización y offline.md
│   ├── Empaquetado y actualizaciones.md
│   └── Impresión.md
│
├── 30 · Trampas/                   ← una nota por trampa, cortita
│   ├── React Query pausa todo sin conexión.md
│   ├── La numeración se separa de ARCA.md
│   ├── ARCA informa rechazos en dos lugares.md
│   ├── target=_blank no existe en Tauri.md
│   ├── El índice parcial no infiere ON CONFLICT.md
│   └── … (hay una docena)
│
├── 40 · Cliente/
│   ├── Alcance V1.md
│   ├── Pedidos de Lucas.md
│   ├── Reuniones/
│   │   ├── 2026-08-10 · Primera.md
│   │   ├── 2026-09-03 · Las 24 sugerencias.md
│   │   └── 2026-09-07 · Visita al local.md
│   └── Mensajes/
│
├── 50 · Terceros/
│   ├── Contador.md
│   ├── ARCA.md
│   ├── Zubu (la tienda).md
│   └── El local (las 4 PC).md
│
└── 90 · Operación/
    ├── Guía de pantallas.md
    ├── Instalación en el local.md
    └── Cómo publicar una corrección.md
```

---

## Las dos reglas que hacen que sirva

### 1 · Ninguna nota pasa de ~200 líneas

Es el número que hace la diferencia. Con notas de ese tamaño, retomar el proyecto significa leer **tres o cuatro notas de 5 KB** en vez de un archivo de 75. Si una nota crece más, se parte.

### 2 · `AHORA.md` es la única nota obligatoria

Una página. Se lee entera en un minuto y contesta:

- **Qué estoy haciendo ahora mismo**
- **Qué está bloqueado y por quién**
- **Qué sigue, en orden**
- **Qué NO hay que tocar** (lo que está andando y verificado)
- Enlaces a las tres o cuatro notas que hagan falta hoy

> Es lo que hoy son las primeras 60 líneas de `ESTADO.md`, pero **sin las otras 700 detrás**. Todo lo demás se lee **si hace falta**, siguiendo un enlace.

---

## Qué se gana de Obsidian específicamente

Cosas que un montón de `.md` sueltos no dan:

- **`[[Enlaces]]` entre notas.** Escribir `[[El stock son movimientos]]` en cualquier lado lleva a la decisión. Hoy hay que acordarse de en qué archivo estaba.
- **Backlinks.** Abrir una decisión y ver **quién la usa**. Es lo que hoy no se puede: saber qué se rompe si se cambia.
- **Frontmatter con estado.** Cada nota arranca con:
  ```yaml
  ---
  estado: hecho | en curso | bloqueado | decidido
  actualizado: 2026-09-09
  modulo: facturacion
  ---
  ```
  Y con eso se arma sola una tabla de "todo lo bloqueado" sin mantenerla a mano.
- **Tags** — `#bloqueante`, `#trampa`, `#pedido-de-lucas`, `#espera-a-terceros`.
- **El grafo.** Ver qué módulos dependen de qué decisiones. Suena a adorno y no lo es: es la forma más rápida de contestar *"si toco esto, qué más se mueve"*.

> ⚠️ **Una cosa a favor de no complicarse:** una bóveda de Obsidian **son archivos `.md` normales en una carpeta**. Se puede seguir leyendo y editando desde cualquier lado, y sigue viviendo en el repositorio con su historial de Git. No hay formato propietario ni migración de vuelta.

---

## Cómo se haría, en orden

### Paso 1 — Partir `ESTADO.md` *(media sesión · **recomiendo hacerlo antes del 26/10**)*

1. Sacar `AHORA.md` de las primeras secciones.
2. Mover las secciones por módulo a `20 · Módulos/`.
3. Mover las trampas a `30 · Trampas/`, una por nota.
4. Mover la tabla de terceros a `50 · Terceros/`.
5. Dejar `ESTADO.md` como redirección: *"esto se partió, empezá por AHORA.md"*.

**Lo que hay que cuidar:** no perder nada. Cada sección migrada se marca en el original hasta que esté toda movida.

### Paso 2 — Estructura de carpetas y enlaces *(una sesión · después del 26/10)*

Numerar las carpetas, mover el resto de los archivos, y **reemplazar las referencias `[texto](archivo.md)` por `[[enlaces]]` de Obsidian**.

### Paso 3 — Frontmatter y tags *(media sesión · después del 26/10)*

Agregarle el encabezado a cada nota y las tres o cuatro consultas que arman solas las tablas de pendientes.

### Paso 4 — Una nota por decisión *(a medida que aparezcan)*

Las decisiones de fondo pasan a nota propia, con el formato de siempre: **qué se decidió, por qué, qué se rompe si se cambia**. No se hacen todas de una: se van sacando cuando se tocan.

---

## Lo que NO hay que hacer

- ❌ **Reescribir el contenido.** Es mudanza, no redacción. El texto está bien y ya se peleó por él.
- ❌ **Empezar por la taxonomía.** Los tags y las carpetas se acomodan solos después de mover; al revés se inventan categorías vacías.
- ❌ **Sacar la documentación del repositorio.** Vive con el código y viaja con él. Un `.md` que no está en el repo se pierde — como pasó con las fotos de las facturas de compra.
- ❌ **Meter plugins.** Obsidian sin plugins alcanza para todo esto. Los enlaces, los backlinks y el frontmatter son nativos.
