import { db } from '@/lib/local/db'
import type { NoFiscalLineaLocal, NoFiscalLocal } from '@/lib/local/db'

/*
  ─────────────────────────────────────────────────────────────
  Emitir sin conexión

  El remito es el papel que sale a la calle. Si el reparto sale un
  martes a la mañana y justo se cortó internet, no puede depender de que
  vuelva: la mercadería se va igual y alguien tiene que firmar algo.

  Se sigue el mismo reparto de trabajo que el cobro:

    ESCRIBIR ACÁ lo suficiente para imprimir el papel ahora. No es la
    verdad: es un adelanto de lo que el servidor va a registrar.

    ESCRIBIR ALLÁ por la bandeja de salida, llamando a la MISMA función
    de siempre con el id, la serie y el número que puso la terminal. El
    servidor sigue siendo la única autoridad, y como la función es
    idempotente por el id, reintentarla no descuenta stock dos veces.

  Lo que NO se replica acá es el descuento de stock del remito. Eso lo
  hace el servidor cuando la operación sube. Copiarlo también acá sería
  tener la misma regla escrita en dos lenguajes, que es exactamente lo
  que el cobro sin conexión evita a propósito.
  ─────────────────────────────────────────────────────────────
*/

export interface EmisionLocal {
  id: string
  ventaId: string
  tipo: string
  serie: string
  numero: number
  observaciones?: string | null
  validoHasta?: string | null
  entregaDomicilio?: string | null
  entregaLocalidad?: string | null
  entregaContacto?: string | null
  transportista?: string | null
}

/** Los datos del receptor, como los ve la terminal. */
async function receptorDe(clienteId: string) {
  const c = await db.cliente.get(clienteId)
  return {
    receptor_nombre: c?.nombre ?? 'Consumidor Final',
    receptor_documento: c?.numero_documento ?? null,
    // La sigla y la condición viven en tablas de referencia que la
    // terminal no replica. Sin conexión el papel sale sin esas dos
    // etiquetas y con todo lo demás, que es mejor que no salir.
    receptor_documento_sigla: '',
    receptor_condicion: '',
    receptor_domicilio: null as string | null,
  }
}

export async function emitirNoFiscalLocal(datos: EmisionLocal): Promise<NoFiscalLocal> {
  const venta = await db.venta.get(datos.ventaId)
  if (!venta) throw new Error('La venta no está en esta computadora.')

  const lineas = await db.venta_linea.where('venta_id').equals(datos.ventaId).toArray()
  if (!lineas.length) throw new Error('La venta no tiene productos.')
  lineas.sort((a, b) => a.orden - b.orden)

  const esRemito = datos.tipo === 'remito'
  const ahora = new Date().toISOString()
  const receptor = await receptorDe(venta.cliente_id)

  const total =
    Math.round(lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.precio_unitario), 0) * 100) /
    100

  const doc: NoFiscalLocal = {
    id: datos.id,
    tipo_clave: datos.tipo,
    serie: datos.serie,
    numero: datos.numero,
    venta_id: datos.ventaId,
    fecha: ahora.slice(0, 10),
    estado: 'emitido',
    ...receptor,
    total,
    observaciones: datos.observaciones ?? null,
    valido_hasta: datos.tipo === 'presupuesto' ? (datos.validoHasta ?? null) : null,
    entrega_domicilio: esRemito ? (datos.entregaDomicilio ?? null) : null,
    entrega_localidad: esRemito ? (datos.entregaLocalidad ?? null) : null,
    entrega_contacto: esRemito ? (datos.entregaContacto ?? null) : null,
    transportista: esRemito ? (datos.transportista ?? null) : null,
    venta_codigo: venta.codigo,
    creado_en: ahora,
  }

  const lineasDoc: NoFiscalLineaLocal[] = lineas.map((l) => ({
    id: crypto.randomUUID(),
    comprobante_no_fiscal_id: datos.id,
    orden: l.orden,
    codigo_producto: l.codigo_producto,
    descripcion: l.descripcion,
    cantidad: Number(l.cantidad),
    precio_unitario: Number(l.precio_unitario),
    importe: Math.round(Number(l.cantidad) * Number(l.precio_unitario) * 100) / 100,
  }))

  await db.transaction('rw', db.no_fiscal, db.no_fiscal_linea, async () => {
    await db.no_fiscal.put(doc)
    await db.no_fiscal_linea.bulkPut(lineasDoc)
  })

  return doc
}

/** El comprobante guardado en esta máquina, para imprimirlo sin conexión. */
export async function obtenerNoFiscalLocal(id: string) {
  const doc = await db.no_fiscal.get(id)
  if (!doc) return null

  const lineas = await db.no_fiscal_linea
    .where('comprobante_no_fiscal_id')
    .equals(id)
    .toArray()
  lineas.sort((a, b) => a.orden - b.orden)

  const emisor: Record<string, string> = {}
  for (const f of await db.configuracion.toArray()) {
    if (f.clave.startsWith('comercio.')) {
      emisor[f.clave.replace('comercio.', '')] = String(f.valor ?? '')
    }
  }

  return { doc, lineas, emisor }
}
