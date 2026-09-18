/*
  ─────────────────────────────────────────────────────────────
  PRUEBAS DE LA API DE LA TIENDA, POR INTERNET

  Le pega a la función publicada como le pegaría la tienda de Zubu, y
  mira lo que un desarrollador de afuera ve: códigos de respuesta,
  encabezados, mensajes y la forma de cada producto.

  Lo que decide qué se ve está probado aparte, contra la base:
  supabase/pruebas/api-tienda.sql. Esto prueba la puerta.

  Cómo se corre (con una clave de prueba, nunca con la de Zubu):

    API_TIENDA_CLAVE=gross_... node supabase/pruebas/api-tienda-http.mjs

  La clave va por variable de entorno para que no quede escrita en el
  repositorio ni en el historial de la consola.
  ─────────────────────────────────────────────────────────────
*/

const BASE = process.env.API_TIENDA_URL ?? 'https://ywggnhoifhtoncnxrodh.supabase.co/functions/v1/api-tienda'
const CLAVE = process.env.API_TIENDA_CLAVE

const CAMPOS_PRODUCTO = [
  'actualizado_en', 'animales', 'categoria', 'codigo', 'codigos_barra', 'descripcion', 'etapas_de_vida',
  'id', 'marca', 'nombre', 'precio', 'presentacion', 'publicado', 'requiere_receta', 'stock', 'unidad',
].join(',')

if (!CLAVE) {
  console.error('Falta la clave de prueba: API_TIENDA_CLAVE=gross_... node supabase/pruebas/api-tienda-http.mjs')
  process.exit(2)
}

let fallas = 0
let bien = 0
function comprobar(ok, que) {
  if (ok) {
    bien++
    console.log(`  ✓ ${que}`)
  } else {
    fallas++
    console.log(`  ✗ ${que}`)
  }
}

async function pedir(ruta, { clave = CLAVE, metodo = 'GET', encabezados = {} } = {}) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { ...(clave ? { Authorization: `Bearer ${clave}` } : {}), ...encabezados },
  })
  const texto = await r.text()
  let cuerpo = null
  try {
    cuerpo = JSON.parse(texto)
  } catch {
    cuerpo = null
  }
  return { estado: r.status, encabezados: r.headers, cuerpo, texto }
}

console.log(`\nAPI de la tienda — ${BASE}\n`)

console.log('Lo que se rechaza')
{
  const r = await pedir('/catalogo', { clave: null })
  comprobar(r.estado === 401 && r.cuerpo?.error?.codigo === 'falta_clave', `sin clave: 401 falta_clave (${r.estado})`)
}
{
  const r = await pedir('/catalogo', { clave: 'gross_estaClaveNoExisteNiVaAExistirNunca0123456789' })
  comprobar(r.estado === 401 && r.cuerpo?.error?.codigo === 'clave_invalida', `clave inventada: 401 clave_invalida (${r.estado})`)
}
{
  const r = await pedir('/catalogo', { metodo: 'POST' })
  comprobar(r.estado === 405 && r.encabezados.get('allow') === 'GET', `escribir: 405 con Allow: GET (${r.estado})`)
}
{
  const r = await pedir('/catalogo', {
    clave: null,
    metodo: 'OPTIONS',
    encabezados: { Origin: 'https://una-pagina.com', 'Access-Control-Request-Method': 'GET' },
  })
  comprobar(r.estado === 405 && !r.encabezados.get('access-control-allow-origin'),
    `un navegador preguntando: 405 y sin permiso CORS (${r.estado})`)
}
{
  const r = await pedir('/pedidos')
  comprobar(r.estado === 404 && r.cuerpo?.error?.codigo === 'ruta_desconocida', `consulta que no existe: 404 (${r.estado})`)
}
{
  const r = await pedir('/catalogo?limite=0')
  comprobar(r.estado === 400 && r.cuerpo?.error?.codigo === 'limite_invalido', `limite=0: 400 limite_invalido (${r.estado})`)
}
{
  const r = await pedir('/catalogo?dsde=x')
  comprobar(r.estado === 400 && r.cuerpo?.error?.codigo === 'parametro_desconocido', `parámetro mal escrito: 400 (${r.estado})`)
}
{
  // Este lo rechaza la base, no la puerta: prueba que el 400 de la base
  // llega como 400 y no como un error nuestro.
  const r = await pedir('/catalogo?desde=estoNoEsUnaMarca')
  comprobar(r.estado === 400 && r.cuerpo?.error?.codigo === 'desde_invalido', `marca inventada: 400 desde_invalido (${r.estado})`)
}

console.log('\nEl catálogo')
const entero = await pedir('/catalogo')
comprobar(entero.estado === 200, `responde 200 (${entero.estado})`)
comprobar((entero.encabezados.get('content-type') ?? '').startsWith('application/json'), 'es JSON')
comprobar(entero.encabezados.get('cache-control') === 'no-store', 'no se guarda en caché')
comprobar(!entero.encabezados.get('access-control-allow-origin'), 'no habilita a los navegadores')
const productos = entero.cuerpo?.productos ?? []
comprobar(Array.isArray(entero.cuerpo?.productos), `trae la lista de productos (${productos.length})`)
comprobar(productos.every((p) => Object.keys(p).sort().join(',') === CAMPOS_PRODUCTO),
  'cada producto trae exactamente los campos acordados')
comprobar(productos.every((p) => p.publicado === true), 'el catálogo entero trae sólo lo publicado')
comprobar(productos.every((p) => typeof p.stock === 'number' && p.stock >= 0), 'el stock es un número, nunca negativo')
comprobar(productos.every((p) => typeof p.precio === 'number' && p.precio > 0), 'el precio es un número mayor a cero')
comprobar(!/costo|margen|proveedor|nombre_interno|colchon/.test(entero.texto), 'no aparece nada interno en la respuesta')
comprobar(typeof entero.cuerpo?.frescura?.confiable === 'boolean', 'trae la frescura')
comprobar(entero.cuerpo?.hay_mas === false && typeof entero.cuerpo?.siguiente === 'string', 'trae la marca para la próxima vez')

console.log('\nDe a páginas')
{
  const vistos = []
  let desde = null
  let paginas = 0
  for (;;) {
    const r = await pedir(`/catalogo?limite=5${desde ? `&desde=${encodeURIComponent(desde)}` : ''}`)
    if (r.estado !== 200) break
    vistos.push(...r.cuerpo.productos.map((p) => p.id))
    desde = r.cuerpo.siguiente
    paginas++
    if (!r.cuerpo.hay_mas || paginas > 100) break
  }
  const esperados = productos.map((p) => p.id).sort().join(',')
  comprobar(new Set(vistos).size === vistos.length, `ninguno repetido (${vistos.length} en ${paginas} páginas)`)
  comprobar([...vistos].sort().join(',') === esperados, 'los mismos que el catálogo entero, ni uno más ni uno menos')
}

console.log('\nLo que cambió')
{
  const r = await pedir(`/catalogo?desde=${encodeURIComponent(entero.cuerpo.siguiente)}`)
  comprobar(r.estado === 200 && Array.isArray(r.cuerpo?.productos), `con la marca responde 200 (${r.cuerpo?.productos?.length ?? '?'} cambios)`)
}

console.log('\nLas clasificaciones')
{
  const r = await pedir('/clasificaciones')
  comprobar(r.estado === 200, `responde 200 (${r.estado})`)
  comprobar(Object.keys(r.cuerpo ?? {}).sort().join(',') === 'animales,categorias,etapas_de_vida,generado_en,marcas,presentaciones',
    'trae las cinco listas')
  const slugs = new Set((r.cuerpo?.categorias ?? []).map((c) => c.slug))
  comprobar(productos.every((p) => p.categoria === null || slugs.has(p.categoria)),
    'cada categoría que usan los productos está en la lista')
}
{
  const r = await pedir('/clasificaciones?limite=3')
  comprobar(r.estado === 400, `no acepta parámetros (${r.estado})`)
}

console.log(`\n${fallas ? `✗ ${fallas} fallaron` : '✓ Todo bien'} — ${bien} comprobaciones pasaron\n`)
process.exit(fallas ? 1 : 0)
