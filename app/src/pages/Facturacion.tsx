import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { pedirTexto } from '@/components/Dialogo'
import ExportarParaContador from '@/components/ExportarParaContador'
import {
  ETIQUETA_SEMAFORO,
  devolverVenta,
  facturarVenta,
  listarComprobantes,
  solicitarCae,
  ventasSinFacturar,
} from '@/lib/api/facturacion'
import type { FilaComprobante, Semaforo, VentanaCae } from '@/lib/api/facturacion'
import PanelContingencia from '@/components/PanelContingencia'
import DevolucionParcial from '@/components/DevolucionParcial'
import { emitirConCaea, estadoContingencia } from '@/lib/api/contingencia'
import { moneda } from '@/lib/tipos'

const COLOR_SEMAFORO: Record<Semaforo, string> = {
  verde: 'bg-verde-500',
  amarillo: 'bg-amber-400',
  naranja: 'bg-orange-500',
  rojo: 'bg-red-500',
  violeta: 'bg-violet-500',
  gris: 'bg-piedra-300',
}

export default function Facturacion() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState<'pendientes' | 'todos'>('pendientes')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  /*
    La venta que se esta devolviendo por partes.

    Vive aca y no adentro de la fila porque el dialogo tiene que
    sobrevivir a que la tabla se refresque: al volver de ARCA la lista se
    vuelve a pedir, y un estado dentro de la fila se perderia a la mitad.
  */
  const [devolviendoParte, setDevolviendoParte] = useState<FilaComprobante | null>(null)

  const puedeVer = tienePermiso('facturacion.ver')
  const puedeEmitir = tienePermiso('facturacion.emitir')
  const puedeContingencia = tienePermiso('facturacion.contingencia')

  // Mismo queryKey que el panel: React Query lo trae una sola vez.
  const contingencia = useQuery({
    queryKey: ['contingencia'],
    queryFn: estadoContingencia,
    enabled: puedeVer,
  })
  const hayCaea = !!contingencia.data?.vigente

  const comprobantes = useQuery({
    queryKey: ['comprobantes', filtro],
    queryFn: () => listarComprobantes(filtro),
    enabled: puedeVer,
  })

  const sinFacturar = useQuery({
    queryKey: ['ventas-sin-facturar'],
    queryFn: ventasSinFacturar,
    enabled: puedeVer,
  })

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['comprobantes'] })
    qc.invalidateQueries({ queryKey: ['ventas-sin-facturar'] })
    qc.invalidateQueries({ queryKey: ['contingencia'] })
  }

  function avisar(texto: string) {
    setAviso(texto)
    setError(null)
    setTimeout(() => setAviso(null), 5000)
  }

  const reintentar = useMutation({
    mutationFn: (id: string) => solicitarCae(id),
    onSuccess: ({ cae }) => {
      avisar(`Autorizado por ARCA. CAE ${cae}`)
      refrescar()
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : 'ARCA no autorizó el comprobante.')
      refrescar()
    },
  })

  const facturar = useMutation({
    mutationFn: (ventaId: string) => facturarVenta(ventaId),
    onSuccess: ({ cae }) => {
      avisar(`Autorizado por ARCA. CAE ${cae}`)
      refrescar()
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : 'No se pudo facturar.')
      refrescar()
    },
  })

  /*
    Devolución. Se pide el motivo antes de tocar nada: queda guardado en
    la venta y es lo que después explica por qué el stock volvió a entrar.
  */
  const devolver = useMutation({
    mutationFn: ({ ventaId, motivo }: { ventaId: string; motivo: string }) =>
      devolverVenta(ventaId, motivo),
    onSuccess: ({ notaCreditoId, cae, problema }) => {
      if (!notaCreditoId) {
        avisar('Venta anulada. No estaba facturada, así que no hace falta nota de crédito.')
      } else if (problema) {
        setAviso(null)
        setError(
          `La devolución se hizo y la nota de crédito quedó armada, pero ARCA no la autorizó todavía: ${problema} Se puede reintentar desde esta misma pantalla.`,
        )
      } else {
        avisar(`Nota de crédito autorizada por ARCA. CAE ${cae}`)
      }
      refrescar()
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : 'No se pudo hacer la devolución.')
      refrescar()
    },
  })

  /*
    Emitir por contingencia. Se pide el motivo y queda guardado en el
    comprobante: es lo que después explica ante ARCA por qué se usó el
    CAEA en vez de pedir el CAE.
  */
  const porContingencia = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => emitirConCaea(id, motivo),
    onSuccess: ({ caea }) => {
      avisar(`Emitido por contingencia con el CAEA ${caea}. Falta informárselo a ARCA.`)
      refrescar()
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : 'No se pudo emitir por contingencia.')
      refrescar()
    },
  })

  const trabajando =
    reintentar.isPending || facturar.isPending || devolver.isPending || porContingencia.isPending

  if (!puedeVer) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        No tenés permiso para ver la facturación.
      </p>
    )
  }

  const filas = comprobantes.data ?? []
  const pendientes = sinFacturar.data ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Facturación</h1>
          <p className="text-sm text-piedra-500">
            Comprobantes emitidos y los que esperan resolución de ARCA.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-piedra-100 p-1">
          <Solapa activa={filtro === 'pendientes'} onClick={() => setFiltro('pendientes')}>
            Necesitan atención
          </Solapa>
          <Solapa activa={filtro === 'todos'} onClick={() => setFiltro('todos')}>
            Todos
          </Solapa>
        </div>
      </div>

      {aviso && (
        <p className="rounded-xl bg-verde-50 px-4 py-3 text-sm font-medium text-verde-800 ring-1 ring-verde-200">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <PanelContingencia onAviso={avisar} onError={setError} />

      {/*
        El archivo que Gross le manda al contador todos los meses.

        Vive acá y no en una pantalla propia porque es una salida de la
        facturación, no un módulo: son los mismos comprobantes de esta
        pantalla, en un Excel. Una entrada de menú aparte para bajar un
        archivo por mes sería una entrada que casi nunca se toca.
      */}
      <ExportarParaContador />

      {/*
        Ventas cobradas sin comprobante. Va arriba de todo y en rojo
        porque es la única situación donde la plata ya entró y no hay
        respaldo fiscal: es más urgente que un comprobante rechazado.
      */}
      {pendientes.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-red-200">
          <div className="border-b border-red-200 bg-red-50 px-5 py-3">
            <p className="font-medium text-red-900">
              {pendientes.length} {pendientes.length === 1 ? 'venta cobrada' : 'ventas cobradas'} sin
              comprobante
            </p>
            <p className="text-xs text-red-700">
              Ya se cobraron pero no tienen factura. Emitilas cuanto antes: ARCA acepta hasta 5 días
              de diferencia con la fecha de la venta.
            </p>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-piedra-100">
              {pendientes.map((v) => (
                <tr key={v.id}>
                  <td className="px-5 py-2.5 font-mono text-xs text-piedra-400">{v.codigo}</td>
                  <td className="py-2.5 text-tinta">{v.cliente?.nombre}</td>
                  <td className="py-2.5 text-xs text-piedra-500">
                    {new Date(v.ocurrido_en).toLocaleDateString('es-AR')}
                  </td>
                  <td className="py-2.5 text-right font-medium tabular-nums text-tinta">
                    {moneda.format(v.total)}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {puedeEmitir && (
                      <button
                        onClick={() => facturar.mutate(v.id)}
                        disabled={trabajando}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-40"
                      >
                        {facturar.isPending && facturar.variables === v.id ? 'Emitiendo…' : 'Facturar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <table className="w-full text-sm">
          <thead className="border-b border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
            <tr>
              <th className="px-5 py-2.5 font-medium">Estado</th>
              <th className="py-2.5 font-medium">Comprobante</th>
              <th className="py-2.5 font-medium">Receptor</th>
              <th className="py-2.5 font-medium">Fecha</th>
              <th className="py-2.5 text-right font-medium">Total</th>
              <th className="py-2.5 font-medium">CAE</th>
              <th className="w-32 px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-piedra-100">
            {comprobantes.isPending && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-piedra-400">
                  Cargando…
                </td>
              </tr>
            )}
            {!comprobantes.isPending && filas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-piedra-400">
                  {filtro === 'pendientes'
                    ? 'No hay comprobantes esperando resolución.'
                    : 'Todavía no se emitió ningún comprobante.'}
                </td>
              </tr>
            )}
            {filas.map((c) => (
              <Fila
                key={c.id}
                c={c}
                puedeEmitir={puedeEmitir}
                puedeContingencia={puedeContingencia && hayCaea}
                trabajando={trabajando}
                reintentando={reintentar.isPending && reintentar.variables === c.id}
                onReintentar={() => reintentar.mutate(c.id)}
                onContingencia={async () => {
                  const motivo = await pedirTexto({
                    titulo: `Emitir ${c.comprobante} por contingencia`,
                    detalle:
                      'Usalo sólo si ARCA no responde. Queda registrado y hay que informárselo a ARCA cuando el servicio vuelva.',
                    etiqueta: '¿Qué está pasando?',
                    valorInicial: 'ARCA no responde',
                    minimo: 3,
                    aceptar: 'Emitir con CAEA',
                  })
                  if (!motivo) return
                  porContingencia.mutate({ id: c.id, motivo })
                }}
                onDevolverParte={() => setDevolviendoParte(c)}
                onDevolver={async () => {
                  if (!c.venta_id) return
                  const motivo = await pedirTexto({
                    titulo: `Devolver ${c.comprobante}`,
                    detalle: `${c.receptor_nombre}\n\nSe va a reingresar el stock, sacarle la deuda al cliente y emitir la nota de crédito.`,
                    etiqueta: '¿Por qué se devuelve?',
                    valorInicial: 'Devolución del cliente',
                    minimo: 3,
                    aceptar: 'Devolver',
                    peligro: true,
                  })
                  if (!motivo) return
                  devolver.mutate({ ventaId: c.venta_id, motivo })
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-piedra-400">
        La impresión en la Hasar todavía no está conectada: por eso los comprobantes autorizados
        quedan en amarillo (autorizado, sin imprimir).
      </p>

      {devolviendoParte?.venta_id && (
        <DevolucionParcial
          ventaId={devolviendoParte.venta_id}
          comprobante={devolviendoParte.comprobante}
          cliente={devolviendoParte.receptor_nombre}
          onCerrar={() => setDevolviendoParte(null)}
          onListo={(mensaje, problema) => {
            if (problema) {
              setAviso(null)
              setError(mensaje)
            } else {
              avisar(mensaje)
            }
            refrescar()
          }}
        />
      )}
    </div>
  )
}

function Solapa({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        activa ? 'bg-white text-tinta shadow-sm' : 'text-piedra-500 hover:text-tinta'
      }`}
    >
      {children}
    </button>
  )
}

const AVISO_VENTANA: Record<Exclude<VentanaCae, null | 'en_plazo'>, { texto: string; clase: string }> =
  {
    atencion: { texto: 'Quedan pocos días', clase: 'text-amber-700' },
    urgente: { texto: 'Último día para el CAE', clase: 'text-orange-700 font-medium' },
    vencido: { texto: 'Fuera de plazo: ya no toma esta fecha', clase: 'text-red-700 font-medium' },
  }

function Fila({
  c,
  puedeEmitir,
  puedeContingencia,
  trabajando,
  reintentando,
  onReintentar,
  onContingencia,
  onDevolver,
  onDevolverParte,
}: {
  c: FilaComprobante
  puedeEmitir: boolean
  puedeContingencia: boolean
  trabajando: boolean
  reintentando: boolean
  onReintentar: () => void
  onContingencia: () => void
  onDevolver: () => void
  onDevolverParte: () => void
}) {
  const puedeReintentar = c.estado === 'pendiente' || c.estado === 'rechazado'
  const ventana = c.ventana_cae && c.ventana_cae !== 'en_plazo' ? AVISO_VENTANA[c.ventana_cae] : null

  // Devolver es para una factura autorizada que todavía no se devolvió.
  // Sobre una nota de crédito no tiene sentido, y sobre una factura ya
  // devuelta duplicaría el reingreso de stock.
  const puedeDevolver =
    puedeEmitir &&
    c.familia === 'factura' &&
    c.estado === 'autorizado' &&
    !c.tiene_nota_credito &&
    !c.tiene_devoluciones_parciales &&
    !!c.venta_id

  /*
    Devolver por partes sigue disponible mientras quede algo.

    A diferencia de la devolución entera, ésta no se corta porque exista
    una nota de crédito: cada devolución parcial emite la suya, y una
    venta de tres bolsas puede tener tres. Lo que la corta es que no
    quede mercadería sin devolver.
  */
  const puedeDevolverParte =
    puedeEmitir &&
    c.familia === 'factura' &&
    c.estado === 'autorizado' &&
    c.queda_por_devolver &&
    !!c.venta_id

  return (
    <tr>
      <td className="px-5 py-2.5">
        <span className="flex items-center gap-2">
          <span className={`size-2.5 shrink-0 rounded-full ${COLOR_SEMAFORO[c.semaforo]}`} />
          <span className="text-xs text-piedra-600">{ETIQUETA_SEMAFORO[c.semaforo]}</span>
        </span>
        {ventana && <span className={`mt-0.5 block text-xs ${ventana.clase}`}>{ventana.texto}</span>}
      </td>
      <td className="py-2.5">
        <p className="font-mono text-xs text-tinta">{c.comprobante}</p>
        <p className="text-xs text-piedra-400">{c.tipo}</p>
      </td>
      <td className="max-w-48 truncate py-2.5 text-tinta">{c.receptor_nombre}</td>
      <td className="py-2.5 text-xs text-piedra-500">
        {new Date(`${c.fecha}T00:00:00`).toLocaleDateString('es-AR')}
      </td>
      <td className="py-2.5 text-right font-medium tabular-nums text-tinta">
        {moneda.format(c.total)}
      </td>
      <td className="py-2.5">
        {c.cae ? (
          <>
            <p className="font-mono text-xs text-piedra-600">{c.cae}</p>
            {c.cae_vencimiento && (
              <p className="text-xs text-piedra-400">
                vence {new Date(`${c.cae_vencimiento}T00:00:00`).toLocaleDateString('es-AR')}
              </p>
            )}
          </>
        ) : (
          <span className="text-xs text-piedra-300">—</span>
        )}
        {c.intentos_fallidos > 0 && (
          <p className="text-xs text-red-600">
            {c.intentos_fallidos} {c.intentos_fallidos === 1 ? 'intento fallido' : 'intentos fallidos'}
          </p>
        )}
      </td>
      <td className="px-5 py-2.5 text-right">
        {puedeEmitir && puedeReintentar && (
          <button
            onClick={onReintentar}
            disabled={trabajando}
            className="rounded-lg bg-marca-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-marca-600 disabled:opacity-40"
          >
            {reintentando ? 'Pidiendo…' : c.estado === 'rechazado' ? 'Reintentar' : 'Pedir CAE'}
          </button>
        )}
        {/*
          El CAEA se ofrece recién cuando ARCA ya falló por caída, y
          nunca sobre un comprobante que ARCA rechazó: un rechazo dice
          que los datos están mal, y el CAEA no arregla eso. La base
          verifica lo mismo antes de emitir; acá se evita mostrar un
          botón que va a fallar.
        */}
        {puedeContingencia && puedeReintentar && c.estado !== 'rechazado' && c.intentos_fallidos > 0 && (
          <button
            onClick={onContingencia}
            disabled={trabajando}
            className="ml-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200 hover:bg-violet-50 disabled:opacity-40"
          >
            Emitir con CAEA
          </button>
        )}
        {c.cae && (
          <Link
            to={`/comprobante/${c.id}`}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50"
          >
            Ver / Imprimir
          </Link>
        )}
        {puedeDevolver && (
          <button
            onClick={onDevolver}
            disabled={trabajando}
            className="ml-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-piedra-500 ring-1 ring-borde hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
          >
            Devolver
          </button>
        )}
        {puedeDevolverParte && (
          <button
            onClick={onDevolverParte}
            disabled={trabajando}
            className="ml-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-piedra-500 ring-1 ring-borde hover:bg-marca-50 hover:text-marca-700 disabled:opacity-40"
          >
            Devolver parte
          </button>
        )}
        {/*
          «Devuelta» sólo cuando ya no queda nada. Con una devolución
          parcial la factura tiene nota de crédito igual, y decir
          «devuelta» ahí sería falso: volvió una bolsa de tres.
        */}
        {c.tiene_nota_credito && !c.queda_por_devolver && (
          <span className="ml-1.5 text-xs text-piedra-400">Devuelta</span>
        )}
        {c.tiene_devoluciones_parciales && c.queda_por_devolver && (
          <span className="ml-1.5 text-xs text-piedra-400">Devuelta en parte</span>
        )}
      </td>
    </tr>
  )
}
