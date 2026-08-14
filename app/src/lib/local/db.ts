import Dexie from 'dexie'
import type { EntityTable } from 'dexie'

/*
  ─────────────────────────────────────────────────────────────
  Base local de la terminal

  Vive en IndexedDB, dentro del navegador de cada máquina. No es una
  copia completa del sistema: sólo lo que el mostrador necesita para
  seguir vendiendo cuando se corta internet.

  Se replican DATOS MAESTROS (productos, precios, clientes) porque se
  editan en la oficina y la terminal sólo los lee. Los HECHOS que genera
  el mostrador —ventas, movimientos— viajan al revés, por la bandeja de
  salida.

  Con 2.261 productos esto ocupa unos pocos megabytes. No hace falta
  SQLite ni nada más pesado: IndexedDB alcanza y sobra, y no exige
  cabeceras especiales del servidor.
  ─────────────────────────────────────────────────────────────
*/

export interface ProductoLocal {
  id: string
  codigo: string
  nombre_interno: string
  nombre_publico: string | null
  precio_venta: number
  costo: number | null
  margen_sobre_costo: number | null
  unidad_medida: string
  alicuota_iva_id: number
  condicion_iva: string
  categoria_id: string | null
  marca_id: string | null
  activo: boolean
  revisado_en: string | null
  actualizado_en: string
  eliminado_en: string | null
  /** Se calcula al guardar, para poder buscar sin acentos ni mayúsculas. */
  busqueda: string
}

export interface CodigoBarraLocal {
  id: string
  producto_id: string
  codigo: string
  eliminado_en: string | null
  actualizado_en: string
}

export interface SaldoLocal {
  producto_id: string
  cantidad: number
  actualizado_en: string
}

export interface UmbralLocal {
  id: string
  ambito: string
  producto_id: string | null
  categoria_id: string | null
  bajo: number
  critico: number
  actualizado_en: string
}

export interface ClienteLocal {
  id: string
  codigo: string | null
  nombre: string
  numero_documento: string | null
  condicion_iva_id: number
  descuento_porcentaje: number
  lista_precio_id: string | null
  cuenta_corriente: boolean
  limite_credito: number | null
  dias_vencimiento: number
  activo: boolean
  actualizado_en: string
  eliminado_en: string | null
  busqueda: string
}

export interface ListaPrecioLocal {
  id: string
  nombre: string
  ajuste_porcentaje: number
  es_predeterminada: boolean
  activo: boolean
  actualizado_en: string
  eliminado_en: string | null
}

export interface MedioPagoLocal {
  id: string
  nombre: string
  tipo: string
  lista_precio_id: string | null
  admite_cuotas: boolean
  cuotas_maximas: number
  afecta_caja: boolean
  orden: number
  activo: boolean
  actualizado_en: string
  eliminado_en: string | null
}

export interface CuotaLocal {
  clave: string // medio_pago_id + '-' + cuotas
  medio_pago_id: string
  cuotas: number
  recargo_porcentaje: number
  activo: boolean
  actualizado_en: string
}

export interface ConfiguracionLocal {
  clave: string
  valor: unknown
  actualizado_en: string
}

export interface ReferenciaLocal {
  id: string
  tipo: string // categoria | marca | presentacion | animal | etapa_vida
  nombre: string
  actualizado_en: string
  eliminado_en: string | null
}

/** Marca hasta dónde se sincronizó cada tabla. */
export interface Cursor {
  tabla: string
  cursor: string
  sincronizado_en: string
}

/*
  Contadores propios de la terminal, separados de configuracion porque
  esa tabla se pisa entera con lo que baja del servidor. Un contador de
  numeración que se borra en una sincronización hace que la terminal
  repita números de venta, y eso rompe la restricción de unicidad.
*/
export interface Contador {
  clave: string
  valor: number
  actualizado_en: string
}

export type EstadoOperacion = 'pendiente' | 'enviando' | 'error'

/*
  Bandeja de salida.

  Todo lo que la terminal genera pasa por acá antes de llegar al
  servidor, esté o no haya conexión. Que sea siempre el mismo camino es
  lo que hace que el modo sin conexión no sea un caso especial lleno de
  bifurcaciones: es el camino normal, que a veces tarda más.

  El orden importa: una línea de venta no puede subir antes que su
  cabecera. Por eso se procesa en el orden en que se creó.
*/
export interface OperacionPendiente {
  id: string
  /** Agrupa operaciones que tienen que subir juntas y en orden. */
  lote: string
  orden: number
  tipo: 'insert' | 'rpc'
  tabla: string
  datos: Record<string, unknown>
  descripcion: string
  creado_en: string
  intentos: number
  ultimo_error: string | null
  estado: EstadoOperacion
}

class BaseLocal extends Dexie {
  producto!: EntityTable<ProductoLocal, 'id'>
  codigo_barra!: EntityTable<CodigoBarraLocal, 'id'>
  saldo!: EntityTable<SaldoLocal, 'producto_id'>
  umbral!: EntityTable<UmbralLocal, 'id'>
  cliente!: EntityTable<ClienteLocal, 'id'>
  lista_precio!: EntityTable<ListaPrecioLocal, 'id'>
  medio_pago!: EntityTable<MedioPagoLocal, 'id'>
  cuota!: EntityTable<CuotaLocal, 'clave'>
  configuracion!: EntityTable<ConfiguracionLocal, 'clave'>
  referencia!: EntityTable<ReferenciaLocal, 'id'>
  cursor!: EntityTable<Cursor, 'tabla'>
  contador!: EntityTable<Contador, 'clave'>
  outbox!: EntityTable<OperacionPendiente, 'id'>

  constructor() {
    super('gross')
    this.version(1).stores({
      producto: 'id, codigo, activo, actualizado_en',
      codigo_barra: 'id, codigo, producto_id, actualizado_en',
      saldo: 'producto_id, actualizado_en',
      umbral: 'id, producto_id, categoria_id, actualizado_en',
      cliente: 'id, codigo, cuenta_corriente, actualizado_en',
      lista_precio: 'id, es_predeterminada, actualizado_en',
      medio_pago: 'id, orden, actualizado_en',
      cuota: 'clave, medio_pago_id, actualizado_en',
      configuracion: 'clave, actualizado_en',
      referencia: 'id, tipo, actualizado_en',
      cursor: 'tabla',
      outbox: 'id, lote, estado, creado_en, [lote+orden]',
    })

    this.version(2).stores({
      contador: 'clave',
    })
  }
}

export const db = new BaseLocal()

/*
  IndexedDB se queda esperando en silencio cuando otra pestaña tiene la
  base abierta con una versión anterior del esquema. No falla: espera. Y
  como todas las operaciones quedan encoladas detrás de esa apertura, la
  pantalla se congela sin decir nada — que es exactamente el peor modo
  de fallar para alguien que está atendiendo.

  Estos avisos convierten ese cuelgue mudo en un mensaje concreto.
*/
export let bloqueoBaseLocal: string | null = null

db.on('blocked', () => {
  bloqueoBaseLocal =
    'La base local está bloqueada por otra pestaña del sistema abierta con una versión anterior. Cerrá las demás pestañas y recargá esta.'
  console.error(`[base local] ${bloqueoBaseLocal}`)
})

db.on('versionchange', () => {
  // Otra pestaña quiere actualizar el esquema: hay que soltar la base o
  // la bloqueamos nosotros.
  db.close()
  bloqueoBaseLocal =
    'Otra pestaña actualizó el sistema. Recargá esta pantalla para seguir trabajando.'
  console.warn(`[base local] ${bloqueoBaseLocal}`)
})

/** Normaliza para buscar: sin acentos, sin mayúsculas. */
export function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export async function vaciarBaseLocal() {
  await Promise.all([
    db.producto.clear(),
    db.codigo_barra.clear(),
    db.saldo.clear(),
    db.umbral.clear(),
    db.cliente.clear(),
    db.lista_precio.clear(),
    db.medio_pago.clear(),
    db.cuota.clear(),
    db.configuracion.clear(),
    db.referencia.clear(),
    db.cursor.clear(),
  ])
  // La bandeja de salida NO se toca: puede haber ventas sin subir.
}
