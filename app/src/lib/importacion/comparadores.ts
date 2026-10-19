import type { Campo } from '@/lib/importacion/planilla'
import type { CampoCliente } from '@/lib/importacion/definiciones'
import {
  importe,
  mostrarNumero,
  mostrarPesos,
  siNo,
  texto,
  type Comparador,
  type Indice,
  type Registro,
} from '@/lib/importacion/comparar'

/*
  Cómo se compara cada planilla con lo que ya está.

  Los datos se agrupan como los piensa quien importa —«el precio», «la
  categoría»—, no como columnas: las cuatro de la categoría son una
  sola cosa, y elegir actualizar el rubro sin el subrubro dejaría el
  producto colgado de una rama que no existe.
*/

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

/** Sin acentos ni mayúsculas: así compara la base las categorías y las marcas. */
const comoNombre = (v: unknown): string | null => {
  const t = texto(v)
  return t === null ? null : t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const NIVELES: Campo[] = ['categoria', 'subrubro', 'grupo', 'subgrupo']

export const COMPARADOR_PRODUCTOS: Comparador<Campo> = {
  claves: ['codigo'],
  nombre: (r) => `${r.codigo} · ${r.nombre_interno}`,
  indexar: (registros) => {
    const i: Indice = new Map()
    for (const r of registros) i.set(String(r.codigo).toUpperCase(), r)
    return i
  },
  buscar: (d, i) => (d.codigo ? (i.get(d.codigo.toUpperCase()) ?? null) : null),
  grupos: [
    {
      id: 'nombre', etiqueta: 'Nombre', campos: ['nombre_interno'],
      actual: (r) => texto(r.nombre_interno), nuevo: (d) => texto(d.nombre_interno),
    },
    {
      id: 'nombre_publico', etiqueta: 'Nombre público', campos: ['nombre_publico'],
      actual: (r) => texto(r.nombre_publico), nuevo: (d) => texto(d.nombre_publico),
    },
    {
      id: 'precio', etiqueta: 'Precio de venta', campos: ['precio_venta'],
      actual: (r) => importe(r.precio_venta), nuevo: (d) => importe(d.precio_venta), mostrar: mostrarPesos,
    },
    {
      id: 'costo', etiqueta: 'Costo', campos: ['costo'],
      actual: (r) => importe(r.costo), nuevo: (d) => importe(d.costo), mostrar: mostrarPesos,
    },
    {
      id: 'iva', etiqueta: 'IVA', campos: ['alicuota_porcentaje'],
      actual: (r) => {
        const a = uno(r.alicuota as { porcentaje: number } | null)
        return a ? String(Number(a.porcentaje)) : null
      },
      nuevo: (d) => (d.alicuota_porcentaje ? String(Number(d.alicuota_porcentaje)) : null),
      mostrar: (v) => `${v.replace('.', ',')} %`,
    },
    {
      id: 'categoria', etiqueta: 'Rubro y subrubros', campos: NIVELES,
      // Se compara la última rama, que es la que queda puesta en el producto.
      actual: (r) => comoNombre(uno(r.categoria as { nombre: string } | null)?.nombre),
      nuevo: (d) => comoNombre([...NIVELES].reverse().map((n) => d[n]).find((v) => texto(v))),
    },
    {
      id: 'marca', etiqueta: 'Marca', campos: ['marca'],
      actual: (r) => comoNombre(uno(r.marca as { nombre: string } | null)?.nombre), nuevo: (d) => comoNombre(d.marca),
    },
    {
      id: 'unidad', etiqueta: 'Unidad', campos: ['unidad_medida'],
      actual: (r) => comoNombre(r.unidad_medida), nuevo: (d) => comoNombre(d.unidad_medida),
    },
    {
      id: 'veterinario', etiqueta: 'Es veterinario', campos: ['es_veterinario'],
      actual: (r) => siNo(r.es_producto_veterinario), nuevo: (d) => siNo(d.es_veterinario),
    },
    {
      id: 'receta', etiqueta: 'Requiere receta', campos: ['requiere_receta'],
      actual: (r) => siNo(r.requiere_receta), nuevo: (d) => siNo(d.requiere_receta),
    },
    {
      id: 'fitosanitario', etiqueta: 'Es fitosanitario', campos: ['es_fitosanitario'],
      actual: (r) => siNo(r.es_fitosanitario), nuevo: (d) => siNo(d.es_fitosanitario),
    },
    {
      id: 'peso', etiqueta: 'Peso', campos: ['peso_kg'],
      actual: (r) => importe(r.peso_kg), nuevo: (d) => importe(d.peso_kg), mostrar: (v) => `${mostrarNumero(v)} kg`,
    },
    {
      id: 'bulto', etiqueta: 'Unidades por bulto', campos: ['unidades_por_bulto'],
      actual: (r) => importe(r.unidades_por_bulto), nuevo: (d) => importe(d.unidades_por_bulto), mostrar: mostrarNumero,
    },
    // Estos viven en otras tablas: no se comparan, se mandan si se eligen.
    { id: 'codigo_barra', etiqueta: 'Código de barra (se agrega)', campos: ['codigo_barra'] },
    { id: 'aviso', etiqueta: 'Aviso de stock', campos: ['stock_bajo', 'stock_critico'] },
    { id: 'suelta', etiqueta: 'De qué envase sale', campos: ['sale_de', 'cantidad_por_envase'] },
  ],
}

/*
  La condición frente al IVA, como la entiende la base
  (app.condicion_iva_desde_texto). Hace falta acá para no decir que
  cambia un cliente que dice «Monotributista» en la planilla y
  «Monotributo» en el sistema: es lo mismo.
*/
export function condicionDesdeTexto(v: string | undefined): number | null {
  if (!v) return null
  const t = v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (!t) return null
  if (['ri', 'r i', 'resp insc'].includes(t) || t.includes('inscripto')) return 1
  if (t.includes('monotributista social') || t.includes('monotributo social')) return 13
  if (t.includes('monotrib') || ['mt', 'rm', 'm'].includes(t)) return 6
  if (t.includes('no alcanzado')) return 15
  if (t.includes('exento') || t === 'ex') return 4
  if (t.includes('no categorizado')) return 7
  if (t.includes('consumidor') || ['cf', 'c f', 'final'].includes(t)) return 5
  return null
}

const CONDICIONES: Record<string, string> = {
  1: 'Responsable Inscripto',
  4: 'Exento',
  5: 'Consumidor Final',
  6: 'Monotributo',
  7: 'No categorizado',
  13: 'Monotributo social',
  15: 'No alcanzado',
}

const digitos = (v: unknown) => (v === null || v === undefined ? null : String(v).replace(/\D/g, '') || null)

export const COMPARADOR_CLIENTES: Comparador<CampoCliente> = {
  // El documento viaja siempre: es con lo que la base lo encuentra si no tiene código.
  claves: ['codigo', 'documento'],
  nombre: (r) => `${r.codigo ?? r.numero_documento ?? ''} · ${r.nombre}`,
  indexar: (registros) => {
    const i: Indice = new Map()
    for (const r of registros) {
      if (r.codigo) i.set(`c:${String(r.codigo).toUpperCase()}`, r)
      if (r.numero_documento) i.set(`d:${r.numero_documento}`, r)
    }
    return i
  },
  /*
    Igual que la base: primero por código; si no, por CUIT o DNI. Pero
    un cliente con el mismo CUIT y OTRO código no es éste: la base frena
    la fila, así que acá no se lo cuenta como «ya está».
  */
  buscar: (d, i) => {
    const porCodigo = d.codigo ? i.get(`c:${d.codigo.toUpperCase()}`) : undefined
    if (porCodigo) return porCodigo
    const doc = digitos(d.documento)
    const porDoc = doc ? i.get(`d:${doc}`) : undefined
    if (porDoc && d.codigo && porDoc.codigo && String(porDoc.codigo).toUpperCase() !== d.codigo.toUpperCase()) return null
    return porDoc ?? null
  },
  grupos: [
    { id: 'nombre', etiqueta: 'Nombre', campos: ['nombre'], actual: (r) => texto(r.nombre), nuevo: (d) => texto(d.nombre) },
    {
      id: 'condicion', etiqueta: 'Condición frente al IVA', campos: ['condicion_iva'],
      actual: (r) => (r.condicion_iva_id == null ? null : String(r.condicion_iva_id)),
      nuevo: (d) => {
        const c = condicionDesdeTexto(d.condicion_iva)
        return c === null ? null : String(c)
      },
      mostrar: (v) => CONDICIONES[v] ?? v,
    },
    {
      id: 'documento', etiqueta: 'CUIT o DNI', campos: ['documento'],
      actual: (r) => digitos(r.numero_documento), nuevo: (d) => digitos(d.documento),
    },
    { id: 'domicilio', etiqueta: 'Domicilio', campos: ['domicilio'], actual: (r) => texto(r.calle), nuevo: (d) => texto(d.domicilio) },
    { id: 'localidad', etiqueta: 'Localidad', campos: ['localidad'], actual: (r) => texto(r.localidad), nuevo: (d) => texto(d.localidad) },
    { id: 'provincia', etiqueta: 'Provincia', campos: ['provincia'], actual: (r) => texto(r.provincia), nuevo: (d) => texto(d.provincia) },
    {
      id: 'codigo_postal', etiqueta: 'Código postal', campos: ['codigo_postal'],
      actual: (r) => texto(r.codigo_postal), nuevo: (d) => texto(d.codigo_postal),
    },
    { id: 'telefono', etiqueta: 'Teléfono', campos: ['telefono'], actual: (r) => texto(r.telefono), nuevo: (d) => texto(d.telefono) },
    { id: 'email', etiqueta: 'Email', campos: ['email'], actual: (r) => texto(r.email), nuevo: (d) => texto(d.email) },
    {
      id: 'cuenta_corriente', etiqueta: 'Cuenta corriente', campos: ['cuenta_corriente'],
      actual: (r) => siNo(r.cuenta_corriente), nuevo: (d) => siNo(d.cuenta_corriente),
    },
    {
      id: 'limite', etiqueta: 'Límite de crédito', campos: ['limite_credito'],
      actual: (r) => importe(r.limite_credito), nuevo: (d) => importe(d.limite_credito), mostrar: mostrarPesos,
    },
    {
      id: 'dias', etiqueta: 'Días de plazo', campos: ['dias_vencimiento'],
      actual: (r) => importe(r.dias_vencimiento), nuevo: (d) => importe(d.dias_vencimiento), mostrar: mostrarNumero,
    },
    // El saldo lo deja igual al de la planilla la base, sin sumar: se manda si se elige.
    { id: 'saldo', etiqueta: 'Saldo de cuenta corriente', campos: ['saldo'] },
  ],
}

export type { Registro }
