import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import {
  CLIENTE_NUEVO,
  guardarCliente,
  listarClientes,
  obtenerCliente,
  referenciasFiscales,
} from '@/lib/api/clientes'
import type { Cliente } from '@/lib/api/clientes'
import ClienteEditor from '@/components/ClienteEditor'
import CuentaCorriente from '@/components/CuentaCorriente'
import { moneda, numero } from '@/lib/tipos'

type Pestania = 'datos' | 'cuenta'

export default function Clientes() {
  const { perfil, tienePermiso } = useAuth()
  const qc = useQueryClient()

  const [texto, setTexto] = useState('')
  const [debounced, setDebounced] = useState('')
  const [soloConDeuda, setSoloConDeuda] = useState(false)
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Partial<Cliente>>(CLIENTE_NUEVO)
  const [pestania, setPestania] = useState<Pestania>('datos')
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const busqueda = useRef<HTMLInputElement>(null)

  const puedeCrear = tienePermiso('clientes.crear')
  const puedeEditar = tienePermiso('clientes.editar')
  const puedeCobrar = tienePermiso('cuentacorriente.cobrar')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(texto.trim()), 250)
    return () => clearTimeout(t)
  }, [texto])

  useEffect(() => {
    busqueda.current?.focus()
  }, [])

  const listado = useQuery({
    queryKey: ['clientes', debounced, soloConDeuda],
    queryFn: () => listarClientes(debounced, soloConDeuda),
  })

  const referencias = useQuery({
    queryKey: ['referencias-fiscales'],
    queryFn: referenciasFiscales,
    staleTime: 10 * 60_000,
  })

  const detalle = useQuery({
    queryKey: ['cliente', seleccionado],
    queryFn: () => obtenerCliente(seleccionado!),
    enabled: !!seleccionado,
  })

  useEffect(() => {
    if (!detalle.data) return
    setForm(detalle.data.cliente)
    setError(null)
  }, [detalle.data])

  const guardar = useMutation({
    mutationFn: () => guardarCliente(creando ? null : seleccionado, form),
    onSuccess: (id) => {
      setError(null)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['cliente', id] })
      if (creando) {
        setCreando(false)
        setSeleccionado(id)
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar.'),
  })

  function abrir(id: string) {
    setCreando(false)
    setSeleccionado(id)
    setPestania('datos')
  }

  function nuevo() {
    setCreando(true)
    setSeleccionado(null)
    setForm(CLIENTE_NUEVO)
    setPestania('datos')
    setError(null)
  }

  function cerrar() {
    setSeleccionado(null)
    setCreando(false)
    setForm(CLIENTE_NUEVO)
    setError(null)
    busqueda.current?.focus()
  }

  const abierto = creando || !!seleccionado

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Clientes</h1>
          <p className="text-sm text-piedra-500">
            {listado.data ? `${numero.format(listado.data.total)} en total` : 'Cargando…'}
          </p>
        </div>
        {puedeCrear && (
          <button
            onClick={nuevo}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600"
          >
            Nuevo cliente
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <svg
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-piedra-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.3-4.3M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            ref={busqueda}
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nombre, documento o código…"
            className="w-full rounded-xl border border-borde bg-white py-2.5 pr-4 pl-11 text-tinta shadow-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap text-piedra-600">
          <input
            type="checkbox"
            checked={soloConDeuda}
            onChange={(e) => setSoloConDeuda(e.target.checked)}
            className="size-4 rounded border-borde text-marca-700 focus:ring-marca-500"
          />
          Sólo con deuda
        </label>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div
          className={`overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde ${
            abierto ? 'w-96 shrink-0' : 'flex-1'
          }`}
        >
          <div className="h-full overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-piedra-100">
                {listado.isPending && (
                  <tr>
                    <td className="px-4 py-12 text-center text-piedra-400">Buscando…</td>
                  </tr>
                )}
                {!listado.isPending && !listado.data?.filas.length && (
                  <tr>
                    <td className="px-4 py-12 text-center text-piedra-400">
                      {soloConDeuda ? 'Nadie tiene deuda abierta.' : 'No hay clientes que coincidan.'}
                    </td>
                  </tr>
                )}
                {listado.data?.filas.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => abrir(c.id)}
                    className={`cursor-pointer ${
                      c.id === seleccionado ? 'bg-marca-50' : 'hover:bg-piedra-50'
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-tinta">{c.nombre}</p>
                      <p className="text-xs text-piedra-400">
                        {c.numero_documento ?? 'sin documento'}
                        {!c.activo && ' · inactivo'}
                      </p>
                    </td>
                    <td className="w-32 px-4 py-2.5 text-right">
                      {c.cuenta_corriente && (
                        <span
                          className={`text-sm font-medium tabular-nums ${
                            c.saldo > 0 ? 'text-tinta' : 'text-piedra-400'
                          }`}
                        >
                          {moneda.format(c.saldo)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {abierto && referencias.data && (
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
            <div className="flex items-center justify-between border-b border-borde px-5 py-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold text-tinta">
                  {creando ? 'Nuevo cliente' : (form.nombre ?? 'Cliente')}
                </h2>
                {!creando && detalle.data && (
                  <p className="text-xs text-piedra-400">
                    {form.cuenta_corriente
                      ? `Cuenta corriente · saldo ${moneda.format(detalle.data.saldo)}`
                      : 'Sin cuenta corriente'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {guardado && (
                  <span className="rounded-full bg-verde-100 px-2.5 py-1 text-xs font-medium text-verde-800">
                    Guardado
                  </span>
                )}
                <button
                  onClick={cerrar}
                  className="rounded-lg p-1.5 text-piedra-400 hover:bg-piedra-100 hover:text-piedra-600"
                  aria-label="Cerrar"
                >
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {!creando && (
              <div className="flex gap-1 border-b border-borde px-5">
                {(['datos', 'cuenta'] as Pestania[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPestania(p)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                      pestania === p
                        ? 'border-marca-700 text-marca-700'
                        : 'border-transparent text-piedra-500 hover:text-tinta'
                    }`}
                  >
                    {p === 'datos' ? 'Datos' : 'Cuenta corriente'}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5">
              {detalle.isPending && !creando ? (
                <p className="py-8 text-center text-sm text-piedra-400">Cargando…</p>
              ) : pestania === 'datos' || creando ? (
                <ClienteEditor
                  datos={form}
                  onCambio={setForm}
                  condiciones={referencias.data.condiciones}
                  documentos={referencias.data.documentos}
                  listas={referencias.data.listas}
                  puedeEditar={creando ? puedeCrear : puedeEditar}
                />
              ) : detalle.data ? (
                <CuentaCorriente
                  cliente={detalle.data.cliente}
                  saldo={detalle.data.saldo}
                  usuarioId={perfil!.id}
                  puedeCobrar={puedeCobrar}
                  onCambio={() => {
                    qc.invalidateQueries({ queryKey: ['cliente', seleccionado] })
                    qc.invalidateQueries({ queryKey: ['clientes'] })
                  }}
                />
              ) : null}
            </div>

            {(pestania === 'datos' || creando) && (
              <div className="border-t border-borde bg-piedra-50 px-5 py-3">
                {error && (
                  <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
                    {error}
                  </p>
                )}
                <button
                  onClick={() => guardar.mutate()}
                  disabled={
                    !form.nombre?.trim() ||
                    guardar.isPending ||
                    (creando ? !puedeCrear : !puedeEditar)
                  }
                  className="w-full rounded-lg bg-marca-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
                >
                  {guardar.isPending ? 'Guardando…' : creando ? 'Crear cliente' : 'Guardar cambios'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
