/*
  Deja lista la carpeta que se sube a Cloudflare.

  Genera las dos cosas de una sola vez y en la misma carpeta:

    app/dist/                    la aplicación web
    app/dist/actualizaciones/    lo que las 4 PC del local consultan
                                 para saber si hay una versión nueva

  El circuito completo, una vez por corrección:

    1. Subir el número de versión en src-tauri/tauri.conf.json
    2. npm run escritorio:publicar
    3. Arrastrar app/dist a Cloudflare Pages, al proyecto gross-sistema

  ─────────────────────────────────────────────────────────────
  Por qué este comando y no `npm run build`

  Las dos cosas viven en la misma dirección y en la misma carpeta, así
  que si alguna vez se sube un `dist` generado con el build común, la
  carpeta de actualizaciones desaparece de Cloudflare y las terminales
  del local dejan de recibir correcciones — sin ningún error visible,
  que es la peor forma de romperse.

  Por eso el deploy sale SIEMPRE de acá. `npm run build` sigue estando
  para compilar y revisar, no para publicar.
  ─────────────────────────────────────────────────────────────

  La firma es lo que hace que esto sea seguro. Cada versión se firma con
  la clave privada que está en secrets/, y el programa instalado sólo
  acepta una actualización firmada con esa clave. Sin eso, cualquiera
  que pudiera responder en esa dirección podría instalarle lo que
  quisiera a las cuatro máquinas del local.
*/

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = join(aqui, '..')

const CLAVE = join(raiz, 'secrets', 'actualizador-gross.key')
const DIST = join(aqui, 'dist')
const DESTINO = join(DIST, 'actualizaciones')
const BASE_URL = 'https://gross-sistema.pages.dev/actualizaciones'

function morir(mensaje) {
  console.error(`\n  [X] ${mensaje}\n`)
  process.exit(1)
}

// ── 1. La clave tiene que estar ──
if (!existsSync(CLAVE)) {
  morir(
    `No está la clave de firma en ${CLAVE}.\n` +
      `      Sin ella no se puede publicar una actualización, y las máquinas ya\n` +
      `      instaladas no aceptarían una versión firmada con otra clave.\n` +
      `      Está en la copia de seguridad; no se genera de nuevo.`,
  )
}

const config = JSON.parse(readFileSync(join(aqui, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const version = config.version

/*
  No publicar dos veces el mismo número.

  Las terminales comparan versiones: si el número no cambia, no se
  enteran de nada y la corrección no llega nunca. Se pregunta contra lo
  que está publicado de verdad, que es la única fuente confiable.

  Si no hay internet o todavía no se publicó nada, se sigue igual: no
  poder consultar no es motivo para frenar.
*/
try {
  const respuesta = await fetch(`${BASE_URL}/latest.json`, { signal: AbortSignal.timeout(8000) })
  if (respuesta.ok) {
    const publicado = await respuesta.json()
    if (publicado.version === version) {
      morir(
        `La versión ${version} ya está publicada en Cloudflare.\n` +
          `      Subí el número en src-tauri/tauri.conf.json antes de publicar.`,
      )
    }
    console.log(`\n  Publicado hoy: ${publicado.version} → se va a publicar: ${version}`)
  }
} catch {
  console.log('\n  (No se pudo consultar qué versión está publicada; se sigue igual.)')
}

// ── 2. Compilar el programa, firmándolo ──
//
// Esto genera de paso un `dist` sin service worker, que es el que queda
// adentro del instalador. El de la web se regenera en el paso 3.
console.log(`\n  Compilando el programa, versión ${version}…\n`)
execFileSync('npm', ['run', 'escritorio:instalador'], {
  cwd: aqui,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    /*
      Se le pasa el CONTENIDO de la clave, no la ruta.

      Tauri acepta las dos formas, pero la ruta de este proyecto tiene
      espacios ("00 ILUMA", "Dev Code") y ahí se pierde en el camino: el
      empaquetador no encuentra la clave, y el error que devuelve —"se
      encontró una clave pública pero no una privada"— manda a buscar el
      problema en el lugar equivocado.
    */
    TAURI_SIGNING_PRIVATE_KEY: readFileSync(CLAVE, 'utf8').trim(),
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '',
  },
})

const nsis = join(aqui, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
const instalador = join(nsis, `Sistema Gross_${version}_x64-setup.exe`)
const firma = `${instalador}.sig`

if (!existsSync(instalador)) morir(`No se generó el instalador en ${instalador}`)
if (!existsSync(firma)) {
  morir(
    `Se generó el instalador pero no la firma.\n` +
      `      Revisá que "createUpdaterArtifacts" siga en true en tauri.conf.json.`,
  )
}

// ── 3. Regenerar el `dist` de la web ──
//
// El paso anterior dejó un dist sin service worker, que es lo correcto
// adentro del programa y lo incorrecto en la web: ahí el service worker
// es justamente lo que hace que abra sin internet.
console.log('\n  Generando la aplicación web…\n')
execFileSync('npm', ['run', 'build'], { cwd: aqui, stdio: 'inherit', shell: true })

// ── 4. Sumarle la carpeta de actualizaciones ──
rmSync(DESTINO, { recursive: true, force: true })
mkdirSync(DESTINO, { recursive: true })

// Sin espacios en el nombre: viaja por una dirección web y un espacio
// ahí se convierte en %20, que es una fuente de errores tonta y difícil
// de ver.
const archivo = `sistema-gross-${version}-setup.exe`
copyFileSync(instalador, join(DESTINO, archivo))

writeFileSync(
  join(DESTINO, 'latest.json'),
  JSON.stringify(
    {
      version,
      notes: 'Mejoras y correcciones del sistema.',
      pub_date: new Date().toISOString(),
      platforms: {
        'windows-x86_64': {
          signature: readFileSync(firma, 'utf8').trim(),
          url: `${BASE_URL}/${archivo}`,
        },
      },
    },
    null,
    2,
  ) + '\n',
)

console.log(`
  Versión ${version} lista para publicar.

    Arrastrá  app/dist  a Cloudflare Pages, al proyecto gross-sistema.

    Adentro va la aplicación web y, en actualizaciones/, el instalador
    firmado que las 4 PC del local van a encontrar solas.

    Para instalar en una máquina nueva, el mismo archivo sirve:
    app/dist/actualizaciones/${archivo}
`)
