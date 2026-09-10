/*
  Lo que dice el sistema, dicho para el mostrador.

  Los errores que llegan de adentro —del navegador, de la base— están
  escritos para nosotros: en inglés, con nombres de tablas y de archivos.
  Sirven en un registro; no sirven arriba del teclado del PIN ni al lado
  del botón de guardar una factura, que es donde los lee alguien que
  tiene un cliente esperando o un papel en la mano.

  Es la misma familia del "tauri localhost dice" que Lucas marcó el
  07/09. La regla acá es la misma que allá: si el mensaje no dice qué
  hacer, no sirve.

  Lo que NO hace esta función es esconder. Los mensajes que escribimos
  nosotros —los que salen de las funciones de la base, en castellano y
  explicando el caso— pasan tal cual, porque esos ya dicen lo que hay que
  saber.
*/
export function enCastellano(e: unknown, siNoSeSabe = 'No se pudo completar la operación.'): string {
  const crudo = e instanceof Error ? e.message : ''
  if (!crudo.trim()) return siNoSeSabe

  /*
    El programa no pudo traer una parte de sí mismo. Pasa en la versión
    web cuando se corta la conexión justo cuando hacía falta un pedazo
    que todavía no estaba bajado. Con recargar alcanza, y eso es
    exactamente lo que no se entiende del mensaje original.
  */
  if (/dynamically imported module|failed to fetch|networkerror|load failed/i.test(crudo)) {
    return 'No se pudo cargar una parte del sistema. Recargá la pantalla y volvé a intentar.'
  }

  /*
    Un importe más grande de lo que entra en la columna. En la práctica
    es siempre lo mismo: un cero de más, o un número que se pegó dos
    veces adentro del campo.
  */
  if (/numeric field overflow/i.test(crudo)) {
    return 'Hay un importe demasiado grande. Fijate que no se haya colado un cero de más.'
  }

  // Algo que ya estaba cargado. Las funciones de la base que saben QUÉ
  // está repetido lo dicen ellas; esto es para el resto.
  if (/duplicate key|violates unique constraint/i.test(crudo)) {
    return 'Eso ya estaba cargado.'
  }

  return crudo
}
