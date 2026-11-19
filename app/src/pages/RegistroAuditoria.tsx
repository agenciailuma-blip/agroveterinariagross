import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { bajarExcel, cambiosDe, ETIQUETA_TIPO, LIMITE, listarEventos, TIPOS } from '@/lib/api/auditoria'
import type { Evento, Filtros, TipoEvento } from '@/lib/api/auditoria'
import { abrirComprobante, abrirNoFiscal, abrirPlanillaCaja } from '@/lib/escritorio'
import { enCastellano } from '@/lib/errores'
import { botonChico, campo, campoDeFiltro, tarjeta } from '@/estilos'

/*
  Administración → Registro de auditoría (19/11).

  Todo lo sensible en una sola lista, de lo más nuevo a lo más viejo:
  qué se anuló, qué precios se tocaron, quién autorizó qué, cajas, y
  cada cambio en fichas y configuración con el valor de antes y el de
  después. Nadie lo puede corregir ni borrar.
*/

const COLOR: Record<TipoEvento, string> = {
  anulacion: 'bg-red-50 text-red-800',
  devolucion: 'bg-red-50 text-red-800',
  precio: 'bg-amber-50 text-amber-900',
  autorizacion: 'bg-amber-50 text-amber-900',
  caja: 'bg-verde-50 text-verde-800',
  stock: 'bg-piedra-100 text-piedra-700',
  ficha: 'bg-marca-50 text-marca-700',
  permisos: 'bg-marca-50 text-marca-700',
  configuracion: 'bg-marca-50 text-marca-700',
}

function hoyMenos(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* Los papeles que ya tienen dónde abrirse. */
function abrir(e: Evento): (() => void) | null {
  if (!e.referencia_id) return null
  if (e.referencia === 'comprobante') return () => void abrirComprobante(e.referencia_id!)
  if (e.referencia === 'comprobante_no_fiscal') return () => void abrirNoFiscal(e.referencia_id!)
  if (e.referencia === 'caja' && e.tipo === 'caja') return () => void abrirPlanillaCaja(e.referencia_id!)
  return null
}

export default function RegistroAuditoria() {
  const { tienePermiso } = useAuth()
  const puede = tienePermiso('auditoria.ver')
  const [filtros, setFiltros] = useState<Filtros>({
    desde: hoyMenos(7),
    hasta: '',
    usuarioId: '',
    tipo: '',
    texto: '',
  })
  const [texto, setTexto] = useState('')
  const [bajando, setBajando] = useState(false)

  const eventos = useQuery({
    queryKey: ['registro-auditoria', filtros],
    queryFn: () => listarEventos(filtros),
    enabled: puede,
  })

  // Las personas que aparecen, para el filtro. Se recuerdan las vistas,
  // así elegir una no hace desaparecer a las demás del desplegable.
  const [conocidas, setConocidas] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    const nuevas = (eventos.data ?? []).filter((e) => e.usuario_id && e.usuario)
    if (nuevas.length === 0) return
    setConocidas((antes) => {
      if (nuevas.every((e) => antes.has(e.usuario_id!))) return antes
      const m = new Map(antes)
      for (const e of nuevas) m.set(e.usuario_id!, e.usuario!)
      return m
    })
  }, [eventos.data])
  const personas = useMemo(
    () => [...conocidas.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')),
    [conocidas],
  )

  if (!puede) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para ver el registro de auditoría. Se da desde Usuarios → Roles y permisos.
      </p>
    )
  }

  const filas = eventos.data ?? []
  const poner = (c: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...c }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-tinta">Registro de auditoría</h1>
        <p className="mt-1 text-sm text-piedra-500">
          Quién hizo qué, desde qué puesto y cuándo. Los cambios en fichas y configuración se anotan desde el
          19/11; lo demás, desde que se empezó a usar el sistema. Nadie lo puede corregir ni borrar.
        </p>
      </div>

      <form
        className={`${tarjeta} flex flex-wrap items-end gap-3 p-4`}
        onSubmit={(ev) => {
          ev.preventDefault()
          poner({ texto })
        }}
      >
        <label className="block min-w-0 flex-1 basis-56">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Buscar</span>
          <input
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            onBlur={() => poner({ texto })}
            placeholder="Producto, cliente, número, motivo…"
            className={campo}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Desde</span>
          <input type="date" value={filtros.desde} onChange={(ev) => poner({ desde: ev.target.value })} className={campoDeFiltro} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Hasta</span>
          <input type="date" value={filtros.hasta} onChange={(ev) => poner({ hasta: ev.target.value })} className={campoDeFiltro} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Tipo</span>
          <select
            value={filtros.tipo}
            onChange={(ev) => poner({ tipo: ev.target.value as TipoEvento | '' })}
            className={`${campoDeFiltro} max-w-full`}
          >
            <option value="">Todo</option>
            {TIPOS.map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Quién</span>
          <select
            value={filtros.usuarioId}
            onChange={(ev) => poner({ usuarioId: ev.target.value })}
            className={`${campoDeFiltro} max-w-full`}
          >
            <option value="">Todos</option>
            {personas.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={filas.length === 0 || bajando}
          onClick={async () => {
            setBajando(true)
            try {
              await bajarExcel(filas)
            } finally {
              setBajando(false)
            }
          }}
          className={botonChico.suave}
        >
          {bajando ? 'Armando…' : 'Bajar a Excel'}
        </button>
      </form>

      {eventos.isError && (
        <p role="alert" className="text-sm text-red-700">
          {enCastellano(eventos.error)}
        </p>
      )}

      <div className={`${tarjeta} p-2 sm:p-4`}>
        {eventos.isLoading ? (
          <p className="p-3 text-sm text-piedra-500">Buscando…</p>
        ) : filas.length === 0 ? (
          <p className="p-3 text-sm text-piedra-500">Nada con esos filtros.</p>
        ) : (
          <>
            <p className="px-2 pb-2 text-xs text-piedra-500">
              {filas.length === LIMITE
                ? `Se muestran los ${LIMITE} más recientes: acotá las fechas para ver más atrás.`
                : `${filas.length} ${filas.length === 1 ? 'renglón' : 'renglones'}.`}
            </p>
            <ul className="divide-y divide-piedra-100">
              {filas.map((e, i) => (
                <Renglon key={`${e.momento}-${e.referencia_id}-${i}`} e={e} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function Renglon({ e }: { e: Evento }) {
  const cambios = cambiosDe(e)
  const ver = abrir(e)
  const momento = new Date(e.momento)
  return (
    <li className="px-2 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="whitespace-nowrap text-xs tabular-nums text-piedra-500">
          {momento.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}{' '}
          {momento.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${COLOR[e.tipo] ?? ''}`}>
          {ETIQUETA_TIPO[e.tipo] ?? e.tipo}
        </span>
        <span className="text-sm font-medium text-tinta">{e.que}</span>
        {ver && (
          <button onClick={ver} className="text-xs text-marca-700 underline">
            Ver
          </button>
        )}
      </div>
      {e.detalle && <p className="mt-0.5 break-words text-sm text-piedra-700">{e.detalle}</p>}
      {cambios.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-piedra-600">
          {cambios.map((c) => (
            <li key={c.campo} className="break-words">
              <span className="font-medium">{c.campo}:</span>{' '}
              {c.antes !== null && c.despues !== null ? (
                <>
                  <span className="text-piedra-400 line-through">{c.antes}</span> → {c.despues}
                </>
              ) : (
                (c.despues ?? c.antes)
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-0.5 text-xs text-piedra-400">
        {[e.usuario ?? 'Sin dato de quién', e.puesto].filter(Boolean).join(' · ')}
      </p>
    </li>
  )
}
