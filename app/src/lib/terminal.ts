import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface Terminal {
  id: string
  nombre: string
  tipo: 'caja' | 'mostrador' | 'oficina'
  prefijo: string | null
  punto_venta_id: string | null
}

const CLAVE = 'gross.terminal'

/*
  Qué terminal es esta máquina.

  Se elige una vez por PC y queda guardado localmente. No puede venir del
  usuario: el mismo vendedor atiende desde cualquiera de los mostradores,
  y lo que define el prefijo de numeración y la impresora es la máquina,
  no la persona.
*/
export function useTerminal() {
  const [terminal, setTerminalEstado] = useState<Terminal | null>(null)
  const [disponibles, setDisponibles] = useState<Terminal[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true

    async function cargar() {
      const { data } = await supabase
        .from('terminal')
        .select('id, nombre, tipo, prefijo, punto_venta_id')
        .eq('activo', true)
        .is('eliminado_en', null)
        .order('nombre')

      if (!vigente) return
      const lista = (data ?? []) as Terminal[]
      setDisponibles(lista)

      const guardada = localStorage.getItem(CLAVE)
      // Se revalida contra el servidor: si la terminal se dio de baja,
      // la máquina tiene que volver a elegir en vez de operar con una
      // referencia muerta.
      const encontrada = lista.find((t) => t.id === guardada) ?? null
      if (guardada && !encontrada) localStorage.removeItem(CLAVE)
      setTerminalEstado(encontrada)
      setCargando(false)
    }

    cargar()
    return () => {
      vigente = false
    }
  }, [])

  const elegir = useCallback((t: Terminal) => {
    localStorage.setItem(CLAVE, t.id)
    setTerminalEstado(t)
  }, [])

  const olvidar = useCallback(() => {
    localStorage.removeItem(CLAVE)
    setTerminalEstado(null)
  }, [])

  return { terminal, disponibles, cargando, elegir, olvidar }
}
