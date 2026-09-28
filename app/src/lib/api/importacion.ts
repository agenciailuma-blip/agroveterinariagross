import { supabase } from '@/lib/supabase'
import { aPayloadImportacion } from '@/lib/importacion/planilla'
import type { Campo } from '@/lib/importacion/planilla'

export interface ResultadoFila {
  fila: number
  codigo: string | null
  resultado: 'creado' | 'actualizado' | 'error'
  detalle: string | null
}

export interface ResumenImportacion {
  creados: number
  actualizados: number
  errores: ResultadoFila[]
  avisos: ResultadoFila[]
}

/*
  Se manda de a 200 filas.

  Un archivo de 3.000 productos en una sola llamada tarda lo suficiente
  como para que el navegador o el servidor corten por tiempo, y ahí no se
  sabe qué entró y qué no. De a tandas, cada una es una transacción que
  cerró o falló, y la pantalla puede mostrar el avance mientras tanto —
  que en una carga de varios minutos es la diferencia entre esperar y
  pensar que se colgó.
*/
const TANDA = 200

/*
  El número de fila que ve la persona en su Excel.

  La base devuelve la posición de la fila entre las que se mandaron, y
  eso no es la fila del archivo: arriba puede haber un título y el
  encabezado, y en el medio filas vacías o con error que no viajaron.
  Decir «fila 3» cuando en el Excel es la 5 manda a corregir la fila
  equivocada. Se vio el 28/09 probando la importación de clientes; la de
  productos tenía lo mismo.
*/
export function aFilasDelArchivo(resumen: ResumenImportacion, lineas: number[]): ResumenImportacion {
  const traducir = (f: ResultadoFila) => ({ ...f, fila: lineas[f.fila - 1] ?? f.fila })
  return { ...resumen, errores: resumen.errores.map(traducir), avisos: resumen.avisos.map(traducir) }
}

export async function importarProductos(
  filas: Partial<Record<Campo, string>>[],
  crearReferencias: boolean,
  onAvance?: (procesadas: number, total: number) => void,
): Promise<ResumenImportacion> {
  const resumen: ResumenImportacion = { creados: 0, actualizados: 0, errores: [], avisos: [] }

  for (let i = 0; i < filas.length; i += TANDA) {
    const tanda = filas.slice(i, i + TANDA).map(aPayloadImportacion)

    const { data, error } = await supabase.rpc('importar_productos', {
      p_filas: tanda,
      p_crear_referencias: crearReferencias,
    })

    if (error) throw new Error(`No se pudo importar desde la fila ${i + 1}: ${error.message}`)

    for (const cruda of (data ?? []) as ResultadoFila[]) {
      // La función numera dentro de su tanda; acá se pasa a la posición
      // entre todas las filas que se mandaron. El número de fila del
      // Excel lo pone aFilasDelArchivo(), en la pantalla.
      const fila = { ...cruda, fila: cruda.fila + i }

      if (fila.resultado === 'error') resumen.errores.push(fila)
      else {
        if (fila.resultado === 'creado') resumen.creados++
        else resumen.actualizados++
        // Entró, pero con algo que conviene mirar (un código de barra
        // que ya era de otro producto, por ejemplo).
        if (fila.detalle) resumen.avisos.push(fila)
      }
    }

    onAvance?.(Math.min(i + TANDA, filas.length), filas.length)
  }

  return resumen
}

/*
  ─────────────────────────────────────────────────────────────
  Clientes con su saldo, y saldos de proveedores

  Las dos planillas del día del corte. Van de a tandas por la misma razón
  que los productos, y cada fila vuelve con su resultado: creada,
  actualizada, con un aviso para mirar, o rechazada y por qué.
  ─────────────────────────────────────────────────────────────
*/

async function importarEnTandas(
  funcion: 'importar_clientes' | 'importar_saldos_proveedores',
  parametros: (tanda: Record<string, string>[]) => Record<string, unknown>,
  filas: Record<string, string>[],
  onAvance?: (procesadas: number, total: number) => void,
): Promise<ResumenImportacion> {
  const resumen: ResumenImportacion = { creados: 0, actualizados: 0, errores: [], avisos: [] }

  for (let i = 0; i < filas.length; i += TANDA) {
    const { data, error } = await supabase.rpc(funcion, parametros(filas.slice(i, i + TANDA)))
    if (error) throw new Error(`No se pudo importar desde la fila ${i + 1}: ${error.message}`)

    for (const cruda of (data ?? []) as ResultadoFila[]) {
      const fila = { ...cruda, fila: cruda.fila + i }
      if (fila.resultado === 'error') resumen.errores.push(fila)
      else {
        if (fila.resultado === 'creado') resumen.creados++
        else resumen.actualizados++
        if (fila.detalle) resumen.avisos.push(fila)
      }
    }

    onAvance?.(Math.min(i + TANDA, filas.length), filas.length)
  }

  return resumen
}

/** Clientes, con el saldo que debe cada uno a la fecha del corte. */
export function importarClientes(
  filas: Record<string, string>[],
  fechaSaldo: string,
  onAvance?: (procesadas: number, total: number) => void,
): Promise<ResumenImportacion> {
  return importarEnTandas(
    'importar_clientes',
    (tanda) => ({ p_filas: tanda, p_fecha_saldo: fechaSaldo }),
    filas,
    onAvance,
  )
}

/** Proveedores, con lo que se les debe a la fecha del corte. */
export function importarSaldosProveedores(
  filas: Record<string, string>[],
  fecha: string,
  onAvance?: (procesadas: number, total: number) => void,
): Promise<ResumenImportacion> {
  return importarEnTandas(
    'importar_saldos_proveedores',
    (tanda) => ({ p_filas: tanda, p_fecha: fecha }),
    filas,
    onAvance,
  )
}
