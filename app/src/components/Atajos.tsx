import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { ATAJOS, IR_A, atajoDePantalla, useAtajo } from '@/lib/atajos'

/** La tecla, dibujada como tecla. Al lado del botón que aprieta. */
export function TeclaAtajo({ tecla, clara = false }: { tecla: string; clara?: boolean }) {
  return (
    <kbd
      className={`ml-2 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium ${
        clara ? 'bg-white/20 text-white/90' : 'bg-piedra-100 text-piedra-600 ring-1 ring-borde'
      }`}
    >
      {tecla}
    </kbd>
  )
}

/** La tabla de atajos, agrupada por dónde se usan. La misma en la ayuda y en Configuración. */
export function ListaDeAtajos() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {ATAJOS.map((g) => (
        <section key={g.donde} className="min-w-0">
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-piedra-400 uppercase">{g.donde}</h3>
          <dl className="divide-y divide-piedra-100">
            {g.atajos.map((a) => (
              <div key={a.teclas + a.que} className="flex items-baseline gap-3 py-1.5">
                <dt className="w-28 shrink-0">
                  <kbd className="rounded bg-piedra-100 px-1.5 py-0.5 font-mono text-xs font-medium text-tinta ring-1 ring-borde">
                    {a.teclas}
                  </kbd>
                </dt>
                <dd className="min-w-0 text-sm text-piedra-600">{a.que}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

function Ayuda({ onCerrar }: { onCerrar: () => void }) {
  // Mientras está abierta, F1 la cierra y F9 no aprieta nada de atrás.
  useAtajo('F1', onCerrar)
  useAtajo('F9', onCerrar)
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', alTeclado)
    return () => window.removeEventListener('keydown', alTeclado)
  }, [onCerrar])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-tinta/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Atajos de teclado"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-lg ring-1 ring-borde"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-tinta">Atajos de teclado</h2>
            <p className="text-sm text-piedra-500">Para trabajar sin el mouse. F1 abre y cierra esta lista.</p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-piedra-600 hover:bg-piedra-100"
          >
            Cerrar
          </button>
        </div>
        <ListaDeAtajos />
      </div>
    </div>
  )
}

/*
  Las teclas de función, para todo el sistema.

  Primero la pantalla: si registró la tecla, es suya —en el Mostrador,
  F2 vuelve al buscador en vez de recargar la pantalla—. Si no, las de
  ir a otra pantalla, sólo hacia donde la persona puede entrar. Y F1,
  la ayuda.

  Toda tecla de función que se atiende se frena: en el navegador F1
  abre la ayuda de Chrome y F3 busca en la página.
*/
export function useAtajosGlobales() {
  const navegar = useNavigate()
  const { tienePermiso } = useAuth()
  const [ayuda, setAyuda] = useState(false)

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (!/^F([1-9]|1[0-2])$/.test(e.key) || e.altKey || e.ctrlKey || e.metaKey) return

      const propia = atajoDePantalla(e.key)
      if (propia) {
        e.preventDefault()
        propia()
        return
      }
      if (e.key === 'F1') {
        e.preventDefault()
        setAyuda(true)
        return
      }
      const destino = IR_A.find((d) => d.tecla === e.key)
      if (destino && tienePermiso(destino.permiso)) {
        e.preventDefault()
        navegar(destino.a)
      }
    }
    window.addEventListener('keydown', alTeclado)
    return () => window.removeEventListener('keydown', alTeclado)
  }, [navegar, tienePermiso])

  return {
    abrirAyuda: () => setAyuda(true),
    ayuda: ayuda ? <Ayuda onCerrar={() => setAyuda(false)} /> : null,
  }
}
