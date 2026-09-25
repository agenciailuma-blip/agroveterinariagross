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

  Todo lo que corre por defecto es de sólo lectura o rechazos, que no
  dejan nada en la base. El pedido de compra que SÍ entra queda detrás
  de una bandera, porque escribe una venta de verdad:

    API_TIENDA_CLAVE=gross_... API_TIENDA_ESCRIBIR=1 node ...

  Cuando se corre así, al final imprime qué creó para poder borrarlo.
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

async function pedir(ruta, { clave = CLAVE, metodo = 'GET', encabezados = {}, cuerpo } = {}) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      ...(clave ? { Authorization: `Bearer ${clave}` } : {}),
      ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...encabezados,
    },
    // Un texto se manda tal cual: así se puede probar un JSON roto.
    body: cuerpo === undefined ? undefined : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  })
  const texto = await r.text()
  // Se llama distinto que el cuerpo que se manda, que es un parámetro.
  let leido = null
  try {
    leido = JSON.parse(texto)
  } catch {
    leido = null
  }
  return { estado: r.status, encabezados: r.headers, cuerpo: leido, texto }
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
  const r = await pedir('/clientes')
  comprobar(r.estado === 404 && r.cuerpo?.error?.codigo === 'ruta_desconocida', `camino que no existe: 404 (${r.estado})`)
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

console.log('\nLos pedidos de compra: lo que se rechaza')
const ID_INVENTADO = '0f3c2a44-0000-4000-8000-000000000000'
const PEDIDO_MINIMO = {
  numero: 'NO-ENTRA',
  comprador: { nombre: 'Quien Prueba' },
  productos: [{ id: ID_INVENTADO, cantidad: 1, precio: 100 }],
}
const rechazados = []

async function rechaza(que, cuerpo, codigo, estado = 400) {
  const r = await pedir('/pedidos', { metodo: 'POST', cuerpo })
  rechazados.push(r)
  comprobar(
    r.estado === estado && r.cuerpo?.error?.codigo === codigo,
    `${que}: ${estado} ${codigo} (${r.estado} ${r.cuerpo?.error?.codigo ?? '?'})`,
  )
  return r
}

{
  const r = await pedir('/pedidos')
  rechazados.push(r)
  comprobar(r.estado === 405 && r.encabezados.get('allow') === 'POST', `leerlos: 405 con Allow: POST (${r.estado})`)
}
{
  const r = await pedir('/pedidos', { metodo: 'POST', clave: null, cuerpo: PEDIDO_MINIMO })
  rechazados.push(r)
  comprobar(r.estado === 401 && r.cuerpo?.error?.codigo === 'falta_clave', `sin clave: 401 falta_clave (${r.estado})`)
}
{
  const r = await pedir('/pedidos', {
    metodo: 'POST',
    clave: 'gross_estaClaveNoExisteNiVaAExistirNunca0123456789',
    cuerpo: PEDIDO_MINIMO,
  })
  rechazados.push(r)
  comprobar(r.estado === 401 && r.cuerpo?.error?.codigo === 'clave_invalida', `clave inventada: 401 (${r.estado})`)
}

await rechaza('cuerpo vacío', '', 'cuerpo_invalido')
await rechaza('JSON roto', '{"numero":', 'cuerpo_invalido')
await rechaza('una lista en vez de un objeto', '[{"numero":"A"}]', 'cuerpo_invalido')
await rechaza('sin número de pedido', { ...PEDIDO_MINIMO, numero: undefined }, 'falta_numero')
await rechaza('sin productos', { ...PEDIDO_MINIMO, productos: [] }, 'faltan_productos')
await rechaza('sin comprador', { ...PEDIDO_MINIMO, comprador: undefined }, 'falta_el_comprador')
await rechaza('una entrega que no existe', { ...PEDIDO_MINIMO, entrega: { tipo: 'drone' } }, 'entrega_invalida')
await rechaza(
  'cantidad cero',
  { ...PEDIDO_MINIMO, productos: [{ id: ID_INVENTADO, cantidad: 0, precio: 100 }] },
  'cantidad_invalida',
)
await rechaza(
  'precio negativo',
  { ...PEDIDO_MINIMO, productos: [{ id: ID_INVENTADO, cantidad: 1, precio: -1 }] },
  'precio_invalido',
)

{
  /*
    El identificador que no es un identificador: la base lo rechaza como
    pedido mal armado, y el mensaje crudo de Postgres no tiene que salir.
  */
  const r = await rechaza(
    'un id que no es un id',
    { ...PEDIDO_MINIMO, productos: [{ id: 'abc', cantidad: 1, precio: 1 }] },
    'pedido_invalido',
  )
  comprobar(
    !/uuid|syntax|venta_linea/i.test(r.cuerpo?.error?.mensaje ?? ''),
    'el mensaje no cuenta cómo está armado el sistema adentro',
  )
}
{
  const r = await rechaza('un producto que no existe', PEDIDO_MINIMO, 'producto_desconocido')
  comprobar((r.cuerpo?.error?.mensaje ?? '').includes(ID_INVENTADO), 'el mensaje dice cuál era el producto')
}
{
  const r = await pedir('/pedidos', { metodo: 'POST', cuerpo: { ...PEDIDO_MINIMO, relleno: 'x'.repeat(200_001) } })
  rechazados.push(r)
  comprobar(
    r.estado === 413 && r.cuerpo?.error?.codigo === 'cuerpo_demasiado_grande',
    `un cuerpo enorme: 413 cuerpo_demasiado_grande (${r.estado})`,
  )
}

comprobar(rechazados.every((r) => !r.texto.includes(CLAVE)), 'ningún rechazo repite la clave')
comprobar(
  rechazados.every((r) => !r.encabezados.get('access-control-allow-origin')),
  'ningún rechazo habilita a los navegadores',
)
comprobar(rechazados.every((r) => r.estado !== 500), 'ningún pedido mal armado se contesta como error nuestro')

console.log('\nEl estado de un pedido: lo que se rechaza')
{
  const r = await pedir('/pedidos/NO-EXISTE-NUNCA-123')
  comprobar(r.estado === 404 && r.cuerpo?.error?.codigo === 'pedido_desconocido',
    `un pedido que no existe: 404 pedido_desconocido (${r.estado} ${r.cuerpo?.error?.codigo ?? '?'})`)
}
{
  const r = await pedir('/pedidos/NO-EXISTE', { clave: null })
  comprobar(r.estado === 401 && r.cuerpo?.error?.codigo === 'falta_clave', `sin clave: 401 (${r.estado})`)
}
{
  const r = await pedir('/pedidos/NO-EXISTE', { clave: 'gross_estaClaveNoExisteNiVaAExistirNunca0123456789' })
  comprobar(r.estado === 401 && r.cuerpo?.error?.codigo === 'clave_invalida', `clave inventada: 401 (${r.estado})`)
}
{
  const r = await pedir('/pedidos/NO-EXISTE', { metodo: 'POST', cuerpo: {} })
  comprobar(r.estado === 405 && r.encabezados.get('allow') === 'GET', `mandarle algo: 405 con Allow: GET (${r.estado})`)
}
{
  /*
    Un número mal codificado no llega a la función: lo corta antes la
    plataforma de Supabase, con un 500 suyo en texto plano. La regla de
    la puerta (400 numero_invalido) está probada con las pruebas de la
    aplicación; acá sólo se mira que no pase nada y no salga nada.
  */
  const r = await pedir('/pedidos/T%E0%A4%A')
  comprobar(r.estado >= 400 && !r.texto.includes(CLAVE) && !/pedido_tienda|venta/.test(r.texto),
    `un número mal codificado se rechaza sin contar nada (${r.estado})`)
}

/*
  Hasta acá nada dejó rastro: un pedido rechazado no crea ni media
  venta. Lo que sigue sí escribe, y por eso hay que pedirlo.
*/
if (!process.env.API_TIENDA_ESCRIBIR) {
  console.log('\nEl pedido que entra: salteado. Corré con API_TIENDA_ESCRIBIR=1 para probarlo; escribe una venta real.')
} else {
  console.log('\nEl pedido que entra')
  const unProducto = productos.find((p) => p.stock > 0) ?? productos[0]
  const numero = `PRUEBA-HTTP-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`
  const cuerpo = {
    numero,
    // Sin pagar: entra a la cola de la caja y no toca el stock, que es
    // lo menos invasivo que se puede probar contra la base de verdad.
    pagado: false,
    comprador: { nombre: 'Prueba de la API', email: 'prueba@ejemplo.com' },
    entrega: { tipo: 'retira' },
    productos: [{ id: unProducto.id, cantidad: 1, precio: unProducto.precio }],
  }

  const r = await pedir('/pedidos', { metodo: 'POST', cuerpo })
  comprobar(r.estado === 200, `responde 200 (${r.estado})`)
  comprobar(
    Object.keys(r.cuerpo ?? {}).sort().join(',') === 'estado,pedido,repetido,revisar,total,venta',
    `trae los campos acordados (${Object.keys(r.cuerpo ?? {}).sort().join(',')})`,
  )
  comprobar(r.cuerpo?.repetido === false && r.cuerpo?.estado === 'recibido', 'entra como recibido')
  comprobar(
    typeof r.cuerpo?.venta === 'string' && r.cuerpo.venta.startsWith('WEB-'),
    `le da un número de venta (${r.cuerpo?.venta})`,
  )
  comprobar(r.cuerpo?.total === unProducto.precio, `el total es lo que se mandó (${r.cuerpo?.total})`)
  comprobar(!/costo|margen|proveedor|nombre_interno|colchon/.test(r.texto), 'no vuelve nada interno')

  // El reintento de una tienda a la que se le cortó la conexión.
  const otra = await pedir('/pedidos', { metodo: 'POST', cuerpo })
  comprobar(otra.estado === 200 && otra.cuerpo?.repetido === true, 'mandado dos veces, la segunda avisa que ya estaba')
  comprobar(otra.cuerpo?.venta === r.cuerpo?.venta, 'y contesta la misma venta, no una nueva')

  // Y la tienda pregunta por él, con el número tal cual lo mandó.
  const estado = await pedir(`/pedidos/${encodeURIComponent(numero)}`)
  comprobar(estado.estado === 200, `el estado responde 200 (${estado.estado})`)
  comprobar(
    Object.keys(estado.cuerpo ?? {}).sort().join(',') ===
      'actualizado,cobrado,entrega,estado,factura,numero,pagado_en_la_web,reintegros',
    `trae los campos acordados (${Object.keys(estado.cuerpo ?? {}).sort().join(',')})`,
  )
  comprobar(
    estado.cuerpo?.numero === numero && estado.cuerpo?.estado === 'recibido' &&
      estado.cuerpo?.cobrado === false && estado.cuerpo?.factura === null &&
      Array.isArray(estado.cuerpo?.reintegros) && estado.cuerpo.reintegros.length === 0,
    'recién entrado: recibido, sin cobrar, sin factura y sin nada que devolver',
  )
  comprobar(!/Prueba de la API|prueba@ejemplo|WEB-/.test(estado.texto), 'no devuelve datos del comprador ni la venta interna')

  console.log(`\n  Quedo creado en la base: pedido ${numero}, venta ${r.cuerpo?.venta}. Borralo cuando termines.`)
}

console.log(`\n${fallas ? `✗ ${fallas} fallaron` : '✓ Todo bien'} — ${bien} comprobaciones pasaron\n`)
process.exit(fallas ? 1 : 0)
