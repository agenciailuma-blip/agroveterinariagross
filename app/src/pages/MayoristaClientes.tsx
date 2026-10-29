import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { consultarCuitEnArca } from '@/lib/api/clientes'
import { cuitValido } from '@/lib/api/cheques'
import { enCastellano } from '@/lib/errores'
import { moneda } from '@/lib/tipos'
import { boton, botonChico, campo, campoDeFiltro, tarjeta } from '@/estilos'
import {
  CONDICIONES_IVA,
  enlaceMapa,
  enlaceWhatsapp,
  filtrarClientes,
  guardarClienteMayorista,
  leerClientes,
  rutasDe,
  ubicacionActual,
  type ClienteMayorista,
  type DatosClienteMayorista,
} from '@/lib/api/mayorista'

/*
  ─────────────────────────────────────────────────────────────
  Los clientes mayoristas

  Lo que el vendedor mira antes de salir a la ruta y parado en la puerta
  del cliente: quién está por esa ruta, quién debe y desde cuándo, cómo
  llegar, y llamarlo o escribirle sin copiar el número.

  Son los clientes de siempre con la marca de mayorista: el que también
  compra en el mostrador tiene una sola cuenta, no dos. En el local se
  marca desde su ficha en Clientes; en la ruta, dándolo de alta acá —si
  el documento ya estaba, se le pone la marca en vez de duplicarlo—.
  ─────────────────────────────────────────────────────────────
*/

function fecha(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR')
}

export default function MayoristaClientes() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [ruta, setRuta] = useState('')
  const [soloConVencido, setSoloConVencido] = useState(false)
  const [editando, setEditando] = useState<ClienteMayorista | 'nuevo' | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const puedeVer = tienePermiso('mayorista.vender') || tienePermiso('mayorista.atender')
  const cargaClientes = tienePermiso('mayorista.clientes')
  const arma = tienePermiso('mayorista.vender')
  const cobra = tienePermiso('mayorista.cobrar')

  const clientes = useQuery({
    queryKey: ['mayorista-clientes'],
    queryFn: leerClientes,
    enabled: puedeVer,
    staleTime: 5 * 60_000,
  })

  const todos = useMemo(() => clientes.data?.datos ?? [], [clientes.data])
  const rutas = useMemo(() => rutasDe(todos), [todos])
  const filas = useMemo(() => filtrarClientes(todos, { texto, ruta, soloConVencido }), [todos, texto, ruta, soloConVencido])
  const veDeuda = todos.some((c) => c.saldo !== null)

  if (!puedeVer) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para la venta mayorista.
      </p>
    )
  }

  if (editando) {
    return (
      <EditorCliente
        cliente={editando === 'nuevo' ? null : editando}
        rutas={rutas}
        onCerrar={() => setEditando(null)}
        onGuardado={(m) => {
          setEditando(null)
          setAviso(m)
          qc.invalidateQueries({ queryKey: ['mayorista-clientes'] })
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Clientes mayoristas</h1>
          <p className="text-sm text-piedra-500">Por ruta, con lo que deben y cómo llegar.</p>
        </div>
        {cargaClientes && (
          <button onClick={() => setEditando('nuevo')} className={boton.principal}>
            Nuevo cliente
          </button>
        )}
      </div>

      {aviso && (
        <p className="rounded-xl bg-verde-50 px-4 py-3 text-sm font-medium text-verde-800 ring-1 ring-verde-200">
          {aviso}
        </p>
      )}
      {clientes.data?.deLaCopia && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          Sin señal: es la lista del {new Date(clientes.data.leidoEn).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Nombre o localidad"
          className={`${campoDeFiltro} min-w-0 flex-1 basis-48`}
        />
        {rutas.length > 0 && (
          <select value={ruta} onChange={(e) => setRuta(e.target.value)} className={`${campoDeFiltro} min-w-0`}>
            <option value="">Todas las rutas</option>
            {rutas.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
        {veDeuda && (
          <label className="flex items-center gap-2 px-1 text-sm text-piedra-600">
            <input
              type="checkbox"
              checked={soloConVencido}
              onChange={(e) => setSoloConVencido(e.target.checked)}
              className="size-4 rounded border-borde text-marca-700 focus:ring-marca-500"
            />
            Con algo vencido
          </label>
        )}
      </div>

      {clientes.isPending ? (
        <p className="text-sm text-piedra-500">Cargando…</p>
      ) : clientes.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {enCastellano(clientes.error, 'No se pudieron leer los clientes.')}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 px-4 py-12">
          <p className="text-center text-sm text-piedra-400">
            {todos.length === 0
              ? 'Todavía no hay clientes mayoristas. Se marcan desde su ficha en Clientes, o se dan de alta acá.'
              : 'Ningún cliente con esos filtros.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filas.map((c) => (
            <FilaCliente
              key={c.id}
              c={c}
              onEditar={cargaClientes ? () => setEditando(c) : undefined}
              onPedido={arma ? () => navegar(`/mayorista?cliente=${c.id}`) : undefined}
              onCobro={cobra ? () => navegar(`/mayorista/cobros?cliente=${c.id}`) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function FilaCliente({
  c,
  onEditar,
  onPedido,
  onCobro,
}: {
  c: ClienteMayorista
  onEditar?: () => void
  onPedido?: () => void
  /** Le pagó al vendedor: la orden de recibo. */
  onCobro?: () => void
}) {
  const whatsapp = enlaceWhatsapp(c.telefono)
  const mapa = enlaceMapa(c)

  return (
    <li className={`${tarjeta} space-y-2 px-4 py-3`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate font-medium text-tinta">{c.nombre}</p>
          <p className="truncate text-xs text-piedra-500">
            {[c.nombre_fantasia, c.localidad, c.zona, c.ruta].filter(Boolean).join(' · ') || 'Sin localidad'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(c.vencido ?? 0) > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
              Vencido {moneda.format(c.vencido!)}
              {c.vencimiento_mas_antiguo ? ` desde ${fecha(c.vencimiento_mas_antiguo)}` : ''}
            </span>
          )}
          {c.saldo !== null && c.saldo > 0 && (c.vencido ?? 0) === 0 && (
            <span className="rounded-full bg-piedra-100 px-2 py-0.5 text-xs text-piedra-700">
              Debe {moneda.format(c.saldo)}
            </span>
          )}
          {!c.cuenta_corriente && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Sin cuenta corriente</span>
          )}
        </div>
      </div>
      {c.ultimo_pedido_en && (
        <p className="text-xs text-piedra-500">
          Último pedido: N.º {c.ultimo_pedido_numero}, el {fecha(c.ultimo_pedido_en)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {onPedido && (
          <button onClick={onPedido} className={botonChico.principal}>
            Pedido
          </button>
        )}
        {onCobro && (
          <button onClick={onCobro} className={botonChico.secundario}>
            Cobro
          </button>
        )}
        {c.telefono && (
          <a href={`tel:${c.telefono.replace(/[^\d+]/g, '')}`} className={botonChico.secundario}>
            Llamar
          </a>
        )}
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer" className={botonChico.secundario}>
            WhatsApp
          </a>
        )}
        {mapa && (
          <a href={mapa} target="_blank" rel="noreferrer" className={botonChico.secundario}>
            Cómo llegar
          </a>
        )}
        {onEditar && (
          <button onClick={onEditar} className={botonChico.suave}>
            Editar
          </button>
        )}
      </div>
    </li>
  )
}

// ───────────────────────────────────────────────────────────────
// Alta y contacto
// ───────────────────────────────────────────────────────────────

function Campo({ etiqueta, ayuda, children, ancho = '' }: { etiqueta: string; ayuda?: string; children: ReactNode; ancho?: string }) {
  return (
    <label className={`block min-w-0 ${ancho}`}>
      <span className="mb-1 block text-xs font-medium text-piedra-600">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-piedra-400">{ayuda}</span>}
    </label>
  )
}

/*
  De un cliente que ya existe se tocan el contacto y la ubicación, no los
  datos fiscales: es el mismo cliente que se factura en el mostrador, y
  eso se corrige en su ficha, en el local.
*/
function EditorCliente({
  cliente,
  rutas,
  onCerrar,
  onGuardado,
}: {
  cliente: ClienteMayorista | null
  rutas: string[]
  onCerrar: () => void
  onGuardado: (mensaje: string) => void
}) {
  const nuevo = cliente === null
  const [d, setD] = useState<DatosClienteMayorista>(() =>
    cliente
      ? {
          telefono: cliente.telefono ?? '',
          email: cliente.email ?? '',
          calle: cliente.calle ?? '',
          numero: cliente.numero ?? '',
          localidad: cliente.localidad ?? '',
          zona: cliente.zona ?? '',
          ruta: cliente.ruta ?? '',
          latitud: cliente.latitud,
          longitud: cliente.longitud,
        }
      : { condicion_iva_id: 5, latitud: null, longitud: null },
  )
  const [error, setError] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const set = (p: Partial<DatosClienteMayorista>) => setD((x) => ({ ...x, ...p }))

  const doc = (d.numero_documento ?? '').replace(/\D/g, '')
  const esCuit = doc.length === 11 && cuitValido(doc)

  const arca = useMutation({
    mutationFn: () => consultarCuitEnArca(doc),
    onSuccess: (r) => {
      if (!r.ok) {
        setNota(r.error)
        return
      }
      setNota(r.datos.avisos.length > 0 ? r.datos.avisos.join(' ') : 'Datos traídos de ARCA.')
      set({
        nombre: r.datos.nombre,
        ...(r.datos.condicion_iva_id !== null ? { condicion_iva_id: r.datos.condicion_iva_id } : {}),
        ...(r.datos.calle
          ? { calle: r.datos.calle, numero: r.datos.numero ?? '', localidad: r.datos.localidad ?? '' }
          : {}),
      })
    },
  })

  const ubicar = useMutation({
    mutationFn: ubicacionActual,
    onSuccess: (u) => {
      setError(null)
      set(u)
    },
    onError: (e) => setError(enCastellano(e)),
  })

  const guardar = useMutation({
    mutationFn: () => guardarClienteMayorista(cliente?.id ?? null, d),
    onSuccess: (r) =>
      onGuardado(
        nuevo && r.existia
          ? `${r.nombre} ya era cliente: ahora es también mayorista.`
          : nuevo
            ? `${r.nombre}: dado de alta, con cuenta corriente a 30 días.`
            : `${r.nombre}: guardado.`,
      ),
    onError: (e) => setError(enCastellano(e)),
  })

  const puedeGuardar = !nuevo || (d.nombre ?? '').trim().length > 0 || doc.length >= 7

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight text-tinta">
          {nuevo ? 'Nuevo cliente mayorista' : cliente.nombre}
        </h1>
        <button onClick={onCerrar} className={boton.suave}>
          Volver
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <section className={`${tarjeta} grid grid-cols-1 gap-3 p-4 sm:grid-cols-2`}>
        {nuevo && (
          <>
            <Campo etiqueta="CUIT o DNI" ayuda="Si ya es cliente del local, no se duplica." ancho="sm:col-span-2">
              <div className="flex gap-2">
                <input
                  inputMode="numeric"
                  value={d.numero_documento ?? ''}
                  onChange={(e) => set({ numero_documento: e.target.value })}
                  className={campo}
                />
                {esCuit && (
                  <button
                    type="button"
                    onClick={() => arca.mutate()}
                    disabled={arca.isPending}
                    className={`${botonChico.secundario} shrink-0`}
                  >
                    {arca.isPending ? 'Buscando…' : 'Traer de ARCA'}
                  </button>
                )}
              </div>
              {nota && <span className="mt-1 block text-xs text-piedra-600">{nota}</span>}
            </Campo>
            <Campo etiqueta="Nombre o razón social" ancho="sm:col-span-2">
              <input value={d.nombre ?? ''} onChange={(e) => set({ nombre: e.target.value })} className={campo} />
            </Campo>
            <Campo etiqueta="Nombre del comercio">
              <input
                value={d.nombre_fantasia ?? ''}
                onChange={(e) => set({ nombre_fantasia: e.target.value })}
                className={campo}
              />
            </Campo>
            <Campo etiqueta="Condición frente al IVA">
              <select
                value={d.condicion_iva_id ?? 5}
                onChange={(e) => set({ condicion_iva_id: Number(e.target.value) })}
                className={campo}
              >
                {CONDICIONES_IVA.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </>
        )}

        <Campo etiqueta="Teléfono">
          <input
            type="tel"
            value={d.telefono ?? ''}
            onChange={(e) => set({ telefono: e.target.value })}
            placeholder="3764 123456"
            className={campo}
          />
        </Campo>
        <Campo etiqueta="Mail" ayuda="Para mandarle la factura.">
          <input type="email" value={d.email ?? ''} onChange={(e) => set({ email: e.target.value })} className={campo} />
        </Campo>
        <Campo etiqueta="Calle">
          <input value={d.calle ?? ''} onChange={(e) => set({ calle: e.target.value })} className={campo} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Número">
            <input value={d.numero ?? ''} onChange={(e) => set({ numero: e.target.value })} className={campo} />
          </Campo>
          <Campo etiqueta="Localidad">
            <input value={d.localidad ?? ''} onChange={(e) => set({ localidad: e.target.value })} className={campo} />
          </Campo>
        </div>
        <Campo etiqueta="Ruta" ayuda="Por dónde se pasa: «Ruta 14».">
          <input list="rutas-mayoristas" value={d.ruta ?? ''} onChange={(e) => set({ ruta: e.target.value })} className={campo} />
          <datalist id="rutas-mayoristas">
            {rutas.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Campo>
        <Campo etiqueta="Zona">
          <input value={d.zona ?? ''} onChange={(e) => set({ zona: e.target.value })} className={campo} />
        </Campo>

        <div className="space-y-2 sm:col-span-2">
          <p className="text-xs font-medium text-piedra-600">Ubicación</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => ubicar.mutate()} disabled={ubicar.isPending} className={botonChico.secundario}>
              {ubicar.isPending ? 'Buscando…' : 'Estoy en el local del cliente'}
            </button>
            {d.latitud != null && d.longitud != null ? (
              <>
                <a
                  href={enlaceMapa({ latitud: d.latitud, longitud: d.longitud, calle: null, numero: null, localidad: null })!}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-marca-700 underline"
                >
                  Ver en el mapa
                </a>
              </>
            ) : (
              <span className="text-xs text-piedra-500">Sin ubicación guardada.</span>
            )}
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button onClick={() => guardar.mutate()} disabled={guardar.isPending || !puedeGuardar} className={boton.principal}>
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
