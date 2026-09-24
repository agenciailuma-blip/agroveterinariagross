/*
  ─────────────────────────────────────────────────────────────
  LO QUE LA TERMINAL LE PIDE A CADA TABLA, ¿EXISTE?

  Esta prueba existe por un error concreto: la tabla `caea` no tenía la
  columna `actualizado_en`, la terminal la pedía igual, y la bajada se
  cortaba ahí. El CAEA no llegaba a ninguna máquina —lo único que
  permite facturar durante un corte de internet— y tampoco bajaba lo que
  venía después: la numeración y los saldos de cuenta corriente. Estuvo
  así seis días sin que nadie lo viera, porque la aplicación no muestra
  el error del servidor y desde el servidor la terminal parecía apagada.

  Las pruebas de la aplicación no lo podían encontrar: corren sin base.
  Las de la base tampoco: no saben qué le pide la terminal. Esto une las
  dos puntas — lee las definiciones de sync.ts y le pregunta a la base.

  Cómo se corre, desde la raíz del repositorio:

    node supabase/pruebas/columnas-de-sincronizacion.mjs

  No necesita clave: usa la pública de app/.env, la misma que el
  navegador. Una columna que no existe da 400 aunque no haya sesión,
  porque el error es de lectura de la consulta, no de permisos.
  ─────────────────────────────────────────────────────────────
*/
import { readFileSync } from 'node:fs'

const raiz = new URL('../../', import.meta.url)
const sync = readFileSync(new URL('app/src/lib/local/sync.ts', raiz), 'utf8')
const env = readFileSync(new URL('app/.env', raiz), 'utf8')

const leer = (clave) => env.match(new RegExp(`^${clave}=(.+)$`, 'm'))?.[1]?.trim()
const URL_BASE = leer('VITE_SUPABASE_URL')
const CLAVE = leer('VITE_SUPABASE_PUBLISHABLE_KEY') ?? leer('VITE_SUPABASE_ANON_KEY')

if (!URL_BASE || !CLAVE) {
  console.error('Falta VITE_SUPABASE_URL o la clave pública en app/.env')
  process.exit(2)
}

/** El bloque de un `const NOMBRE = [ … ]`, tal cual está escrito. */
function bloque(nombre) {
  const desde = sync.indexOf(`const ${nombre}`)
  if (desde < 0) throw new Error(`No se encontró ${nombre} en sync.ts`)
  // Desde el `=` y no desde el nombre: `Definicion[]` también tiene un
  // corchete, y es el que se encontraba primero.
  const abre = sync.indexOf('[', sync.indexOf('=', desde))
  let nivel = 0
  for (let i = abre; i < sync.length; i++) {
    if (sync[i] === '[') nivel++
    if (sync[i] === ']' && --nivel === 0) return sync.slice(abre, i + 1)
  }
  throw new Error(`No se pudo leer ${nombre}`)
}

/*
  Cada definición del bloque, leída desde su `columnas:` hacia atrás.

  Se lee así y no partiendo por llaves porque las definiciones tienen
  comentarios y funciones adentro, con sus propias llaves.
*/
function definiciones(texto) {
  const salida = []
  for (const m of texto.matchAll(/columnas:\s*(?:\n\s*)?'([^']*)'/g)) {
    const antes = texto.slice(0, m.index)
    const tabla = [...antes.matchAll(/tabla:\s*'([^']*)'/g)].pop()
    const origen = [...antes.matchAll(/origen:\s*'([^']*)'/g)].pop()
    // El origen cuenta sólo si es de esta misma definición, o sea si
    // viene después del último `tabla:`.
    const deEsta = origen && tabla && origen.index > tabla.index ? origen[1] : tabla?.[1]
    salida.push({ tabla: deEsta, columnas: m[1].replace(/\s+/g, ' ').trim() })
  }
  return salida
}

const maestros = definiciones(bloque('MAESTROS'))
const catalogos = definiciones(bloque('CATALOGOS_FISCALES'))
const referencias = JSON.parse(bloque('REFERENCIAS').replace(/'/g, '"')).map((tabla) => ({
  tabla,
  // El mismo select que usa bajarReferencias().
  columnas: 'id, nombre, actualizado_en, eliminado_en',
}))

const aRevisar = [...maestros, ...catalogos, ...referencias]
if (maestros.length < 10) {
  console.error(`Sólo se leyeron ${maestros.length} tablas maestras de sync.ts: la prueba no está leyendo bien el archivo.`)
  process.exit(2)
}

let fallas = 0
console.log(`\nLo que la terminal le pide a la base — ${aRevisar.length} tablas\n`)

for (const { tabla, columnas } of aRevisar) {
  const r = await fetch(
    `${URL_BASE}/rest/v1/${tabla}?select=${encodeURIComponent(columnas)}&limit=0`,
    { headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` } },
  )
  if (r.ok) {
    console.log(`  ✓ ${tabla}`)
  } else {
    fallas++
    const cuerpo = await r.text()
    const mensaje = (() => {
      try {
        return JSON.parse(cuerpo).message
      } catch {
        return cuerpo.slice(0, 200)
      }
    })()
    console.log(`  ✗ ${tabla} → ${r.status}: ${mensaje}`)
  }
}

// El motor de bajada pagina con actualizado_en: una tabla maestra sin
// esa columna se corta apenas la terminal intenta bajarla.
for (const { tabla, columnas } of maestros) {
  if (!columnas.split(',').some((c) => c.trim() === 'actualizado_en')) {
    fallas++
    console.log(`  ✗ ${tabla} → la bajada ordena por actualizado_en y esta definición no la pide`)
  }
}

console.log(`\n${fallas ? `✗ ${fallas} problema(s)` : '✓ Todo lo que la terminal pide existe'}\n`)
process.exit(fallas ? 1 : 0)
