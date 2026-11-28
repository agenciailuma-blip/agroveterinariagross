import { useEffect, useState } from 'react'
import { alCambiarElServidor, supabase } from '@/lib/supabase'

export type EstadoConexion = 'en_linea' | 'sin_conexion' | 'verificando'

/*
  Estado de conexión real, no el que dice el sistema operativo.

  navigator.onLine miente seguido: dice que hay red porque la placa está
  conectada al router, aunque el router no llegue a internet. En Oberá
  eso es justamente el caso frecuente. Por eso además se consulta el
  servidor cada tanto.

  Cada treinta segundos (28/11; antes quince): cada pregunta cuenta para
  los cupos del servidor. Un corte sin nadie usando el sistema puede
  tardar hasta quince segundos más en mostrarse; si alguien está
  cobrando, su consulta lo descubre igual que antes.
*/
export function useConexion(intervaloMs = 30_000) {
  const [estado, setEstado] = useState<EstadoConexion>(
    navigator.onLine ? 'verificando' : 'sin_conexion',
  )
  const [ultimoContacto, setUltimoContacto] = useState<Date | null>(null)

  useEffect(() => {
    let vigente = true

    async function verificar() {
      if (!navigator.onLine) {
        if (vigente) setEstado('sin_conexion')
        return
      }
      try {
        // Consulta mínima: sólo confirma que el servidor responde.
        const { error } = await supabase.from('configuracion').select('clave').limit(1)
        if (!vigente) return
        if (error) {
          setEstado('sin_conexion')
        } else {
          setEstado('en_linea')
          setUltimoContacto(new Date())
        }
      } catch {
        if (vigente) setEstado('sin_conexion')
      }
    }

    verificar()
    const timer = setInterval(verificar, intervaloMs)

    const alConectar = () => {
      setEstado('verificando')
      verificar()
    }
    const alDesconectar = () => setEstado('sin_conexion')

    window.addEventListener('online', alConectar)
    window.addEventListener('offline', alDesconectar)

    // Lo que descubre el cortacircuito se sabe en el acto, no a la próxima vuelta.
    const dejarDeEscuchar = alCambiarElServidor((caido) => {
      if (caido) setEstado('sin_conexion')
      else verificar()
    })

    return () => {
      vigente = false
      dejarDeEscuchar()
      clearInterval(timer)
      window.removeEventListener('online', alConectar)
      window.removeEventListener('offline', alDesconectar)
    }
  }, [intervaloMs])

  return { estado, ultimoContacto }
}
