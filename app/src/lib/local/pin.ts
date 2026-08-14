import { db } from '@/lib/local/db'

/*
  ─────────────────────────────────────────────────────────────
  Identificación por PIN sin conexión

  EL PROBLEMA

  verificar_pin() vive en el servidor, porque el hash del PIN está
  guardado fuera del alcance de la API a propósito. Eso está bien, pero
  significa que sin internet nadie puede identificarse — y entonces el
  mostrador no puede vender, que es justo para lo que existe todo el
  modo sin conexión.

  LA SOLUCIÓN

  Cuando alguien se identifica CON conexión, la terminal guarda un
  verificador local derivado de su PIN. Sin conexión, ese verificador
  permite reconocerlo de nuevo.

  Consecuencia deliberada: alguien que nunca se identificó en esa
  computadora no puede hacerlo sin conexión. Es correcto — la terminal
  no tiene forma honesta de saber quién es. Y en la práctica no molesta:
  cada vendedor se identifica en su mostrador todos los días.

  POR QUÉ PBKDF2 Y NO UN HASH SIMPLE

  Un PIN son cuatro dígitos: diez mil combinaciones. Un SHA-256 de eso
  se rompe al instante con la base local en la mano. PBKDF2 con muchas
  iteraciones hace que cada intento cueste, así que recorrer las diez
  mil pasa de instantáneo a un rato largo.

  No es inviolable, y no pretende serlo: el PIN no da acceso al sistema
  —para eso está la sesión de la terminal— sino que atribuye quién hizo
  cada operación. Lo que se protege es la trazabilidad, no la puerta.

  El verificador lleva el id de la terminal adentro, así que copiarlo a
  otra máquina no sirve de nada.
  ─────────────────────────────────────────────────────────────
*/

const ITERACIONES = 210_000

async function derivar(pin: string, usuarioId: string, terminalId: string) {
  const codificador = new TextEncoder()
  const material = await crypto.subtle.importKey(
    'raw',
    codificador.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: codificador.encode(`gross:${usuarioId}:${terminalId}`),
      iterations: ITERACIONES,
      hash: 'SHA-256',
    },
    material,
    256,
  )
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface OperadorLocal {
  usuario_id: string
  nombre: string
  rol: string
}

function clave(usuarioId: string, terminalId: string) {
  return `pin:${terminalId}:${usuarioId}`
}

/** Guarda el verificador tras una identificación exitosa contra el servidor. */
export async function recordarPin(
  pin: string,
  operador: OperadorLocal,
  terminalId: string,
) {
  const verificador = await derivar(pin, operador.usuario_id, terminalId)
  await db.contador.put({
    clave: clave(operador.usuario_id, terminalId),
    // El contador guarda números; acá hace falta texto, así que el dato
    // va en la clave y el valor sólo marca cuándo se guardó.
    valor: Date.now(),
    actualizado_en: verificador,
  })
  await db.contador.put({
    clave: `operador:${terminalId}:${operador.usuario_id}`,
    valor: Date.now(),
    actualizado_en: JSON.stringify(operador),
  })
}

/** Reconoce un PIN contra los verificadores guardados en esta terminal. */
export async function verificarPinLocal(
  pin: string,
  terminalId: string,
): Promise<OperadorLocal | null> {
  const guardados = await db.contador
    .filter((c) => c.clave.startsWith(`pin:${terminalId}:`))
    .toArray()

  for (const g of guardados) {
    const usuarioId = g.clave.split(':')[2]
    const esperado = g.actualizado_en
    const calculado = await derivar(pin, usuarioId, terminalId)
    if (calculado !== esperado) continue

    const ficha = await db.contador.get(`operador:${terminalId}:${usuarioId}`)
    if (!ficha) continue
    try {
      return JSON.parse(ficha.actualizado_en) as OperadorLocal
    } catch {
      return null
    }
  }
  return null
}

export async function hayPinesGuardados(terminalId: string) {
  const n = await db.contador.filter((c) => c.clave.startsWith(`pin:${terminalId}:`)).count()
  return n > 0
}
