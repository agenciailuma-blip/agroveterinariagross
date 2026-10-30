import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { confirmar } from '@/components/Dialogo'
import { hoyEnObera } from '@/lib/api/cheques'
import { obtenerNoFiscalCompleto } from '@/lib/api/noFiscal'
import {
  ajusteGuardado,
  arruinarHoja,
  avisoDeTandas,
  guardarAjuste,
  limitarAjuste,
  listarTandas,
  numeroDeHoja,
  remitoEnHojas,
  tomarHojas,
  type AjusteDeImpresion,
} from '@/lib/api/remitoR'
import {
  medidorDelNavegador,
  repartirEnHojas,
  textosDeHoja,
  type DatosDeHoja,
  type TextoEnHoja,
} from '@/lib/comprobante/hojaRemitoR'
import { enCastellano } from '@/lib/errores'
import { boton, botonChico, campoDeFiltro } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  El remito R, sobre la hoja de la imprenta

  Fase 03, punto 4. Se imprime sólo lo que cambia: lo fijo, el número y el
  CAI ya vienen en la hoja. En pantalla se ve encima del dibujo de la
  hoja; en el papel, el dibujo no sale.

  El número se toma recién al imprimir. Imprimir de nuevo usa el mismo; si
  la hoja no sirvió, se anota y el remito pasa a la siguiente.
  ─────────────────────────────────────────────────────────────
*/
export default function RemitoRImprimible() {
  const { id } = useParams<{ id: string }>()
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const puede = tienePermiso('facturacion.no_fiscal_emitir')
  const [ajuste, setAjuste] = useState<AjusteDeImpresion>(ajusteGuardado)
  const [prueba, setPrueba] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Medir antes de que cargue la letra daría otros cortes de renglón.
  const [letraLista, setLetraLista] = useState(false)

  useEffect(() => {
    let vivo = true
    Promise.all([document.fonts.load('400 10px Ubuntu'), document.fonts.load('700 10px Ubuntu')]).finally(() => {
      if (vivo) setLetraLista(true)
    })
    return () => {
      vivo = false
    }
  }, [])

  const doc = useQuery({
    queryKey: ['no-fiscal', id],
    queryFn: () => obtenerNoFiscalCompleto(id!),
    enabled: !!id && puede,
  })
  const enHojas = useQuery({
    queryKey: ['remito-r', id],
    queryFn: () => remitoEnHojas(id!),
    enabled: !!id && puede,
  })
  const tandas = useQuery({ queryKey: ['remito-r-tandas'], queryFn: listarTandas, enabled: puede })

  const d = doc.data
  const datos: DatosDeHoja | null = d
    ? {
        fecha: d.fecha,
        nombre: d.receptor_nombre,
        documento: d.receptor_documento,
        condicion: d.receptor_condicion,
        domicilio: d.entrega_domicilio || d.receptor_domicilio,
        localidad: d.entrega_localidad,
        transportista: d.transportista,
        pedido: enHojas.data?.pedido_numero ?? null,
        asociado: enHojas.data?.asociado ?? null,
        lineas: d.lineas.map((l) => ({
          codigo: l.codigo_producto ?? '',
          descripcion: l.descripcion,
          cantidad: Number(l.cantidad),
        })),
      }
    : null

  const paginas = useMemo(() => {
    if (!datos) return []
    const medir = medidorDelNavegador()
    const reparto = repartirEnHojas(datos.lineas, medir)
    return reparto.map((renglones, i) => textosDeHoja(datos, renglones, i, reparto.length, medir))
    // Los datos salen de las dos consultas; la letra cambia cómo se mide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.data, enHojas.data, letraLista])

  const hojas = enHojas.data?.hojas ?? []
  const faltan = Math.max(0, paginas.length - hojas.length)
  const proxima = tandas.data?.find((t) => t.vigente)
  const aviso = avisoDeTandas(tandas.data ?? [], hoyEnObera())
  const anulado = d?.estado === 'anulado'

  const imprimir = useMutation({
    mutationFn: async () => {
      if (faltan > 0) await tomarHojas(id!, paginas.length)
    },
    onSuccess: async () => {
      setError(null)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['remito-r', id] }),
        qc.invalidateQueries({ queryKey: ['remito-r-tandas'] }),
      ])
      window.print()
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo tomar la hoja.')),
  })

  const arruinar = useMutation({
    mutationFn: (hojaId: string) => arruinarHoja(hojaId, null),
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: ['remito-r', id] })
      qc.invalidateQueries({ queryKey: ['remito-r-tandas'] })
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo anotar la hoja.')),
  })

  function imprimirPrueba() {
    flushSync(() => setPrueba(true))
    window.print()
    setPrueba(false)
  }

  function cambiarAjuste(cambio: Partial<AjusteDeImpresion>) {
    const nuevo = { ...ajuste, ...cambio }
    setAjuste(nuevo)
    guardarAjuste(nuevo)
  }

  if (!puede) {
    return <p className="p-8 text-sm text-piedra-600">No tenés permiso para imprimir el remito R.</p>
  }
  if (doc.isPending || enHojas.isPending) return <p className="p-8 text-sm text-piedra-500">Cargando…</p>
  if (doc.isError || enHojas.isError || !d) {
    return (
      <p role="alert" className="m-8 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
        {enCastellano(doc.error ?? enHojas.error, 'No se pudo cargar el remito.')}
      </p>
    )
  }
  if (d.tipo_clave !== 'remito') {
    return <p className="p-8 text-sm text-piedra-600">Este comprobante no es un remito.</p>
  }

  const ocupado = imprimir.isPending || arruinar.isPending
  const sinHoja = faltan > 0 && !proxima

  return (
    <div className="min-h-full bg-piedra-100 py-6 print:bg-white print:py-0">
      <style>{'@page { size: A4; margin: 0; }'}</style>

      <div className="mx-auto mb-4 max-w-[21cm] space-y-3 px-4 print:hidden">
        <div>
          <h1 className="text-lg font-semibold text-tinta">Remito R</h1>
          <p className="text-sm [overflow-wrap:anywhere] text-piedra-500">{d.receptor_nombre}</p>
        </div>

        {anulado && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Este remito está anulado: no se imprime.
          </p>
        )}
        {aviso && !anulado && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{aviso}</p>
        )}
        {sinHoja && !anulado && !aviso && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Todavía no hay hojas cargadas. Se cargan en Configuración, Facturación.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}

        {hojas.length > 0 && (
          <ul className="space-y-1">
            {hojas.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-borde">
                <span className="font-medium tabular-nums text-tinta">Hoja {numeroDeHoja(h.punto_venta, h.numero)}</span>
                <button
                  disabled={ocupado}
                  className={botonChico.suave}
                  onClick={async () => {
                    const ok = await confirmar({
                      titulo: `Hoja ${numeroDeHoja(h.punto_venta, h.numero)}`,
                      detalle: 'Queda anotada como arruinada y el remito pasa a la hoja siguiente.',
                      aceptar: 'Se arruinó',
                      peligro: true,
                    })
                    if (ok) arruinar.mutate(h.id)
                  }}
                >
                  Se arruinó
                </button>
              </li>
            ))}
          </ul>
        )}

        {!anulado && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => imprimir.mutate()}
              disabled={ocupado || sinHoja || paginas.length === 0}
              className={boton.principal}
            >
              {imprimir.isPending
                ? 'Un momento…'
                : faltan === 0
                  ? 'Imprimir de nuevo en la misma hoja'
                  : proxima
                    ? `Imprimir en la hoja ${numeroDeHoja(proxima.punto_venta, proxima.proxima)}${faltan > 1 ? ` y ${faltan - 1} más` : ''}`
                    : 'Imprimir'}
            </button>
            <button onClick={imprimirPrueba} disabled={ocupado} className={boton.secundario}>
              Prueba en papel en blanco
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-white px-3 py-2 text-sm text-piedra-600 ring-1 ring-borde">
          <label className="flex items-center gap-2">
            Correr a la derecha
            <input
              type="number"
              step="0.5"
              value={ajuste.x}
              onChange={(e) => cambiarAjuste({ x: limitarAjuste(Number(e.target.value)) })}
              className={`${campoDeFiltro} w-20 text-right`}
            />
            mm
          </label>
          <label className="flex items-center gap-2">
            Correr hacia abajo
            <input
              type="number"
              step="0.5"
              value={ajuste.y}
              onChange={(e) => cambiarAjuste({ y: limitarAjuste(Number(e.target.value)) })}
              className={`${campoDeFiltro} w-20 text-right`}
            />
            mm
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={ajuste.duplicado}
              onChange={(e) => cambiarAjuste({ duplicado: e.target.checked })}
            />
            Imprimir también el duplicado
          </label>
        </div>
      </div>

      {paginas.map((textos, i) => (
        <div key={i}>
          <Hoja textos={textos} ajuste={ajuste} conFondo={prueba} oculta={prueba && i > 0} />
          {/* El duplicado sólo existe en el papel: es la misma hoja. */}
          {ajuste.duplicado && !prueba && (
            <div className="hidden print:block">
              <Hoja textos={textos} ajuste={ajuste} conFondo={false} oculta={false} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function Hoja({
  textos,
  ajuste,
  conFondo,
  oculta,
}: {
  textos: TextoEnHoja[]
  ajuste: AjusteDeImpresion
  conFondo: boolean
  oculta: boolean
}) {
  return (
    <div
      className={`mx-auto mb-4 max-w-[21cm] overflow-hidden bg-white shadow-sm ring-1 ring-borde print:mb-0 print:h-[296mm] print:w-[210mm] print:max-w-none print:break-after-page print:shadow-none print:ring-0 ${oculta ? 'print:hidden' : ''}`}
    >
      <svg
        viewBox="0 0 210 297"
        xmlns="http://www.w3.org/2000/svg"
        className="block w-full print:h-[297mm] print:w-[210mm]"
        style={{ fontFamily: 'Ubuntu, sans-serif' }}
      >
        <g transform={`translate(${ajuste.x} ${ajuste.y})`}>
          <image href="/remito-r/hoja.png" x="0" y="0" width="210" height="297" className={conFondo ? '' : 'print:hidden'} />
          {textos.map((t, i) => (
            <text
              key={i}
              x={t.x}
              y={t.y}
              fontSize={t.tam * 0.3528}
              fontWeight={t.negrita ? 700 : 400}
              textAnchor={t.ancla ?? 'start'}
              fill="#000"
            >
              {t.texto}
            </text>
          ))}
        </g>
      </svg>
    </div>
  )
}
