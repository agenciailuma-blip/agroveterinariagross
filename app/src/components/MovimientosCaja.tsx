import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { pedirTexto } from '@/components/Dialogo'
import { TeclaAtajo } from '@/components/Atajos'
import {
  CATEGORIAS_DE_EGRESO,
  CATEGORIAS_DE_INGRESO,
  anularMovimiento,
  listarEmpleados,
  pideDescripcion,
  registrarMovimiento,
  resumenDeCaja,
} from '@/lib/api/cierreCaja'
import type { Categoria, MovimientoCaja } from '@/lib/api/cierreCaja'
import { listarProveedores } from '@/lib/api/proveedores'
import { carteraParaEndosar } from '@/lib/api/cheques'
import { leerCantidad } from '@/lib/api/ventas'
import { useAtajo, useBotonConAtajo, useEscapeCierra } from '@/lib/atajos'
import { useListaConFlechas } from '@/lib/buscador'
import { enCastellano } from '@/lib/errores'
import { boton, botonChico, campo } from '@/estilos'
import { moneda } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  Ingresos y egresos de la caja abierta

  Como las dos pantallas del sistema anterior —«Ingreso a caja» y
  «Egreso de caja»—, en una sola ventana: arriba lo cargado en el turno,
  abajo el formulario. Así el cajero ve enseguida si ya lo había cargado.
  ─────────────────────────────────────────────────────────────
*/

export default function MovimientosCaja({ cajaId, onCerrar }: { cajaId: string; onCerrar: () => void }) {
  const qc = useQueryClient()
  const { tienePermiso } = useAuth()
  const [cargando, setCargando] = useState<'ingreso' | 'egreso' | null>(null)

  const resumen = useQuery({ queryKey: ['resumen-de-caja', cajaId], queryFn: () => resumenDeCaja(cajaId) })
  const movimientos = resumen.data?.movimientos ?? []

  const anular = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => anularMovimiento(id, motivo),
    // Un pago a proveedor anulado también toca su cuenta y los cheques.
    onSuccess: () => qc.invalidateQueries(),
  })

  async function pedirAnular(m: MovimientoCaja) {
    const motivo = await pedirTexto({
      titulo: 'Anular el movimiento',
      detalle: [
        `${m.concepto} · ${moneda.format(Math.abs(m.importe))}`,
        m.categoria === 'pago_proveedor' && m.proveedor && 'También se anula el pago en la cuenta del proveedor.',
        m.forma === 'cheques' && 'Los cheques vuelven a la cartera.',
      ]
        .filter(Boolean)
        .join('\n'),
      etiqueta: 'Motivo',
      minimo: 3,
      aceptar: 'Anular',
      peligro: true,
    })
    if (motivo) anular.mutate({ id: m.id, motivo })
  }

  // Mientras la ventana está abierta, F10 y F3 no cobran ni cambian la venta de atrás.
  useAtajo('F10', () => {}, !cargando)
  useAtajo('F3', () => {})
  // Esc cierra el formulario si hay uno abierto, y si no la ventana.
  const ventana = useRef<HTMLDivElement>(null)
  useEscapeCierra(ventana, () => (cargando ? setCargando(null) : onCerrar()))

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-tinta/50 p-4"
      role="dialog"
      aria-modal="true"
      ref={ventana}
    >
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-tinta">Ingresos y egresos</h2>
          <button onClick={onCerrar} className={botonChico.suave}>
            Cerrar
          </button>
        </div>

        {resumen.isError && (
          <p className="mt-3 text-sm text-red-700">{enCastellano(resumen.error, 'No se pudieron cargar los movimientos.')}</p>
        )}

        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg ring-1 ring-borde">
          {resumen.isPending ? (
            <p className="px-3 py-4 text-sm text-piedra-400">Cargando…</p>
          ) : movimientos.length === 0 ? (
            <p className="px-3 py-4 text-sm text-piedra-500">Todavía no se cargó ninguno en esta caja.</p>
          ) : (
            <ul>
              {movimientos.map((m) => (
                <li
                  key={m.id}
                  className={`flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-piedra-100 px-3 py-2 text-sm last:border-0 ${
                    m.anulado_en ? 'opacity-50' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`[overflow-wrap:anywhere] text-tinta ${m.anulado_en ? 'line-through' : ''}`}>{m.concepto}</p>
                    <p className="text-xs text-piedra-500">
                      {new Date(m.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      {m.usuario && ` · ${m.usuario}`}
                      {m.forma === 'cheques' && ` · ${m.cheques.length === 1 ? '1 cheque' : `${m.cheques.length} cheques`}`}
                      {m.excluir_del_cierre && ' · no va en el cierre'}
                      {m.anulado_en && ` · anulado: ${m.motivo_anulacion}`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-medium tabular-nums ${m.tipo === 'ingreso' ? 'text-verde-700' : 'text-red-700'}`}
                  >
                    {m.tipo === 'ingreso' ? '+' : '−'}
                    {moneda.format(Math.abs(m.importe))}
                  </span>
                  {!m.anulado_en && (
                    <button
                      onClick={() => pedirAnular(m)}
                      disabled={anular.isPending}
                      className="shrink-0 text-xs text-piedra-500 underline hover:text-red-700"
                    >
                      Anular
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {anular.isError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {enCastellano(anular.error, 'No se pudo anular.')}
          </p>
        )}

        {cargando ? (
          <FormularioMovimiento
            key={cargando}
            tipo={cargando}
            cajaId={cajaId}
            puedePagarProveedores={tienePermiso('proveedores.pagar')}
            onListo={() => {
              setCargando(null)
              qc.invalidateQueries({ queryKey: ['resumen-de-caja', cajaId] })
            }}
            onCancelar={() => setCargando(null)}
          />
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setCargando('ingreso')} className={boton.secundario}>
              + Ingreso
            </button>
            <button onClick={() => setCargando('egreso')} className={boton.secundario}>
              − Egreso
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function FormularioMovimiento({
  tipo,
  cajaId,
  puedePagarProveedores,
  onListo,
  onCancelar,
}: {
  tipo: 'ingreso' | 'egreso'
  cajaId: string
  puedePagarProveedores: boolean
  onListo: () => void
  onCancelar: () => void
}) {
  const qc = useQueryClient()
  const opciones = tipo === 'ingreso' ? CATEGORIAS_DE_INGRESO : CATEGORIAS_DE_EGRESO
  const [categoria, setCategoria] = useState<Categoria>(opciones[0].valor)
  const [importe, setImporte] = useState('')
  const [concepto, setConcepto] = useState('')
  const [excluir, setExcluir] = useState(false)
  const [empleadoId, setEmpleadoId] = useState('')
  const [proveedor, setProveedor] = useState<{ id: string; nombre: string } | null>(null)
  const [conCheques, setConCheques] = useState(false)
  const [cheques, setCheques] = useState<string[]>([])

  const empleados = useQuery({
    queryKey: ['empleados'],
    queryFn: listarEmpleados,
    enabled: categoria === 'anticipo_haberes',
  })
  const cartera = useQuery({
    queryKey: ['cheques', 'para-endosar'],
    queryFn: carteraParaEndosar,
    enabled: conCheques,
  })

  const usaCheques = categoria === 'pago_proveedor' && !!proveedor && conCheques
  const totalCheques = useMemo(
    () => (cartera.data ?? []).filter((c) => cheques.includes(c.id)).reduce((s, c) => s + c.importe, 0),
    [cartera.data, cheques],
  )
  const monto = usaCheques ? totalCheques : (leerCantidad(importe) ?? 0)

  const falta =
    monto <= 0
      ? usaCheques
        ? 'Elegí los cheques.'
        : 'Falta el importe.'
      : pideDescripcion(categoria) && concepto.trim().length < 3
        ? 'Escribí de qué es.'
        : categoria === 'anticipo_haberes' && !empleadoId
          ? 'Elegí a quién.'
          : null

  const guardar = useMutation({
    mutationFn: () =>
      registrarMovimiento(cajaId, {
        categoria,
        importe: monto,
        concepto,
        excluir,
        empleadoId: empleadoId || null,
        proveedorId: proveedor?.id ?? null,
        cheques: usaCheques ? cheques : [],
      }),
    onSuccess: () => {
      if (categoria === 'pago_proveedor') qc.invalidateQueries({ queryKey: ['cheques'] })
      onListo()
    },
  })

  const botonGuardar = useBotonConAtajo('F10')

  return (
    <form
      className="mt-4 space-y-3 rounded-lg bg-piedra-50 p-4 ring-1 ring-borde"
      onSubmit={(e) => {
        e.preventDefault()
        if (!falta) guardar.mutate()
      }}
    >
      <p className="text-sm font-semibold text-tinta">{tipo === 'ingreso' ? 'Ingreso a caja' : 'Egreso de caja'}</p>

      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Tipo</legend>
        {opciones.map((o) => (
          <label
            key={o.valor}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm ring-1 ${
              categoria === o.valor ? 'bg-marca-700 text-white ring-marca-700' : 'bg-white text-piedra-600 ring-borde hover:bg-marca-50'
            }`}
          >
            <input
              type="radio"
              name="categoria"
              value={o.valor}
              checked={categoria === o.valor}
              onChange={() => {
                setCategoria(o.valor)
                setConCheques(false)
                setCheques([])
              }}
              className="sr-only"
            />
            {o.nombre}
          </label>
        ))}
      </fieldset>

      {categoria === 'anticipo_haberes' && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Empleado</span>
          <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className={`${campo} bg-white`}>
            <option value="">Elegí a quién…</option>
            {empleados.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      {categoria === 'pago_proveedor' && puedePagarProveedores && (
        <div>
          <span className="mb-1 block text-xs font-medium text-piedra-600">Proveedor</span>
          {proveedor ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 [overflow-wrap:anywhere] text-sm font-medium text-tinta">{proveedor.nombre}</span>
              <button
                type="button"
                onClick={() => {
                  setProveedor(null)
                  setConCheques(false)
                  setCheques([])
                }}
                className="text-xs text-marca-700 underline"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <ElegirProveedor onElegir={setProveedor} />
          )}
          <p className="mt-1 text-xs text-piedra-500">
            {proveedor
              ? 'Queda como pago a cuenta del proveedor. Las facturas se imputan desde Proveedores.'
              : 'Sin proveedor es un acreedor: sólo sale de la caja.'}
          </p>
        </div>
      )}

      {categoria === 'pago_proveedor' && proveedor && (
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="sr-only">Forma de pago</legend>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={!conCheques} onChange={() => setConCheques(false)} /> Efectivo
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={conCheques} onChange={() => setConCheques(true)} /> Cheques de la cartera
          </label>
        </fieldset>
      )}

      {usaCheques ? (
        <div className="max-h-48 overflow-y-auto rounded-lg bg-white ring-1 ring-borde">
          {cartera.isPending ? (
            <p className="px-3 py-2 text-sm text-piedra-400">Cargando la cartera…</p>
          ) : (cartera.data?.length ?? 0) === 0 ? (
            <p className="px-3 py-2 text-sm text-piedra-500">No hay cheques en la cartera para endosar.</p>
          ) : (
            cartera.data!.map((c) => (
              <label key={c.id} className="flex items-start gap-2 border-b border-piedra-100 px-3 py-2 text-sm last:border-0">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={cheques.includes(c.id)}
                  onChange={(e) =>
                    setCheques((cs) => (e.target.checked ? [...cs, c.id] : cs.filter((x) => x !== c.id)))
                  }
                />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {c.nombre}
                  {c.cliente && <span className="text-piedra-500"> · {c.cliente}</span>}
                </span>
                <span className="shrink-0 tabular-nums">{moneda.format(c.importe)}</span>
              </label>
            ))
          )}
        </div>
      ) : (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Importe</span>
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            value={importe}
            onChange={(e) => {
              if (/^\d*[.,]?\d{0,2}$/.test(e.target.value)) setImporte(e.target.value)
            }}
            className={`${campo} bg-white text-right text-base tabular-nums`}
          />
        </label>
      )}
      {usaCheques && cheques.length > 0 && (
        <p className="text-right text-sm font-medium tabular-nums text-tinta">Total: {moneda.format(totalCheques)}</p>
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-piedra-600">
          Descripción{pideDescripcion(categoria) ? '' : ' (opcional)'}
        </span>
        <input value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={200} className={`${campo} bg-white`} />
      </label>

      <label className="flex items-center gap-2 text-sm text-piedra-600">
        <input type="checkbox" checked={excluir} onChange={(e) => setExcluir(e.target.checked)} />
        No incluir en el cierre
      </label>

      {guardar.isError && (
        <p role="alert" className="text-sm text-red-700">
          {enCastellano(guardar.error, 'No se pudo guardar.')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button ref={botonGuardar} type="submit" disabled={!!falta || guardar.isPending} className={boton.principal}>
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
          <TeclaAtajo tecla="F10" clara />
        </button>
        <button type="button" onClick={onCancelar} className={boton.suave}>
          Cancelar
        </button>
        {falta && <span className="text-xs text-piedra-500">{falta}</span>}
      </div>
    </form>
  )
}

function ElegirProveedor({ onElegir }: { onElegir: (p: { id: string; nombre: string }) => void }) {
  const [texto, setTexto] = useState('')
  const buscados = useQuery({
    queryKey: ['proveedores', 'buscar', texto.trim()],
    queryFn: () => listarProveedores(texto),
    enabled: texto.trim().length >= 2,
  })
  const lista = useMemo(() => (buscados.data ?? []).slice(0, 8), [buscados.data])
  const { marcado, teclas, lista: refLista } = useListaConFlechas(lista, (p) => onElegir({ id: p.id, nombre: p.nombre }))

  return (
    <div>
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          teclas(e)
        }}
        placeholder="Buscar por nombre o CUIT"
        className={`${campo} bg-white`}
      />
      {lista.length > 0 && (
        <ul ref={(n) => void (refLista.current = n)} className="mt-1 max-h-40 overflow-y-auto rounded-lg bg-white ring-1 ring-borde">
          {lista.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                data-marcado={i === marcado}
                onClick={() => onElegir({ id: p.id, nombre: p.nombre })}
                className={`block w-full px-3 py-1.5 text-left text-sm [overflow-wrap:anywhere] ${
                  i === marcado ? 'bg-marca-50' : 'hover:bg-piedra-50'
                }`}
              >
                {p.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
