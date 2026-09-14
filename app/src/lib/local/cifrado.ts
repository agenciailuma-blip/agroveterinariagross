import Dexie from 'dexie'
import { db } from '@/lib/local/db'
import type {
  ClienteGuardado,
  ClienteLocal,
  NoFiscalGuardado,
  NoFiscalLocal,
  VentaGuardada,
  VentaLocal,
} from '@/lib/local/db'
import { enEscritorio } from '@/lib/escritorio'

/*
  ─────────────────────────────────────────────────────────────
  Los datos personales de la base local, cifrados

  Comprometido en el alcance §1 y exigido por la Ley 25.326. Para vender
  sin internet, cada PC guarda nombre y documento de los clientes, y los
  remitos guardan además el domicilio de entrega y un contacto. Todo eso
  se guarda cifrado.

  ─── QUÉ PROTEGE, DICHO SIN VUELTAS ───

  Protege el caso en que alguien se lleva los archivos de la PC —la roban,
  sacan el disco, copian la carpeta del programa— y los abre en otra
  máquina: ve basura. No protege contra alguien sentado frente al sistema
  abierto; para eso están el usuario y los PIN.

  ─── QUÉ SE CIFRA Y QUÉ NO ───

  Se cifra lo que identifica a una persona: el nombre, el documento, el
  domicilio, el contacto, las observaciones que alguien pudo haber
  escrito, y la bandeja de operaciones pendientes entera. Lo que queda en
  claro —el límite de crédito, el saldo, los importes— está atado a un
  código interno que sin el nombre no dice de quién es.

  Y no se cifra nada por lo que se busque con un índice: la base no
  podría encontrarlo. Los clientes se buscan por nombre, pero recorriendo
  la lista en memoria, así que su nombre sí puede ir cifrado.

  ─── LA LLAVE ───

  En el programa instalado la guarda Windows, atada a la cuenta de
  usuario de esta PC (ver `llave_local.rs`). Copiada la carpeta a otra
  máquina, la llave no viaja.

  En el navegador de la oficina no hay Windows a mano: la llave la guarda
  el propio navegador, como una llave que ni la aplicación puede leer.
  Es más débil —quien copie el perfil entero del navegador se la lleva— y
  se acepta así porque la oficina no es donde se trabaja sin conexión.

  ─── LA TRAMPA DE INDEXEDDB QUE HAY QUE RESPETAR ───

  Cifrar es asíncrono y no es una operación de la base. Si se espera
  adentro de una transacción de Dexie, la transacción se cierra sola y la
  escritura falla. Por eso se cifra siempre ANTES de abrir la
  transacción, y adentro sólo se escribe.
  ─────────────────────────────────────────────────────────────
*/

/** Un dato cifrado, tal como queda guardado. */
export interface Cifrado {
  readonly c1: string
}

/*
  Guardado como objeto y no como texto a propósito.

  Con un texto, el tipo seguiría siendo `string` y el compilador dejaría
  mostrar un nombre cifrado en pantalla sin quejarse: el error aparecería
  como un cliente llamado «k7Fq9…» en el mostrador. Con un objeto, cada
  lugar que intenta usarlo sin descifrar no compila.

  El «c1» es la versión del formato: AES-GCM de 256 bits, con un vector
  al azar de 12 bytes delante del texto cifrado. Si algún día cambia, lo
  viejo se sigue reconociendo.
*/
export function esCifrado(valor: unknown): valor is Cifrado {
  return typeof valor === 'object' && valor !== null && typeof (valor as Cifrado).c1 === 'string'
}

/** La base local no se puede abrir: la llave no está, o no es la de estos datos. */
export class BaseLocalBloqueada extends Error {
  /** 'perdida' = no hay llave y hay datos cifrados; 'ajena' = la llave no abre estos datos. */
  readonly motivo: 'perdida' | 'ajena' | 'sin_acceso'

  constructor(mensaje: string, motivo: 'perdida' | 'ajena' | 'sin_acceso') {
    super(mensaje)
    this.name = 'BaseLocalBloqueada'
    this.motivo = motivo
  }
}

/* ─── De bytes a texto y vuelta ─── */

function aBase64(bytes: Uint8Array): string {
  // Por tramos: String.fromCharCode con muchos argumentos desborda la pila
  // en una operación pendiente grande.
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binario)
}

function deBase64(texto: string): Uint8Array {
  const binario = atob(texto)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

/* ─── La llave ─── */

export interface FuenteDeLlave {
  /** La llave guardada, o null si todavía no hay ninguna. */
  leer(): Promise<CryptoKey | null>
  /** Genera una llave nueva, la guarda y la devuelve ya confirmada. */
  crear(): Promise<CryptoKey>
}

function importar(bytes: Uint8Array): Promise<CryptoKey> {
  // No exportable: una vez adentro, ni la aplicación puede volver a leerla.
  return crypto.subtle.importKey('raw', bytes as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

const fuenteDeWindows: FuenteDeLlave = {
  async leer() {
    const { invoke } = await import('@tauri-apps/api/core')
    const bytes = await invoke<number[] | null>('leer_llave_base_local')
    return bytes ? importar(Uint8Array.from(bytes)) : null
  },

  async crear() {
    const { invoke } = await import('@tauri-apps/api/core')
    const nueva = crypto.getRandomValues(new Uint8Array(32))
    await invoke('guardar_llave_base_local', { llave: Array.from(nueva) })

    /*
      Se vuelve a leer antes de usarla.

      Cifrar con una llave que Windows no terminó de guardar dejaría los
      datos ilegibles la próxima vez que se abra el programa. Si lo
      guardado no es exactamente lo generado, se para acá.
    */
    const guardada = await invoke<number[] | null>('leer_llave_base_local')
    if (!guardada || guardada.length !== nueva.length || guardada.some((b, i) => b !== nueva[i])) {
      throw new BaseLocalBloqueada(
        'Windows no confirmó que la llave de la base local haya quedado guardada.',
        'sin_acceso',
      )
    }
    return importar(nueva)
  },
}

/*
  La del navegador vive en una base aparte, y no en la base local.

  Vaciar la base local —cuando una terminal se rehace desde cero— no
  tiene que llevarse la llave: si quedara algo cifrado sin su llave, no
  habría forma de abrirlo.
*/
const baseDeLlave = new Dexie('gross-llave')
baseDeLlave.version(1).stores({ llave: 'nombre' })

const fuenteDelNavegador: FuenteDeLlave = {
  async leer() {
    const fila = (await baseDeLlave.table('llave').get('base-local')) as
      | { nombre: string; llave: CryptoKey }
      | undefined
    return fila?.llave ?? null
  },

  async crear() {
    const llave = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ])
    await baseDeLlave.table('llave').put({ nombre: 'base-local', llave })
    const guardada = await fuenteDelNavegador.leer()
    if (!guardada) {
      throw new BaseLocalBloqueada(
        'El navegador no dejó guardar la llave de la base local.',
        'sin_acceso',
      )
    }
    return guardada
  },
}

let fuente: FuenteDeLlave = enEscritorio ? fuenteDeWindows : fuenteDelNavegador
let abriendo: Promise<CryptoKey> | null = null

/** Sólo para las pruebas: otra fuente de llave, y volver a empezar. */
export function usarFuenteDeLlave(otra: FuenteDeLlave) {
  fuente = otra
  abriendo = null
}

/*
  El testigo: una palabra conocida, cifrada con la llave de estos datos.

  Es lo que permite distinguir tres situaciones que por fuera se ven
  iguales —«no puedo leer»— y que piden cosas opuestas:

  · no hay testigo ni llave: es la primera vez, se crea la llave.
  · hay testigo pero no hay llave: la llave se perdió. Crear otra dejaría
    ilegible para siempre lo que ya estaba cifrado, así que NO se crea.
  · hay testigo y llave, pero la llave no lo abre: es la llave de otros
    datos. Tampoco se sigue.
*/
const TESTIGO = 'Sistema Gross'

async function desbloquear(): Promise<CryptoKey> {
  const testigo = await db.seguridad.get('testigo')
  let llave = await fuente.leer()

  if (!llave) {
    if (testigo) {
      throw new BaseLocalBloqueada(
        'Los datos de esta computadora están cifrados, pero la llave para abrirlos no está. ' +
          'Suele pasar cuando se entra con otra cuenta de Windows que la de siempre.',
        'perdida',
      )
    }
    llave = await fuente.crear()
  }

  if (testigo) {
    const abierto = await descifrarCon(llave, testigo.valor).catch(() => null)
    if (abierto !== TESTIGO) {
      throw new BaseLocalBloqueada(
        'La llave de esta computadora no abre los datos que tiene guardados.',
        'ajena',
      )
    }
  } else {
    await db.seguridad.put({ clave: 'testigo', valor: await cifrarCon(llave, TESTIGO) })
  }

  return llave
}

/*
  La llave se consigue una sola vez por ventana y se recuerda.

  Si falla, no se recuerda el fallo: la próxima operación vuelve a
  intentar. Un Windows que tardó en contestar al arrancar no puede dejar
  al mostrador sin clientes hasta que alguien cierre el programa.
*/
export function obtenerLlave(): Promise<CryptoKey> {
  if (!abriendo) {
    abriendo = desbloquear().catch((e) => {
      abriendo = null
      throw e
    })
  }
  return abriendo
}

/* ─── Cifrar y descifrar ─── */

async function cifrarCon(llave: CryptoKey, texto: string): Promise<Cifrado> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      llave,
      new TextEncoder().encode(texto) as BufferSource,
    ),
  )
  const junto = new Uint8Array(iv.length + cifrado.length)
  junto.set(iv)
  junto.set(cifrado, iv.length)
  return { c1: aBase64(junto) }
}

async function descifrarCon(llave: CryptoKey, valor: Cifrado): Promise<string> {
  const junto = deBase64(valor.c1)
  const claro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: junto.subarray(0, 12) as BufferSource },
    llave,
    junto.subarray(12) as BufferSource,
  )
  return new TextDecoder().decode(claro)
}

export async function cifrar(texto: string): Promise<Cifrado> {
  return cifrarCon(await obtenerLlave(), texto)
}

/*
  Acepta también un texto en claro, y lo devuelve tal cual.

  Es lo que guardaron las versiones anteriores, y va a estar en las cuatro
  PC hasta que la migración termine de cifrarlo. Leerlo como corresponde
  en vez de fallar es lo que permite que el mostrador siga vendiendo
  mientras tanto.
*/
export async function descifrar(valor: Cifrado | string | null | undefined): Promise<string | null> {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'string') return valor
  return descifrarCon(await obtenerLlave(), valor)
}

/* ─── Por fila ─── */

/** Los campos que identifican a una persona, tabla por tabla. */
export const PERSONALES = {
  cliente: ['nombre', 'numero_documento', 'busqueda'],
  venta: ['nombre_para_llamar', 'observaciones'],
  no_fiscal: [
    'receptor_nombre',
    'receptor_documento',
    'receptor_domicilio',
    'observaciones',
    'entrega_domicilio',
    'entrega_localidad',
    'entrega_contacto',
    'transportista',
  ],
} as const

/**
 * Cómo queda guardada una fila: los campos personales, cifrados.
 * Un campo que admite null sigue admitiéndolo: un dato vacío no se cifra.
 */
export type Guardado<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: null extends T[P] ? Cifrado | null : undefined extends T[P] ? Cifrado | null | undefined : Cifrado
}

export async function sellar<T extends object, K extends keyof T & string>(
  fila: T,
  campos: readonly K[],
): Promise<Guardado<T, K>> {
  const copia = { ...fila } as Record<string, unknown>
  for (const campo of campos) {
    const valor = copia[campo]
    // Lo vacío y lo que ya está cifrado se dejan como están: cifrar dos
    // veces dejaría un dato que al abrirse devuelve otro dato cifrado.
    if (typeof valor === 'string') copia[campo] = await cifrar(valor)
  }
  return copia as Guardado<T, K>
}

export async function abrir<T extends object, K extends keyof T & string>(
  fila: Guardado<T, K>,
  campos: readonly K[],
): Promise<T> {
  const copia = { ...fila } as Record<string, unknown>
  for (const campo of campos) {
    const valor = copia[campo]
    if (esCifrado(valor)) copia[campo] = await descifrar(valor)
  }
  return copia as T
}

/*
  Una función por tabla, con el tipo escrito.

  Con la versión genérica el compilador no siempre adivina de qué tabla
  es la fila, y un error de tipos acá es justo lo que no puede pasar
  desapercibido. Con estas, cada lugar dice qué abre.
*/
type CamposCliente = (typeof PERSONALES.cliente)[number]
type CamposVenta = (typeof PERSONALES.venta)[number]
type CamposNoFiscal = (typeof PERSONALES.no_fiscal)[number]

export const sellarCliente = (c: ClienteLocal): Promise<ClienteGuardado> =>
  sellar<ClienteLocal, CamposCliente>(c, PERSONALES.cliente)
export const abrirCliente = (c: ClienteGuardado): Promise<ClienteLocal> =>
  abrir<ClienteLocal, CamposCliente>(c, PERSONALES.cliente)

export const sellarVenta = (v: VentaLocal): Promise<VentaGuardada> =>
  sellar<VentaLocal, CamposVenta>(v, PERSONALES.venta)
export const abrirVenta = (v: VentaGuardada): Promise<VentaLocal> =>
  abrir<VentaLocal, CamposVenta>(v, PERSONALES.venta)

export const sellarNoFiscal = (d: NoFiscalLocal): Promise<NoFiscalGuardado> =>
  sellar<NoFiscalLocal, CamposNoFiscal>(d, PERSONALES.no_fiscal)
export const abrirNoFiscal = (d: NoFiscalGuardado): Promise<NoFiscalLocal> =>
  abrir<NoFiscalLocal, CamposNoFiscal>(d, PERSONALES.no_fiscal)

/** Si a una fila le queda algún dato personal en claro. */
export function quedaEnClaro(fila: object, campos: readonly string[]): boolean {
  return campos.some((c) => typeof (fila as Record<string, unknown>)[c] === 'string')
}

/* ─── La bandeja de salida, entera ─── */

export async function cifrarObjeto(objeto: Record<string, unknown>): Promise<Cifrado> {
  return cifrar(JSON.stringify(objeto))
}

export async function descifrarObjeto(
  valor: Cifrado | Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!esCifrado(valor)) return valor
  return JSON.parse((await descifrar(valor)) ?? '{}') as Record<string, unknown>
}

/*
  ─────────────────────────────────────────────────────────────
  Lo que quedó guardado en claro por las versiones anteriores

  Las cuatro PC tienen hoy clientes, ventas en cola, remitos y operaciones
  pendientes sin cifrar. Esto los cifra, de a una tabla, sin apuro.

  No es una actualización del esquema que corra al abrir la base, a
  propósito: si se cortara la luz a la mitad, la base quedaría a medio
  abrir. Es una tarea que se puede interrumpir en cualquier momento y
  retomar la próxima vez, porque cada fila se reconoce sola —cifrada o en
  claro— y lo que ya está cifrado no se toca. Mientras tanto el sistema
  funciona igual: `descifrar` lee las dos formas.

  El cuidado de fondo es no pisar nada. Entre que se lee una fila y se
  escribe cifrada, la sincronización pudo haber traído una versión nueva,
  o la venta pudo haber subido y borrarse de la bandeja. Por eso adentro
  de la transacción se vuelve a leer y se reemplaza un campo sólo si
  sigue teniendo exactamente el texto que se cifró.
  ─────────────────────────────────────────────────────────────
*/
export async function cifrarLoQueQuedoEnClaro(): Promise<number> {
  let cifradas = 0
  cifradas += await cifrarTabla('cliente', PERSONALES.cliente)
  cifradas += await cifrarTabla('venta', PERSONALES.venta)
  cifradas += await cifrarTabla('no_fiscal', PERSONALES.no_fiscal)
  cifradas += await cifrarBandeja()
  return cifradas
}

type Fila = Record<string, unknown> & { id: string }

async function cifrarTabla(nombre: 'cliente' | 'venta' | 'no_fiscal', campos: readonly string[]) {
  const tabla = db.table<Fila, string>(nombre)
  const enClaro = (await tabla.toArray()).filter((f) => quedaEnClaro(f, campos))
  if (!enClaro.length) return 0

  // Se cifra afuera de la transacción: adentro sólo se escribe.
  const selladas = await Promise.all(enClaro.map((f) => sellar(f, campos as (keyof Fila & string)[])))

  let cifradas = 0
  await db.transaction('rw', tabla, async () => {
    const actuales = await tabla.bulkGet(enClaro.map((f) => f.id))
    const aGuardar: Fila[] = []

    actuales.forEach((actual, i) => {
      if (!actual) return // se borró mientras tanto
      const nueva: Fila = { ...actual }
      let cambio = false
      for (const campo of campos) {
        if (typeof actual[campo] === 'string' && actual[campo] === enClaro[i][campo]) {
          nueva[campo] = (selladas[i] as Fila)[campo]
          cambio = true
        }
      }
      if (cambio) aGuardar.push(nueva)
    })

    if (aGuardar.length) await tabla.bulkPut(aGuardar)
    cifradas = aGuardar.length
  })
  return cifradas
}

async function cifrarBandeja() {
  const enClaro = (await db.outbox.toArray()).filter((o) => !esCifrado(o.datos))
  if (!enClaro.length) return 0

  const datos = await Promise.all(
    enClaro.map((o) => cifrarObjeto(o.datos as unknown as Record<string, unknown>)),
  )

  let cifradas = 0
  await db.transaction('rw', db.outbox, async () => {
    const actuales = await db.outbox.bulkGet(enClaro.map((o) => o.id))
    /*
      Se conserva todo lo demás de la fila tal como está AHORA —el estado,
      los intentos, si ya se le entregó a la caja—: pudo haber cambiado
      mientras se cifraba, y lo único que esto viene a cambiar son los
      datos.
    */
    const aGuardar = actuales.flatMap((actual, i) =>
      actual && !esCifrado(actual.datos) ? [{ ...actual, datos: datos[i] }] : [],
    )
    if (aGuardar.length) await db.outbox.bulkPut(aGuardar)
    cifradas = aGuardar.length
  })
  return cifradas
}

/*
  Rehacer la base de esta computadora cuando la llave no aparece.

  Borra lo cifrado que ya no se puede abrir y el testigo, y deja que la
  próxima sincronización traiga todo de nuevo desde el servidor. No se
  pierde nada: clientes, ventas en cola y remitos están en el servidor.

  Salvo una cosa, y por eso se niega: las operaciones que todavía no
  subieron existen SÓLO en esta PC. Si hay alguna, esto no las borra. Lo
  correcto primero es volver a entrar con la cuenta de Windows de
  siempre, que es la que tiene la llave; descartarlas es una decisión
  para soporte, no un botón del mostrador.
*/
export async function rehacerBaseLocal(): Promise<void> {
  const sinSubir = await db.outbox.count()
  if (sinSubir > 0) {
    throw new Error(
      `Hay ${sinSubir} operación${sinSubir === 1 ? '' : 'es'} sin subir que sólo existe${
        sinSubir === 1 ? '' : 'n'
      } en esta computadora. No se rehace la base para no perderla${sinSubir === 1 ? '' : 's'}.`,
    )
  }

  await db.transaction(
    'rw',
    [db.cliente, db.venta, db.venta_linea, db.no_fiscal, db.no_fiscal_linea, db.seguridad, db.cursor],
    async () => {
      await Promise.all([
        db.cliente.clear(),
        db.venta.clear(),
        db.venta_linea.clear(),
        db.no_fiscal.clear(),
        db.no_fiscal_linea.clear(),
        db.seguridad.clear(),
        // Sin el cursor, la sincronización vuelve a traer los clientes
        // desde el principio en vez de sólo lo cambiado.
        db.cursor.delete('cliente'),
      ])
    },
  )
  abriendo = null
}
