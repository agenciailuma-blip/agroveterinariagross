import { leerCsv } from '@/lib/importacion/planilla'

/*
  Lectura del archivo que sube la persona.

  Vive aparte de planilla.ts a propósito: acá adentro hay una
  dependencia que sólo funciona en el navegador, y planilla.ts —que es
  donde está la lógica que interpreta precios y encabezados— tiene que
  poder probarse en Node sin arrastrarla.
*/

export interface HojaLeida {
  nombre: string
  filas: unknown[][]
}

/*
  Devuelve TODAS las hojas del archivo.

  read-excel-file entrega un arreglo de hojas, no de filas. Antes se lo
  trataba como si fuera lo segundo, así que la primera "fila" era en
  realidad la primera hoja entera y el encabezado salía ilegible. Con
  un archivo de una sola hoja el error pasaba desapercibido; con la
  planilla de Gross —que trae las listas de valores en la primera hoja
  y los productos en la segunda— no se importaba nada.
*/
export async function leerArchivo(archivo: File): Promise<HojaLeida[]> {
  if (/\.xlsx?$/i.test(archivo.name)) {
    // Carga diferida: la librería de Excel pesa, y sólo hace falta en
    // esta pantalla. El mostrador no tiene por qué bajarla.
    const { default: leerExcel } = await import('read-excel-file/browser')
    const hojas = await leerExcel(archivo)
    return hojas.map((h) => ({ nombre: h.sheet, filas: h.data as unknown[][] }))
  }

  return [{ nombre: archivo.name, filas: leerCsv(await archivo.text()) }]
}
