import { useEffect, useState } from 'react'

/*
  El mismo valor, pero recién cuando se deja de escribir.

  Para los filtros que van a la base: sin esto, escribir «Enrique»
  serían siete consultas.
*/
export function useDiferido<T>(valor: T, ms = 350): T {
  const [diferido, setDiferido] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setDiferido(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return diferido
}
