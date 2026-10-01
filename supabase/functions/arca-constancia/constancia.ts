// ═══════════════════════════════════════════════════════════════
// Lo que ARCA dice de un CUIT, en los términos del sistema
//
// Separado de la puerta (index.ts) porque es la parte que puede
// equivocarse en silencio: una condición frente al IVA mal leída es una
// Factura B a un responsable inscripto, o una A a un monotributista, y
// ARCA la autoriza igual. Sin Deno ni red: se prueba desde la app.
// ═══════════════════════════════════════════════════════════════

/** Los códigos de condición frente al IVA del receptor, los de ARCA (tabla condicion_iva_receptor). */
export const CONDICION = {
  responsableInscripto: 1,
  exento: 4,
  consumidorFinal: 5,
  monotributo: 6,
  monotributoSocial: 13,
  noAlcanzado: 15,
} as const

/*
  Los impuestos de la constancia que deciden la condición.

  Son los códigos del padrón de ARCA, no del sistema. Un CUIT puede
  tener muchos impuestos (ganancias, bienes personales…); sólo estos
  dicen qué factura le corresponde.
*/
const IMPUESTO = {
  monotributo: 20,
  monotributoSocial: 21,
  iva: 30,
  ivaExento: 32,
  ivaNoAlcanzado: 34,
} as const

export interface DatosDeArca {
  cuit: string
  tipo_persona: 'fisica' | 'juridica'
  nombre: string
  /** null cuando ARCA no la informa: la decide una persona. */
  condicion_iva_id: number | null
  calle: string | null
  numero: string | null
  localidad: string | null
  provincia: string | null
  codigo_postal: string | null
  /** Lo que conviene que vea quien carga: CUIT inactiva, constancia con observaciones. */
  avisos: string[]
}

export type Constancia =
  | { encontrado: true; datos: DatosDeArca }
  | { encontrado: false; motivo: string }

/** CUIT con su dígito verificador correcto. Acepta guiones y espacios. */
export function cuitValido(texto: string): boolean {
  const d = texto.replace(/\D/g, '')
  if (d.length !== 11) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0)
  const resto = 11 - (suma % 11)
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto
  return verificador === Number(d[10])
}

// ── Lectura del XML ──
//
// La respuesta es SOAP con un esquema fijo y sin atributos que importen.
// Alcanza con buscar etiquetas por nombre, sin el prefijo del espacio de
// nombres, que ARCA cambia entre servicios.

function bloques(xml: string, etiqueta: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${etiqueta}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${etiqueta}>`, 'g')
  return [...xml.matchAll(re)].map((m) => m[1])
}

function valor(xml: string, etiqueta: string): string | null {
  const b = bloques(xml, etiqueta)[0]
  if (b === undefined) return null
  const limpio = desescapar(b).trim()
  return limpio === '' ? null : limpio
}

function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function idsDeImpuestos(xml: string | undefined): number[] {
  if (!xml) return []
  return bloques(xml, 'impuesto')
    .map((b) => Number(valor(b, 'idImpuesto')))
    .filter((n) => Number.isFinite(n))
}

/*
  La condición frente al IVA, a partir de los impuestos inscriptos.

  El monotributo va primero: un monotributista no está inscripto en IVA,
  pero si un padrón viejo trajera los dos, la factura que corresponde es
  la B del monotributo. Sin ninguno de estos impuestos, el CUIT existe
  pero no factura IVA —un empleado, un jubilado—: es consumidor final.
*/
export function condicionSegunImpuestos(regimenGeneral: number[], monotributo: number[]): number {
  const todos = new Set([...regimenGeneral, ...monotributo])
  if (todos.has(IMPUESTO.monotributoSocial)) return CONDICION.monotributoSocial
  if (todos.has(IMPUESTO.monotributo)) return CONDICION.monotributo
  if (todos.has(IMPUESTO.iva)) return CONDICION.responsableInscripto
  if (todos.has(IMPUESTO.ivaExento)) return CONDICION.exento
  if (todos.has(IMPUESTO.ivaNoAlcanzado)) return CONDICION.noAlcanzado
  return CONDICION.consumidorFinal
}

/*
  «AV LIBERTAD 1234» → calle y número.

  ARCA manda la dirección en un solo texto. Se separa el número sólo si
  está al final y es claramente un número de puerta; si no, va todo a
  la calle y no se inventa nada.
*/
export function separarDireccion(direccion: string | null): { calle: string | null; numero: string | null } {
  if (!direccion) return { calle: null, numero: null }
  const m = direccion.trim().match(/^(.*\S)\s+(\d{1,6}[A-Z]?)$/i)
  if (m) return { calle: m[1], numero: m[2] }
  return { calle: direccion.trim(), numero: null }
}

/** Interpreta la respuesta de getPersona_v2 (Consulta de Constancia de Inscripción). */
export function interpretarConstancia(xml: string, cuitPedido: string): Constancia {
  const falla = valor(xml, 'faultstring')
  if (falla) {
    return { encontrado: false, motivo: falla }
  }

  const persona = bloques(xml, 'personaReturn')[0]
  if (persona === undefined) {
    return { encontrado: false, motivo: 'ARCA contestó algo que no se entiende.' }
  }

  const generales = bloques(persona, 'datosGenerales')[0]
  const errorConstancia = bloques(persona, 'errorConstancia')[0]
  const avisos: string[] = []

  /*
    Sin datos generales pero con error de constancia: ARCA conoce el
    CUIT pero no emite su constancia —le falta el domicilio fiscal, por
    ejemplo—. Trae el nombre, no los impuestos: la condición no se puede
    deducir y la elige una persona.
  */
  if (generales === undefined) {
    if (errorConstancia === undefined) {
      return { encontrado: false, motivo: 'ARCA no tiene datos de ese CUIT.' }
    }
    const nombre = nombreDe(errorConstancia)
    if (!nombre) return { encontrado: false, motivo: mensajesDeError(errorConstancia) || 'ARCA no tiene datos de ese CUIT.' }
    return {
      encontrado: true,
      datos: {
        cuit: cuitPedido,
        tipo_persona: valor(errorConstancia, 'razonSocial') ? 'juridica' : 'fisica',
        nombre,
        condicion_iva_id: null,
        calle: null,
        numero: null,
        localidad: null,
        provincia: null,
        codigo_postal: null,
        avisos: [
          `ARCA no emite la constancia de este CUIT${mensajesDeError(errorConstancia) ? `: ${mensajesDeError(errorConstancia)}` : ''}. La condición frente al IVA hay que elegirla a mano.`,
        ],
      },
    }
  }

  if (errorConstancia !== undefined) {
    const m = mensajesDeError(errorConstancia)
    if (m) avisos.push(`ARCA observa la constancia: ${m}`)
  }

  const estado = valor(generales, 'estadoClave')
  if (estado && estado.toUpperCase() !== 'ACTIVO') {
    avisos.push(`El CUIT figura ${estado.toLowerCase()} en ARCA.`)
  }

  const regimen = bloques(persona, 'datosRegimenGeneral')[0]
  const monotributo = bloques(persona, 'datosMonotributo')[0]
  const domicilio = bloques(generales, 'domicilioFiscal')[0]
  const { calle, numero } = separarDireccion(domicilio ? valor(domicilio, 'direccion') : null)

  return {
    encontrado: true,
    datos: {
      cuit: valor(generales, 'idPersona') ?? cuitPedido,
      tipo_persona: (valor(generales, 'tipoPersona') ?? '').toUpperCase() === 'JURIDICA' ? 'juridica' : 'fisica',
      nombre: nombreDe(generales) ?? '',
      condicion_iva_id: condicionSegunImpuestos(idsDeImpuestos(regimen), idsDeImpuestos(monotributo)),
      calle,
      numero,
      localidad: domicilio ? valor(domicilio, 'localidad') : null,
      provincia: domicilio ? valor(domicilio, 'descripcionProvincia') : null,
      codigo_postal: domicilio ? valor(domicilio, 'codPostal') : null,
      avisos,
    },
  }
}

function nombreDe(xml: string): string | null {
  const razon = valor(xml, 'razonSocial')
  if (razon) return razon
  const apellido = valor(xml, 'apellido')
  const nombre = valor(xml, 'nombre')
  const junto = [apellido, nombre].filter(Boolean).join(' ')
  return junto || null
}

function mensajesDeError(xml: string): string {
  return bloques(xml, 'error')
    .map((e) => desescapar(e).trim())
    .filter(Boolean)
    .join(' · ')
}
