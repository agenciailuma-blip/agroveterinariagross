/*
  Después de cada `npm run build`, avisar si el `dist` NO se puede subir.

  ─── El problema que esto evita ───

  El deploy sale siempre de `npm run escritorio:publicar`, que genera dos
  cosas en la misma carpeta: la aplicación web y, adentro de
  `dist/actualizaciones/`, el instalador firmado que las 4 PC del local
  consultan para actualizarse solas.

  `npm run build` genera sólo la primera. El resultado se ve idéntico —una
  carpeta `dist` llena de archivos, sin ningún error— pero le falta la
  carpeta de actualizaciones. Si ese `dist` se sube a Cloudflare, las
  cuatro terminales dejan de recibir correcciones y NADIE SE ENTERA: no
  hay pantalla de error, no hay aviso, simplemente nunca más les llega
  una actualización.

  Ya pasó una vez, el 04/09/2026, corriendo el build para verificar otra
  cosa. Se descubrió a tiempo de casualidad. Este archivo existe para que
  la próxima no dependa de la casualidad.

  ─── Por qué avisa y no falla ───

  `escritorio:publicar` llama a `npm run build` adentro y recién después
  arma la carpeta de actualizaciones. Si el build fallara acá, el único
  camino correcto de publicar quedaría roto.

  Así que avisa por consola y deja un archivo bien visible adentro de
  `dist`. Lo del archivo importa más que lo de la consola: el aviso de la
  terminal se pierde entre el resto de la salida y se olvida, pero el
  archivo viaja con la carpeta y aparece justo cuando alguien la abre
  para arrastrarla.
*/
import { existsSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const DIST = join(aqui, 'dist')
const ACTUALIZACIONES = join(DIST, 'actualizaciones')
const MARCA = join(DIST, 'NO-SUBIR-ESTA-CARPETA.txt')

if (!existsSync(DIST)) process.exit(0)

// El dist está completo. Si quedó una marca de una corrida anterior, sobra.
if (existsSync(ACTUALIZACIONES)) {
  rmSync(MARCA, { force: true })
  process.exit(0)
}

writeFileSync(
  MARCA,
  [
    'ESTA CARPETA NO SE PUEDE SUBIR A CLOUDFLARE.',
    '',
    'Se generó con `npm run build`, que arma sólo la aplicación web y no',
    'la carpeta `actualizaciones/` que consultan las 4 PC del local.',
    '',
    'Si se sube así, las terminales dejan de recibir actualizaciones y no',
    'aparece ningún error: simplemente nunca más les llega una.',
    '',
    'Para publicar de verdad:',
    '',
    '  1. Subir el número de versión en src-tauri/tauri.conf.json',
    '  2. npm --prefix app run escritorio:publicar',
    '  3. Recién ahí, arrastrar app/dist a Cloudflare',
    '',
    'Ese comando regenera todo y borra este archivo solo.',
    '',
  ].join('\n'),
  'utf8',
)

console.log(
  [
    '',
    '  ⚠️  Este `dist` NO se puede subir a Cloudflare.',
    '',
    '     Le falta `actualizaciones/`, que es lo que consultan las 4 PC del',
    '     local. Si se sube así, dejan de recibir correcciones sin mostrar',
    '     ningún error.',
    '',
    '     Para publicar:  npm --prefix app run escritorio:publicar',
    '',
    '     (Quedó un NO-SUBIR-ESTA-CARPETA.txt adentro de dist como',
    '     recordatorio. El publicador lo borra solo.)',
    '',
  ].join('\n'),
)
