/*
  Arma la plantilla de la hoja del remito R.

    node docs/remito-r/armar-plantilla.mjs

  Salen dos cosas del mismo dibujo:
  · el PDF para la imprenta: original, duplicado e indicaciones;
  · la imagen de la hoja que usa el sistema de fondo, para mostrar en
    pantalla cómo cae lo impreso y para la prueba de alineación.

  Las medidas están en milímetros. Si se mueve un campo acá, hay que
  mover su renglón en app/src/lib/comprobante/hojaRemitoR.ts.
*/
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aca = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aca, '..', '..')
const publico = join(raiz, 'app', 'public')
const temporal = join(aca, '.armado')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const MARCA = '#8d0b7b'
const BANDA = '#f6e6f3'
const TINTA = '#1f2021'
const IMPRENTA = '#fff27a'

const pt = (n) => n * 0.3528
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function t(x, y, texto, { tam = 7.5, peso = 400, ancla = 'start', color = TINTA, espacio = 0 } = {}) {
  return `<text x="${x}" y="${y}" font-size="${pt(tam)}" font-weight="${peso}" text-anchor="${ancla}" fill="${color}" letter-spacing="${espacio}">${esc(texto)}</text>`
}
const rect = (x, y, a, h, attrs = '') => `<rect x="${x}" y="${y}" width="${a}" height="${h}" ${attrs}/>`
const linea = (x1, y1, x2, y2, grosor = 0.3, color = MARCA) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${grosor}"/>`

const interior = (archivo) => {
  const svg = readFileSync(join(publico, 'marca', archivo), 'utf8')
  return {
    caja: svg.match(/viewBox="([^"]+)"/)[1],
    adentro: svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>')).replace(/<defs>.*?<\/defs>/s, ''),
  }
}
const logo = interior('logo.svg')
const isotipo = interior('isotipo.svg')

/** Lo que completa la imprenta: resaltado en la plantilla; sin resaltar en el fondo del sistema. */
function dePrenta(resaltar, x, y, a, h) {
  return resaltar ? rect(x, y, a, h, `fill="${IMPRENTA}"`) : ''
}

function hoja(copia, resaltar) {
  const p = []

  // El marco
  p.push(rect(8, 8, 194, 281, `fill="none" stroke="${MARCA}" stroke-width="0.5" rx="1.5"`))

  // La marca de agua, en el cuerpo
  p.push(`<svg x="60" y="112" width="90" height="90" viewBox="${isotipo.caja}" opacity="0.07">${isotipo.adentro}</svg>`)

  // ── Encabezado ──
  p.push(`<svg x="14" y="11" width="68" height="25.2" viewBox="${logo.caja}">${logo.adentro}</svg>`)
  p.push(t(14, 40.5, 'GROSS ERNESTO HUGO', { tam: 8, peso: 700 }))
  p.push(t(14, 44, 'Av. Libertad 315 - (3360) Oberá, Misiones  ·  Tel.: 3755-421829 / 401829', { tam: 7 }))
  p.push(t(14, 47.6, 'I.V.A. RESPONSABLE INSCRIPTO', { tam: 7, peso: 500 }))

  // La letra, al medio
  p.push(linea(105, 44, 105, 50, 0.3))
  p.push(rect(96, 8, 18, 18, `fill="#fff" stroke="${MARCA}" stroke-width="0.5"`))
  p.push(t(105, 22.4, 'R', { tam: 44, peso: 700, ancla: 'middle' }))
  p.push(rect(97.5, 26, 15, 7.4, `fill="#fff" stroke="${MARCA}" stroke-width="0.3"`))
  p.push(t(105, 28.9, 'CÓDIGO', { tam: 5.5, peso: 500, ancla: 'middle' }))
  p.push(t(105, 31.9, 'Nº 91', { tam: 6.5, peso: 700, ancla: 'middle' }))
  p.push(t(105, 36, 'DOCUMENTO', { tam: 4.8, peso: 500, ancla: 'middle' }))
  p.push(t(105, 38.2, 'NO VÁLIDO', { tam: 4.8, peso: 500, ancla: 'middle' }))
  p.push(t(105, 40.4, 'COMO FACTURA', { tam: 4.8, peso: 500, ancla: 'middle' }))

  // El número, la fecha y los datos fiscales
  p.push(t(120, 17, 'REMITO', { tam: 20, peso: 700, color: MARCA, espacio: 0.3 }))
  p.push(dePrenta(resaltar, 131, 20.2, 62, 7.6))
  p.push(t(120, 26, 'Nº', { tam: 14, peso: 700 }))
  p.push(t(131.5, 26, '0000-00000000', { tam: 15, peso: 700 }))
  p.push(t(120, 36, 'FECHA:', { tam: 8, peso: 500 }))
  for (const [x, a, rotulo] of [
    [134, 11, 'DÍA'],
    [147, 11, 'MES'],
    [160, 16, 'AÑO'],
  ]) {
    p.push(rect(x, 31, a, 7, `fill="#fff" stroke="${MARCA}" stroke-width="0.25" rx="0.6"`))
    p.push(t(x + a / 2, 40.2, rotulo, { tam: 4.6, ancla: 'middle', color: '#6b6b6b' }))
  }
  p.push(t(120, 44.2, 'C.U.I.T.: 20-14636976-7  ·  ING. BRUTOS: 20-14636976-7', { tam: 6.6 }))
  p.push(t(120, 47.6, 'INICIO DE ACTIVIDADES: 16/06/1986', { tam: 6.6 }))
  p.push(linea(8, 50, 202, 50, 0.4))

  // ── El destinatario ──
  p.push(rect(8.25, 50.2, 193.5, 7.8, `fill="${BANDA}"`))
  const rotulo = (x, y, s) => t(x, y, s, { tam: 6.8, peso: 500 })
  p.push(rotulo(12, 55.2, 'SEÑOR(ES):'))
  p.push(rotulo(155, 55.2, 'PEDIDO Nº:'))
  p.push(rotulo(12, 62.5, 'DOMICILIO:'))
  p.push(rotulo(125, 62.5, 'LOCALIDAD:'))
  p.push(rotulo(12, 69.5, 'I.V.A.:'))
  p.push(rotulo(125, 69.5, 'C.U.I.T.:'))

  // ── El cuerpo: en blanco, salvo los títulos ──
  p.push(rect(8.25, 72, 193.5, 7, `fill="${BANDA}"`))
  p.push(t(14, 76.8, 'CÓDIGO', { tam: 7, peso: 700 }))
  p.push(t(42, 76.8, 'DESCRIPCIÓN', { tam: 7, peso: 700 }))
  p.push(t(197, 76.8, 'CANTIDAD', { tam: 7, peso: 700, ancla: 'end' }))

  // ── Abajo ──
  p.push(dePrenta(resaltar, 14, 227, 100, 10.5))
  if (resaltar) p.push(t(64, 233.4, 'CÓDIGO DE BARRAS DEL C.A.I. — lo agrega la imprenta', { tam: 7, ancla: 'middle' }))
  p.push(linea(8, 239, 202, 239, 0.3))

  p.push(rect(12, 241, 116, 26, `fill="none" stroke="${MARCA}" stroke-width="0.3" rx="0.8"`))
  p.push(rotulo(15, 246.5, 'TRANSPORTE:'))
  p.push(rotulo(15, 254, 'RECIBÍ CONFORME:'))
  p.push(rotulo(15, 262.5, 'Nº DE DOCUMENTO:'))
  p.push(rotulo(80, 254, 'FIRMA:'))
  p.push(rotulo(80, 262.5, 'ACLARACIÓN:'))
  p.push(linea(40, 255, 78, 255, 0.15, TINTA))
  p.push(linea(40, 263.5, 78, 263.5, 0.15, TINTA))
  p.push(linea(90, 255, 126, 255, 0.15, TINTA))
  p.push(linea(97, 263.5, 126, 263.5, 0.15, TINTA))

  p.push(rotulo(131, 245, 'TOTAL DE UNIDADES:'))
  p.push(rotulo(131, 250.3, 'CANTIDAD DE BULTOS:'))
  p.push(rotulo(131, 255.6, 'TOTAL KG:'))
  p.push(rotulo(131, 260.9, 'VALOR DECLARADO:'))
  p.push(rotulo(131, 266.2, 'FACTURA / PROFORMA Nº:'))

  // ── El pie: los datos de la imprenta, la copia y el C.A.I. ──
  p.push(linea(8, 270, 202, 270, 0.3))
  p.push(dePrenta(resaltar, 12, 271.5, 48, 15))
  p.push(t(13, 275, 'Datos de la imprenta:', { tam: 5.6, peso: 500 }))
  p.push(t(13, 278, 'nombre, C.U.I.T., domicilio', { tam: 5.6 }))
  p.push(t(13, 281, 'y habilitación', { tam: 5.6 }))
  p.push(dePrenta(resaltar, 62, 271.5, 56, 15))
  p.push(t(90, 276, 'Fecha de impresión: 00/00/0000', { tam: 6.4, ancla: 'middle' }))
  p.push(t(90, 280, 'desde 0000-00000000 hasta 0000-00000000', { tam: 6.4, ancla: 'middle' }))
  p.push(t(134, 281, copia, { tam: 10, peso: 700, ancla: 'middle' }))
  p.push(dePrenta(resaltar, 150, 271.5, 50, 15))
  p.push(t(198, 277, 'C.A.I. Nº: 00000000000000', { tam: 8, peso: 500, ancla: 'end' }))
  p.push(t(198, 282.5, 'Fecha de Vto.: 00/00/0000', { tam: 8.5, peso: 700, ancla: 'end' }))

  return `<section class="pagina"><svg class="dibujo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297">${p.join('')}</svg></section>`
}

const INDICACIONES = `
<section class="pagina texto">
  <h1>Remito R — indicaciones para la imprenta</h1>
  <p class="bajada">Agroveterinaria Gross · GROSS ERNESTO HUGO · C.U.I.T. 20-14636976-7</p>

  <h2>Qué se pide</h2>
  <ul>
    <li>Hojas <b>A4 sueltas</b> (210 × 297 mm), en <b>original y duplicado</b>. Las páginas 1 y 2 de este archivo son los diseños.</li>
    <li>Tienen que pasar por una <b>impresora láser común</b>: el comercio imprime sobre ellas los datos de cada remito.</li>
    <li>Cada número va en <b>dos hojas seguidas</b>: original y duplicado del mismo número, en ese orden, en toda la tanda.</li>
  </ul>

  <h2>Lo que completa la imprenta</h2>
  <p>Está resaltado en amarillo en las páginas 1 y 2. <b>El amarillo no se imprime.</b></p>
  <ul>
    <li>El número de cada hoja, con su punto de venta, numerado correlativo.</li>
    <li>El C.A.I. y su fecha de vencimiento, gestionados ante ARCA.</li>
    <li>El código de barras del C.A.I.</li>
    <li>Sus datos, la fecha de impresión y el rango de números de la tanda.</li>
  </ul>

  <h2>Lo que no hay que mover</h2>
  <ul>
    <li><b>El tamaño ni la posición de los campos.</b> Los datos del remito salen de la impresora en lugares medidos: si un campo se corre, el dato cae afuera. Se imprime al 100 %, sin ajustar a la página.</li>
    <li><b>El cuerpo de la hoja va en blanco:</b> sin renglones ni cuadrícula. Sólo la marca de agua, bien clara, para que se lea lo que se imprime encima.</li>
    <li>Los recuadros de fecha y las líneas de firma, como están.</li>
  </ul>

  <h2>Antes de imprimir la tanda</h2>
  <p>Se pide <b>una muestra</b> —original y duplicado— para probarla en la impresora del comercio. Si la imprenta tiene que cambiar algo del diseño, por una exigencia de ARCA o de su equipo, que lo avise antes: se ajusta del lado del sistema.</p>

  <h2>Colores y archivo</h2>
  <ul>
    <li>Violeta de la marca: <b>#8D0B7B</b>. El logo es vectorial y las letras van incluidas en el PDF.</li>
    <li>Sin sangrado: el diseño queda 8 mm adentro del borde de la hoja.</li>
  </ul>
</section>`

const CSS = `
@font-face { font-family: Ubuntu; font-weight: 400; src: url('${pathToFileURL(join(publico, 'fuentes', 'Ubuntu-Regular.ttf'))}'); }
@font-face { font-family: Ubuntu; font-weight: 500; src: url('${pathToFileURL(join(publico, 'fuentes', 'Ubuntu-Medium.ttf'))}'); }
@font-face { font-family: Ubuntu; font-weight: 700; src: url('${pathToFileURL(join(publico, 'fuentes', 'Ubuntu-Bold.ttf'))}'); }
@page { size: 210mm 297mm; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #fff; font-family: Ubuntu, sans-serif; color: ${TINTA}; }
.pagina { width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; break-after: page; position: relative; }
.pagina:last-child { page-break-after: auto; break-after: auto; }
.dibujo { display: block; width: 210mm; height: 297mm; font-family: Ubuntu, sans-serif; }
.cls-1 { fill: ${MARCA}; }
.texto { padding: 20mm 22mm; font-size: 10.5pt; line-height: 1.45; }
.texto h1 { margin: 0; font-size: 17pt; color: ${MARCA}; }
.texto .bajada { margin: 1mm 0 6mm; font-size: 9.5pt; color: #555; }
.texto h2 { margin: 6mm 0 1.5mm; font-size: 11.5pt; }
.texto p { margin: 0 0 2mm; }
.texto ul { margin: 0; padding-left: 5mm; }
.texto li { margin-bottom: 1.2mm; }
`

const estilosLogo = readFileSync(join(publico, 'marca', 'logo.svg'), 'utf8').match(/<style>(.*?)<\/style>/s)[1]

const documento = (cuerpo) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Remito R - Plantilla</title><style>${estilosLogo}${CSS}</style></head><body>${cuerpo}</body></html>`

mkdirSync(temporal, { recursive: true })
mkdirSync(join(publico, 'remito-r'), { recursive: true })

const htmlPdf = join(temporal, 'plantilla.html')
const htmlFondo = join(temporal, 'fondo.html')
writeFileSync(htmlPdf, documento(hoja('ORIGINAL', true) + hoja('DUPLICADO', true) + INDICACIONES))
writeFileSync(htmlFondo, documento(hoja('ORIGINAL', false)))
writeFileSync(join(temporal, 'vista.html'), documento(hoja('ORIGINAL', true)))

const edge = (...args) =>
  execFileSync(EDGE, ['--headless=new', '--disable-gpu', `--user-data-dir=${join(temporal, 'perfil')}`, ...args], { stdio: 'ignore' })

edge('--no-pdf-header-footer', `--print-to-pdf=${join(aca, 'Remito R - Plantilla para la imprenta.pdf')}`, pathToFileURL(htmlPdf).href)
edge('--window-size=794,1123', '--force-device-scale-factor=2', '--hide-scrollbars', `--screenshot=${join(publico, 'remito-r', 'hoja.png')}`, pathToFileURL(htmlFondo).href)
edge('--window-size=794,1123', '--force-device-scale-factor=2', '--hide-scrollbars', `--screenshot=${join(temporal, 'vista.png')}`, pathToFileURL(join(temporal, 'vista.html')).href)
console.log('Listo.')
