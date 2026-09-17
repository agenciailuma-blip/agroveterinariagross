import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { Cifrado, Guardado } from '@/lib/local/cifrado'

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

/** El cliente como queda en disco: nombre, documento y búsqueda, cifrados. */
export type ClienteGuardado = Guardado<ClienteLocal, 'nombre' | 'numero_documento' | 'busqueda'>

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

/*
  Saldo de cuenta corriente.

  Es lo único que hace falta para decidir, sin conexión, si una venta
  financiada entra dentro del límite de crédito del cliente. Los
  movimientos que lo componen no se replican: la terminal no los
  necesita para cobrar, y son muchos.
*/
export interface SaldoCuentaCorrienteLocal {
  cliente_id: string
  saldo: number
  actualizado_en: string
}

/*
  ─────────────────────────────────────────────────────────────
  La cola de la caja

  Estas dos tablas son la excepción a la regla de "sólo datos maestros".
  La caja necesita ver las ventas que esperan cobro, y esas ventas las
  generan otras terminales: sin una copia local, cortar internet deja a
  la caja con la pantalla vacía aunque haya gente esperando para pagar.

  Se replican sólo mientras están en cola. Cuando una venta se cobra o
  se anula desaparece de acá: no es un histórico, es una bandeja de
  entrada.

  ⚠️ Alcance real de esto: como la sincronización pasa por el servidor,
  sin internet la caja sólo ve las ventas que alcanzó a bajar ANTES del
  corte. Una venta armada por un vendedor durante la caída no tiene
  camino para llegar hasta que vuelva la conexión.
  ─────────────────────────────────────────────────────────────
*/
export interface VentaLocal {
  id: string
  codigo: string
  estado: string
  cliente_id: string
  vendedor_id: string | null
  total: number
  descuento_total: number
  lista_precio_id: string | null
  /*
    Recargo del plan de cuotas, ya incluido en los precios de las líneas.

    Opcional por lo mismo que `nombre_para_llamar`: las ventas guardadas
    antes de esta versión no lo tienen y Dexie no migra filas viejas.
    Leerlo como `?? 0` es correcto para las dos.
  */
  recargo_porcentaje?: number
  /** Lo que el vendedor ya le preguntó al cliente, para no repetirlo. */
  medio_pago_previsto_id: string | null
  cuotas_previstas: number | null
  observaciones: string | null
  /*
    Cómo llamarlo en la caja. Lo escribe el vendedor al enviar.

    Opcional a propósito: las ventas que ya estaban guardadas en una
    terminal antes de esta versión no tienen el campo, y Dexie no
    migra filas viejas. Leerlo como `?? null` es correcto para las dos.
  */
  nombre_para_llamar?: string | null
  ocurrido_en: string
  enviada_caja_en: string | null
  actualizado_en: string
}

/*
  Los comprobantes que numera Gross, guardados en la terminal.

  Están acá por una sola razón: el remito sale a la calle. Si se emite
  con internet cortado, el papel tiene que poder imprimirse igual, y
  para eso el documento tiene que existir en esta máquina y no sólo en
  la bandeja de salida.
*/
/** La venta de la cola como queda en disco. */
export type VentaGuardada = Guardado<VentaLocal, 'nombre_para_llamar' | 'observaciones'>

export interface NoFiscalLocal {
  id: string
  tipo_clave: string
  serie: string
  numero: number
  /*
    Anulable desde el 09/09: un remito puede nacer sin venta.

    Es el caso que trajo Lucas —documentar mercadería que todavía no
    entró al local, para la municipalidad o un pedido especial—, y por
    eso `comprobante_no_fiscal.venta_id` fue anulable desde el
    principio del lado del servidor.
  */
  venta_id: string | null
  fecha: string
  estado: string
  receptor_nombre: string
  receptor_documento: string | null
  receptor_documento_sigla: string
  receptor_condicion: string
  receptor_domicilio: string | null
  total: number
  observaciones: string | null
  valido_hasta: string | null
  entrega_domicilio: string | null
  entrega_localidad: string | null
  entrega_contacto: string | null
  transportista: string | null
  /*
    Sólo el remito. En false documenta un compromiso —mercadería que
    todavía no entró— y no toca el inventario. Se guarda acá para que
    el papel lo pueda decir sin preguntarle al servidor.
  */
  descuenta_stock?: boolean
  venta_codigo: string | null
  creado_en: string
}

/** El remito o presupuesto como queda en disco: todo lo del receptor y la entrega, cifrado. */
export type NoFiscalGuardado = Guardado<
  NoFiscalLocal,
  | 'receptor_nombre'
  | 'receptor_documento'
  | 'receptor_domicilio'
  | 'observaciones'
  | 'entrega_domicilio'
  | 'entrega_localidad'
  | 'entrega_contacto'
  | 'transportista'
>

export interface NoFiscalLineaLocal {
  id: string
  comprobante_no_fiscal_id: string
  orden: number
  /** Nulo en una línea libre: no es un producto del catálogo. */
  producto_id?: string | null
  codigo_producto: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  importe: number
}

export interface VentaLineaLocal {
  id: string
  venta_id: string
  orden: number
  producto_id: string | null
  codigo_producto: string
  descripcion: string
  cantidad: number
  precio_original: number
  precio_acordado: number
  precio_unitario: number
  motivo_modificacion: string | null
  alicuota_iva_id: number
  condicion_iva: string
  actualizado_en: string
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

/*
  Lo que la base local necesita saber de su propio cifrado.

  Hoy es una sola fila, el testigo: una palabra conocida cifrada con la
  llave de estos datos. Ver `cifrado.ts`.
*/
export interface SeguridadLocal {
  clave: string
  valor: Cifrado
}

export type EstadoOperacion = 'pendiente' | 'enviando' | 'error'

/** La operación con sus datos a la vista: en memoria y viajando por la red del local. */
export type OperacionAbierta = Omit<OperacionPendiente, 'datos'> & { datos: Record<string, unknown> }

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
  /*
    Cifrado entero: una venta o un remito pendiente lleva el nombre, el
    documento y a veces el domicilio del cliente. Se abre recién para
    mandarlo al servidor o a la caja.
  */
  datos: Cifrado
  descripcion: string
  creado_en: string
  intentos: number
  ultimo_error: string | null
  estado: EstadoOperacion
  /*
    Cuándo se le entregó al punto de encuentro del local.

    No reemplaza a la subida a Supabase: la operación sigue en la cola
    hasta que llega al servidor. Esto sólo evita volver a mandarle lo
    mismo a la caja en cada vuelta.

    Va sin índice a propósito, así no hace falta subir la versión de la
    base local — y una versión nueva en una terminal desconectada es
    justo lo que no conviene el día de la instalación.
  */
  entregado_en?: string | null
}

class BaseLocal extends Dexie {
  producto!: EntityTable<ProductoLocal, 'id'>
  codigo_barra!: EntityTable<CodigoBarraLocal, 'id'>
  saldo!: EntityTable<SaldoLocal, 'producto_id'>
  umbral!: EntityTable<UmbralLocal, 'id'>
  cliente!: EntityTable<ClienteGuardado, 'id'>
  saldo_cuenta_corriente!: EntityTable<SaldoCuentaCorrienteLocal, 'cliente_id'>
  venta!: EntityTable<VentaGuardada, 'id'>
  venta_linea!: EntityTable<VentaLineaLocal, 'id'>
  lista_precio!: EntityTable<ListaPrecioLocal, 'id'>
  medio_pago!: EntityTable<MedioPagoLocal, 'id'>
  cuota!: EntityTable<CuotaLocal, 'clave'>
  configuracion!: EntityTable<ConfiguracionLocal, 'clave'>
  referencia!: EntityTable<ReferenciaLocal, 'id'>
  cursor!: EntityTable<Cursor, 'tabla'>
  contador!: EntityTable<Contador, 'clave'>
  no_fiscal!: EntityTable<NoFiscalGuardado, 'id'>
  no_fiscal_linea!: EntityTable<NoFiscalLineaLocal, 'id'>
  outbox!: EntityTable<OperacionPendiente, 'id'>
  seguridad!: EntityTable<SeguridadLocal, 'clave'>

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

    // v3 — lo que la caja necesita para cobrar sin conexión
    this.version(3).stores({
      saldo_cuenta_corriente: 'cliente_id, actualizado_en',
      venta: 'id, codigo, estado, cliente_id, enviada_caja_en, actualizado_en',
      venta_linea: 'id, venta_id, orden, actualizado_en',
    })

    // v4 — el remito y el presupuesto se emiten sin conexión, así que el
    // papel tiene que poder imprimirse desde esta máquina.
    this.version(4).stores({
      no_fiscal: 'id, tipo_clave, venta_id, creado_en',
      no_fiscal_linea: 'id, comprobante_no_fiscal_id, orden',
    })

    /*
      v5 — el testigo del cifrado.

      Se evitaba subir la versión, y la razón sigue en pie: una terminal
      con otra ventana abierta en la versión vieja se queda esperando.
      Esta vez no hay forma de evitarlo —el testigo tiene que vivir con los
      datos— y se hace de la manera más inofensiva posible: sólo se crea
      una tabla vacía. No hay función de actualización que transforme
      filas al abrir; los datos que quedaron en claro los cifra después,
      de a poco y sin apuro, `cifrarLoQueQuedoEnClaro`. Si esa ventana
      vieja traba la apertura, el aviso de `blocked` ya lo dice.
    */
    this.version(5).stores({
      seguridad: 'clave',
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
