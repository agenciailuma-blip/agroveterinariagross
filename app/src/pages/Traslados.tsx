import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { confirmar, pedirTexto } from '@/components/Dialogo'
import { hoyEnObera, sumarDias } from '@/lib/api/cheques'
import { leerImporte } from '@/lib/api/recibos'
import {
  ESTADOS,
  MOTIVOS,
  cambiarEstado,
  datosDe,
  duracion,
  enlaceMapaTraslado,
  enlaceTelefono,
  estadisticasTraslados,
  faltaEnTraslado,
  guardarTraslado,
  leerKm,
  leerMinutos,
  listarTraslados,
  mandarACaja,
  puedeIrACaja,
  sePuedeCorregir,
  trasladoVacio,
  ventaVigente,
  type DatosTraslado,
  type EstadoTraslado,
  type MotivoTraslado,
  type Traslado,
  type Vista,
} from '@/lib/api/traslados'
import { abrirComprobante, abrirMapa, abrirNoFiscal } from '@/lib/escritorio'
import { enCastellano } from '@/lib/errores'
import { avanzarConEnter } from '@/lib/teclado'
import { boton, botonChico, campo, campoDeFiltro, tarjeta } from '@/estilos'
import { moneda, numero } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  Traslados

  Fase 03, punto 6. Las órdenes para ir a buscar o llevar un animal.
  Arriba lo que hay que hacer, por día y por hora; lo atrasado se marca.
  Desde cada orden: el mapa, el teléfono del dueño, mandarla a la caja
  y, al volver, finalizarla con los kilómetros, el costo y el tiempo.

  La hoja para el que maneja sale aparte, para imprimir: lo que hay que
  buscar ese día.
  ─────────────────────────────────────────────────────────────
*/
export default function Traslados() {
  const { tienePermiso } = useAuth()
  const puede = tienePermiso('traslados.ver')
  const edita = tienePermiso('traslados.editar')
  const [vista, setVista] = useState<Vista>('abiertas')
  const [buscar, setBuscar] = useState('')
  const [editando, setEditando] = useState<{ id: string; datos: DatosTraslado; numero: number | null } | null>(null)
  const [finalizando, setFinalizando] = useState<Traslado | null>(null)

  const hoy = hoyEnObera()
  const desde = `${hoy.slice(0, 8)}01`

  const traslados = useQuery({
    queryKey: ['traslados', vista, buscar.trim()],
    queryFn: () => listarTraslados(vista, buscar),
    enabled: puede,
  })
  const estadisticas = useQuery({
    queryKey: ['traslados-estadisticas', desde, hoy],
    queryFn: () => estadisticasTraslados(desde, hoy),
    enabled: puede,
  })

  if (!puede) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para ver los traslados.
      </p>
    )
  }

  const filas = traslados.data ?? []
  const grupos = vista === 'abiertas' ? porDia(filas, hoy) : [{ titulo: null, atrasado: false, filas }]
  const e = estadisticas.data

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Traslados</h1>
          <p className="text-sm text-piedra-500">Ir a buscar o llevar un animal. Se cobran por la caja.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/traslados/hoja?fecha=${hoy}`} className={boton.secundario}>
            Hoja del día
          </Link>
          {edita && (
            <button
              onClick={() => setEditando({ id: crypto.randomUUID(), datos: trasladoVacio(hoy), numero: null })}
              className={boton.principal}
            >
              Nueva orden
            </button>
          )}
        </div>
      </div>

      {e && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Dato
            titulo="Este mes"
            valor={e.finalizadas === 1 ? 'Un traslado' : `${e.finalizadas} traslados`}
            detalle={`Cobrados ${moneda.format(e.monto)}`}
          />
          <Dato titulo="Kilómetros" valor={`${numero.format(e.km)} km`} detalle={promedio(e.km, e.con_datos, (n) => `${numero.format(n)} km`)} />
          <Dato titulo="Costo" valor={moneda.format(e.costo)} detalle={promedio(e.costo, e.con_datos, (n) => moneda.format(n))} />
          <Dato
            titulo="Tiempo"
            valor={e.minutos ? duracion(e.minutos) : '—'}
            detalle={promedio(e.minutos, e.con_datos, (n) => duracion(n))}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-piedra-100 p-0.5 text-sm">
          {(
            [
              ['abiertas', 'Por hacer'],
              ['cerradas', 'Hechas'],
              ['todas', 'Todas'],
            ] as const
          ).map(([v, etiqueta]) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`rounded-md px-3 py-1.5 ${vista === v ? 'bg-white font-medium text-tinta shadow-sm' : 'text-piedra-500'}`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <input
          value={buscar}
          onChange={(ev) => setBuscar(ev.target.value)}
          placeholder="Dueño, dirección, animal o número"
          inputMode="search"
          className={`${campoDeFiltro} min-w-0 flex-1 basis-48 sm:max-w-xs`}
        />
      </div>

      {traslados.isPending ? (
        <p className="text-sm text-piedra-500">Cargando…</p>
      ) : traslados.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {enCastellano(traslados.error, 'No se pudieron leer los traslados.')}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 px-4 py-12">
          <p className="text-center text-sm text-piedra-400">
            {buscar.trim()
              ? 'Ninguna orden con eso.'
              : vista === 'abiertas'
                ? 'No hay traslados por hacer.'
                : 'Todavía no hay órdenes.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map((g) => (
            <section key={g.titulo ?? 'todas'} className="space-y-2">
              {g.titulo && (
                <h2 className={`text-xs font-semibold tracking-wide uppercase ${g.atrasado ? 'text-red-700' : 'text-piedra-500'}`}>
                  {g.titulo}
                </h2>
              )}
              <ul className="space-y-3">
                {g.filas.map((t) => (
                  <Orden
                    key={t.id}
                    t={t}
                    hoy={hoy}
                    edita={edita}
                    onCorregir={() => setEditando({ id: t.id, datos: datosDe(t), numero: t.numero })}
                    onFinalizar={() => setFinalizando(t)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editando && (
        <FormularioTraslado
          id={editando.id}
          numero={editando.numero}
          inicial={editando.datos}
          bloqueaMonto={!!filas.find((t) => t.id === editando.id && ventaVigente(t))}
          onCerrar={() => setEditando(null)}
        />
      )}
      {finalizando && <ModalFinalizar t={finalizando} onCerrar={() => setFinalizando(null)} />}
    </div>
  )
}

const promedio = (total: number, n: number, formato: (n: number) => string) =>
  n > 0 ? `Promedio ${formato(total / n)}` : 'Se anotan al finalizar'

/* Lo que está por hacer, por día: lo atrasado junto, arriba. */
function porDia(filas: Traslado[], hoy: string) {
  const grupos: { titulo: string; atrasado: boolean; filas: Traslado[] }[] = []
  for (const t of filas) {
    const atrasado = t.fecha < hoy
    const titulo = atrasado ? 'Atrasados' : nombreDelDia(t.fecha, hoy)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.titulo === titulo) ultimo.filas.push(t)
    else grupos.push({ titulo, atrasado, filas: [t] })
  }
  return grupos
}

export function nombreDelDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return 'Hoy'
  if (fecha === sumarDias(hoy, 1)) return 'Mañana'
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' })
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className={`${tarjeta} min-w-0 p-4`}>
      <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">{titulo}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-tinta">{valor}</p>
      <p className="mt-0.5 text-xs text-piedra-500">{detalle}</p>
    </div>
  )
}

const COLOR_ESTADO: Record<EstadoTraslado, string> = {
  pendiente: 'bg-amber-50 text-amber-800 ring-amber-200',
  en_camino: 'bg-marca-50 text-marca-700 ring-marca-200',
  finalizada: 'bg-verde-50 text-verde-700 ring-verde-200',
  cancelada: 'bg-piedra-100 text-piedra-500 ring-borde',
}

function Orden({
  t,
  hoy,
  edita,
  onCorregir,
  onFinalizar,
}: {
  t: Traslado
  hoy: string
  edita: boolean
  onCorregir: () => void
  onFinalizar: () => void
}) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const venta = ventaVigente(t)
  const telefono = enlaceTelefono(t.dueno_telefono)
  const abierta = sePuedeCorregir(t)

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['traslados'] })
    qc.invalidateQueries({ queryKey: ['traslados-estadisticas'] })
  }
  const accion = useMutation({
    mutationFn: async (hacer: () => Promise<unknown>) => hacer(),
    onMutate: () => setError(null),
    onSuccess: refrescar,
    onError: (e) => setError(enCastellano(e, 'No se pudo guardar.')),
  })

  const aCaja = async () => {
    const ok = await confirmar({
      titulo: `¿Mandar la orden ${t.numero} a la caja?`,
      detalle: `Queda en la cola por ${moneda.format(t.monto)}, a nombre de Consumidor Final.`,
      aceptar: 'Mandar a caja',
    })
    if (ok) accion.mutate(() => mandarACaja(t.id))
  }
  const cancelar = async () => {
    const motivo = await pedirTexto({
      titulo: `Cancelar la orden ${t.numero}`,
      etiqueta: 'Por qué se cancela',
      minimo: 3,
      aceptar: 'Cancelar la orden',
      peligro: true,
    })
    if (motivo) accion.mutate(() => cambiarEstado(t.id, 'cancelada', { motivo }))
  }

  return (
    <li className={`${tarjeta} min-w-0 p-4 ${t.estado === 'cancelada' ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-tinta">
            N° {t.numero} · {MOTIVOS[t.motivo]}
          </p>
          <p className={`text-xs ${abierta && t.fecha < hoy ? 'font-medium text-red-700' : 'text-piedra-500'}`}>
            {nombreDelDia(t.fecha, hoy)}
            {t.hora && ` · ${t.hora} h`}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${COLOR_ESTADO[t.estado]}`}>
          {ESTADOS[t.estado]}
        </span>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-piedra-400">Dueño</dt>
          <dd className="[overflow-wrap:anywhere] text-tinta">
            {t.dueno_nombre}
            {t.dueno_telefono &&
              (telefono ? (
                <a href={telefono} className="ml-2 text-marca-700 hover:underline">
                  {t.dueno_telefono}
                </a>
              ) : (
                <span className="ml-2 text-piedra-500">{t.dueno_telefono}</span>
              ))}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-piedra-400">Dirección</dt>
          <dd className="flex flex-wrap items-center gap-x-2 [overflow-wrap:anywhere] text-tinta">
            <span className="min-w-0">
              {t.direccion}
              {t.localidad && `, ${t.localidad}`}
            </span>
            <BotonMapa url={enlaceMapaTraslado(t)} />
          </dd>
        </div>
        {t.descripcion && (
          <div className="min-w-0">
            <dt className="text-xs text-piedra-400">Animal</dt>
            <dd className="[overflow-wrap:anywhere] text-tinta">{t.descripcion}</dd>
          </div>
        )}
        {t.observaciones && (
          <div className="min-w-0">
            <dt className="text-xs text-piedra-400">Observaciones</dt>
            <dd className="[overflow-wrap:anywhere] text-tinta">{t.observaciones}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-piedra-100 pt-3 text-sm">
        <span className="font-semibold tabular-nums text-tinta">{t.monto ? moneda.format(t.monto) : 'Sin monto'}</span>
        <EstadoDelCobro t={t} />
        {t.estado === 'finalizada' && <HechoEnElViaje t={t} />}
        {t.estado === 'cancelada' && t.motivo_cancelacion && (
          <span className="text-xs [overflow-wrap:anywhere] text-piedra-500">Cancelada: {t.motivo_cancelacion}</span>
        )}
      </div>

      {edita && t.estado !== 'cancelada' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {t.estado === 'pendiente' && (
            <button
              onClick={() => accion.mutate(() => cambiarEstado(t.id, 'en_camino'))}
              disabled={accion.isPending}
              className={botonChico.secundario}
            >
              Salió
            </button>
          )}
          {abierta && (
            <button onClick={onFinalizar} disabled={accion.isPending} className={botonChico.principal}>
              Finalizar
            </button>
          )}
          {puedeIrACaja(t) && (
            <button onClick={aCaja} disabled={accion.isPending} className={botonChico.secundario}>
              Mandar a caja
            </button>
          )}
          {abierta && (
            <button onClick={onCorregir} disabled={accion.isPending} className={botonChico.suave}>
              Corregir
            </button>
          )}
          {t.estado === 'en_camino' && (
            <button
              onClick={() => accion.mutate(() => cambiarEstado(t.id, 'pendiente'))}
              disabled={accion.isPending}
              className={botonChico.suave}
            >
              Volver a pendiente
            </button>
          )}
          {abierta && !venta && (
            <button onClick={cancelar} disabled={accion.isPending} className={botonChico.suave}>
              Cancelar
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </li>
  )
}

function EstadoDelCobro({ t }: { t: Traslado }) {
  const venta = ventaVigente(t)
  if (!venta) {
    return t.monto > 0 && t.estado !== 'cancelada' ? <span className="text-xs text-piedra-500">Sin mandar a la caja</span> : null
  }
  if (venta.estado === 'en_caja' || venta.estado === 'borrador') {
    return <span className="text-xs text-amber-800">En la caja · {venta.codigo}</span>
  }
  // Cobrada.
  if (venta.comprobante_id) {
    return (
      <button onClick={() => abrirComprobante(venta.comprobante_id!)} className="text-xs text-marca-700 hover:underline">
        Cobrada · {venta.comprobante}
      </button>
    )
  }
  if (venta.no_fiscal_id) {
    return (
      <button onClick={() => abrirNoFiscal(venta.no_fiscal_id!)} className="text-xs text-marca-700 hover:underline">
        Cobrada · comprobante interno
      </button>
    )
  }
  return <span className="text-xs text-verde-700">Cobrada · {venta.codigo}</span>
}

function HechoEnElViaje({ t }: { t: Traslado }) {
  const partes = [
    t.km !== null && `${numero.format(t.km)} km`,
    t.costo !== null && `costo ${moneda.format(t.costo)}`,
    t.minutos !== null && duracion(t.minutos),
  ].filter(Boolean)
  return partes.length ? <span className="text-xs text-piedra-500">{partes.join(' · ')}</span> : null
}

export function BotonMapa({ url }: { url: string }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="shrink-0">
      <button
        onClick={() => {
          setError(null)
          abrirMapa(url).catch((e) => setError(enCastellano(e, 'No se pudo abrir el mapa.')))
        }}
        className="rounded-lg px-2 py-0.5 text-xs font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50"
      >
        Mapa
      </button>
      {error && <span className="block text-xs text-red-700">{error}</span>}
    </span>
  )
}

// ─── Cargar o corregir ───

function FormularioTraslado({
  id,
  numero: n,
  inicial,
  bloqueaMonto,
  onCerrar,
}: {
  id: string
  numero: number | null
  inicial: DatosTraslado
  bloqueaMonto: boolean
  onCerrar: () => void
}) {
  const qc = useQueryClient()
  const [d, setD] = useState(inicial)
  const cambiar = (c: Partial<DatosTraslado>) => setD({ ...d, ...c })
  const falta = faltaEnTraslado(d)
  const [intento, setIntento] = useState(false)

  const guardar = useMutation({
    mutationFn: () => guardarTraslado(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['traslados'] })
      onCerrar()
    },
  })

  const etiqueta = 'mb-1 block text-xs font-medium text-piedra-600'

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-tinta/50 p-4" onClick={onCerrar}>
      <form
        className="mx-auto my-8 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={avanzarConEnter}
        onSubmit={(e) => {
          e.preventDefault()
          setIntento(true)
          if (!falta) guardar.mutate()
        }}
      >
        <h2 className="font-semibold text-tinta">{n ? `Corregir la orden ${n}` : 'Nueva orden de traslado'}</h2>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className={etiqueta}>Fecha</span>
            <input type="date" value={d.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} className={campo} />
          </label>
          <label className="block min-w-0">
            <span className={etiqueta}>Hora</span>
            <input type="time" value={d.hora} onChange={(e) => cambiar({ hora: e.target.value })} className={campo} />
          </label>

          <div className="col-span-2">
            <span className={etiqueta}>Motivo</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(MOTIVOS) as MotivoTraslado[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => cambiar({ motivo: m })}
                  className={`rounded-full px-3 py-1 text-sm ring-1 ${
                    d.motivo === m ? 'bg-marca-700 text-white ring-marca-700' : 'text-marca-700 ring-borde hover:bg-marca-50'
                  }`}
                >
                  {MOTIVOS[m]}
                </button>
              ))}
            </div>
          </div>

          <label className="col-span-2 block min-w-0 sm:col-span-1">
            <span className={etiqueta}>Dirección</span>
            <input value={d.direccion} onChange={(e) => cambiar({ direccion: e.target.value })} className={campo} />
          </label>
          <label className="col-span-2 block min-w-0 sm:col-span-1">
            <span className={etiqueta}>Localidad</span>
            <input
              value={d.localidad}
              onChange={(e) => cambiar({ localidad: e.target.value })}
              placeholder="Oberá"
              className={campo}
            />
          </label>

          <label className="col-span-2 block min-w-0 sm:col-span-1">
            <span className={etiqueta}>Nombre completo del dueño</span>
            <input value={d.dueno_nombre} onChange={(e) => cambiar({ dueno_nombre: e.target.value })} className={campo} />
          </label>
          <label className="col-span-2 block min-w-0 sm:col-span-1">
            <span className={etiqueta}>Teléfono</span>
            <input
              value={d.dueno_telefono}
              onChange={(e) => cambiar({ dueno_telefono: e.target.value })}
              inputMode="tel"
              className={campo}
            />
          </label>

          <label className="col-span-2 block min-w-0">
            <span className={etiqueta}>El animal</span>
            <input
              value={d.descripcion}
              onChange={(e) => cambiar({ descripcion: e.target.value })}
              placeholder="Especie, tamaño, nombre"
              className={campo}
            />
          </label>

          <label className="col-span-2 block min-w-0 sm:col-span-1">
            <span className={etiqueta}>Monto</span>
            <input
              value={d.monto}
              onChange={(e) => cambiar({ monto: e.target.value })}
              inputMode="decimal"
              disabled={bloqueaMonto}
              className={`${campo} text-right tabular-nums disabled:bg-piedra-50`}
            />
            {bloqueaMonto ? (
              <span className="mt-1 block text-[11px] text-piedra-400">Ya está en la caja: para cambiarlo, anulá esa venta.</span>
            ) : (
              leerImporte(d.monto) !== null && (
                <span className="mt-1 block text-[11px] text-piedra-400">{moneda.format(leerImporte(d.monto)!)}</span>
              )
            )}
          </label>
          <label className="col-span-2 block min-w-0">
            <span className={etiqueta}>Observaciones</span>
            <textarea
              value={d.observaciones}
              onChange={(e) => cambiar({ observaciones: e.target.value })}
              rows={2}
              className={campo}
            />
          </label>
        </div>

        {intento && falta && <p className="mt-3 text-xs text-red-700">{falta}</p>}
        {guardar.isError && (
          <p role="alert" className="mt-3 text-xs text-red-700">
            {enCastellano(guardar.error, 'No se pudo guardar la orden.')}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={boton.suave}>
            Cerrar
          </button>
          <button type="submit" disabled={guardar.isPending} className={boton.principal}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Al volver ───

function ModalFinalizar({ t, onCerrar }: { t: Traslado; onCerrar: () => void }) {
  const qc = useQueryClient()
  const [km, setKm] = useState('')
  const [costo, setCosto] = useState('')
  const [tiempo, setTiempo] = useState('')

  const vKm = km.trim() ? leerKm(km) : null
  const vCosto = costo.trim() ? leerImporte(costo) : null
  const vMinutos = tiempo.trim() ? leerMinutos(tiempo) : null
  const mal =
    (km.trim() && vKm === null && 'Los kilómetros no se entienden.') ||
    (costo.trim() && vCosto === null && 'El costo no se entiende.') ||
    (tiempo.trim() && vMinutos === null && 'El tiempo no se entiende: poné minutos, o horas y minutos como 1:15.') ||
    null

  const finalizar = useMutation({
    mutationFn: () => cambiarEstado(t.id, 'finalizada', { km: vKm, costo: vCosto, minutos: vMinutos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['traslados'] })
      qc.invalidateQueries({ queryKey: ['traslados-estadisticas'] })
      onCerrar()
    },
  })

  const etiqueta = 'mb-1 block text-xs font-medium text-piedra-600'
  const ayuda = 'mt-1 block text-[11px] text-piedra-400'

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-tinta/50 p-4" onClick={onCerrar}>
      <form
        className="mx-auto my-8 w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={avanzarConEnter}
        onSubmit={(e) => {
          e.preventDefault()
          if (!mal) finalizar.mutate()
        }}
      >
        <h2 className="font-semibold text-tinta">Finalizar la orden {t.numero}</h2>
        <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-piedra-500">
          {MOTIVOS[t.motivo]} · {t.dueno_nombre}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <label className="block min-w-0">
            <span className={etiqueta}>Km</span>
            <input autoFocus value={km} onChange={(e) => setKm(e.target.value)} inputMode="decimal" className={`${campo} text-right`} />
            {vKm !== null && <span className={ayuda}>{numero.format(vKm)} km</span>}
          </label>
          <label className="block min-w-0">
            <span className={etiqueta}>Costo</span>
            <input value={costo} onChange={(e) => setCosto(e.target.value)} inputMode="decimal" className={`${campo} text-right`} />
            {vCosto !== null && <span className={ayuda}>{moneda.format(vCosto)}</span>}
          </label>
          <label className="block min-w-0">
            <span className={etiqueta}>Tiempo</span>
            <input value={tiempo} onChange={(e) => setTiempo(e.target.value)} placeholder="1:15" className={`${campo} text-right`} />
            {vMinutos !== null && <span className={ayuda}>{duracion(vMinutos)}</span>}
          </label>
        </div>
        <p className="mt-2 text-[11px] text-piedra-400">Con esto salen las estadísticas. Lo que no se sepa puede quedar vacío.</p>

        {mal && <p className="mt-3 text-xs text-red-700">{mal}</p>}
        {finalizar.isError && (
          <p role="alert" className="mt-3 text-xs text-red-700">
            {enCastellano(finalizar.error, 'No se pudo finalizar.')}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={boton.suave}>
            Cerrar
          </button>
          <button type="submit" disabled={finalizar.isPending || !!mal} className={boton.principal}>
            {finalizar.isPending ? 'Guardando…' : 'Finalizar'}
          </button>
        </div>
      </form>
    </div>
  )
}
