import { Fragment, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { datosEmisor } from '@/lib/api/comprobante'
import { agruparPor, buscarComprobantes, fechaAr, totalesDe, type Totales } from '@/lib/api/buscarComprobantes'
import { busquedaDe, type Modo } from '@/lib/api/buscarComprobantes'
import { moneda, numero } from '@/lib/tipos'
import { boton } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  El listado de una búsqueda, en papel

  Lo que se ve en Facturas emitidas o en Percepciones, en una hoja A4:
  el período, cada comprobante con su neto, IVA y percepción, el
  subtotal de cada semana o mes si se clasificó, y el total al pie. Para
  llevárselo al contador o archivarlo. Lee la misma búsqueda de la
  dirección, así que sale exactamente lo que estaba en pantalla.
  ─────────────────────────────────────────────────────────────
*/

export default function ListadoDeComprobantesImprimible() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const modo: Modo = params.get('m') === 'percepciones' ? 'percepciones' : 'facturas'
  const b = busquedaDe(params, modo)
  const soloPercepciones = modo === 'percepciones'

  const consulta = useQuery({
    queryKey: ['buscar-comprobantes', 'listado', params.toString()],
    queryFn: () =>
      buscarComprobantes({
        desde: b.desde,
        hasta: b.hasta,
        cliente: b.cliente,
        numero: b.numero,
        familia: b.familia,
        letra: b.letra,
        situacion: b.situacion,
        soloConPercepcion: b.soloConPercepcion,
      }),
  })
  const emisor = useQuery({ queryKey: ['emisor'], queryFn: datosEmisor })

  const titulo = soloPercepciones ? 'Percepciones de IIBB' : 'Comprobantes emitidos'

  // El título es el nombre que propone el navegador al guardar el PDF.
  useEffect(() => {
    const anterior = document.title
    document.title = `${titulo} ${fechaAr(b.desde)} al ${fechaAr(b.hasta)}`.replaceAll('/', '-')
    return () => {
      document.title = anterior
    }
  }, [titulo, b.desde, b.hasta])

  const filas = consulta.data?.filas ?? []
  const grupos = agruparPor(filas, b.agrupar)
  // Con alguna percepción en la lista, va su columna: sin ella el total no cierra a la vista.
  const conPercepcion = soloPercepciones || filas.some((f) => f.tributos_total !== 0)
  const total = totalesDe(filas)
  const conSubtotal = b.agrupar !== 'nada'
  const columnas = conPercepcion ? 8 : 7

  const filtrosEscritos = [
    b.cliente && `Cliente: ${b.cliente}`,
    b.numero && `Número: ${b.numero}`,
    b.letra && `Letra ${b.letra}`,
    b.familia !== 'todas' && { factura: 'Sólo facturas', nota_credito: 'Sólo notas de crédito', nota_debito: 'Sólo notas de débito' }[b.familia!],
  ].filter(Boolean)

  return (
    <div className="min-h-full bg-piedra-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[21cm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/facturacion/emitidas'))}
          className="text-sm text-marca-700 hover:underline"
        >
          ← Volver
        </button>
        <button onClick={() => window.print()} disabled={!filas.length} className={boton.principal}>
          Imprimir o guardar PDF
        </button>
      </div>

      <style>{'@page { size: A4; margin: 12mm; }'}</style>

      {consulta.isPending ? (
        <Aviso texto="Armando el listado…" />
      ) : consulta.isError ? (
        <Aviso texto="No se pudo armar el listado: hace falta conexión con el servidor." />
      ) : (
        <div className="mx-auto max-w-[21cm] bg-white p-8 text-[11px] leading-snug text-tinta shadow-sm ring-1 ring-borde print:max-w-none print:p-0 print:shadow-none print:ring-0">
          <div className="flex items-start justify-between gap-4 border-b-2 border-tinta pb-2">
            <div>
              <p className="text-sm font-bold">{emisor.data?.nombre_fantasia || emisor.data?.razon_social}</p>
              {emisor.data?.cuit && <p>CUIT {emisor.data.cuit}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm font-bold">{titulo}</p>
              <p>
                Del {fechaAr(b.desde)} al {fechaAr(b.hasta)}
              </p>
              {filtrosEscritos.length > 0 && <p className="text-piedra-600">{filtrosEscritos.join(' · ')}</p>}
            </div>
          </div>

          {consulta.data?.cortado && (
            <p className="mt-2 font-bold">Atención: la búsqueda tiene más comprobantes de los que entran en el listado.</p>
          )}

          <table className="mt-2 w-full">
            <thead className="border-b border-tinta text-left">
              <tr>
                <th className="py-1 pr-2 font-semibold">Fecha</th>
                <th className="py-1 pr-2 font-semibold">Comprobante</th>
                <th className="py-1 pr-2 font-semibold">Cliente</th>
                <th className="py-1 pr-2 font-semibold">CUIT / DNI</th>
                <th className="py-1 pr-2 text-right font-semibold">Neto</th>
                <th className="py-1 pr-2 text-right font-semibold">IVA</th>
                {conPercepcion && <th className="py-1 pr-2 text-right font-semibold">Percepción</th>}
                <th className="py-1 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr>
                  <td colSpan={columnas} className="py-4 text-center text-piedra-500">
                    No hay comprobantes en esta búsqueda.
                  </td>
                </tr>
              )}
              {grupos.map((g) => (
                <Fragment key={g.clave}>
                  {conSubtotal && (
                    <tr>
                      <td colSpan={columnas} className="pt-2 font-bold">
                        {g.titulo}
                      </td>
                    </tr>
                  )}
                  {g.filas.map((f) => (
                    <tr key={f.id} className="border-b border-piedra-200 break-inside-avoid">
                      <td className="py-0.5 pr-2 whitespace-nowrap">{fechaAr(f.fecha)}</td>
                      <td className="py-0.5 pr-2 whitespace-nowrap">
                        {f.familia === 'factura' ? 'FC' : f.familia === 'nota_credito' ? 'NC' : 'ND'} {f.clase}{' '}
                        {f.comprobante}
                      </td>
                      <td className="py-0.5 pr-2">{f.receptor_nombre}</td>
                      <td className="py-0.5 pr-2 whitespace-nowrap">{f.receptor_documento}</td>
                      <Celda v={f.signo * (f.neto_gravado + f.neto_no_gravado + f.exento)} />
                      <Celda v={f.signo * f.iva_total} />
                      {conPercepcion && <Celda v={f.signo * f.tributos_total} />}
                      <Celda v={f.signo * f.total} ultima />
                    </tr>
                  ))}
                  {conSubtotal && (
                    <Suma titulo={`Subtotal ${g.titulo} · ${g.totales.comprobantes}`} t={g.totales} conPercepcion={conPercepcion} />
                  )}
                </Fragment>
              ))}
            </tbody>
            {filas.length > 0 && (
              <tfoot className="border-t-2 border-tinta">
                <Suma titulo={`TOTAL · ${numero.format(total.comprobantes)} comprobantes`} t={total} conPercepcion={conPercepcion} fuerte />
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

function Celda({ v, ultima }: { v: number; ultima?: boolean }) {
  return <td className={`py-0.5 text-right whitespace-nowrap tabular-nums ${ultima ? '' : 'pr-2'}`}>{moneda.format(v)}</td>
}

function Suma({ titulo, t, conPercepcion, fuerte }: { titulo: string; t: Totales; conPercepcion: boolean; fuerte?: boolean }) {
  return (
    <tr className={fuerte ? 'font-bold' : 'font-semibold'}>
      <td colSpan={4} className="py-1 pr-2">
        {titulo}
      </td>
      <Celda v={t.neto} />
      <Celda v={t.iva} />
      {conPercepcion && <Celda v={t.percepciones} />}
      <Celda v={t.total} ultima />
    </tr>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p className="mx-auto max-w-[21cm] rounded-xl bg-white px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
      {texto}
    </p>
  )
}
