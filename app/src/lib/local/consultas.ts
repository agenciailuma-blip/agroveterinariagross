import { db, normalizar } from '@/lib/local/db'
import type { EstadoStock } from '@/lib/tipos'
import type { ClienteVenta, ProductoVenta } from '@/lib/api/ventas'
import type { ListaPrecio, MedioPago } from '@/lib/api/precios'

/*
  Consultas contra la base local.

  Devuelven exactamente la misma forma que las del servidor, así las
  pantallas no tienen que saber de dónde salieron los datos. Esa es la
  regla: el modo sin conexión no puede ser una versión distinta de la
  aplicación, tiene que ser la misma con otra fuente.
*/

async function valorConfig(clave: string, defecto: number) {
  const c = await db.configuracion.get(clave)
  const v = c?.valor
  return typeof v === 'number' ? v : Number(v ?? defecto) || defecto
}

/*
  Resuelve el estado de stock igual que la vista del servidor: gana el
  umbral del producto, después el de la categoría, después el general.
  Está duplicado a propósito y hay que mantener los dos lados iguales;
  la versión del servidor es la que manda.
*/
export async function estadoDeStock(
  cantidad: number,
  productoId: string,
  categoriaId: string | null,
): Promise<EstadoStock> {
  if (cantidad < 0) return 'sobrevendido'

  const umbrales = await db.umbral.toArray()
  const porProducto = umbrales.find((u) => u.ambito === 'producto' && u.producto_id === productoId)
  const porCategoria = categoriaId
    ? umbrales.find((u) => u.ambito === 'categoria' && u.categoria_id === categoriaId)
    : undefined

  const bajo = porProducto?.bajo ?? porCategoria?.bajo ?? (await valorConfig('stock.umbral_bajo_general', 10))
  const critico =
    porProducto?.critico ?? porCategoria?.critico ?? (await valorConfig('stock.umbral_critico_general', 3))

  if (cantidad <= critico) return 'critico'
  if (cantidad <= bajo) return 'bajo'
  return 'ok'
}

export async function hayDatosLocales() {
  return (await db.producto.count()) > 0
}

export async function buscarProductosLocal(texto: string): Promise<ProductoVenta[]> {
  const limpio = texto.trim()
  if (!limpio) return []

  // El código de barra exacto gana siempre: un escaneo no puede
  // devolver una lista para elegir.
  const barra = await db.codigo_barra.where('codigo').equals(limpio).first()
  let productos = barra
    ? [await db.producto.get(barra.producto_id)].filter(Boolean)
    : undefined

  if (!productos) {
    const patron = normalizar(limpio)
    // Con 2.261 productos recorrer todo y filtrar en memoria tarda unos
    // pocos milisegundos. Un índice de subcadenas no compensa acá.
    productos = await db.producto
      .filter((p) => !p.eliminado_en && p.activo && p.busqueda.includes(patron))
      .limit(20)
      .toArray()
  }

  const saldos = await db.saldo.bulkGet(productos.map((p) => p!.id))

  return Promise.all(
    productos.map(async (p, i) => {
      const cantidad = Number(saldos[i]?.cantidad ?? 0)
      return {
        producto_id: p!.id,
        codigo: p!.codigo,
        nombre_interno: p!.nombre_interno,
        precio_venta: Number(p!.precio_venta),
        unidad_medida: p!.unidad_medida,
        alicuota_iva_id: p!.alicuota_iva_id,
        condicion_iva: p!.condicion_iva as ProductoVenta['condicion_iva'],
        cantidad,
        estado: await estadoDeStock(cantidad, p!.id, p!.categoria_id),
      }
    }),
  )
}

export async function buscarClientesLocal(texto: string): Promise<ClienteVenta[]> {
  const patron = normalizar(texto.trim())
  const filas = await db.cliente
    .filter((c) => !c.eliminado_en && c.activo && (!patron || c.busqueda.includes(patron)))
    .limit(15)
    .toArray()

  return filas.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    numero_documento: c.numero_documento,
    condicion_iva_id: c.condicion_iva_id,
    descuento_porcentaje: Number(c.descuento_porcentaje),
    cuenta_corriente: c.cuenta_corriente,
    limite_credito: c.limite_credito != null ? Number(c.limite_credito) : null,
  }))
}

export async function consumidorFinalLocal(): Promise<ClienteVenta | null> {
  const c = await db.cliente.where('codigo').equals('CF').first()
  if (!c) return null
  return {
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    numero_documento: c.numero_documento,
    condicion_iva_id: c.condicion_iva_id,
    descuento_porcentaje: Number(c.descuento_porcentaje),
    cuenta_corriente: c.cuenta_corriente,
    limite_credito: c.limite_credito != null ? Number(c.limite_credito) : null,
  }
}

export async function preciosLocal(): Promise<{ listas: ListaPrecio[]; medios: MedioPago[] }> {
  const [listas, medios, cuotas] = await Promise.all([
    db.lista_precio.filter((l) => !l.eliminado_en).toArray(),
    db.medio_pago.filter((m) => !m.eliminado_en).sortBy('orden'),
    db.cuota.toArray(),
  ])

  return {
    listas: listas.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      descripcion: null,
      ajuste_porcentaje: Number(l.ajuste_porcentaje),
      es_predeterminada: l.es_predeterminada,
      orden: 0,
      activo: l.activo,
    })),
    medios: medios.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      tipo: m.tipo,
      lista_precio_id: m.lista_precio_id,
      admite_cuotas: m.admite_cuotas,
      cuotas_maximas: m.cuotas_maximas,
      afecta_caja: m.afecta_caja,
      orden: m.orden,
      activo: m.activo,
      medio_pago_cuota: cuotas
        .filter((c) => c.medio_pago_id === m.id)
        .map((c) => ({
          medio_pago_id: c.medio_pago_id,
          cuotas: c.cuotas,
          recargo_porcentaje: Number(c.recargo_porcentaje),
          activo: c.activo,
        }))
        .sort((a, b) => a.cuotas - b.cuotas),
    })),
  }
}

/*
  Numeración de la venta sin conexión.

  Cada terminal tiene su prefijo, así que puede numerar sola sin
  coordinar con nadie. Se toma el mayor entre lo que hay en la bandeja
  de salida y el último conocido del servidor, para que reconectar no
  reinicie la cuenta.
*/
export async function siguienteCodigoLocal(prefijo: string) {
  const enCola = await db.outbox.filter((o) => o.tabla === 'venta').toArray()
  const numeros = enCola
    .map((o) => String((o.datos as { codigo?: string }).codigo ?? ''))
    .filter((c) => c.startsWith(prefijo + '-'))
    .map((c) => Number(c.split('-').pop()) || 0)

  const guardado = Number((await db.configuracion.get(`ultimo_numero:${prefijo}`))?.valor ?? 0)
  const siguiente = Math.max(guardado, ...numeros, 0) + 1
  return `${prefijo}-${String(siguiente).padStart(6, '0')}`
}

export async function recordarUltimoNumero(prefijo: string, codigo: string) {
  const numero = Number(codigo.split('-').pop()) || 0
  await db.configuracion.put({
    clave: `ultimo_numero:${prefijo}`,
    valor: numero,
    actualizado_en: new Date().toISOString(),
  })
}
