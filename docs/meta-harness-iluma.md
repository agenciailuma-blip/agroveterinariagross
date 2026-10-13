# El meta-harness de ILUMA

**Qué es:** la estructura de archivos, reglas y rutinas que rodea al asistente de programación en cada proyecto. Hace que **cada sesión arranque sabiendo dónde quedamos** y **termine dejando anotado lo que hizo**, para que no se pierda contexto entre chats, ni entre semanas, ni entre personas.

**Para qué sirve este documento:** abrir un proyecto nuevo —o instalarlo en uno ya arrancado— con la misma base ordenada. Tiene la estructura, para qué sirve cada pieza, el ciclo de una sesión y las plantillas listas para copiar.

> **En una frase, para explicarlo:** «El asistente no se acuerda de nada entre un chat y otro. El harness es su cuaderno: al empezar lo lee, al terminar lo completa. Así nada depende de la memoria de nadie.»

---

## Índice

1. [La idea](#1-la-idea)
2. [Las piezas, de un vistazo](#2-las-piezas-de-un-vistazo)
3. [La estructura de carpetas](#3-la-estructura-de-carpetas)
4. [Cada pieza, en detalle](#4-cada-pieza-en-detalle)
5. [El ciclo de una sesión](#5-el-ciclo-de-una-sesión)
6. [La memoria del asistente](#6-la-memoria-del-asistente)
7. [Abrir un proyecto nuevo, paso a paso](#7-abrir-un-proyecto-nuevo-paso-a-paso)
8. [Instalarlo en un proyecto ya arrancado](#8-instalarlo-en-un-proyecto-ya-arrancado)
9. [Mantenerlo sano](#9-mantenerlo-sano)
10. [Lo que no hay que hacer](#10-lo-que-no-hay-que-hacer)
11. [Plantillas](#11-plantillas)

---

## 1. La idea

El asistente trabaja muy bien **dentro** de una sesión, pero cada chat nuevo empieza en blanco. Sin una estructura alrededor pasan tres cosas:

- **Se pierde lo hecho:** algo se terminó y la documentación lo sigue dando por pendiente.
- **Se repiten errores:** la trampa que costó una tarde vuelve a aparecer un mes después.
- **Cada sesión arranca releyendo todo**, y el contexto se gasta en buscar en vez de trabajar.

El meta-harness resuelve eso con **cuatro ideas simples**:

| Idea | En la práctica |
|---|---|
| **Todo queda escrito en el repositorio** | Una carpeta `docs/` que viaja con el código, con su historial en Git. Se abre como bóveda de Obsidian. |
| **Al empezar, se lee dónde quedamos** | Un aviso automático pone en el contexto la última bitácora y los pendientes. `/inicio` hace el arranque completo. |
| **Al terminar, se anota** | `/cierre` es obligatorio: nota del tema, pendientes y bitácora al día, y commit. |
| **Lo anotado se verifica contra la realidad** | Cada pendiente dice cómo comprobarse. Si la documentación está atrasada, se corrige en el momento. |

**Lo adaptado del ejemplo original:** en lugar de instalar un generador de harnesses, es un sistema propio y chico, hecho de notas en Markdown que ya usábamos con Obsidian, dos atajos (`/inicio` y `/cierre`) y un aviso automático. No depende de ninguna herramienta extra y se entiende leyéndolo.

---

## 2. Las piezas, de un vistazo

| Pieza | Archivo | Pregunta que contesta | Cambia |
|---|---|---|---|
| **Puntero** | `CLAUDE.md` (raíz) | ¿Qué es esto y dónde está el harness? | Casi nunca |
| **Constitución** | `docs/Cómo trabajamos.md` | ¿Qué reglas se siguen siempre? | Sólo si el usuario lo pide |
| **Panorama** | `docs/Panorama.md` | ¿De qué se trata el proyecto y dónde está cada cosa? | Poco |
| **Pendientes** | `docs/Pendientes.md` | ¿Qué falta, quién lo hace y cómo se verifica? | Cada sesión |
| **Bitácora** | `docs/Bitácora.md` | ¿Qué se hizo y por dónde se sigue? | Cada tarea cerrada |
| **Flujo de trabajo** | `docs/Flujo de trabajo.md` | ¿Cómo se hace un cambio, chico o grande? | Casi nunca |
| **Herramientas** | `docs/Herramientas.md` | ¿Cómo se llega a cada sistema y cómo se verifica? | Cuando se descubre algo |
| **Specs** | `docs/specs/` | ¿Qué se acordó construir antes de construirlo? | Una por cambio grande |
| **Notas por tema** | `docs/20 · Módulos/` y demás | ¿Cómo funciona esto y qué trampas tiene? | Al tocar el tema |
| **Aviso de inicio** | `.claude/hooks/inicio.sh` | (lo lee el asistente solo al abrir) | Casi nunca |
| **Atajos** | `.claude/skills/inicio` y `cierre` | (se escriben `/inicio` y `/cierre`) | Casi nunca |
| **Memoria del asistente** | Fuera del repo | ¿Quién es el usuario y cómo prefiere trabajar? | De a poco |

---

## 3. La estructura de carpetas

```
Proyecto/
├── CLAUDE.md                      ← puntero: qué es, dónde está el harness, lo imprescindible
├── .gitattributes                 ← *.sh con fin de línea LF (si no, bash los rechaza en Windows)
├── .gitignore                     ← ignora lo personal de .claude/ y de Obsidian
├── .claude/
│   ├── settings.json              ← conecta el aviso de inicio (versionado)
│   ├── settings.local.json        ← permisos personales (NO se versiona)
│   ├── hooks/
│   │   └── inicio.sh              ← imprime la bitácora y los pendientes al abrir
│   └── skills/
│       ├── inicio/SKILL.md        ← /inicio
│       └── cierre/SKILL.md        ← /cierre
│
└── docs/                          ← la bóveda de Obsidian (sólo esta carpeta)
    ├── Panorama.md                ← ⭐ el índice: se entra por acá
    ├── Cómo trabajamos.md         ← la constitución
    ├── Flujo de trabajo.md
    ├── Herramientas.md
    ├── Pendientes.md
    ├── Bitácora.md
    │
    ├── specs/                     ← AAAA-MM-DD Nombre.md, una por cambio grande
    ├── 10 · Decisiones/           ← las de fondo: qué, por qué, qué se rompe si se cambia
    ├── 20 · Módulos/              ← una nota por tema o módulo del sistema
    ├── 30 · Trampas/              ← lo que costó horas, para no repetirlo
    ├── 40 · Cliente/              ← alcance, reuniones, pedidos, audios transcriptos
    ├── 50 · Terceros/             ← contador, organismos, proveedores, otros equipos
    ├── 90 · Operación/            ← instalar, publicar, guía de pantallas
    └── manual/                    ← lo que se le entrega al cliente (sin estado del proyecto)
```

**Por qué la bóveda es `docs/` y no todo el proyecto:** si Obsidian abriera la raíz, indexaría `node_modules` y las carpetas de compilación, que son decenas de miles de archivos que no son notas.

**Por qué las carpetas van numeradas:** Obsidian las ordena solo en la barra lateral, y el número dice de un vistazo qué tipo de nota hay adentro.

**Un proyecto con varios repositorios** (por ejemplo, sitio público y sistema interno): el harness vive en **uno solo** y los demás apuntan ahí desde su `CLAUDE.md`. Si se abren juntos, una carpeta madre con su propio `CLAUDE.md` puntero y su `.claude/` que llama al aviso del repo principal.

---

## 4. Cada pieza, en detalle

### `CLAUDE.md` — el puntero

Lo lee el asistente automáticamente al abrir el proyecto. **Es corto**: qué es el proyecto en dos líneas, el stack, dónde está el harness y las cuatro o cinco reglas que no pueden faltar ni en una sesión apurada. No repite lo que está en `docs/`: apunta.

### `Cómo trabajamos.md` — la constitución

Las reglas que **toda sesión sigue siempre**. La mayoría nace de algo que salió mal una vez.

- **Regla cero: la cambia sólo el usuario.** Si una regla estorba, el asistente lo propone en el chat, el usuario confirma, se edita la nota y queda en la bitácora.
- Agrupada en cuatro bloques: **comunicación**, **producción** (qué pide confirmación), **memoria del proyecto** (cierre obligatorio, verificar contra la realidad, cada dato en un solo lugar) y **contexto**.
- Corta: una pantalla. Si crece, algo de lo que tiene es una nota de tema.

### `Panorama.md` — el índice

**Se entra por acá.** Qué es el proyecto, dónde está cada cosa (repos, entornos, accesos), y los enlaces a todas las notas, empezando por las del harness. Abriendo la vista de grafo de Obsidian desde acá se ve cómo se conecta todo.

### `Pendientes.md` — lo que falta

La nota para decidir qué sigue. **Cada ítem dice tres cosas:**

1. **Qué** hay que hacer.
2. **Quién** lo hace: el usuario, el asistente, el cliente o un tercero.
3. **Cómo verificar** que está hecho: una consulta, una URL, algo que se mira.

Lo tercero es lo que hace que funcione: **el usuario hace cosas fuera de las sesiones** (carga datos, configura paneles, habla con el cliente). Al empezar, el asistente verifica cada pendiente y **tacha lo que ya está hecho**, con la fecha y la evidencia. Lo tachado no se borra enseguida: muestra qué se resolvió y cuándo.

Secciones: *Por hacer* (del usuario, del asistente, de terceros) · *Postergado* · *Tachados*.

### `Bitácora.md` — lo que se hizo

**Una entrada por tarea cerrada, lo más nuevo arriba.** Es la memoria entre chats: la sesión nueva lee las dos o tres primeras y sabe dónde está parada.

Cada entrada tiene cuatro partes: **Qué** se hizo · **Decisiones** y por qué · **Dónde quedó** (notas, spec, commits) · **Sigue**: por dónde arrancar la próxima vez, con detalle suficiente para no tener que preguntar.

En proyectos con cliente conviene sumar una línea: **cómo se lo contás al cliente**, en dos frases sin tecnicismos.

### `Flujo de trabajo.md` — cómo se hace un cambio

Un arranque, dos caminos y un cierre:

- **Cambio rápido** (un bug, un ajuste visual, un texto): leer la nota del tema → hacer → verificar → cierre.
- **Cambio grande** (algo nuevo, un cambio en la base o en permisos, una integración, algo que toca datos reales): **spec primero**, el usuario la aprueba, se implementa, se verifica contra la spec, cierre.

### `Herramientas.md` — cómo se llega a cada sistema

Todo lo que se descubrió a los tumbos: qué hay instalado en la PC y qué no, cómo se accede a la base, cómo se publica, cómo se prueba como si fuera un usuario, qué conector apunta a qué proyecto. **Una sesión nueva no tiene que volver a descubrirlo.**

### `specs/` — lo acordado antes de construir

Un archivo por cambio grande, con fecha en el nombre: objetivo, alcance, **fuera de alcance** (para que no crezca solo), plan, **cómo se verifica**, riesgos y cómo volver atrás. Estado: *propuesta → aprobada → hecha* (o *descartada*). Si en el camino aparece algo que la contradice, **se corrige la spec antes de seguir**, no sólo el chat.

### Las notas por tema

- **`10 · Decisiones`:** las de fondo. Formato fijo: qué se decidió, por qué, **qué se rompe si se cambia**.
- **`20 · Módulos`:** cómo funciona cada parte. **Arranca con las trampas ya pisadas**, porque es lo primero que hay que saber antes de tocarla.
- **`30 · Trampas`:** el síntoma, la causa real y la regla para no repetirlo. Cortas.
- **`40 · Cliente`:** alcance, reuniones, pedidos y mensajes del cliente, con fecha. Los audios se transcriben y se resumen acá.
- **`50 · Terceros`:** qué se le debe a quién y qué espera de quién.
- **`90 · Operación`:** instalar, publicar, recuperar. Paso a paso.
- **`manual/`:** lo que sale del equipo. **Sin estado del proyecto ni nombres de quien lo lee**: se tiene que leer igual dentro de seis meses.

Todas las notas arrancan con un encabezado (frontmatter) para que Obsidian las filtre:

```yaml
---
tags: [proyecto, modulo]
estado: hecho | en curso | bloqueado | decidido
actualizado: AAAA-MM-DD
---
```

### El aviso de inicio y los atajos

- **El aviso de inicio** (un *hook* de tipo `SessionStart`) es un script que corre solo cada vez que se abre un chat en el proyecto. Imprime las últimas entradas de la bitácora y el *Por hacer* de los pendientes, y eso entra al contexto. **Ninguna sesión arranca sin saber dónde quedamos**, aunque nadie escriba `/inicio`.
- **`/inicio`** hace el arranque completo: lee, verifica los pendientes contra la realidad y propone por dónde seguir. **No toca código.**
- **`/cierre`** hace el cierre: verificar, nota del tema, pendientes, bitácora y commit.

---

## 5. El ciclo de una sesión

```
 Abrir el chat
     │
     ▼
 [aviso de inicio] ── pone en el contexto: últimas 2 entradas de la Bitácora + Por hacer
     │
     ▼
 /inicio ── lee · verifica cada pendiente contra la realidad · tacha lo hecho · propone
     │
     ▼
 ¿Cambio chico o grande?
     │                         │
     ▼                         ▼
 Rápido:                    Grande:
 nota del tema → hacer      spec → el usuario aprueba → hacer
 → verificar                → verificar contra la spec
     │                         │
     └───────────┬─────────────┘
                 ▼
 /cierre ── verificar · nota del tema (+ trampa nueva) · Pendientes · Bitácora (Sigue:) · commit
                 │
                 ▼
 ¿Otro tema? → vuelve al «¿Cambio chico o grande?»
 ¿Chat nuevo? → la Bitácora ya dice por dónde seguir
```

**Un tema por vez.** Antes de cerrar uno se dice qué queda para después, y eso va a los pendientes.

**El usuario decide cuándo abrir un chat nuevo** (mirando cuánto contexto queda). No hace falta que el asistente lo proponga: el cierre deja escrito por dónde seguir.

### Qué es «verificar»

Depende de lo que se tocó, y lo que no se pudo verificar **se dice**:

| Se tocó | Se verifica |
|---|---|
| Código | Revisión de tipos, pruebas automáticas, compilación |
| La base de datos | Una prueba contra la base real que **termina deshaciendo todo**, corrida como un usuario de cada rol. Y **romperla a propósito**: una prueba que nunca falló no prueba nada |
| Una pantalla | Verla funcionando, en computadora y a 375 px de ancho (celular), con datos de prueba que después se dan de baja |
| Producción | Guardar cómo estaba antes y comparar después |
| Un pendiente | Su línea «Cómo verificar» |

---

## 6. La memoria del asistente

Además de `docs/`, el asistente tiene una **memoria automática propia**, fuera del repositorio, que persiste entre chats. Son dos cosas distintas y no se pisan:

| Va en `docs/` (el proyecto) | Va en la memoria del asistente |
|---|---|
| Todo lo del proyecto: estado, decisiones, trampas, pendientes | **Quién es el usuario**: rol, nivel técnico, cómo le sirve que le expliquen |
| Lo que tiene que ver cualquier persona del equipo | **Cómo prefiere trabajar**: correcciones y aprobaciones («todo en español», «verificar a 375 px», «avisar el riesgo una vez y no insistir») |
| | **Punteros**: «el harness de este proyecto está en `docs/`» |

**Reglas:**
- **Cada dato vive en un solo lugar.** Lo del proyecto no se copia a la memoria.
- **Si la memoria contradice a `docs/`, gana `docs/`.**
- La memoria se revisa cada tanto: se juntan las notas repetidas y se borran las que quedaron viejas.
- Lo que el usuario corrige dos veces **se guarda en la memoria** para que no tenga que pedirlo una tercera.

---

## 7. Abrir un proyecto nuevo, paso a paso

1. **Crear la estructura** de la sección 3 (o copiar la de un proyecto anterior y vaciarla).
2. **`CLAUDE.md`** con la plantilla: qué es, el stack y dónde está el harness.
3. **`Cómo trabajamos.md`**: copiar la constitución base (plantilla) y ajustar el bloque de producción al proyecto (qué es producción, qué pide confirmación).
4. **`Herramientas.md`**: completar a medida que se conecta cada cosa (base de datos, hosting, correo, APIs). Lo primero que se anota: **qué conector apunta a qué proyecto**, si hay varios.
5. **`Panorama.md`**: repos, entornos y enlaces.
6. **`Pendientes.md`** con lo que ya se sabe que falta, cada uno con quién y cómo verificar.
7. **Primera entrada de la `Bitácora.md`**: «Se armó el harness», con el *Sigue*.
8. **`.claude/`**: el aviso de inicio, `settings.json` y los dos atajos (plantillas).
9. **`.gitattributes`** con `*.sh text eol=lf` y **`.gitignore`** con lo personal de `.claude/` y de Obsidian.
10. **Abrir `docs/` en Obsidian** como bóveda.
11. **Commit** y abrir un chat nuevo: **comprobar que el aviso funcionó** (que la sesión ya vea la bitácora sin buscarla).

**Del relevamiento con el cliente**, lo primero que va a `40 · Cliente/`: el alcance acordado, la fecha comprometida y quién decide del lado del cliente.

---

## 8. Instalarlo en un proyecto ya arrancado

Cuando ya hay documentación suelta (o un archivo de estado enorme):

1. **Es una mudanza, no una reescritura.** El texto ya se peleó y está bien: se mueve, no se redacta de nuevo.
2. **Primero lo que más duele:** el archivo que se lee entero en cada sesión. Se parte: lo vivo va a *Pendientes* y *Bitácora*; lo que no cambia, a *Decisiones*, *Módulos* y *Trampas*.
3. **No perder nada:** al terminar, comprobar que cada línea con contenido del original existe en algún lado. El archivo viejo queda como redirección («esto se partió, empezá por Panorama»).
4. **Pendientes verificados contra la realidad** el día que se arma: suele aparecer lo que estaba hecho y figuraba como pendiente.
5. **Después**, sin apuro: una nota por decisión y por trampa, enlaces `[[ ]]` de Obsidian, encabezados con estado.
6. **La memoria del asistente** se limpia: lo del proyecto pasa a `docs/` y queda una sola nota que apunta ahí.

---

## 9. Mantenerlo sano

- **Ninguna nota pasa de unas 200 líneas.** Si crece, se parte. Es el número que hace que retomar sea leer tres notas cortas y no un archivo eterno.
- **La historia va a la Bitácora, no a la página de estado.** Lo aprendido: una página de estado que acumula «lo último que pasó» crece hasta cientos de líneas y vuelve a ser el problema que vino a resolver. *Pendientes* dice qué falta; *Bitácora*, qué pasó.
- **La Bitácora se archiva por mes** cuando se hace larga (`Bitácora 2026-09.md`); el aviso de inicio sólo lee las primeras entradas.
- **Lo tachado de Pendientes se limpia** cuando ya no aporta (una vez por mes).
- **`actualizado:`** en cada nota que se toca.
- **Las trampas se escriben el mismo día**, con el síntoma tal como se vio: es lo que alguien va a buscar la próxima vez.
- **La constitución se relee** cuando algo sale mal: casi siempre falta una regla o una regla no se siguió.

---

## 10. Lo que no hay que hacer

- ❌ **Sacar la documentación del repositorio.** Lo que no está en el repo se pierde.
- ❌ **Guardar lo del proyecto en la memoria del asistente** en lugar de `docs/`.
- ❌ **Cerrar una tarea sin `/cierre`.** Es el único momento en que lo hecho queda anotado.
- ❌ **Confiar en la documentación sin verificar.** El usuario hace cosas entre sesiones.
- ❌ **Empezar por la taxonomía** (tags, carpetas finas). Se acomoda sola después de usarla.
- ❌ **Meter plugins de Obsidian.** Enlaces, backlinks, grafo y encabezados son nativos.
- ❌ **Secretos en el repo, en un commit o en el chat.** Van en el gestor de secretos del servicio.
- ❌ **Documentos para afuera con estado del proyecto** o con el nombre de quien los va a leer.

---

## 11. Plantillas

### `CLAUDE.md`

```markdown
# Nombre del proyecto

Qué es, en dos líneas. Para quién. Stack: …

## Antes de tocar algo

El proyecto tiene un harness en `docs/`:

1. **`docs/Cómo trabajamos.md` — la constitución.** Se sigue siempre; la cambia sólo el usuario.
2. **`docs/Bitácora.md`** (últimas entradas) y **`docs/Pendientes.md`** ("Por hacer"): dónde
   quedamos. El aviso de inicio los pone en el contexto; **`/inicio`** hace el arranque completo.
3. **`docs/Flujo de trabajo.md`**: cambio rápido, o grande con spec en `docs/specs/`. Los dos
   terminan en **`/cierre`**.
4. **`docs/Herramientas.md`**: cómo se llega a cada sistema y cómo se verifica.
5. **La nota del tema** que se va a tocar (índice en `docs/Panorama.md`).

## Lo imprescindible

- **Español rioplatense** en respuestas, comentarios del código y commits.
- **Qué es producción** y qué pide confirmación antes de tocarlo: …
- **Ninguna tarea termina sin cierre.**
```

### `docs/Cómo trabajamos.md` (constitución base)

```markdown
---
tags: [proyecto, harness]
actualizado: AAAA-MM-DD
---

# Cómo trabajamos — la constitución

Reglas que **toda sesión sigue siempre**. La mayoría salió de algo que salió mal una vez.

**0. Las cambia sólo el usuario.** Si una regla estorba, se propone en el chat, el usuario
confirma, se edita esta nota y queda en la [[Bitácora]].

## Comunicación

1. **Español rioplatense** en las respuestas, los comentarios del código y los commits.
2. **El porqué de cada decisión técnica**, explicado para alguien que no programa.
3. **Un tema por vez.** Antes de cerrarlo, decir qué queda para después.
4. **La verdad sobre lo que se hizo**: lo que no se pudo probar se dice; si los datos contradicen
   el plan, se avisa antes de seguir.
5. **Avisar un riesgo una vez** y no insistir: el usuario maneja los tiempos con el cliente.

## Producción

6. **Qué es producción en este proyecto:** … Antes de tocar datos se guarda cómo estaban.
7. **Confirmación explícita en el chat** antes de: publicar, mandar mails, borrar datos, tocar
   DNS o servicios externos. Un sí no vale para la siguiente vez.
8. **Los secretos nunca van al repo, a un commit ni al chat.**
9. **Cambios de base de datos:** el archivo de migración **y** aplicado; uno sin el otro desfasa.

## Memoria del proyecto

10. **Antes de tocar un tema, leer su nota**: casi todas empiezan con las trampas ya pisadas.
11. **Ninguna tarea termina sin cierre**: nota del tema, [[Pendientes]] y [[Bitácora]].
12. **El estado se verifica contra la realidad** (la base, lo publicado, el repo), no sólo
    contra la documentación. Si está atrasada, se corrige en el momento.
13. **Cada dato vive en un solo lugar.** La memoria del asistente no reemplaza a `docs/`.
14. **Lo que sale del equipo** (manuales, documentación para terceros) va sin estado del
    proyecto ni nombres de quien lo lee.

## Contexto

15. **El usuario decide cuándo abrir un chat nuevo.** El cierre deja escrito por dónde seguir.
```

### Entrada de la `Bitácora.md`

```markdown
## AAAA-MM-DD — Título corto

- **Qué:** lo que se hizo, en dos o tres líneas.
- **Decisiones:** lo que se eligió y por qué.
- **Cómo se lo contás al cliente:** dos frases sin tecnicismos (si aplica).
- **Dónde quedó:** [[nota del tema]], spec si hubo, commits (`abc1234`).
- **Sigue:** por dónde arrancar la próxima vez, sin tener que preguntar.
```

### Ítem de `Pendientes.md`

```markdown
### Del usuario

3. **Qué hay que hacer**, en una línea.
   *Verificar:* la consulta, la URL o lo que se mira para saber que está hecho.

### Tachados

1. ~~**Lo que se hizo**~~ — hecho el AAAA-MM-DD: la evidencia (qué se vio y dónde).
```

### Spec (`docs/specs/AAAA-MM-DD Nombre.md`)

```markdown
---
estado: propuesta   # propuesta → aprobada → hecha (o descartada)
fecha: AAAA-MM-DD
---
# Nombre

**Objetivo:** qué problema resuelve, en una o dos líneas.

**Alcance:** lo que entra.

**Fuera de alcance:** lo que no entra, para que no crezca solo.

**Plan:** pasos, qué archivos, tablas o funciones toca.

**Cómo se verifica:** qué se mira, contra qué datos, qué tiene que dar.

**Riesgos:** qué puede romperse y cómo se vuelve atrás.
```

### Nota de decisión y de trampa

```markdown
# El stock se guarda como movimientos

**Qué se decidió:** …
**Por qué:** …
**Qué se rompe si se cambia:** …
```

```markdown
# Las peticiones sin límite de espera se cuelgan

**Síntoma:** la pantalla queda en «Cargando…» para siempre cuando se corta internet.
**Causa real:** …
**La regla:** …
**Visto:** AAAA-MM-DD, en [[nota del módulo]].
```

### `.claude/settings.json`

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/inicio.sh\" 2>/dev/null || true",
            "timeout": 10,
            "statusMessage": "Cargando la memoria del proyecto"
          }
        ]
      }
    ]
  }
}
```

### `.claude/hooks/inicio.sh`

```bash
#!/usr/bin/env bash
# Aviso de inicio de sesión del harness. Lo que imprime entra al contexto de la
# sesión nueva: las últimas entradas de la bitácora y el "Por hacer" de los
# pendientes. Es la memoria entre chats. Ver docs/Flujo de trabajo.md.

DOCS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/docs"
BITACORA="$DOCS/Bitácora.md"
PENDIENTES="$DOCS/Pendientes.md"

echo "# Memoria del proyecto (aviso de inicio de sesión)"
echo
echo "Reglas: docs/Cómo trabajamos.md. Arranque completo: /inicio."
echo "Al terminar cada tarea: /cierre (nota del tema, Pendientes y Bitácora)."
echo

if [ -f "$BITACORA" ]; then
  echo "## Últimas entradas de la Bitácora"
  echo
  # Las entradas son los "## AAAA-MM-DD — ..."; van las dos primeras.
  awk '/^## / { if ($0 ~ /^## [0-9][0-9][0-9][0-9]-/) n++; else if (n >= 1) n = 99 }
       n >= 1 && n <= 2 { print }' "$BITACORA"
  echo
fi

if [ -f "$PENDIENTES" ]; then
  echo "## Pendientes — Por hacer"
  echo
  # Desde "## ⏳ Por hacer" hasta lo tachado o la sección siguiente.
  awk '/^## .*Por hacer/ { dentro = 1; next } dentro && (/^## / || /^### Tachados/) { exit } dentro { print }' "$PENDIENTES"
fi
```

> En Windows hace falta **Git Bash** instalado, y el archivo tiene que tener fin de línea **LF**: por eso el `.gitattributes`.

### `.claude/skills/inicio/SKILL.md`

```markdown
---
name: inicio
description: Arranque de sesión del proyecto. Usar al empezar un chat nuevo, o cuando el usuario pregunta dónde quedamos, qué falta o cómo seguimos.
---

# Inicio de sesión

Seguí la sección "1. Al empezar" de `docs/Flujo de trabajo.md`.

1. Leé las últimas dos o tres entradas de `docs/Bitácora.md` y el "Por hacer" de
   `docs/Pendientes.md`.
2. Verificá cada pendiente con su línea *Verificar* (sólo lectura). Lo que dependa del usuario,
   preguntalo al final, todo junto. Si algo ya está hecho, tachalo con la fecha y la evidencia.
3. Contestá en rioplatense: dónde quedamos (dos o tres líneas), qué cambió al verificar, y por
   dónde seguir, con una recomendación.

En este paso no se toca código.
```

### `.claude/skills/cierre/SKILL.md`

```markdown
---
name: cierre
description: Cierre obligatorio de una tarea. Usar siempre al terminar un cambio, antes de decir que está listo o de hacer commit, y cuando el usuario va a abrir otro chat.
---

# Cierre de tarea

Una tarea no está terminada hasta que pasa por acá. Seguí la sección "3. Cierre" de
`docs/Flujo de trabajo.md`.

1. **Verificar** con lo que dice `docs/Herramientas.md`. Lo que no se pudo verificar, se dice.
2. **Nota del tema** al día, con la trampa nueva si se pisó una, y `actualizado:`.
3. **`Pendientes.md`**: tachar lo hecho con fecha y evidencia; sumar lo nuevo con quién lo hace
   y cómo verificarlo.
4. **`Bitácora.md`**: entrada nueva arriba de todo, con el formato de la nota.
5. **Commit.** Publicar o hacer push sólo con confirmación del usuario.
6. Si el usuario va a abrir otro chat: el "Sigue:" tiene que alcanzar para arrancar sin preguntar.

Al terminar, decile al usuario qué quedó anotado y dónde.
```

### `.gitignore` (lo que se suma)

```gitignore
# Lo personal del asistente: permisos de cada uno
.claude/settings.local.json

# Obsidian: la bóveda se versiona, el estado de las ventanas no
docs/.obsidian/workspace.json
docs/.obsidian/workspace-mobile.json
```

### `.gitattributes`

```gitattributes
*.sh text eol=lf
```
