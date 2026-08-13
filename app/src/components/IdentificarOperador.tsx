import { useCallback, useEffect, useRef, useState } from 'react'
import { verificarPin } from '@/lib/api/ventas'
import type { Operador } from '@/lib/api/ventas'

const CLAVE = 'gross.operador'
/*
  Minutos de inactividad tras los cuales hay que volver a poner el PIN.

  Es el equilibrio entre las dos cosas que pidió Lucas: que no estén
  entrando y saliendo todo el tiempo, y que cada venta quede atribuida a
  quien la hizo. Si el operador quedara identificado todo el día, la
  primera venta del que agarra la terminal después saldría a nombre del
  anterior.
*/
const MINUTOS_INACTIVIDAD = 10

interface Guardado {
  operador: Operador
  ultimoUso: number
}

export function useOperador() {
  const [operador, setOperador] = useState<Operador | null>(() => {
    const crudo = sessionStorage.getItem(CLAVE)
    if (!crudo) return null
    try {
      const g = JSON.parse(crudo) as Guardado
      const vencido = Date.now() - g.ultimoUso > MINUTOS_INACTIVIDAD * 60_000
      return vencido ? null : g.operador
    } catch {
      return null
    }
  })

  const marcarUso = useCallback((o: Operador | null) => {
    if (o) sessionStorage.setItem(CLAVE, JSON.stringify({ operador: o, ultimoUso: Date.now() }))
    else sessionStorage.removeItem(CLAVE)
  }, [])

  const identificar = useCallback(
    (o: Operador) => {
      setOperador(o)
      marcarUso(o)
    },
    [marcarUso],
  )

  const salir = useCallback(() => {
    setOperador(null)
    marcarUso(null)
  }, [marcarUso])

  // Cada actividad corre el reloj de inactividad.
  const renovar = useCallback(() => operador && marcarUso(operador), [operador, marcarUso])

  useEffect(() => {
    if (!operador) return
    const timer = setInterval(() => {
      const crudo = sessionStorage.getItem(CLAVE)
      if (!crudo) return salir()
      const g = JSON.parse(crudo) as Guardado
      if (Date.now() - g.ultimoUso > MINUTOS_INACTIVIDAD * 60_000) salir()
    }, 30_000)
    return () => clearInterval(timer)
  }, [operador, salir])

  return { operador, identificar, salir, renovar }
}

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'borrar', '0', 'ok']

export function IdentificarOperador({
  onIdentificado,
  onCancelar,
}: {
  onIdentificado: (o: Operador) => void
  onCancelar?: () => void
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)

  const confirmar = useCallback(
    async (valor: string) => {
      if (valor.length < 4 || verificando) return
      setVerificando(true)
      setError(null)
      try {
        const o = await verificarPin(valor)
        if (o) {
          onIdentificado(o)
        } else {
          setError('PIN incorrecto.')
          setPin('')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo verificar.')
        setPin('')
      } finally {
        setVerificando(false)
      }
    },
    [onIdentificado, verificando],
  )

  function teclear(t: string) {
    setError(null)
    if (t === 'borrar') return setPin((p) => p.slice(0, -1))
    if (t === 'ok') return void confirmar(pin)
    if (pin.length >= 4) return
    const nuevo = pin + t
    setPin(nuevo)
    if (nuevo.length === 4) void confirmar(nuevo)
  }

  // El teclado físico también sirve: en el mostrador es más rápido que
  // apuntar con el mouse.
  useEffect(() => {
    contenedor.current?.focus()
    function alTeclado(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        teclear(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        teclear('borrar')
      } else if (e.key === 'Enter') {
        e.preventDefault()
        teclear('ok')
      } else if (e.key === 'Escape' && onCancelar) {
        onCancelar()
      }
    }
    window.addEventListener('keydown', alTeclado)
    return () => window.removeEventListener('keydown', alTeclado)
  })

  return (
    <div
      ref={contenedor}
      tabIndex={-1}
      className="grid min-h-full place-items-center bg-marca-950/95 p-4 outline-none"
    >
      <div className="w-full max-w-xs">
        <div className="mb-6 text-center">
          <img src="/marca/isotipo.svg" alt="" className="mx-auto mb-4 size-12 brightness-0 invert" />
          <p className="font-medium text-white">Ingresá tu PIN</p>
          <p className="text-xs text-marca-300/70">Para registrar quién hace la venta</p>
        </div>

        <div className="mb-5 flex justify-center gap-3" aria-live="polite">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`size-3.5 rounded-full transition-colors ${
                i < pin.length ? 'bg-acento-400' : 'bg-white/20'
              }`}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mb-4 text-center text-sm text-acento-300">
            {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2.5">
          {TECLAS.map((t) => (
            <button
              key={t}
              onClick={() => teclear(t)}
              disabled={verificando}
              className={`h-16 rounded-xl text-xl font-medium transition-colors disabled:opacity-40 ${
                t === 'ok'
                  ? 'bg-verde-600 text-white hover:bg-verde-500'
                  : t === 'borrar'
                    ? 'bg-white/10 text-white hover:bg-white/20'
                    : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {t === 'borrar' ? '←' : t === 'ok' ? '✓' : t}
            </button>
          ))}
        </div>

        {onCancelar && (
          <button
            onClick={onCancelar}
            className="mt-5 w-full py-2 text-sm text-marca-300/70 hover:text-white"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}
