import { describe, expect, it } from 'vitest'
import { revalidarTerminal, type Terminal } from '@/lib/terminal'

/*
  Qué terminal queda guardada después de preguntarle al servidor.

  Olvidarla de más deja a una PC del local preguntando qué terminal es,
  y sin conexión no se puede elegir: no se puede vender ni cobrar.
*/

function terminal(id: string, nombre = id): Terminal {
  return {
    id,
    nombre,
    tipo: 'caja',
    prefijo: id.toUpperCase(),
    punto_venta_id: null,
    impresora_windows: null,
    es_punto_de_encuentro: false,
    deposito_id: null,
  } as Terminal
}

describe('revalidar la terminal guardada', () => {
  it('una lista vacía no la borra: es una consulta sin sesión, no una baja', () => {
    expect(revalidarTerminal(terminal('caja1'), [])).toBe('sin_cambios')
  })

  it('si sigue en la lista, se refrescan sus datos', () => {
    const nueva = terminal('caja1', 'Caja 1 renombrada')
    expect(revalidarTerminal(terminal('caja1'), [nueva, terminal('mos1')])).toBe(nueva)
  })

  it('si se dio de baja —las demás siguen—, se olvida', () => {
    expect(revalidarTerminal(terminal('caja1'), [terminal('mos1'), terminal('mos2')])).toBeNull()
  })

  it('sin terminal guardada no hay nada que revalidar', () => {
    expect(revalidarTerminal(null, [terminal('mos1')])).toBe('sin_cambios')
  })
})
