import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import DiagnosticoTerminal from '@/components/DiagnosticoTerminal'
import DatosDelEmisor from '@/components/DatosDelEmisor'
import Depositos from '@/components/Depositos'
import RedDelLocal from '@/components/RedDelLocal'
import ImpresoraDelMostrador from '@/components/ImpresoraDelMostrador'
import RitmoDelMostrador from '@/components/RitmoDelMostrador'
import {
  crearPuntoVenta,
  guardarValorConfiguracion,
  listarPuntosVenta,
  marcarRegimenCaea,
  obtenerConfiguracion,
} from '@/lib/api/configuracion'

const CLAVE_ALICUOTA = 'arca.iibb_percepcion_alicuota'
const CLAVE_MINIMO = 'arca.iibb_percepcion_minimo'

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

/*
  Primera sección de una pantalla de configuración general que todavía no
  existe (ver docs/ESTADO.md). Arranca acotada a la percepción de IIBB
  Misiones porque es lo único que hoy tiene que poder cambiar un
  administrador sin depender de una migración: la DGR fija la alícuota y
  el mínimo por resolución, y pueden cambiar en cualquier momento.
*/
export default function Configuracion() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const [alicuota, setAlicuota] = useState('')
  const [minimo, setMinimo] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const puedeGestionar = tienePermiso('configuracion.gestionar')

  const config = useQuery({
    queryKey: ['configuracion', 'arca.iibb'],
    queryFn: () => obtenerConfiguracion([CLAVE_ALICUOTA, CLAVE_MINIMO]),
    enabled: puedeGestionar,
  })

  useEffect(() => {
    if (!config.data) return
    const porClave = new Map(config.data.map((f) => [f.clave, f.valor]))
    setAlicuota(String(porClave.get(CLAVE_ALICUOTA) ?? ''))
    setMinimo(String(porClave.get(CLAVE_MINIMO) ?? ''))
  }, [config.data])

  const guardar = useMutation({
    mutationFn: async () => {
      await Promise.all([
        guardarValorConfiguracion(CLAVE_ALICUOTA, Number(alicuota)),
        guardarValorConfiguracion(CLAVE_MINIMO, Number(minimo)),
      ])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracion', 'arca.iibb'] })
      setAviso('Guardado')
      setTimeout(() => setAviso(null), 3000)
    },
  })

  if (!puedeGestionar) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        No tenés permiso para modificar la configuración del sistema.
      </p>
    )
  }

  const esValido =
    alicuota !== '' && !Number.isNaN(Number(alicuota)) && minimo !== '' && !Number.isNaN(Number(minimo))

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Configuración</h1>
        <p className="text-sm text-piedra-500">
          Valores del sistema que pueden cambiar por norma, sin depender de una actualización.
        </p>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
        <h2 className="font-medium text-tinta">Percepción de Ingresos Brutos — Misiones</h2>
        <p className="mt-1 text-sm text-piedra-500">
          Gross es agente de <strong>percepción</strong> (no de retención) de IIBB en Misiones,
          régimen 14. Estos dos valores los fija la DGR y pueden cambiar por resolución.
        </p>

        {config.isLoading ? (
          <p className="mt-4 text-sm text-piedra-500">Cargando…</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">Alícuota</span>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={alicuota}
                  onChange={(e) => setAlicuota(e.target.value)}
                  className={`${claseInput} pr-6 text-right tabular-nums`}
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-piedra-400">
                  %
                </span>
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">
                Mínimo no sujeto a percepción
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-piedra-400">
                  $
                </span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={minimo}
                  onChange={(e) => setMinimo(e.target.value)}
                  className={`${claseInput} pl-6 text-right tabular-nums`}
                />
              </div>
            </label>
            <p className="col-span-2 text-xs text-piedra-400">
              El mínimo es sobre el importe de la percepción ya calculada, no sobre el monto de la
              venta: así lo indicó el contador.
            </p>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => guardar.mutate()}
            disabled={!esValido || guardar.isPending || config.isLoading}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
          {aviso && (
            <span className="rounded-full bg-verde-100 px-3 py-1 text-xs font-medium text-verde-800 ring-1 ring-verde-200">
              {aviso}
            </span>
          )}
          {guardar.isError && (
            <span className="text-xs text-red-600">No se pudo guardar. Probá de nuevo.</span>
          )}
        </div>
      </div>

      <RitmoDelMostrador />

      <DiagnosticoTerminal />

      <DatosDelEmisor />

      <ImpresoraDelMostrador />

      <RedDelLocal />

      <PuntosDeVenta />

      <Depositos />

      <div className="rounded-xl bg-piedra-100 p-4 text-sm text-piedra-600">
        <p className="font-medium text-tinta">Sobre la exclusión por cliente</p>
        <p className="mt-1">
          Si un cliente tiene certificado de exclusión o no percepción de la DGR, se carga en su
          ficha (pestaña Clientes → Datos fiscales), no acá: ese dato es por cliente, no general.
        </p>
      </div>
    </div>
  )
}

/*
  Puntos de venta de ARCA.

  Lo que se administra acá es el REGISTRO de lo que ya está dado de alta
  en el portal de ARCA, no el alta en sí. Marcar la casilla del régimen
  CAEA sin haber hecho el trámite no habilita nada: ARCA sigue
  rechazando el pedido con el error 15003.
*/
function PuntosDeVenta() {
  const qc = useQueryClient()
  const [nuevo, setNuevo] = useState({ numero: '', nombre: '', caea: true })
  const [error, setError] = useState<string | null>(null)

  const puntos = useQuery({ queryKey: ['puntos-venta'], queryFn: listarPuntosVenta })

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['puntos-venta'] })
    qc.invalidateQueries({ queryKey: ['contingencia'] })
  }

  const marcar = useMutation({
    mutationFn: ({ id, valor }: { id: string; valor: boolean }) => marcarRegimenCaea(id, valor),
    onSuccess: refrescar,
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar.'),
  })

  const crear = useMutation({
    mutationFn: () => crearPuntoVenta(Number(nuevo.numero), nuevo.nombre.trim(), nuevo.caea),
    onSuccess: () => {
      setNuevo({ numero: '', nombre: '', caea: true })
      setError(null)
      refrescar()
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo agregar.'),
  })

  const filas = puntos.data ?? []
  const puedeCrear =
    nuevo.numero !== '' && Number(nuevo.numero) > 0 && nuevo.nombre.trim().length > 2

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <h2 className="font-medium text-tinta">Puntos de venta de ARCA</h2>
      <p className="mt-1 text-sm text-piedra-500">
        Los que están dados de alta en el portal de ARCA. El régimen CAEA es el que habilita a
        facturar cuando ARCA no responde: sin al menos uno, ARCA no otorga el código.
      </p>

      <table className="mt-4 w-full text-sm">
        <thead className="border-b border-borde text-left text-xs tracking-wide text-piedra-500 uppercase">
          <tr>
            <th className="py-2 font-medium">Número</th>
            <th className="py-2 font-medium">Nombre</th>
            <th className="py-2 font-medium">Régimen CAEA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-piedra-100">
          {filas.map((p) => (
            <tr key={p.id}>
              <td className="py-2 font-mono text-xs text-tinta">
                {String(p.numero).padStart(5, '0')}
              </td>
              <td className="py-2 text-tinta">
                {p.nombre}
                {!p.activo && <span className="ml-2 text-xs text-piedra-400">inactivo</span>}
              </td>
              <td className="py-2">
                <label className="flex items-center gap-2 text-xs text-piedra-600">
                  <input
                    type="checkbox"
                    checked={p.regimen_caea}
                    disabled={marcar.isPending}
                    onChange={(e) => marcar.mutate({ id: p.id, valor: e.target.checked })}
                    className="size-4 rounded border-borde"
                  />
                  {p.regimen_caea ? 'Habilitado para contingencia' : 'No'}
                </label>
              </td>
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-sm text-piedra-400">
                No hay puntos de venta cargados.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-borde pt-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Número</span>
          <input
            type="number"
            min={1}
            value={nuevo.numero}
            onChange={(e) => setNuevo({ ...nuevo, numero: e.target.value })}
            className={`${claseInput} w-24`}
          />
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Nombre</span>
          <input
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            placeholder="Contingencia CAEA"
            className={claseInput}
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-piedra-600">
          <input
            type="checkbox"
            checked={nuevo.caea}
            onChange={(e) => setNuevo({ ...nuevo, caea: e.target.checked })}
            className="size-4 rounded border-borde"
          />
          Régimen CAEA
        </label>
        <button
          onClick={() => crear.mutate()}
          disabled={!puedeCrear || crear.isPending}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50 disabled:opacity-40"
        >
          {crear.isPending ? 'Agregando…' : 'Agregar'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
