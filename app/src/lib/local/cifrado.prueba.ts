import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/local/db'
import type { ClienteLocal, NoFiscalLocal, VentaLocal } from '@/lib/local/db'
import {
  BaseLocalBloqueada,
  abrirCliente,
  cifrar,
  cifrarLoQueQuedoEnClaro,
  descifrar,
  descifrarObjeto,
  esCifrado,
  obtenerLlave,
  rehacerBaseLocal,
  sellarCliente,
  usarFuenteDeLlave,
  type FuenteDeLlave,
} from '@/lib/local/cifrado'
import { buscarClientesLocal } from '@/lib/local/consultas'
import { encolar } from '@/lib/local/sync'
import { guardarLoQueLlego, operacionesParaLaCaja } from '@/lib/local/red'

/*
  ─────────────────────────────────────────────────────────────
  El cifrado de la base local

  Lo que se prueba acá es si protege lo que promete: que en el disco no
  quede ningún nombre legible, que la llave perdida no se reemplace en
  silencio por otra —dejando ilegible lo que ya estaba cifrado—, y que
  lo que las versiones anteriores dejaron en claro se cifre sin perder
  nada.

  Corre con IndexedDB de verdad (fake-indexeddb) y con el cifrado de
  verdad del navegador. La llave de Windows se prueba del lado del Rust.
  ─────────────────────────────────────────────────────────────
*/

const AHORA = '2026-09-14T12:00:00.000Z'

/** Una llave que vive en memoria, para poder perderla o cambiarla a propósito. */
function llaveEnMemoria() {
  let llave: CryptoKey | null = null
  let creadas = 0
  const nueva = () =>
    crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

  const fuente: FuenteDeLlave = {
    leer: async () => llave,
    crear: async () => {
      creadas++
      llave = await nueva()
      return llave
    },
  }
  return {
    fuente,
    creadas: () => creadas,
    perder: () => {
      llave = null
    },
    cambiarPorOtra: async () => {
      llave = await nueva()
    },
  }
}

function cliente(extra: Partial<ClienteLocal> = {}): ClienteLocal {
  return {
    id: 'c-1',
    codigo: 'C1',
    nombre: 'Granja Tres Colonias',
    numero_documento: '30743567890',
    condicion_iva_id: 6,
    descuento_porcentaje: 0,
    lista_precio_id: null,
    cuenta_corriente: true,
    limite_credito: 150000,
    dias_vencimiento: 30,
    activo: true,
    actualizado_en: AHORA,
    eliminado_en: null,
    busqueda: 'granja tres colonias 30743567890 c1',
    ...extra,
  }
}

async function limpiar() {
  await Promise.all([
    db.cliente.clear(),
    db.venta.clear(),
    db.venta_linea.clear(),
    db.no_fiscal.clear(),
    db.outbox.clear(),
    db.seguridad.clear(),
    db.cursor.clear(),
  ])
}

let llave: ReturnType<typeof llaveEnMemoria>

beforeEach(async () => {
  await limpiar()
  llave = llaveEnMemoria()
  usarFuenteDeLlave(llave.fuente)
})

describe('lo que queda en el disco', () => {
  /*
    La prueba que justifica todo esto: leyendo la base por fuera —como
    la leería alguien que copió la carpeta— no aparece el nombre, ni el
    documento, ni la búsqueda, que es una copia del nombre.
  */
  it('un cliente guardado no deja su nombre ni su documento legibles', async () => {
    await db.cliente.put(await sellarCliente(cliente()))

    const crudo = JSON.stringify(await db.cliente.get('c-1'))

    expect(crudo).not.toContain('Granja')
    expect(crudo).not.toContain('granja')
    expect(crudo).not.toContain('30743567890')
  })

  it('lo que se cifra se vuelve a leer igual, con acentos y eñes', async () => {
    const texto = 'Muñoz, José — Colonia Aurora · 3755-401122'

    expect(await descifrar(await cifrar(texto))).toBe(texto)
  })

  /*
    Con un vector fijo, dos clientes con el mismo documento quedarían con
    el mismo dato cifrado, y comparando se sabría que son el mismo sin
    abrir nada.
  */
  it('el mismo texto cifrado dos veces no queda igual', async () => {
    const a = await cifrar('Sánchez, Marta')
    const b = await cifrar('Sánchez, Marta')

    expect(a.c1).not.toBe(b.c1)
  })

  it('un dato vacío queda vacío', async () => {
    const guardado = await sellarCliente(cliente({ numero_documento: null }))

    expect(guardado.numero_documento).toBeNull()
    expect((await abrirCliente(guardado)).numero_documento).toBeNull()
  })

  it('la venta pendiente queda cifrada entera en la bandeja', async () => {
    await encolar('v-1', [
      {
        tipo: 'insert',
        tabla: 'venta',
        datos: { id: 'v-1', nombre_para_llamar: 'Don Ramón', observaciones: 'entregar en Aurora' },
        descripcion: 'Venta MOS1-000001',
      },
    ])

    const guardada = (await db.outbox.toArray())[0]

    expect(esCifrado(guardada.datos)).toBe(true)
    expect(JSON.stringify(guardada)).not.toContain('Ramón')
    expect((await descifrarObjeto(guardada.datos)).nombre_para_llamar).toBe('Don Ramón')
  })

  /*
    Por la red del local las operaciones llegan abiertas —cada PC tiene su
    propia llave— y la que las recibe tiene que cifrarlas con la suya
    antes de guardarlas.
  */
  it('lo que llega por la red del local se guarda cifrado', async () => {
    await guardarLoQueLlego({
      clave: 'x',
      tipo: 'operaciones',
      terminal: 'MOS1',
      operaciones: [
        {
          id: 'op-1',
          lote: 'v-9',
          orden: 0,
          tipo: 'insert',
          tabla: 'venta',
          datos: {
            id: 'v-9',
            estado: 'en_caja',
            codigo: 'MOS1-000009',
            nombre_para_llamar: 'Estancia La Esperanza',
            observaciones: null,
            total: 1000,
          },
          descripcion: 'Venta MOS1-000009',
          creado_en: AHORA,
          intentos: 0,
          ultimo_error: null,
          estado: 'pendiente',
        },
      ],
    })

    const crudo = JSON.stringify([await db.outbox.toArray(), await db.venta.toArray()])
    expect(crudo).not.toContain('Esperanza')
    expect(await db.venta.count()).toBe(1)
  })
})

describe('la red del local', () => {
  /*
    Cada PC cifra con su propia llave. Lo que el mostrador le manda a la
    caja tiene que ir abierto: cifrado con la llave del mostrador, la caja
    no lo podría leer nunca, y la venta no aparecería en su pantalla sin
    ningún error que lo explique.
  */
  it('lo que se le manda a la caja va abierto', async () => {
    await encolar('v-1', [
      {
        tipo: 'insert',
        tabla: 'venta',
        datos: { id: 'v-1', estado: 'en_caja', nombre_para_llamar: 'Don Ramón' },
        descripcion: 'Venta MOS1-000001',
      },
    ])

    const [op] = await operacionesParaLaCaja(await db.outbox.toArray())

    expect(esCifrado(op.datos)).toBe(false)
    expect(op.datos.nombre_para_llamar).toBe('Don Ramón')
  })
})

describe('buscar clientes con el nombre cifrado', () => {
  it('encuentra por nombre aunque en el disco no se pueda leer', async () => {
    await db.cliente.put(await sellarCliente(cliente()))

    const encontrados = await buscarClientesLocal('tres colonias')

    expect(encontrados.map((c) => c.nombre)).toEqual(['Granja Tres Colonias'])
  })

  /*
    La lista abierta se guarda en memoria para no abrir miles de nombres
    en cada tecla. Un cliente que baja después tiene que aparecer igual.
  */
  it('un cliente que llegó después aparece en la búsqueda siguiente', async () => {
    await db.cliente.put(await sellarCliente(cliente()))
    await buscarClientesLocal('granja')

    await db.cliente.put(
      await sellarCliente(
        cliente({
          id: 'c-2',
          codigo: 'C2',
          nombre: 'Granja Oberá',
          busqueda: 'granja obera c2',
          actualizado_en: '2026-09-14T13:00:00.000Z',
        }),
      ),
    )

    expect((await buscarClientesLocal('granja')).map((c) => c.nombre).sort()).toEqual([
      'Granja Oberá',
      'Granja Tres Colonias',
    ])
  })
})

describe('la llave', () => {
  it('la primera vez se crea una sola, y deja el testigo', async () => {
    await obtenerLlave()
    await obtenerLlave()

    expect(llave.creadas()).toBe(1)
    expect(await db.seguridad.get('testigo')).toBeDefined()
  })

  /*
    El caso que obliga a que exista el testigo.

    Si la llave desaparece y el sistema creara otra sin avisar, todo lo
    que ya estaba cifrado —incluidas las ventas sin subir— quedaría
    ilegible para siempre. Tiene que frenar, y no crear nada.
  */
  it('si la llave se pierde, frena y NO crea otra', async () => {
    await obtenerLlave()
    llave.perder()
    usarFuenteDeLlave(llave.fuente)

    const error = await obtenerLlave().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(BaseLocalBloqueada)
    expect((error as BaseLocalBloqueada).motivo).toBe('perdida')
    expect(llave.creadas()).toBe(1)
  })

  it('una llave que no es la de estos datos no se usa', async () => {
    await obtenerLlave()
    await llave.cambiarPorOtra()
    usarFuenteDeLlave(llave.fuente)

    const error = await obtenerLlave().catch((e: unknown) => e)

    expect((error as BaseLocalBloqueada).motivo).toBe('ajena')
  })
})

describe('lo que dejaron en claro las versiones anteriores', () => {
  async function sembrarEnClaro() {
    // Así lo guardaba la versión 0.3.1: sin cifrar.
    await db.cliente.put(cliente() as never)
    await db.venta.put({
      id: 'v-1',
      codigo: 'MOS1-000001',
      estado: 'en_caja',
      cliente_id: 'c-1',
      vendedor_id: null,
      total: 1000,
      descuento_total: 0,
      lista_precio_id: null,
      medio_pago_previsto_id: null,
      cuotas_previstas: null,
      observaciones: 'llamar antes',
      nombre_para_llamar: 'Don Ramón',
      ocurrido_en: AHORA,
      enviada_caja_en: AHORA,
      actualizado_en: AHORA,
    } satisfies VentaLocal as never)
    await db.no_fiscal.put({
      id: 'r-1',
      tipo_clave: 'remito',
      serie: 'MOS1',
      numero: 1,
      venta_id: null,
      fecha: '2026-09-14',
      estado: 'emitido',
      receptor_nombre: 'Granja Tres Colonias',
      receptor_documento: '30743567890',
      receptor_documento_sigla: 'CUIT',
      receptor_condicion: '',
      receptor_domicilio: 'Ruta 14 km 850',
      total: 0,
      observaciones: null,
      valido_hasta: null,
      entrega_domicilio: 'Colonia Aurora',
      entrega_localidad: 'Oberá',
      entrega_contacto: '3755-466001',
      transportista: null,
      venta_codigo: null,
      creado_en: AHORA,
    } satisfies NoFiscalLocal as never)
    await db.outbox.put({
      id: 'op-1',
      lote: 'v-1',
      orden: 0,
      tipo: 'insert',
      tabla: 'venta',
      datos: { id: 'v-1', nombre_para_llamar: 'Don Ramón' },
      descripcion: 'Venta MOS1-000001',
      creado_en: AHORA,
      intentos: 2,
      ultimo_error: 'sin conexión',
      estado: 'error',
    } as never)
  }

  it('la migración no deja nada legible en ninguna tabla', async () => {
    await sembrarEnClaro()

    await cifrarLoQueQuedoEnClaro()

    const crudo = JSON.stringify([
      await db.cliente.toArray(),
      await db.venta.toArray(),
      await db.no_fiscal.toArray(),
      await db.outbox.toArray(),
    ])
    for (const dato of ['Granja', '30743567890', 'Ramón', 'llamar antes', 'Aurora', '3755-466001']) {
      expect(crudo).not.toContain(dato)
    }
  })

  /*
    Mientras las cuatro PC migran, el mostrador sigue vendiendo: lo que
    todavía está en claro se tiene que poder leer, y lo migrado tiene que
    leerse exactamente igual que antes.
  */
  it('antes y después de migrar, se lee lo mismo', async () => {
    await sembrarEnClaro()
    const antes = await buscarClientesLocal('granja')

    await cifrarLoQueQuedoEnClaro()

    expect(await buscarClientesLocal('granja')).toEqual(antes)
  })

  /*
    La venta pendiente es lo único que existe sólo en esta PC. La
    migración cambia sus datos y nada más: si ya había fallado dos veces,
    sigue fallada dos veces y sigue en la cola.
  */
  it('la operación pendiente conserva su estado y sus intentos', async () => {
    await sembrarEnClaro()

    await cifrarLoQueQuedoEnClaro()

    const op = await db.outbox.get('op-1')
    expect(op?.estado).toBe('error')
    expect(op?.intentos).toBe(2)
    expect((await descifrarObjeto(op!.datos)).nombre_para_llamar).toBe('Don Ramón')
  })

  it('correrla dos veces no cifra dos veces', async () => {
    await sembrarEnClaro()

    expect(await cifrarLoQueQuedoEnClaro()).toBe(4)
    expect(await cifrarLoQueQuedoEnClaro()).toBe(0)
    expect((await abrirCliente((await db.cliente.get('c-1'))!)).nombre).toBe('Granja Tres Colonias')
  })
})

describe('rehacer la base cuando la llave no aparece', () => {
  /*
    Las operaciones sin subir existen sólo en esta PC. Rehacer la base no
    las puede borrar, aunque no se puedan leer: eso lo decide soporte.
  */
  it('se niega si hay operaciones sin subir', async () => {
    await encolar('v-1', [{ tipo: 'rpc', tabla: 'cobrar_venta', datos: {}, descripcion: 'cobro' }])

    await expect(rehacerBaseLocal()).rejects.toThrow(/sin subir/)
    expect(await db.outbox.count()).toBe(1)
  })

  it('con la bandeja vacía borra lo ilegible y deja arrancar de nuevo', async () => {
    await db.cliente.put(await sellarCliente(cliente()))
    llave.perder()
    usarFuenteDeLlave(llave.fuente)
    await expect(obtenerLlave()).rejects.toBeInstanceOf(BaseLocalBloqueada)

    await rehacerBaseLocal()

    expect(await db.cliente.count()).toBe(0)
    await expect(obtenerLlave()).resolves.toBeDefined()
    expect(await db.seguridad.get('testigo')).toBeDefined()
  })
})
