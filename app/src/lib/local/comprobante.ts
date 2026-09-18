import { db } from '@/lib/local/db'
import { abrirComprobante } from '@/lib/local/cifrado'
import type { ComprobanteCompleto } from '@/lib/api/comprobante'

/*
  ─────────────────────────────────────────────────────────────
  El comprobante que emitió esta terminal, leído desde acá

  Sin internet no hay a quién pedirle la factura que se acaba de emitir
  —y es justo cuando hay que imprimirla, porque el cliente la está
  esperando—. Esto la arma con lo que quedó guardado en la máquina, con
  la misma forma que devuelve el servidor, para que el ticket, la hoja
  A4 y la pantalla no tengan que saber de dónde salió.
  ─────────────────────────────────────────────────────────────
*/

/** Los datos del emisor, de la copia local de la configuración. */
export async function emisorLocal(): Promise<Record<string, string>> {
  const filas = await db.configuracion.toArray()
  const emisor: Record<string, string> = {}
  for (const f of filas) {
    if (f.clave.startsWith('comercio.')) {
      emisor[f.clave.replace('comercio.', '')] = String(f.valor ?? '')
    }
  }
  return emisor
}

export async function obtenerComprobanteLocal(id: string): Promise<ComprobanteCompleto | null> {
  const guardado = await db.comprobante.get(id)
  if (!guardado) return null
  const c = await abrirComprobante(guardado)

  const [alicuotas, tributos, lineas, tipo, condicion, documento, porcentajes, emisor] =
    await Promise.all([
      db.comprobante_alicuota.where('comprobante_id').equals(id).toArray(),
      db.comprobante_tributo.where('comprobante_id').equals(id).toArray(),
      db.venta_linea.where('venta_id').equals(c.venta_id).toArray(),
      db.tipo_comprobante.get(c.tipo_comprobante_id),
      db.condicion_iva.get(c.receptor_condicion_iva_id),
      db.tipo_documento.get(c.receptor_tipo_documento_id),
      db.alicuota_iva.toArray(),
      emisorLocal(),
    ])

  const porcentaje = new Map(porcentajes.map((a) => [a.id, Number(a.porcentaje)]))

  return {
    id: c.id,
    estado: c.estado,
    tipo_comprobante_id: c.tipo_comprobante_id,
    tipo_descripcion: tipo?.descripcion ?? '',
    clase: tipo?.clase ?? '',
    punto_venta: c.punto_venta_numero,
    numero: c.numero,
    fecha: c.fecha,
    concepto: c.concepto,
    receptor_nombre: c.receptor_nombre,
    receptor_documento: c.receptor_documento,
    receptor_tipo_documento_id: c.receptor_tipo_documento_id,
    receptor_documento_sigla: documento?.sigla ?? '',
    receptor_condicion: condicion?.descripcion ?? '',
    receptor_domicilio: c.receptor_domicilio,
    neto_gravado: Number(c.neto_gravado),
    neto_no_gravado: Number(c.neto_no_gravado),
    exento: Number(c.exento),
    iva_total: Number(c.iva_total),
    tributos_total: Number(c.tributos_total),
    total: Number(c.total),
    moneda: c.moneda,
    cotizacion: Number(c.cotizacion),
    cae: c.cae,
    cae_vencimiento: c.cae_vencimiento,
    modalidad: c.modalidad,
    autorizado_en: c.creado_en,
    creado_en: c.creado_en,
    impresiones: c.impresiones,
    lineas: lineas
      .sort((a, b) => a.orden - b.orden)
      .map((l) => ({
        orden: l.orden,
        codigo_producto: l.codigo_producto,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio_unitario),
        importe: Number(l.cantidad) * Number(l.precio_unitario),
        alicuota_iva_id: l.alicuota_iva_id,
      })),
    alicuotas: alicuotas.map((a) => ({
      alicuota_iva_id: a.alicuota_iva_id,
      base_imponible: Number(a.base_imponible),
      importe: Number(a.importe),
      porcentaje: porcentaje.get(a.alicuota_iva_id) ?? 0,
    })),
    tributos: tributos.map((t) => ({
      descripcion: t.descripcion,
      base_imponible: Number(t.base_imponible),
      alicuota: Number(t.alicuota),
      importe: Number(t.importe),
    })),
    emisor,
  }
}

/*
  Los que se emitieron acá y todavía no llegaron al servidor.

  Es lo que hay que poder mirar después de un corte: qué se entregó
  mientras no había internet, para reimprimir si el cliente lo pide y
  para saber que todavía falta que suban.
*/
export async function comprobantesDelCorte(): Promise<ComprobanteCompleto[]> {
  const guardados = await db.comprobante.where('estado').equals('contingencia').toArray()
  const completos = await Promise.all(guardados.map((g) => obtenerComprobanteLocal(g.id)))
  return completos
    .filter((c): c is ComprobanteCompleto => c !== null)
    .sort((a, b) => b.creado_en.localeCompare(a.creado_en))
}

/** Cuáles de los emitidos acá todavía no llegaron al servidor. */
export async function faltanSubir(): Promise<Set<string>> {
  const guardados = await db.comprobante.where('estado').equals('contingencia').toArray()
  return new Set(guardados.filter((c) => !c.subido_en).map((c) => c.id))
}
