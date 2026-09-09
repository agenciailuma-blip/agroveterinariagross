import { describe, expect, it } from 'vitest'
import { destinoDeImpresion, nombreDelDestino } from '@/lib/comprobante/destino'

/*
  Por dónde sale el ticket.

  Lo que se prueba acá es la regla de prioridad, que es lo que puede
  fallar en silencio: una PC que tiene la POS80 elegida y además arrastra
  una IP vieja en la configuración del comercio tiene que imprimir por la
  POS80. Si se colara la red, el cajero apretaría "Imprimir en el
  mostrador" y se quedaría cinco segundos esperando a una impresora que
  no existe, con el cliente adelante.
*/

describe('a dónde va el ticket', () => {
  it('manda la impresora de Windows de la terminal, aunque haya una IP cargada', () => {
    const destino = destinoDeImpresion(
      { impresora_windows: 'POS80 Printer' },
      { impresora_host: '192.168.1.50', impresora_puerto: '9100' },
    )

    expect(destino).toEqual({ via: 'windows', impresora: 'POS80 Printer' })
  })

  it('sin impresora de Windows, usa la de red con su puerto', () => {
    const destino = destinoDeImpresion(
      { impresora_windows: null },
      { impresora_host: '192.168.1.50', impresora_puerto: '9101' },
    )

    expect(destino).toEqual({ via: 'red', host: '192.168.1.50', puerto: 9101 })
  })

  /*
    El puerto vive en una tabla de textos, así que puede llegar vacío o
    con cualquier cosa adentro. Un puerto 0 no es un puerto: hay que caer
    en el habitual y no en un error.
  */
  it('cae en el puerto 9100 cuando el guardado no sirve', () => {
    expect(destinoDeImpresion(null, { impresora_host: '10.0.0.5', impresora_puerto: '' })).toEqual({
      via: 'red',
      host: '10.0.0.5',
      puerto: 9100,
    })
    expect(
      destinoDeImpresion(null, { impresora_host: '10.0.0.5', impresora_puerto: 'nueve mil' }),
    ).toEqual({ via: 'red', host: '10.0.0.5', puerto: 9100 })
  })

  /*
    Un nombre de sólo espacios es lo que queda cuando alguien borra el
    valor a medias. No es una impresora, y tomarlo como tal haría fallar
    la impresión en vez de pasar al camino siguiente.
  */
  it('no toma por impresora un nombre en blanco', () => {
    expect(
      destinoDeImpresion({ impresora_windows: '   ' }, { impresora_host: '192.168.1.50' }),
    ).toEqual({ via: 'red', host: '192.168.1.50', puerto: 9100 })
  })

  it('recorta los espacios de más del nombre elegido', () => {
    expect(destinoDeImpresion({ impresora_windows: ' POS80 Printer ' })).toEqual({
      via: 'windows',
      impresora: 'POS80 Printer',
    })
  })

  /*
    Sin nada configurado no hay destino, y eso NO es un error: la
    pantalla esconde el botón de impresión directa y queda el diálogo de
    impresión de Windows. Nunca puede pasar que no haya forma de
    entregarle algo al cliente.
  */
  it('devuelve nada cuando la PC no tiene impresora configurada', () => {
    expect(destinoDeImpresion(null, {})).toBeNull()
    expect(destinoDeImpresion({ impresora_windows: null }, { impresora_host: '  ' })).toBeNull()
    expect(destinoDeImpresion(undefined)).toBeNull()
  })

  it('nombra el destino como lo va a leer la persona del mostrador', () => {
    expect(nombreDelDestino({ via: 'windows', impresora: 'POS80 Printer(2)' })).toBe(
      'POS80 Printer(2)',
    )
    expect(nombreDelDestino({ via: 'red', host: '192.168.1.50', puerto: 9100 })).toBe(
      '192.168.1.50:9100',
    )
  })
})
