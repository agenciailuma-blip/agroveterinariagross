import { describe, expect, it } from 'vitest'
import { aFilasDelArchivo } from '@/lib/api/importacion'

/*
  Los mensajes de la importación mandan a la fila que la persona ve en su
  Excel, no a la posición entre las filas que se mandaron a la base.
*/
describe('el número de fila de los mensajes', () => {
  it('es el del archivo, con el título, el encabezado y las filas salteadas contadas', () => {
    // Título en la 1, encabezado en la 2, y la fila 4 tenía error y no viajó.
    const lineas = [3, 5, 6]
    const resumen = aFilasDelArchivo(
      {
        creados: 2,
        actualizados: 0,
        errores: [{ fila: 2, codigo: 'C5', resultado: 'error', detalle: 'CUIT mal' }],
        avisos: [{ fila: 3, codigo: 'C6', resultado: 'creado', detalle: 'mirala' }],
      },
      lineas,
    )
    expect(resumen.errores[0].fila).toBe(5)
    expect(resumen.avisos[0].fila).toBe(6)
  })
})
