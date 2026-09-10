import { describe, expect, it } from 'vitest'
import { enCastellano } from '@/lib/errores'

/*
  Los carteles de error del mostrador.

  Los dos casos de abajo no son inventados: aparecieron en pantalla el
  10/09, uno en la pantalla del PIN y el otro cargando una factura de
  compra. Los dos en inglés, los dos sin decir qué hacer.
*/

describe('los errores que llegan de adentro del sistema', () => {
  /*
    Apareció arriba del teclado numérico del PIN:
    "Failed to fetch dynamically imported module: .../pin.ts".
    Con recargar se arregla, y eso era justo lo que no se entendía.
  */
  it('traduce el módulo que no se pudo traer', () => {
    const leido = enCastellano(
      new Error(
        'Failed to fetch dynamically imported module: http://localhost:5173/src/lib/local/pin.ts',
      ),
    )

    expect(leido).toBe('No se pudo cargar una parte del sistema. Recargá la pantalla y volvé a intentar.')
  })

  it('trata igual una caída de red con otro nombre', () => {
    expect(enCastellano(new Error('NetworkError when attempting to fetch resource.'))).toContain(
      'Recargá la pantalla',
    )
  })

  /*
    Apareció al guardar una factura de compra con un importe que se
    escribió dos veces adentro del campo: "numeric field overflow".
  */
  it('traduce el importe que no entra', () => {
    expect(enCastellano(new Error('numeric field overflow'))).toBe(
      'Hay un importe demasiado grande. Fijate que no se haya colado un cero de más.',
    )
  })

  it('traduce lo que ya estaba cargado', () => {
    expect(
      enCastellano(new Error('duplicate key value violates unique constraint "compra_unica"')),
    ).toBe('Eso ya estaba cargado.')
  })

  /*
    Y lo que NO tiene que hacer, que importa igual: los mensajes que
    escribimos nosotros ya dicen qué pasó y qué mirar. Taparlos con uno
    genérico sería perder la única información útil.
  */
  it('deja pasar los mensajes que escribimos nosotros', () => {
    expect(enCastellano(new Error('Esa factura ya está cargada: 0003-00045678.'))).toBe(
      'Esa factura ya está cargada: 0003-00045678.',
    )
    expect(enCastellano(new Error('PIN incorrecto.'))).toBe('PIN incorrecto.')
  })

  it('tiene algo para decir aunque el error venga vacío', () => {
    expect(enCastellano(null)).toBe('No se pudo completar la operación.')
    expect(enCastellano(new Error('   '), 'No se pudo verificar.')).toBe('No se pudo verificar.')
  })
})
