import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTerminal } from '@/lib/terminal'
import { useAuth } from '@/auth/AuthProvider'
import { IdentificarOperador, useOperador } from '@/components/IdentificarOperador'
import CierreDeCaja from '@/components/CierreDeCaja'
import MovimientosCaja from '@/components/MovimientosCaja'
import CobroDeVenta from '@/components/CobroDeVenta'
import { abrirCaja, cajaAbierta, listarVentasEnCola } from '@/lib/api/caja'
import { moneda } from '@/lib/tipos'
import { useAtajo } from '@/lib/atajos'

export default function Caja() {
  const { terminal, cargando: cargandoTerminal } = useTerminal()
  const { operador, identificar, salir } = useOperador()
  const { tienePermiso } = useAuth()

  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const [conMovimientos, setConMovimientos] = useState(false)
  const caja = useQuery({
    queryKey: ['caja'],
    queryFn: () => cajaAbierta(),
    enabled: !!terminal,
  })

  const cola = useQuery({
    queryKey: ['cola-caja'],
    queryFn: listarVentasEnCola,
    refetchInterval: 8000, // el mostrador manda ventas mientras la caja trabaja
  })

  // F3 pasa a la próxima venta de la cola; después de la última, vuelve a la primera.
  useAtajo('F3', () => {
    const lista = cola.data ?? []
    if (!lista.length) return
    const i = lista.findIndex((v) => v.id === seleccionada)
    setSeleccionada(lista[(i + 1) % lista.length].id)
  })

  if (cargandoTerminal) return <p className="text-sm text-piedra-500">Cargando…</p>

  /*
    Esto va ANTES de mirar si la caja está cargando, y el orden importa.

    La consulta de la caja está deshabilitada mientras no haya terminal
    (`enabled: !!terminal`), y una consulta deshabilitada de React Query
    informa `isPending: true` para siempre — no está cargando, es que
    nunca va a arrancar. Preguntando primero por `caja.isPending`, esta
    pantalla se quedaba en "Cargando…" eternamente en una máquina sin
    terminal, y el mensaje de abajo no se mostraba nunca.

    Es el peor final posible para el aviso: la máquina no está rota y hay
    una sola cosa que hacer para arreglarla, pero la pantalla no la dice.
  */
  if (!terminal)
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        Esta máquina todavía no tiene terminal asignada. Entrá a Ventas para elegirla.
      </p>
    )

  if (caja.isPending) return <p className="text-sm text-piedra-500">Cargando…</p>

  // La caja es una sola para el local y cualquier puesto cobra contra
  // ella. Si nadie la abrió, el encargado la abre desde acá con su PIN,
  // sin identificarse antes como operador.
  if (!caja.data) return <AbrirCaja terminalId={terminal.id} onAbierta={() => caja.refetch()} />

  if (!operador)
    return (
      <div className="-m-4 min-h-[calc(100vh-3.5rem)] md:-m-6">
        <IdentificarOperador terminalId={terminal.id} onIdentificado={identificar} />
      </div>
    )

  /*
    En la PC la cola va a la izquierda con 20 rem fijos. Debajo de lg
    no entra al lado del cobro (a 375 px le dejaba unos píxeles): se
    apila, la cola arriba con su propio alto y la página se desplaza
    hacia abajo. Medido el 15/10.
  */
  return (
    <div className="flex flex-col gap-4 lg:h-full lg:flex-row">
      <div className="flex flex-col gap-3 lg:w-80 lg:shrink-0">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Caja</h1>
          <p className="text-sm text-piedra-500">
            {terminal.nombre} · <span className="font-medium text-tinta">{operador.nombre}</span>
            <button onClick={salir} className="ml-2 text-marca-700 hover:underline">
              cambiar
            </button>
          </p>
        </div>

        <div className="flex-1 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
          <div className="border-b border-borde px-4 py-2.5">
            <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">
              Esperando cobro {cola.data?.length ? `· ${cola.data.length}` : ''}
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto lg:h-full lg:max-h-none">
            {!cola.data?.length && (
              <p className="px-4 py-10 text-center text-sm text-piedra-400">
                No hay ventas esperando.
              </p>
            )}
            {cola.data?.map((v) => (
              <button
                key={v.id}
                onClick={() => setSeleccionada(v.id)}
                className={`block w-full border-b border-piedra-100 px-4 py-3 text-left last:border-0 ${
                  v.id === seleccionada ? 'bg-marca-50' : 'hover:bg-piedra-50'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-piedra-400">{v.codigo}</span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums text-tinta">
                      {moneda.format(Math.round((v.total + v.percepcion) * 100) / 100)}
                    </span>
                    {v.percepcion > 0 && (
                      <span className="block text-[11px] text-piedra-500">con percepción IIBB</span>
                    )}
                  </span>
                </div>
                {/*
                  El nombre para llamar va primero y grande: es lo que el
                  cajero dice en voz alta. El cliente de la ficha queda
                  debajo, chico, porque en el mostrador casi siempre dice
                  "Consumidor Final" y no sirve para llamar a nadie.
                */}
                {v.nombre_para_llamar ? (
                  <>
                    <p className="truncate text-sm font-medium text-tinta">
                      {v.nombre_para_llamar}
                    </p>
                    <p className="truncate text-xs text-piedra-400">
                      {v.cliente?.nombre}
                      {v.vendedor?.nombre ? ` · ${v.vendedor.nombre}` : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="truncate text-sm text-tinta">{v.cliente?.nombre}</p>
                    <p className="truncate text-xs text-piedra-400">{v.vendedor?.nombre}</p>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* La plata que entra o sale del cajón sin ser una venta: gastos, anticipos, pagos, retiros. */}
        {tienePermiso('caja.movimientos') && (
          <button
            onClick={() => setConMovimientos(true)}
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-piedra-600 ring-1 ring-borde hover:bg-piedra-50"
          >
            Ingresos y egresos
          </button>
        )}
        <button
          onClick={() => setCerrando(true)}
          className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-piedra-600 ring-1 ring-borde hover:bg-piedra-50"
        >
          Cerrar caja
        </button>
        <Link to="/caja/cierres" className="text-center text-xs text-marca-700 hover:underline">
          Cierres anteriores
        </Link>
      </div>

      <div className="min-w-0 flex-1">
        <CobroDeVenta
          ventaId={seleccionada}
          cajaId={caja.data.id}
          terminal={terminal}
          operador={operador}
          sinVenta={
            <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 py-10 lg:h-full lg:py-0">
              <p className="text-sm text-piedra-400">Elegí una venta de la cola para cobrarla.</p>
            </div>
          }
          onTerminada={() => setSeleccionada(null)}
          onCancelar={() => setSeleccionada(null)}
        />
      </div>

      {conMovimientos && caja.data && (
        <MovimientosCaja cajaId={caja.data.id} onCerrar={() => setConMovimientos(false)} />
      )}

      {cerrando && caja.data && (
        <CierreDeCaja
          cajaId={caja.data.id}
          onCerrada={() => {
            setCerrando(false)
            setSeleccionada(null)
            caja.refetch()
          }}
          onCancelar={() => setCerrando(false)}
        />
      )}
    </div>
  )
}

function AbrirCaja({ terminalId, onAbierta }: { terminalId: string; onAbierta: () => void }) {
  const [monto, setMonto] = useState('0')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const abrir = useMutation({
    mutationFn: () => abrirCaja(terminalId, Number(monto) || 0, pin),
    onSuccess: onAbierta,
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo abrir.'),
  })

  return (
    <div className="mx-auto max-w-sm py-16">
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-borde">
        <h1 className="font-semibold text-tinta">Abrir caja</h1>
        <p className="mt-1 text-sm text-piedra-500">
          La caja es una para todo el local. ¿Con cuánto efectivo arranca el día? Es contra este
          número que se va a arquear al cerrar.
        </p>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Monto inicial</span>
          <input
            type="number"
            min="0"
            step="0.01"
            autoFocus
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="w-full rounded-lg border border-borde px-3 py-2.5 text-right text-lg tabular-nums outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">PIN del encargado</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pin && !abrir.isPending) abrir.mutate()
            }}
            className="w-full rounded-lg border border-borde px-3 py-2.5 text-center text-lg tracking-widest outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
          />
        </label>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <button
          onClick={() => abrir.mutate()}
          disabled={abrir.isPending || !pin}
          className="mt-4 w-full rounded-lg bg-marca-700 px-4 py-2.5 font-medium text-white hover:bg-marca-600 disabled:opacity-60"
        >
          {abrir.isPending ? 'Abriendo…' : 'Abrir caja'}
        </button>
      </div>
    </div>
  )
}
