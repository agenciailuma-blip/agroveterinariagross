import type { ComprobanteCompleto } from '@/lib/api/comprobante'
import { fechaCorta, horaDe, presentacionDe } from '@/lib/comprobante/presentacion'
import { moneda, numero } from '@/lib/tipos'

/*
  El ticket, en el idioma que entiende la impresora del mostrador.

  Una impresora térmica no recibe HTML: recibe bytes con comandos
  intercalados —ESC/POS— que le dicen dónde centrar, dónde poner
  negrita, cómo dibujar el QR y dónde cortar el papel.

  Los importes salen de presentacionDe(), el mismo lugar del que salen
  los del ticket en pantalla y los de la hoja A4. Si cada formato los
  calculara por su lado, el día que se toque uno los tres dejarían de
  coincidir, y serían tres versiones del mismo comprobante con números
  distintos.

  Lo único que cambia acá es la forma, no los números.
*/

/** Caracteres que entran a lo ancho en un rollo de 80 mm, fuente A. */
const ANCHO = 48

const ESC = 0x1b
const GS = 0x1d

/*
  La cinta de bytes. Se exporta para que el ticket no fiscal la use sin
  volver a escribirla: lo que comparten es la forma de hablarle a la
  impresora, no los datos que le mandan.
*/
export class Cinta {
  private partes: number[] = []
  private codificador = new TextEncoder()

  crudo(...bytes: number[]) {
    this.partes.push(...bytes)
    return this
  }

  /*
    El texto va en latin1 y no en UTF-8: es lo que entienden estas
    impresoras. Con UTF-8, cada acento sale como dos símbolos raros, y
    "Bagó" se imprime "BagÃ³" en un comprobante fiscal.
  */
  texto(t: string) {
    for (const c of t) {
      const punto = c.codePointAt(0) ?? 63
      this.partes.push(punto < 256 ? punto : 63) // 63 = '?'
    }
    return this
  }

  linea(t = '') {
    return this.texto(t).crudo(0x0a)
  }

  /** 0 izquierda · 1 centro · 2 derecha */
  alinear(a: 0 | 1 | 2) {
    return this.crudo(ESC, 0x61, a)
  }

  negrita(si: boolean) {
    return this.crudo(ESC, 0x45, si ? 1 : 0)
  }

  /** Doble alto y ancho, para el total. */
  grande(si: boolean) {
    return this.crudo(GS, 0x21, si ? 0x11 : 0x00)
  }

  separador() {
    return this.linea('-'.repeat(ANCHO))
  }

  /*
    Dos columnas: la etiqueta a la izquierda y el importe pegado a la
    derecha. Es lo que hace que los números queden en una columna que se
    puede leer de un vistazo, en vez de desparramados.
  */
  columnas(izquierda: string, derecha: string) {
    const espacio = ANCHO - izquierda.length - derecha.length
    return this.linea(
      espacio > 0 ? izquierda + ' '.repeat(espacio) + derecha : `${izquierda} ${derecha}`,
    )
  }

  /*
    El QR de ARCA, dibujado por la propia impresora.

    Mandarlo como imagen sería mucho más lento y saldría borroso: la
    impresora tiene el generador adentro y lo imprime nítido, que es lo
    que importa cuando alguien lo escanea con el celular.
  */
  qr(url: string) {
    const datos = this.codificador.encode(url)
    const largo = datos.length + 3

    this.crudo(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00) // modelo 2
    this.crudo(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 6) // tamaño del punto
    this.crudo(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31) // corrección M
    this.crudo(GS, 0x28, 0x6b, largo & 0xff, (largo >> 8) & 0xff, 0x31, 0x50, 0x30)
    this.partes.push(...datos)
    this.crudo(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30) // imprimir
    return this
  }

  cortar() {
    // Se avanza el papel antes de cortar: si no, el corte cae sobre la
    // última línea y el total queda partido al medio.
    return this.crudo(0x0a, 0x0a, 0x0a, 0x0a).crudo(GS, 0x56, 0x42, 0x00)
  }

  bytes(): Uint8Array {
    return new Uint8Array(this.partes)
  }
}

/** Un ticket corto para verificar que la impresora contesta. */
export function ticketDePrueba(nombreComercio: string): Uint8Array {
  const c = new Cinta()
  c.crudo(ESC, 0x40) // reiniciar
  c.alinear(1).negrita(true).linea(nombreComercio).negrita(false)
  c.linea('Prueba de impresión').linea()
  c.alinear(0).separador()
  c.linea('Si estás leyendo esto, la impresora está')
  c.linea('bien configurada y el sistema le llega.')
  c.separador()
  c.linea(new Date().toLocaleString('es-AR'))
  c.cortar()
  return c.bytes()
}

export function ticketEscPos(comp: ComprobanteCompleto, urlQr: string | null): Uint8Array {
  const { esA, porcentajeDe, sinIva, codigo, identificado } = presentacionDe(comp)
  const e = comp.emisor
  const c = new Cinta()

  c.crudo(ESC, 0x40)

  // ── Emisor ──
  c.alinear(1).negrita(true).linea(e.razon_social).negrita(false)
  if (e.nombre_fantasia) c.linea(e.nombre_fantasia.toUpperCase())
  c.alinear(0)
  c.linea(`CUIT: ${e.cuit}`)
  c.linea(`Ingresos Brutos: ${e.ingresos_brutos || '-'}`)
  c.linea(`Domicilio: ${e.domicilio}`)
  c.linea(`Localidad: ${e.localidad}`)
  c.linea(`Inicio de Actividades: ${e.inicio_actividades || '-'}`)
  c.linea('IVA Responsable Inscripto')
  if (e.telefono) c.linea(`Teléfono: ${e.telefono}`)

  // ── Identificación ──
  c.separador()
  c.negrita(true)
  c.columnas(
    comp.tipo_descripcion.toUpperCase(),
    `${String(comp.punto_venta).padStart(4, '0')} ${String(comp.numero).padStart(8, '0')}`,
  )
  c.negrita(false)
  c.columnas(`COD. ${codigo}`, `Fecha ${fechaCorta(comp.fecha)}`)
  c.columnas('', `Hora ${horaDe(comp)}`)

  // ── Receptor ──
  c.separador()
  c.linea(`Cliente: ${comp.receptor_nombre}`)
  c.linea(`Domicilio: ${comp.receptor_domicilio || 'n/n'}`)
  c.linea(
    `${identificado ? comp.receptor_documento_sigla : 'CUIT/DNI'}: ${comp.receptor_documento || ''}`,
  )
  c.linea(`Condición de IVA: ${comp.receptor_condicion}`)

  // ── Detalle ──
  c.separador()
  if (esA) c.linea('Precios sin IVA')
  for (const l of comp.lineas) {
    c.linea(l.descripcion.slice(0, ANCHO))
    const unitario = moneda.format(sinIva(l.precio_unitario, l.alicuota_iva_id))
    const izq = `  ${numero.format(l.cantidad)} x ${unitario}${
      esA ? ` IVA ${porcentajeDe(l.alicuota_iva_id)}%` : ''
    }`
    c.columnas(izq, moneda.format(sinIva(l.importe, l.alicuota_iva_id)))
  }

  // ── Impuestos ──
  c.separador()
  if (esA) {
    c.columnas('Subtotal', moneda.format(comp.neto_gravado + comp.exento + comp.neto_no_gravado))
    if (comp.exento > 0) c.columnas('Importe exento', moneda.format(comp.exento))
    for (const a of comp.alicuotas) {
      c.columnas(`IVA ${a.porcentaje}%`, moneda.format(a.importe))
    }
  } else {
    c.linea('Régimen de transparencia fiscal al')
    c.linea('consumidor (Ley 27.743)')
    c.negrita(true).columnas('Alícuota IVA   Neto', 'IVA').negrita(false)
    for (const a of comp.alicuotas) {
      c.columnas(
        `${a.porcentaje.toFixed(2)} %   ${moneda.format(a.base_imponible)}`,
        moneda.format(a.importe),
      )
    }
  }
  for (const t of comp.tributos) {
    c.columnas(`${t.descripcion} ${t.alicuota}%`.slice(0, 32), moneda.format(t.importe))
  }

  // ── Total ──
  c.separador()
  c.negrita(true).grande(true)
  c.columnas('TOTAL:', moneda.format(comp.total))
  c.grande(false).negrita(false)

  // ── Autorización ──
  const etiqueta = comp.modalidad === 'caea' ? 'CAEA' : 'CAE'
  c.linea()
  c.linea(`${etiqueta} Nro: ${comp.cae ?? '-'}`)
  if (comp.cae_vencimiento) {
    c.linea(`Fecha Vencimiento de ${etiqueta}: ${fechaCorta(comp.cae_vencimiento)}`)
  }

  if (urlQr) {
    c.linea()
    c.alinear(1).qr(urlQr).alinear(0)
  }

  c.linea()
  c.alinear(1)
  c.linea('Esta Agencia no se responsabiliza por')
  c.linea('los datos ingresados en el detalle de')
  c.linea('la operación.')
  c.alinear(0)

  c.cortar()
  return c.bytes()
}
