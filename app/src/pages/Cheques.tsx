import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { pedirTexto } from '@/components/Dialogo'
import CamposCheque from '@/components/CamposCheque'
import {
  ESTADO_CHEQUE,
  corregir,
  depositar,
  deshacer,
  devolver,
  faltaEnCheque,
  historialDe,
  hoyEnObera,
  listarCheques,
  marcarDebitados,
  plazoDeDeposito,
  rechazar,
  textoDelPlazo,
} from '@/lib/api/cheques'
import type { Cheque, DatosCheque, Vista } from '@/lib/api/cheques'
import { enCastellano } from '@/lib/errores'
import { moneda } from '@/lib/tipos'
import { boton, botonChico, campo, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  La cartera de cheques

  Lo que antes vivía en un cuaderno: qué cheques hay, de quién, por
  cuánto, para cuándo y dónde están. Tres vistas:

  · En cartera: los recibidos que todavía están en el cajón, ordenados
    por fecha de pago. Se depositan de a varios, y el plazo de 30 días
    para depositarlos está a la vista — un cheque «que se hace correr» es
    justamente el que se queda en el cajón hasta el último día.
  · Propios a debitar: los que libró Gross y todavía no se cobraron. Es
    lo que tiene que haber en el banco, y cuándo.
  · Todos: la historia completa, para contestar «¿dónde está el cheque
    de Fulano?».

  Endosar no se hace acá: se hace al pagarle al proveedor, en su cuenta,
  que es donde se decide qué factura paga.
  ─────────────────────────────────────────────────────────────
*/

const fechaCorta = (f: string | null) => (f ? new Date(`${f}T00:00:00`).toLocaleDateString('es-AR') : '—')

const COLOR_ESTADO: Record<string, string> = {
  en_cartera: 'bg-verde-50 text-verde-800 ring-verde-200',
  emitido: 'bg-marca-50 text-marca-800 ring-marca-200',
  depositado: 'bg-piedra-50 text-piedra-700 ring-borde',
  endosado: 'bg-piedra-50 text-piedra-700 ring-borde',
  debitado: 'bg-piedra-50 text-piedra-700 ring-borde',
  devuelto: 'bg-piedra-50 text-piedra-500 ring-borde',
  anulado: 'bg-piedra-50 text-piedra-500 ring-borde',
  rechazado: 'bg-red-50 text-red-800 ring-red-200',
}

const COLOR_PLAZO = {
  todavia_no: 'text-piedra-500',
  se_puede: 'text-verde-700',
  ultimos_dias: 'font-medium text-amber-700',
  vencido: 'font-medium text-red-700',
} as const

export default function Cheques() {
  const { tienePermiso } = useAuth()
  const puedeMover = tienePermiso('cheques.gestionar')
  const [params, setParams] = useSearchParams()
  const vista = (params.get('ver') as Vista | null) ?? 'cartera'
  const [abierto, setAbierto] = useState<string | null>(params.get('id'))
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [buscar, setBuscar] = useState('')
  const [dialogo, setDialogo] = useState<
    | { tipo: 'depositar'; cheques: Cheque[] }
    | { tipo: 'debitar'; cheques: Cheque[] }
    | { tipo: 'rechazar'; cheque: Cheque }
    | { tipo: 'devolver'; cheque: Cheque }
    | { tipo: 'corregir'; cheque: Cheque }
    | null
  >(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const qc = useQueryClient()

  const cartera = useQuery({ queryKey: ['cheques', 'cartera'], queryFn: () => listarCheques('cartera') })
  const propios = useQuery({ queryKey: ['cheques', 'propios'], queryFn: () => listarCheques('propios') })
  const todos = useQuery({
    queryKey: ['cheques', 'todos'],
    queryFn: () => listarCheques('todos'),
    enabled: vista === 'todos',
  })

  const lista = vista === 'cartera' ? cartera : vista === 'propios' ? propios : todos
  const hoy = hoyEnObera()

  const visibles = useMemo(() => {
    const filas = lista.data ?? []
    const q = buscar.trim().toLowerCase()
    if (vista !== 'todos' || !q) return filas
    return filas.filter((c) =>
      [c.nombre, c.librador, c.cliente, c.proveedor, c.librador_cuit, c.venta]
        .filter(Boolean)
        .some((t) => t!.toLowerCase().includes(q)),
    )
  }, [lista.data, buscar, vista])

  const totalCartera = (cartera.data ?? []).reduce((s, c) => s + c.importe, 0)
  const totalPropios = (propios.data ?? []).reduce((s, c) => s + c.importe, 0)
  const urgentes = (cartera.data ?? []).filter((c) => {
    const p = plazoDeDeposito(c.fecha_pago, hoy)
    return p.tipo === 'ultimos_dias' || p.tipo === 'vencido'
  })

  const seleccion = visibles.filter((c) => elegidos.has(c.id))
  const totalSeleccion = seleccion.reduce((s, c) => s + c.importe, 0)
  const sePuedeElegir = puedeMover && vista !== 'todos'

  function cambiarVista(v: Vista) {
    setElegidos(new Set())
    setAbierto(null)
    setParams(v === 'cartera' ? {} : { ver: v })
  }

  function listo(mensaje: string) {
    setDialogo(null)
    setElegidos(new Set())
    setAviso(mensaje)
    qc.invalidateQueries({ queryKey: ['cheques'] })
    qc.invalidateQueries({ queryKey: ['cheque-historial'] })
    qc.invalidateQueries({ queryKey: ['cartera-para-endosar'] })
    qc.invalidateQueries({ queryKey: ['calendario'] })
  }

  const deshacerCheque = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => deshacer(id, motivo),
    onSuccess: () => listo('Listo: el cheque volvió a como estaba.'),
    onError: (e) => setAviso(enCastellano(e, 'No se pudo deshacer.')),
  })

  async function pedirDeshacer(c: Cheque) {
    const motivo = await pedirTexto({
      titulo: c.estado === 'depositado' ? '¿Volver el cheque a la cartera?' : '¿Volver a esperar el débito?',
      detalle: `${c.nombre} · ${moneda.format(c.importe)}. Es para el error de marcar el cheque equivocado; queda en la historia.`,
      etiqueta: 'Por qué',
      ejemplo: 'Era otro cheque',
      minimo: 3,
      aceptar: 'Deshacer',
    })
    if (motivo) deshacerCheque.mutate({ id: c.id, motivo })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Cheques</h1>
        <p className="text-sm text-piedra-500">
          Los que se recibieron y todavía están en el cajón, y los propios que falta que se debiten.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <button onClick={() => cambiarVista('cartera')} className={`${tarjeta} p-4 text-left hover:ring-marca-200`}>
          <p className="text-xs text-piedra-500">En cartera · {cartera.data?.length ?? '—'}</p>
          <p className="text-2xl font-semibold tabular-nums text-tinta">{moneda.format(totalCartera)}</p>
        </button>
        <button onClick={() => cambiarVista('cartera')} className={`${tarjeta} p-4 text-left hover:ring-marca-200`}>
          <p className="text-xs text-piedra-500">Hay que depositarlos esta semana</p>
          <p className={`text-2xl font-semibold tabular-nums ${urgentes.length ? 'text-amber-700' : 'text-tinta'}`}>
            {urgentes.length ? `${urgentes.length} · ${moneda.format(urgentes.reduce((s, c) => s + c.importe, 0))}` : 'Ninguno'}
          </p>
        </button>
        <button onClick={() => cambiarVista('propios')} className={`${tarjeta} p-4 text-left hover:ring-marca-200`}>
          <p className="text-xs text-piedra-500">Propios por debitar · {propios.data?.length ?? '—'}</p>
          <p className="text-2xl font-semibold tabular-nums text-tinta">{moneda.format(totalPropios)}</p>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['cartera', 'En cartera'],
              ['propios', 'Propios a debitar'],
              ['todos', 'Todos'],
            ] as [Vista, string][]
          ).map(([v, t]) => (
            <button
              key={v}
              onClick={() => cambiarVista(v)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${
                vista === v ? 'bg-marca-700 text-white ring-marca-700' : 'bg-white text-piedra-600 ring-borde hover:bg-piedra-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {vista === 'todos' && (
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar por número, banco, librador, cliente o proveedor…"
            className={`${campo} sm:w-96`}
          />
        )}
      </div>

      {aviso && (
        <p className="flex items-start justify-between gap-3 rounded-lg bg-piedra-50 px-3 py-2 text-sm text-piedra-700 ring-1 ring-borde">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="text-xs text-piedra-500 hover:underline">
            Entendido
          </button>
        </p>
      )}

      {/* Lo elegido, con la acción que corresponde a la vista. */}
      {sePuedeElegir && seleccion.length > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-marca-50 px-4 py-3 ring-1 ring-marca-200">
          <p className="text-sm text-marca-900">
            {seleccion.length === 1 ? '1 cheque' : `${seleccion.length} cheques`} ·{' '}
            <span className="font-semibold tabular-nums">{moneda.format(totalSeleccion)}</span>
          </p>
          <div className="flex gap-2">
            <button onClick={() => setElegidos(new Set())} className={boton.suave}>
              Soltar
            </button>
            {vista === 'cartera' ? (
              <button onClick={() => setDialogo({ tipo: 'depositar', cheques: seleccion })} className={boton.principal}>
                Depositar
              </button>
            ) : (
              <button onClick={() => setDialogo({ tipo: 'debitar', cheques: seleccion })} className={boton.principal}>
                Marcar debitados
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`${tarjeta} overflow-hidden`}>
        {lista.isPending && <p className="px-4 py-8 text-center text-sm text-piedra-400">Cargando…</p>}
        {lista.isError && (
          <p role="alert" className="px-4 py-4 text-sm text-red-700">
            {enCastellano(lista.error, 'No se pudieron traer los cheques.')}
          </p>
        )}
        {!lista.isPending && visibles.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-piedra-400">
            {vista === 'cartera'
              ? 'No hay cheques en la cartera. Entran cuando un cliente paga con cheque en la caja o en su cuenta corriente.'
              : vista === 'propios'
                ? 'No hay cheques propios esperando el débito. Se cargan al pagarle a un proveedor.'
                : 'No hay cheques que coincidan.'}
          </p>
        )}
        <ul className="divide-y divide-piedra-100">
          {visibles.map((c) => (
            <Renglon
              key={c.id}
              c={c}
              hoy={hoy}
              vista={vista}
              abierto={abierto === c.id}
              onAbrir={() => setAbierto(abierto === c.id ? null : c.id)}
              elegible={sePuedeElegir}
              elegido={elegidos.has(c.id)}
              onElegir={(si) =>
                setElegidos((prev) => {
                  const n = new Set(prev)
                  if (si) n.add(c.id)
                  else n.delete(c.id)
                  return n
                })
              }
              puedeMover={puedeMover}
              onAccion={(tipo) => {
                if (tipo === 'deshacer') pedirDeshacer(c)
                else if (tipo === 'depositar') setDialogo({ tipo: 'depositar', cheques: [c] })
                else if (tipo === 'debitar') setDialogo({ tipo: 'debitar', cheques: [c] })
                else setDialogo({ tipo, cheque: c })
              }}
            />
          ))}
        </ul>
      </div>

      {dialogo?.tipo === 'depositar' && (
        <DialogoDepositar cheques={dialogo.cheques} hoy={hoy} onCerrar={() => setDialogo(null)} onListo={listo} />
      )}
      {dialogo?.tipo === 'debitar' && (
        <DialogoDebitar cheques={dialogo.cheques} hoy={hoy} onCerrar={() => setDialogo(null)} onListo={listo} />
      )}
      {dialogo?.tipo === 'rechazar' && (
        <DialogoRechazar c={dialogo.cheque} hoy={hoy} onCerrar={() => setDialogo(null)} onListo={listo} />
      )}
      {dialogo?.tipo === 'devolver' && (
        <DialogoDevolver c={dialogo.cheque} hoy={hoy} onCerrar={() => setDialogo(null)} onListo={listo} />
      )}
      {dialogo?.tipo === 'corregir' && (
        <DialogoCorregir c={dialogo.cheque} onCerrar={() => setDialogo(null)} onListo={listo} />
      )}
    </div>
  )
}

type Accion = 'depositar' | 'debitar' | 'rechazar' | 'devolver' | 'corregir' | 'deshacer'

/* Lo que se puede hacer con un cheque, según dónde está. */
function accionesDe(c: Cheque): Accion[] {
  if (c.origen === 'tercero') {
    switch (c.estado) {
      case 'en_cartera':
        return c.faltan_datos ? ['corregir', 'devolver'] : ['depositar', 'devolver', 'corregir']
      case 'depositado':
        return ['rechazar', 'deshacer', 'corregir']
      case 'endosado':
        return ['rechazar', 'corregir']
      default:
        return ['corregir']
    }
  }
  switch (c.estado) {
    case 'emitido':
      return ['debitar', 'rechazar', 'corregir']
    case 'debitado':
      return ['deshacer']
    default:
      return ['corregir']
  }
}

const ETIQUETA_ACCION: Record<Accion, string> = {
  depositar: 'Depositar',
  debitar: 'Se debitó',
  rechazar: 'Volvió rechazado',
  devolver: 'Devolver al cliente',
  corregir: 'Corregir datos',
  deshacer: 'Deshacer',
}

function Renglon({
  c,
  hoy,
  vista,
  abierto,
  onAbrir,
  elegible,
  elegido,
  onElegir,
  puedeMover,
  onAccion,
}: {
  c: Cheque
  hoy: string
  vista: Vista
  abierto: boolean
  onAbrir: () => void
  elegible: boolean
  elegido: boolean
  onElegir: (si: boolean) => void
  puedeMover: boolean
  onAccion: (a: Accion) => void
}) {
  const plazo = c.estado === 'en_cartera' ? plazoDeDeposito(c.fecha_pago, hoy) : null
  // De quién vino o a quién se le dio: lo que distingue a un cheque del
  // otro cuando los importes se parecen.
  const quien =
    c.origen === 'propio'
      ? c.proveedor
      : [c.librador, c.cliente && c.cliente !== c.librador ? `lo entregó ${c.cliente}` : null].filter(Boolean).join(' · ')

  return (
    <li className={abierto ? 'bg-piedra-50/60' : ''}>
      <div className="flex items-start gap-3 px-4 py-3">
        {elegible && (
          <input
            type="checkbox"
            checked={elegido}
            // Un cheque sin número no se puede depositar: primero se completa.
            disabled={c.faltan_datos}
            onChange={(e) => onElegir(e.target.checked)}
            aria-label={`Elegir ${c.nombre}`}
            className="mt-1"
          />
        )}
        <button onClick={onAbrir} className="min-w-0 flex-1 text-left">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta">
            <span className="font-medium">
              {c.faltan_datos ? 'Cheque sin datos' : `${c.banco} N° ${c.numero}`}
            </span>
            {c.electronico && (
              <span className="rounded bg-marca-50 px-1.5 py-0.5 text-[11px] font-medium text-marca-800 ring-1 ring-marca-200">
                e-cheq
              </span>
            )}
            {c.faltan_datos && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                Completar los datos
              </span>
            )}
            {vista === 'todos' && (
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ${COLOR_ESTADO[c.estado]}`}>
                {c.origen === 'propio' && c.estado !== 'emitido' ? 'Propio · ' : ''}
                {c.origen === 'propio' && c.estado === 'emitido' ? 'Propio, por debitar' : ESTADO_CHEQUE[c.estado]}
              </span>
            )}
          </p>
          {quien && <p className="truncate text-xs text-piedra-500">{quien}</p>}
          <p className="text-xs tabular-nums text-piedra-500">
            {c.diferido ? 'Diferido al ' : 'Al día, '}
            {fechaCorta(c.fecha_pago)}
            {plazo && <span className={`ml-1 ${COLOR_PLAZO[plazo.tipo]}`}>· {textoDelPlazo(plazo)}</span>}
            {c.origen === 'propio' && c.estado === 'emitido' && (
              <span className="ml-1">· se debita desde ese día</span>
            )}
          </p>
        </button>
        <p className="shrink-0 whitespace-nowrap text-right font-semibold tabular-nums text-tinta">
          {moneda.format(c.importe)}
        </p>
      </div>

      {abierto && <Detalle c={c} puedeMover={puedeMover} onAccion={onAccion} />}
    </li>
  )
}

function Detalle({ c, puedeMover, onAccion }: { c: Cheque; puedeMover: boolean; onAccion: (a: Accion) => void }) {
  const historia = useQuery({ queryKey: ['cheque-historial', c.id], queryFn: () => historialDe(c.id) })

  const datos: [string, string | null][] = [
    ['Librador', [c.librador, c.librador_cuit ? `CUIT ${c.librador_cuit}` : null].filter(Boolean).join(' · ') || null],
    ['Lo entregó', c.cliente],
    ['Venta', c.venta],
    [c.origen === 'propio' ? 'Se le dio a' : 'Endosado a', c.proveedor],
    ['Depositado en', c.deposito],
    ['Motivo', c.motivo],
    ['Gastos del banco', c.gastos ? moneda.format(c.gastos) : null],
    ['Observaciones', c.observaciones],
  ]

  return (
    <div className="space-y-3 border-t border-piedra-100 px-4 py-3">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {datos
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="inline text-piedra-500">{k}: </dt>
              <dd className="inline break-words text-tinta">{v}</dd>
            </div>
          ))}
      </dl>

      <div>
        <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">Historia</p>
        <ol className="mt-1 space-y-1 text-sm">
          {historia.data?.map((h) => (
            <li key={h.id} className="flex flex-wrap gap-x-2">
              <span className="tabular-nums text-piedra-500">{fechaCorta(h.fecha)}</span>
              <span className="text-tinta">{h.detalle}</span>
              {h.usuario && <span className="text-piedra-400">· {h.usuario.nombre}</span>}
            </li>
          ))}
        </ol>
      </div>

      {c.estado === 'endosado' && c.proveedor_id && (
        <Link to={`/proveedores/cuentas?p=${c.proveedor_id}`} className="text-sm text-marca-700 hover:underline">
          Ver la cuenta de {c.proveedor} →
        </Link>
      )}

      {puedeMover && (
        <div className="flex flex-wrap gap-2">
          {accionesDe(c).map((a) => (
            <button
              key={a}
              onClick={() => onAccion(a)}
              className={a === 'rechazar' ? `${botonChico.secundario} text-red-700` : botonChico.secundario}
            >
              {ETIQUETA_ACCION[a]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/*
  ─────────────────────────────────────────────────────────────
  Los diálogos de cada acción
  ─────────────────────────────────────────────────────────────
*/

function Ventana({
  titulo,
  children,
  onCerrar,
  ancho = 'max-w-md',
}: {
  titulo: string
  children: React.ReactNode
  onCerrar: () => void
  ancho?: string
}) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-tinta/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => e.key === 'Escape' && onCerrar()}
    >
      <div className={`mx-auto my-10 w-full ${ancho} rounded-xl bg-white p-5 shadow-lg ring-1 ring-borde`}>
        <h2 className="font-semibold text-tinta">{titulo}</h2>
        {children}
      </div>
    </div>
  )
}

function Botones({
  onCerrar,
  onAceptar,
  aceptar,
  trabajando,
  deshabilitado,
  error,
}: {
  onCerrar: () => void
  onAceptar: () => void
  aceptar: string
  trabajando: boolean
  deshabilitado?: boolean
  error: string | null
}) {
  return (
    <>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCerrar} className={boton.suave}>
          Cancelar
        </button>
        <button onClick={onAceptar} disabled={trabajando || deshabilitado} className={boton.principal}>
          {trabajando ? 'Guardando…' : aceptar}
        </button>
      </div>
    </>
  )
}

function CampoFecha({ valor, onCambio, hoy, etiqueta }: { valor: string; onCambio: (f: string) => void; hoy: string; etiqueta: string }) {
  return (
    <label className="block w-44">
      <span className="mb-1 block text-xs font-medium text-piedra-600">{etiqueta}</span>
      <input type="date" value={valor} max={hoy} onChange={(e) => onCambio(e.target.value)} className={campo} />
    </label>
  )
}

function DialogoDepositar({
  cheques,
  hoy,
  onCerrar,
  onListo,
}: {
  cheques: Cheque[]
  hoy: string
  onCerrar: () => void
  onListo: (m: string) => void
}) {
  const [fecha, setFecha] = useState(hoy)
  const [cuenta, setCuenta] = useState('')
  const [error, setError] = useState<string | null>(null)
  const total = cheques.reduce((s, c) => s + c.importe, 0)
  const antes = cheques.filter((c) => c.fecha_pago > fecha)

  const ir = useMutation({
    mutationFn: () => depositar(cheques.map((c) => c.id), fecha, cuenta.trim()),
    onSuccess: () =>
      onListo(
        `${cheques.length === 1 ? 'Cheque depositado' : `${cheques.length} cheques depositados`} por ${moneda.format(total)}.`,
      ),
    onError: (e) => setError(enCastellano(e, 'No se pudo registrar el depósito.')),
  })

  return (
    <Ventana titulo={cheques.length === 1 ? 'Depositar el cheque' : `Depositar ${cheques.length} cheques`} onCerrar={onCerrar}>
      <p className="mt-1 text-sm text-piedra-500">
        {moneda.format(total)}. Salen de la cartera. Si el banco devuelve alguno, se marca como rechazado.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <CampoFecha valor={fecha} onCambio={setFecha} hoy={hoy} etiqueta="Fecha del depósito" />
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-xs font-medium text-piedra-600">
            En qué cuenta <span className="font-normal text-piedra-400">(opcional)</span>
          </span>
          <input value={cuenta} onChange={(e) => setCuenta(e.target.value)} placeholder="Macro cta. cte." className={campo} />
        </label>
      </div>
      {antes.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          {antes.length === 1 ? 'Uno todavía no llegó' : `${antes.length} todavía no llegaron`} a su fecha de pago: el
          banco los acredita recién ese día.
        </p>
      )}
      <Botones onCerrar={onCerrar} onAceptar={() => ir.mutate()} aceptar="Depositar" trabajando={ir.isPending} error={error} />
    </Ventana>
  )
}

function DialogoDebitar({
  cheques,
  hoy,
  onCerrar,
  onListo,
}: {
  cheques: Cheque[]
  hoy: string
  onCerrar: () => void
  onListo: (m: string) => void
}) {
  const [fecha, setFecha] = useState(hoy)
  const [error, setError] = useState<string | null>(null)
  const total = cheques.reduce((s, c) => s + c.importe, 0)

  const ir = useMutation({
    mutationFn: () => marcarDebitados(cheques.map((c) => c.id), fecha),
    onSuccess: () => onListo(`${cheques.length === 1 ? 'Cheque debitado' : `${cheques.length} cheques debitados`}.`),
    onError: (e) => setError(enCastellano(e, 'No se pudo marcar el débito.')),
  })

  return (
    <Ventana titulo={cheques.length === 1 ? 'El cheque se debitó' : `Se debitaron ${cheques.length} cheques`} onCerrar={onCerrar}>
      <p className="mt-1 text-sm text-piedra-500">
        {moneda.format(total)}. {cheques.length === 1 ? 'Deja' : 'Dejan'} de figurar como plata que tiene que haber en el banco.
      </p>
      <div className="mt-4">
        <CampoFecha valor={fecha} onCambio={setFecha} hoy={hoy} etiqueta="Fecha del débito" />
      </div>
      <Botones onCerrar={onCerrar} onAceptar={() => ir.mutate()} aceptar={cheques.length === 1 ? 'Marcar debitado' : 'Marcar debitados'} trabajando={ir.isPending} error={error} />
    </Ventana>
  )
}

const MOTIVOS_RECHAZO = ['Sin fondos', 'Firma no conforme', 'Cuenta cerrada', 'Defectos formales', 'Orden de no pagar']

function DialogoRechazar({ c, hoy, onCerrar, onListo }: { c: Cheque; hoy: string; onCerrar: () => void; onListo: (m: string) => void }) {
  const [fecha, setFecha] = useState(hoy)
  const [motivo, setMotivo] = useState('Sin fondos')
  const [gastos, setGastos] = useState('')
  const [cargar, setCargar] = useState(c.origen === 'tercero' && !!c.cliente_con_cuenta)
  const [error, setError] = useState<string | null>(null)
  const nGastos = Number(gastos.replace(',', '.')) || 0

  const ir = useMutation({
    mutationFn: () => rechazar(c.id, fecha, motivo.trim(), nGastos, cargar),
    onSuccess: () => onListo(`${c.nombre} marcado como rechazado.`),
    onError: (e) => setError(enCastellano(e, 'No se pudo marcar el rechazo.')),
  })

  return (
    <Ventana titulo="El cheque volvió rechazado" onCerrar={onCerrar}>
      <p className="mt-1 text-sm text-piedra-500">
        {c.nombre} · {moneda.format(c.importe)}
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <CampoFecha valor={fecha} onCambio={setFecha} hoy={hoy} etiqueta="Fecha del rechazo" />
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Motivo</span>
          <input list="motivos-rechazo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} />
          <datalist id="motivos-rechazo">
            {MOTIVOS_RECHAZO.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
      </div>

      {/* Lo que pasa, dicho antes de apretar: son dos cuentas que se mueven. */}
      <div className="mt-4 space-y-2 text-sm">
        {c.proveedor && (
          <p className="rounded-lg bg-piedra-50 px-3 py-2 text-piedra-700 ring-1 ring-borde">
            Se le había dado a <strong>{c.proveedor}</strong>: vuelve a su cuenta y se le debe de nuevo{' '}
            {moneda.format(c.importe)}, que se paga como una factura.
          </p>
        )}
        {c.origen === 'tercero' && (
          <>
            <label className="block w-44">
              <span className="mb-1 block text-xs font-medium text-piedra-600">
                Gastos del banco <span className="font-normal text-piedra-400">(opcional)</span>
              </span>
              <input value={gastos} onChange={(e) => setGastos(e.target.value)} inputMode="decimal" className={campo} />
            </label>
            {c.cliente && (
              <label className="flex items-start gap-2 text-piedra-700">
                <input
                  type="checkbox"
                  checked={cargar}
                  disabled={!c.cliente_con_cuenta}
                  onChange={(e) => setCargar(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  Cargárselo a la cuenta de <strong>{c.cliente}</strong>
                  {cargar && `: ${moneda.format(c.importe + nGastos)}, que vence hoy`}
                  {!c.cliente_con_cuenta && (
                    <span className="block text-xs text-piedra-500">
                      No tiene cuenta corriente: el reclamo queda anotado en el cheque.
                    </span>
                  )}
                </span>
              </label>
            )}
          </>
        )}
      </div>

      <Botones
        onCerrar={onCerrar}
        onAceptar={() => ir.mutate()}
        aceptar="Marcar rechazado"
        trabajando={ir.isPending}
        deshabilitado={motivo.trim().length < 3}
        error={error}
      />
    </Ventana>
  )
}

function DialogoDevolver({ c, hoy, onCerrar, onListo }: { c: Cheque; hoy: string; onCerrar: () => void; onListo: (m: string) => void }) {
  const [fecha, setFecha] = useState(hoy)
  const [motivo, setMotivo] = useState('')
  // Si pagaba la cuenta, devolverlo es volver a deberla.
  const [cargar, setCargar] = useState(!!c.cliente_con_cuenta && !c.venta)
  const [error, setError] = useState<string | null>(null)

  const ir = useMutation({
    mutationFn: () => devolver(c.id, fecha, motivo.trim(), cargar),
    onSuccess: () => onListo(`${c.nombre} devuelto al cliente.`),
    onError: (e) => setError(enCastellano(e, 'No se pudo registrar la devolución.')),
  })

  return (
    <Ventana titulo="Devolverle el cheque al cliente" onCerrar={onCerrar}>
      <p className="mt-1 text-sm text-piedra-500">
        {c.nombre} · {moneda.format(c.importe)}. Sale de la cartera.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <CampoFecha valor={fecha} onCambio={setFecha} hoy={hoy} etiqueta="Fecha" />
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Por qué</span>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Lo cambió por efectivo" className={campo} />
        </label>
      </div>
      {c.cliente && (
        <label className="mt-4 flex items-start gap-2 text-sm text-piedra-700">
          <input
            type="checkbox"
            checked={cargar}
            disabled={!c.cliente_con_cuenta}
            onChange={(e) => setCargar(e.target.checked)}
            className="mt-1"
          />
          <span>
            Volver a cargarle {moneda.format(c.importe)} a la cuenta de <strong>{c.cliente}</strong>
            <span className="block text-xs text-piedra-500">
              {c.cliente_con_cuenta
                ? 'Si con este cheque pagaba su cuenta y ahora no lo deja, vuelve a deberlo.'
                : 'No tiene cuenta corriente.'}
            </span>
          </span>
        </label>
      )}
      <Botones
        onCerrar={onCerrar}
        onAceptar={() => ir.mutate()}
        aceptar="Devolver"
        trabajando={ir.isPending}
        deshabilitado={motivo.trim().length < 3}
        error={error}
      />
    </Ventana>
  )
}

function DialogoCorregir({ c, onCerrar, onListo }: { c: Cheque; onCerrar: () => void; onListo: (m: string) => void }) {
  const [datos, setDatos] = useState<DatosCheque>({
    banco: c.banco ?? '',
    numero: c.numero ?? '',
    fecha_pago: c.fecha_pago,
    librador: c.librador ?? '',
    librador_cuit: c.librador_cuit ?? '',
    electronico: c.electronico,
  })
  const [observaciones, setObservaciones] = useState(c.observaciones ?? '')
  const [error, setError] = useState<string | null>(null)
  // El plazo de 30 días es para recibirlo, no para corregir uno viejo.
  const falta = faltaEnCheque(datos, 'propio')

  const ir = useMutation({
    mutationFn: () =>
      corregir(c.id, {
        banco: datos.banco,
        numero: datos.numero,
        fecha_pago: datos.fecha_pago,
        librador: datos.librador,
        librador_cuit: datos.librador_cuit,
        electronico: datos.electronico,
        observaciones,
      }),
    onSuccess: () => onListo('Datos del cheque corregidos.'),
    onError: (e) => setError(enCastellano(e, 'No se pudieron guardar los datos.')),
  })

  return (
    <Ventana titulo="Corregir los datos del cheque" onCerrar={onCerrar} ancho="max-w-2xl">
      <p className="mt-1 text-sm text-piedra-500">
        {moneda.format(c.importe)}. El importe no se corrige: si está mal, el cheque se devuelve y se carga de nuevo.
      </p>
      <div className="mt-4">
        <CamposCheque valor={datos} onChange={setDatos} origen="propio" conLibrador={c.origen === 'tercero'} autoFocus />
      </div>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-piedra-600">
          Observaciones <span className="font-normal text-piedra-400">(opcional)</span>
        </span>
        <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={campo} />
      </label>
      <Botones
        onCerrar={onCerrar}
        onAceptar={() => ir.mutate()}
        aceptar="Guardar"
        trabajando={ir.isPending}
        deshabilitado={falta !== null}
        error={error}
      />
    </Ventana>
  )
}
