import { db } from '@/lib/local/db'
import type {
  OperacionAbierta,
  OperacionPendiente,
  VentaLineaLocal,
  VentaLocal,
} from '@/lib/local/db'
import { cifrarObjeto, descifrarObjeto, sellarVenta } from '@/lib/local/cifrado'
import {
  abrirPuntoDeEncuentro,
  enEscritorio,
  hablarConLaCaja,
  nombreDeEstaComputadora,
} from '@/lib/escritorio'
import type { Terminal } from '@/lib/terminal'
import { supabase } from '@/lib/supabase'

/*
  ─────────────────────────────────────────────────────────────
  La venta que llega por la red del local

  Sin internet, las cuatro PC quedan aisladas y la venta que arma un
  vendedor no tiene cómo llegar a la caja. Este archivo es la mitad de
  arriba de eso: el camino ya existe —está en Rust— y acá se decide qué
  se manda y qué se hace con lo que llega.

  La forma está en [[10 · Las decisiones que no se revisan]]: una
  terminal escucha, la de la caja, y las demás le hablan.

  Lo que viaja son las MISMAS operaciones que van a Supabase, sin
  traducir. Eso es lo que hace que todo esto sea seguro: cada una trae
  el id que generó la terminal, así que si termina llegando dos veces
  —una por acá y otra por internet— la segunda choca contra la clave
  primaria y se descarta sola.
  ─────────────────────────────────────────────────────────────
*/

/*
  El mensaje tal como lo arma y lo lee el Rust.

  Las operaciones viajan ABIERTAS. Cada PC cifra su base con su propia
  llave, guardada en su propio Windows: una operación cifrada en el
  mostrador sería ilegible para la caja. Se abren justo antes de mandar
  y la caja las vuelve a cifrar con la suya al guardarlas.

  Lo que protege el cifrado es el disco, no la red del local: por el
  cable viajan en claro, como viajaban antes, dentro de la red interna
  de Gross y con la clave del local.
*/
export interface MensajeDelLocal {
  clave: string
  tipo: 'salud' | 'operaciones'
  terminal: string
  operaciones: OperacionAbierta[]
}

async function valorDeConfiguracion(clave: string): Promise<string> {
  // Se lee de la copia local, no del servidor: todo esto pasa
  // justamente cuando el servidor no está.
  const fila = await db.configuracion.get(clave)
  return fila ? String(fila.valor ?? '') : ''
}

export async function claveDelLocal() {
  return valorDeConfiguracion('local.clave')
}

export async function direccionDelPuntoDeEncuentro() {
  return valorDeConfiguracion('local.punto_de_encuentro')
}

/*
  ─────────────────────────────────────────────────────────────
  El lado que escucha — la caja
  ─────────────────────────────────────────────────────────────
*/

/*
  Ponerse a escuchar y dejar dicho dónde encontrarse.

  La dirección la escribe la propia terminal que escucha, con el nombre
  que tiene esa computadora en Windows. Nadie tiene que averiguar ni
  escribir una IP —que además cambia cuando la reparte el router— y en
  el local los nombres ya se resuelven entre máquinas: la impresora
  compartida se llama «POS80 Printer(2) en DESKTOP-O4R9STD».

  Si no hay internet en ese momento no se puede publicar la dirección,
  pero tampoco hace falta: la que estaba sigue siendo válida.
*/
export async function ponerseAEscuchar(): Promise<{ puerto: number; nombre: string }> {
  const clave = await claveDelLocal()
  if (!clave) throw new Error('Todavía no bajó la clave de la red del local.')

  const puerto = await abrirPuntoDeEncuentro(clave)
  const nombre = await nombreDeEstaComputadora()

  const publicada = await direccionDelPuntoDeEncuentro()
  if (nombre && nombre !== publicada) {
    await supabase.from('configuracion').update({ valor: nombre }).eq('clave', 'local.punto_de_encuentro')
  }

  return { puerto, nombre }
}

/*
  Qué se guarda de lo que llegó.

  Está separado del acceso a la base porque es la regla que puede
  equivocarse en silencio y salir cara, igual que `conciliarCola`.

  Tres decisiones:

  · La venta se le muestra al cajero **sólo si viene esperando cobro**.
    Un presupuesto o un remito que un mostrador manda para que suba
    igual no tiene por qué aparecer en la cola de la caja.

  · Una venta que ESTA terminal ya cobró no se vuelve a guardar. Es el
    mismo peligro que ya tenía la cola: el mostrador puede reenviar sus
    operaciones —porque para él siguen pendientes hasta que lleguen al
    servidor— y traerla de vuelta la pondría otra vez en la pantalla del
    cajero, con la plata ya cobrada.

  · Todo lo que llega va a la cola de subida igual, incluso lo que no se
    muestra. Que las dos terminales intenten subirlo es a propósito: si
    la del mostrador no vuelve a encenderse, la venta sube igual desde
    acá. Lo peor que puede pasar es que la segunda choque contra la
    clave primaria, que es exactamente para lo que existen esos id.
*/
export function loQueSeGuarda(
  llegan: OperacionAbierta[],
  yaCobradasAca: Set<string>,
): {
  ventas: VentaLocal[]
  lineas: VentaLineaLocal[]
  paraLaCola: OperacionAbierta[]
} {
  const esVenta = (o: OperacionAbierta) => o.tipo === 'insert' && o.tabla === 'venta'
  const esLinea = (o: OperacionAbierta) => o.tipo === 'insert' && o.tabla === 'venta_linea'

  const ventas = llegan
    .filter(esVenta)
    .map((o) => o.datos as unknown as VentaLocal)
    .filter((v) => v.estado === 'en_caja' && !yaCobradasAca.has(v.id))

  const visibles = new Set(ventas.map((v) => v.id))

  const lineas = llegan
    .filter(esLinea)
    .map((o) => o.datos as unknown as VentaLineaLocal)
    .filter((l) => visibles.has(l.venta_id))

  return { ventas, lineas, paraLaCola: llegan }
}

/*
  Guardar lo que llegó de otra terminal.

  Las operaciones se copian a la cola **tal cual vinieron, con su id**,
  así recibir lo mismo dos veces no duplica nada: la segunda pisa a la
  primera en vez de agregar otra.
*/
export async function guardarLoQueLlego(mensaje: MensajeDelLocal): Promise<number> {
  const llegan = mensaje.operaciones ?? []
  if (!llegan.length) return 0

  const cobradas = new Set(
    (await db.venta.where('estado').equals('cobrada').toArray()).map((v) => v.id),
  )

  const { ventas, lineas, paraLaCola } = loQueSeGuarda(llegan, cobradas)

  // Todo se cifra con la llave de esta PC antes de tocar la base.
  const [ventasSelladas, colaSellada] = await Promise.all([
    Promise.all(ventas.map(sellarVenta)),
    Promise.all(
      paraLaCola.map(async (o) => ({
        ...o,
        datos: await cifrarObjeto(o.datos),
        estado: 'pendiente' as const,
        // Llegaron por la red, así que para esta terminal ya están
        // entregadas: no tiene a quién reenviárselas.
        entregado_en: o.creado_en,
      })),
    ),
  ])

  if (ventasSelladas.length) await db.venta.bulkPut(ventasSelladas)
  if (lineas.length) await db.venta_linea.bulkPut(lineas)
  await db.outbox.bulkPut(colaSellada)

  return paraLaCola.length
}

/*
  ─────────────────────────────────────────────────────────────
  El lado que habla — los mostradores
  ─────────────────────────────────────────────────────────────
*/

/*
  Qué falta entregarle a la caja.

  Lo que todavía no llegó al servidor y todavía no se le pasó a la caja.
  Se sigue guardando en la cola después de entregarlo: la caja lo va a
  subir, pero si esa máquina se apaga, esta también tiene que poder.
*/
export function loQueFaltaEntregar<T extends Pick<OperacionPendiente, 'entregado_en' | 'estado'>>(
  cola: T[],
): T[] {
  return cola.filter(
    (o) => !o.entregado_en && (o.estado === 'pendiente' || o.estado === 'error'),
  )
}

/*
  Lo que se le manda a la caja, ya abierto.

  Separado del envío para poder probarlo sin el programa instalado: es la
  parte que falla en silencio. Una operación mandada tal como está
  guardada llegaría cifrada con la llave de ESTA PC, y la caja —que tiene
  la suya— no podría leerla nunca.
*/
export async function operacionesParaLaCaja(cola: OperacionPendiente[]): Promise<OperacionAbierta[]> {
  return Promise.all(
    loQueFaltaEntregar(cola).map(async (o) => ({ ...o, datos: await descifrarObjeto(o.datos) })),
  )
}

export async function entregarALaCaja(terminal: Terminal | null): Promise<number> {
  // La que escucha no se manda nada a sí misma.
  if (!enEscritorio || !terminal || terminal.es_punto_de_encuentro) return 0

  const [clave, direccion] = await Promise.all([claveDelLocal(), direccionDelPuntoDeEncuentro()])
  if (!clave || !direccion) return 0

  const cola = await db.outbox.toArray()
  const falta = loQueFaltaEntregar(cola)
  if (!falta.length) return 0

  const abiertas = await operacionesParaLaCaja(cola)

  const mensaje: MensajeDelLocal = {
    clave,
    tipo: 'operaciones',
    terminal: terminal.nombre,
    operaciones: abiertas,
  }

  const r = await hablarConLaCaja(direccion, JSON.stringify(mensaje))
  if (!r.ok) throw new Error(r.detalle)

  const ahora = new Date().toISOString()
  await db.outbox.bulkPut(falta.map((o) => ({ ...o, entregado_en: ahora })))

  return falta.length
}
