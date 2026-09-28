import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmar } from '@/components/Dialogo'
import { listarPuntosVenta } from '@/lib/api/configuracion'
import {
  crearTerminal,
  darDeBajaTerminal,
  editarTerminal,
  listarTerminales,
  nombreSugerido,
  prefijoSugerido,
} from '@/lib/api/terminales'
import type { TerminalDelLocal, TipoTerminal } from '@/lib/api/terminales'
import { enCastellano } from '@/lib/errores'
import { boton, botonChico, campo, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Cajas y mostradores

  Las máquinas del local. Gross las da de alta solo (28/09): con el
  segundo local en camino, no puede depender de que alguien de afuera
  entre a la base cada vez que suma una PC.

  Crear la terminal es la mitad. La otra mitad pasa en la PC nueva: se
  abre el sistema y se la elige en Ventas. Por eso el aviso después de
  crear dice exactamente eso.
  ─────────────────────────────────────────────────────────────
*/

const ETIQUETA: Record<TipoTerminal, string> = {
  caja: 'Caja',
  mostrador: 'Mostrador',
  oficina: 'Oficina',
}

const hace = (fecha: string | null) => {
  if (!fecha) return 'nunca'
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 2) return 'recién'
  if (min < 60) return `hace ${min} min`
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`
  return new Date(fecha).toLocaleDateString('es-AR')
}

export default function CajasYMostradores() {
  const qc = useQueryClient()
  const terminales = useQuery({ queryKey: ['terminales-del-local'], queryFn: listarTerminales })
  const puntos = useQuery({ queryKey: ['puntos-venta'], queryFn: listarPuntosVenta })
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Una caja factura por su punto de venta: el de contingencia (CAEA) no
  // es para eso.
  const puntosParaCaja = (puntos.data ?? []).filter((p) => p.activo && !p.regimen_caea)

  const refrescar = () => qc.invalidateQueries({ queryKey: ['terminales-del-local'] })

  const baja = useMutation({
    mutationFn: (id: string) => darDeBajaTerminal(id),
    onSuccess: () => {
      setAviso('Dada de baja. Sus ventas quedan registradas con su número.')
      refrescar()
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo dar de baja.')),
  })

  async function pedirBaja(t: TerminalDelLocal) {
    setAviso(null)
    setError(null)
    const ok = await confirmar({
      titulo: `¿Dar de baja «${t.nombre}»?`,
      detalle: 'Deja de aparecer para elegir en las PC. Sus ventas no se tocan. Si esa máquina sigue en uso, va a pedir que se elija otra terminal.',
      aceptar: 'Dar de baja',
      peligro: true,
    })
    if (ok) baja.mutate(t.id)
  }

  return (
    <div className={`${tarjeta} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-tinta">Cajas y mostradores</h2>
          <p className="mt-1 text-sm text-piedra-500">
            Las máquinas del local. Cada una numera sus ventas con su prefijo, y la caja factura con
            su punto de venta.
          </p>
        </div>
        {!creando && (
          <button
            onClick={() => {
              setCreando(true)
              setAviso(null)
              setError(null)
            }}
            className={boton.secundario}
          >
            Agregar
          </button>
        )}
      </div>

      {creando && (
        <FormularioAlta
          existentes={terminales.data ?? []}
          puntos={puntosParaCaja}
          onListo={(nombre) => {
            setCreando(false)
            setAviso(
              `Se dio de alta «${nombre}». En la PC nueva: abrí el sistema, entrá con tu usuario y elegí «${nombre}» en Ventas. Queda guardado en esa máquina.`,
            )
            refrescar()
          }}
          onCancelar={() => setCreando(false)}
        />
      )}

      {aviso && (
        <p className="mt-4 rounded-lg bg-verde-50 px-3 py-2 text-sm text-verde-800 ring-1 ring-verde-200">{aviso}</p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-piedra-100 text-left text-xs text-piedra-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Nombre</th>
              <th className="py-2 pr-3 font-medium">Tipo</th>
              <th className="py-2 pr-3 font-medium">Prefijo</th>
              <th className="py-2 pr-3 font-medium">Punto de venta</th>
              <th className="py-2 pr-3 font-medium">Última conexión</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {terminales.data?.map((t) =>
              editando === t.id ? (
                <FilaEditable
                  key={t.id}
                  t={t}
                  puntos={puntosParaCaja}
                  onListo={() => {
                    setEditando(null)
                    refrescar()
                  }}
                  onCancelar={() => setEditando(null)}
                />
              ) : (
                <tr key={t.id} className="border-b border-piedra-50 last:border-0">
                  <td className="py-2 pr-3 text-tinta">
                    {t.nombre}
                    {t.es_punto_de_encuentro && (
                      <span className="ml-2 rounded bg-marca-50 px-1.5 py-0.5 text-[11px] font-medium text-marca-700">
                        escucha a las demás
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-piedra-600">{ETIQUETA[t.tipo]}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-piedra-600">{t.prefijo ?? '—'}</td>
                  <td className="py-2 pr-3 tabular-nums text-piedra-600">
                    {t.punto_venta ? String(t.punto_venta.numero).padStart(4, '0') : '—'}
                  </td>
                  <td className="py-2 pr-3 text-xs text-piedra-500">
                    {hace(t.ultima_sincronizacion)}
                    {t.version_app && <span className="ml-1 text-piedra-400">· {t.version_app}</span>}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right">
                    <button onClick={() => setEditando(t.id)} className={botonChico.suave}>
                      Editar
                    </button>
                    <button
                      onClick={() => pedirBaja(t)}
                      disabled={baja.isPending}
                      className="rounded-lg px-3 py-1.5 text-xs text-piedra-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                    >
                      Dar de baja
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FormularioAlta({
  existentes,
  puntos,
  onListo,
  onCancelar,
}: {
  existentes: TerminalDelLocal[]
  puntos: { id: string; numero: number; nombre: string }[]
  onListo: (nombre: string) => void
  onCancelar: () => void
}) {
  const prefijos = existentes.map((t) => t.prefijo)
  const [tipo, setTipo] = useState<TipoTerminal>('mostrador')
  const [prefijo, setPrefijo] = useState(() => prefijoSugerido('mostrador', prefijos))
  const [nombre, setNombre] = useState(() => nombreSugerido('mostrador', prefijoSugerido('mostrador', prefijos)))
  const [puntoVenta, setPuntoVenta] = useState(puntos[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  function cambiarTipo(t: TipoTerminal) {
    setTipo(t)
    const p = prefijoSugerido(t, prefijos)
    setPrefijo(p)
    setNombre(nombreSugerido(t, p))
  }

  const crear = useMutation({
    mutationFn: () =>
      crearTerminal({
        nombre,
        tipo,
        prefijo,
        punto_venta_id: tipo === 'caja' ? puntoVenta || null : null,
      }),
    onSuccess: () => onListo(nombre.trim()),
    onError: (e) => setError(enCastellano(e, 'No se pudo crear.')),
  })

  return (
    <div className="mt-4 rounded-lg bg-piedra-50 p-4 ring-1 ring-borde">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Tipo</span>
          <select value={tipo} onChange={(e) => cambiarTipo(e.target.value as TipoTerminal)} className={campo}>
            <option value="mostrador">Mostrador</option>
            <option value="caja">Caja</option>
            <option value="oficina">Oficina</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Prefijo</span>
          <input
            value={prefijo}
            onChange={(e) => setPrefijo(e.target.value.toUpperCase().replace(/\s/g, ''))}
            maxLength={8}
            className={`${campo} font-mono`}
          />
        </label>
        {tipo === 'caja' && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">Punto de venta</span>
            <select value={puntoVenta} onChange={(e) => setPuntoVenta(e.target.value)} className={campo}>
              {puntos.map((p) => (
                <option key={p.id} value={p.id}>
                  {String(p.numero).padStart(4, '0')} · {p.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="mt-2 text-xs text-piedra-500">
        El prefijo va adelante de cada número de venta de esta máquina ({prefijo || 'MOS3'}-000001) y{' '}
        <strong>no se puede cambiar después</strong>.
        {tipo === 'caja' && ' Una caja factura: el punto de venta tiene que estar dado de alta en ARCA.'}
        {tipo === 'oficina' && ' Una oficina no vende ni factura: es para administrar.'}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancelar} className={boton.suave}>
          Cancelar
        </button>
        <button
          onClick={() => {
            setError(null)
            crear.mutate()
          }}
          disabled={!nombre.trim() || !prefijo || (tipo === 'caja' && !puntoVenta) || crear.isPending}
          className={boton.principal}
        >
          {crear.isPending ? 'Creando…' : `Crear ${ETIQUETA[tipo].toLowerCase()}`}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

function FilaEditable({
  t,
  puntos,
  onListo,
  onCancelar,
}: {
  t: TerminalDelLocal
  puntos: { id: string; numero: number; nombre: string }[]
  onListo: () => void
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(t.nombre)
  const [puntoVenta, setPuntoVenta] = useState(t.punto_venta_id ?? puntos[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  const guardar = useMutation({
    mutationFn: () => editarTerminal(t.id, nombre, t.tipo === 'caja' ? puntoVenta : null),
    onSuccess: onListo,
    onError: (e) => setError(enCastellano(e, 'No se pudo guardar.')),
  })

  return (
    <tr className="border-b border-piedra-50 bg-piedra-50/60 last:border-0">
      <td className="py-2 pr-3">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </td>
      <td className="py-2 pr-3 text-piedra-600">{ETIQUETA[t.tipo]}</td>
      <td className="py-2 pr-3 font-mono text-xs text-piedra-400" title="El prefijo no se cambia">
        {t.prefijo ?? '—'}
      </td>
      <td className="py-2 pr-3">
        {t.tipo === 'caja' ? (
          <select value={puntoVenta} onChange={(e) => setPuntoVenta(e.target.value)} className={campo}>
            {puntos.map((p) => (
              <option key={p.id} value={p.id}>
                {String(p.numero).padStart(4, '0')}
              </option>
            ))}
          </select>
        ) : (
          '—'
        )}
      </td>
      <td />
      <td className="whitespace-nowrap py-2 text-right">
        <button onClick={onCancelar} className={botonChico.suave}>
          Cancelar
        </button>
        <button
          onClick={() => guardar.mutate()}
          disabled={!nombre.trim() || guardar.isPending}
          className={botonChico.principal}
        >
          Guardar
        </button>
      </td>
    </tr>
  )
}
