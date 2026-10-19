import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ETIQUETA_PERIODO,
  TOPE,
  agruparPor,
  buscarComprobantes,
  busquedaACsv,
  fechaAr,
  leerNumero,
  nombreDeArchivo,
  totalesDe,
  busquedaDe,
  type FilaBusqueda,
  type Filtros,
  type Grupo,
  type Modo,
  type Periodo,
  type Totales,
} from '@/lib/api/buscarComprobantes'
import { descargarCsv } from '@/lib/api/noFiscal'
import { moneda, numero } from '@/lib/tipos'
import { boton, botonChico, campoDeFiltro, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  El buscador de comprobantes

  La misma pantalla sirve para Facturas emitidas y para Percepciones:
  cambia el filtro de partida y qué columna manda. Lo de OBTech eran
  tres pestañas —Clave, Fecha y Cliente—, una búsqueda por vez; acá los
  tres filtros están juntos y se combinan: las facturas de HIMPA de
  agosto se buscan de una.

  Los filtros viven en la dirección de la página y no en la memoria de
  la pantalla. Así, al abrir una factura para reimprimirla y volver, la
  búsqueda sigue como estaba; y el listado para imprimir lee la misma
  búsqueda sin que haya que pasársela de otra forma.
  ─────────────────────────────────────────────────────────────
*/

export default function BuscadorDeComprobantes({ modo }: { modo: Modo }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const b = busquedaDe(params, modo)
  const conPercepcion = modo === 'percepciones'

  function cambiar(cambios: Record<string, string>) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    setParams(p, { replace: true })
  }

  /*
    Lo escrito en Cliente y Número se busca un cuarto de segundo después
    de la última tecla: buscar letra por letra sería pedirle a la base
    una lista por cada letra.
  */
  const [cliente, setCliente] = useState(b.cliente ?? '')
  const [numeroTexto, setNumeroTexto] = useState(b.numero ?? '')
  useEffect(() => {
    const t = setTimeout(() => {
      if (cliente !== (params.get('c') ?? '') || numeroTexto !== (params.get('n') ?? '')) {
        cambiar({ c: cliente.trim(), n: numeroTexto.trim() })
      }
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, numeroTexto])

  const numeroMal = !!numeroTexto.trim() && !leerNumero(numeroTexto)

  const filtros: Filtros = {
    desde: b.desde,
    hasta: b.hasta,
    cliente: b.cliente,
    numero: numeroMal ? '' : b.numero,
    familia: b.familia,
    letra: b.letra,
    situacion: b.situacion,
    soloConPercepcion: b.soloConPercepcion,
  }

  const consulta = useQuery({
    queryKey: ['buscar-comprobantes', filtros],
    queryFn: () => buscarComprobantes(filtros),
    placeholderData: (anterior) => anterior,
  })

  const filas = consulta.data?.filas ?? []
  const grupos = agruparPor(filas, b.agrupar)
  const total = totalesDe(filas)
  const fechasAlReves = b.desde > b.hasta

  function bajar() {
    if (!filas.length) return
    const base = conPercepcion ? 'percepciones' : 'comprobantes'
    // Con alguna percepción en la lista, va su columna: sin ella el total no cierra.
    const columnaPercepcion = conPercepcion || filas.some((f) => f.tributos_total !== 0)
    descargarCsv(nombreDeArchivo(base, b.desde, b.hasta), busquedaACsv(grupos, columnaPercepcion))
  }

  // La vuelta desde la factura: a esta misma búsqueda, no al principio.
  const volver = `${location.pathname}${location.search}`

  return (
    <div className="space-y-4">
      <div className={`${tarjeta} p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="Período">
            <select
              value={b.periodo}
              onChange={(e) =>
                cambiar(
                  e.target.value === 'personalizado'
                    ? { p: 'personalizado', d: b.desde, h: b.hasta }
                    : { p: e.target.value, d: '', h: '' },
                )
              }
              className={campoDeFiltro}
            >
              {(Object.keys(ETIQUETA_PERIODO) as Periodo[]).map((p) => (
                <option key={p} value={p}>
                  {ETIQUETA_PERIODO[p]}
                </option>
              ))}
            </select>
          </Campo>
          {b.periodo === 'personalizado' && (
            <>
              <Campo etiqueta="Desde">
                <input
                  type="date"
                  value={b.desde}
                  onChange={(e) => e.target.value && cambiar({ d: e.target.value })}
                  className={campoDeFiltro}
                />
              </Campo>
              <Campo etiqueta="Hasta">
                <input
                  type="date"
                  value={b.hasta}
                  onChange={(e) => e.target.value && cambiar({ h: e.target.value })}
                  className={campoDeFiltro}
                />
              </Campo>
            </>
          )}
          <Campo etiqueta="Cliente" ancho>
            <input
              type="search"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Nombre o CUIT"
              className={`${campoDeFiltro} w-full`}
            />
          </Campo>
          <Campo etiqueta="Número">
            <input
              type="search"
              inputMode="numeric"
              value={numeroTexto}
              onChange={(e) => setNumeroTexto(e.target.value)}
              placeholder="29 o 1-29"
              className={`${campoDeFiltro} w-32`}
            />
          </Campo>
          {!conPercepcion && (
            <>
              <Campo etiqueta="Tipo">
                <select
                  value={b.familia}
                  onChange={(e) => cambiar({ t: e.target.value === 'todas' ? '' : e.target.value })}
                  className={campoDeFiltro}
                >
                  <option value="todas">Todos</option>
                  <option value="factura">Facturas</option>
                  <option value="nota_credito">Notas de crédito</option>
                  <option value="nota_debito">Notas de débito</option>
                </select>
              </Campo>
              <Campo etiqueta="Letra">
                <select value={b.letra} onChange={(e) => cambiar({ l: e.target.value })} className={campoDeFiltro}>
                  <option value="">Todas</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </Campo>
              <Campo etiqueta="Estado">
                <select
                  value={b.situacion}
                  onChange={(e) => cambiar({ s: e.target.value === 'validos' ? '' : e.target.value })}
                  className={campoDeFiltro}
                >
                  <option value="validos">Con CAE o CAEA</option>
                  <option value="sin_cae">Sin CAE todavía</option>
                  <option value="todos">Todos, también anulados</option>
                </select>
              </Campo>
            </>
          )}
          <Campo etiqueta="Clasificar">
            <select
              value={b.agrupar}
              onChange={(e) => cambiar({ g: e.target.value === 'nada' ? '' : e.target.value })}
              className={campoDeFiltro}
            >
              <option value="nada">Sin separar</option>
              <option value="semana">Por semana</option>
              <option value="mes">Por mes</option>
            </select>
          </Campo>
        </div>

        {numeroMal && (
          <p className="mt-2 text-xs text-amber-700">
            «{numeroTexto}» no es un número de comprobante: se escribe como 29, 1-29 o 0001-00000029.
          </p>
        )}
        {fechasAlReves && (
          <p className="mt-2 text-xs text-amber-700">«Desde» es después de «Hasta»: no puede haber nada.</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-borde pt-3">
          <p className="mr-auto text-sm text-piedra-500">
            Del {fechaAr(b.desde)} al {fechaAr(b.hasta)}
            {consulta.isFetching && ' · buscando…'}
          </p>
          <Link
            to={`/comprobantes/listado?${new URLSearchParams({ ...Object.fromEntries(params), m: modo })}`}
            className={boton.secundario}
            aria-disabled={!filas.length}
            onClick={(e) => !filas.length && e.preventDefault()}
          >
            Imprimir el listado
          </Link>
          <button onClick={bajar} disabled={!filas.length} className={boton.principal}>
            Bajar Excel
          </button>
        </div>
      </div>

      {consulta.isError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          No se pudo buscar: {(consulta.error as Error).message}
        </p>
      )}

      {consulta.data?.cortado && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Hay más de {numero.format(TOPE)} comprobantes en estas fechas y se muestran los primeros. Acotá
          las fechas para que los totales sean los de todo el período.
        </p>
      )}

      {filas.length > 0 && <Resumen t={total} conPercepcion={conPercepcion} />}

      <div className={`overflow-hidden ${tarjeta}`}>
        <table className="w-full text-sm">
          <thead className="border-b border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
            <tr>
              <th className="py-2.5 pr-3 pl-3 font-medium sm:pl-4">Comprobante</th>
              <th className="hidden py-2.5 pr-3 font-medium lg:table-cell">Fecha</th>
              <th className="hidden py-2.5 pr-3 font-medium sm:table-cell">Cliente</th>
              <th className="hidden py-2.5 pr-3 text-right font-medium md:table-cell">Neto</th>
              <th className="hidden py-2.5 pr-3 text-right font-medium md:table-cell">IVA</th>
              {conPercepcion ? (
                <>
                  <th className="py-2.5 pr-3 text-right font-medium">Percepción</th>
                  <th className="hidden py-2.5 pr-3 text-right font-medium xl:table-cell">Total</th>
                </>
              ) : (
                <>
                  <th className="hidden py-2.5 pr-3 text-right font-medium xl:table-cell">Percepción</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Total</th>
                </>
              )}
              <th className="py-2.5 pr-3 sm:pr-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-piedra-100">
            {consulta.isPending && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-piedra-400">
                  Buscando…
                </td>
              </tr>
            )}
            {!consulta.isPending && filas.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-piedra-400">
                  {conPercepcion
                    ? 'No hay facturas con percepción en esta búsqueda.'
                    : 'No hay comprobantes en esta búsqueda.'}
                </td>
              </tr>
            )}
            {grupos.map((g) => (
              <GrupoDeFilas
                key={g.clave}
                g={g}
                conSubtotal={grupos.length > 1 || b.agrupar !== 'nada'}
                conPercepcion={conPercepcion}
                volver={volver}
              />
            ))}
          </tbody>
          {filas.length > 0 && (
            <tfoot className="border-t-2 border-tinta bg-piedra-50">
              <FilaTotal titulo="Total" t={total} conPercepcion={conPercepcion} fuerte />
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function Campo({ etiqueta, ancho, children }: { etiqueta: string; ancho?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${ancho ? 'min-w-40 flex-1' : ''}`}>
      <span className="mb-1 block text-xs font-medium text-piedra-600">{etiqueta}</span>
      {children}
    </label>
  )
}

function Resumen({ t, conPercepcion }: { t: Totales; conPercepcion: boolean }) {
  return (
    <dl className={`grid grid-cols-2 gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-3 lg:grid-cols-5 ${tarjeta}`}>
      <Dato k="Comprobantes" v={numero.format(t.comprobantes)} />
      <Dato k="Neto" v={moneda.format(t.neto)} />
      <Dato k="IVA" v={moneda.format(t.iva)} />
      {(conPercepcion || t.percepciones !== 0) && (
        <Dato k="Percepciones" v={moneda.format(t.percepciones)} fuerte={conPercepcion} />
      )}
      <Dato k="Total" v={moneda.format(t.total)} fuerte={!conPercepcion} />
    </dl>
  )
}

function Dato({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-piedra-500">{k}</dt>
      <dd className={`tabular-nums ${fuerte ? 'font-semibold text-marca-700' : 'font-medium text-tinta'}`}>{v}</dd>
    </div>
  )
}

function GrupoDeFilas({
  g,
  conSubtotal,
  conPercepcion,
  volver,
}: {
  g: Grupo
  conSubtotal: boolean
  conPercepcion: boolean
  volver: string
}) {
  return (
    <>
      {conSubtotal && g.titulo && (
        <tr className="bg-piedra-50/60">
          <td colSpan={9} className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-piedra-600 uppercase sm:px-4">
            {g.titulo}
          </td>
        </tr>
      )}
      {g.filas.map((f) => (
        <Fila key={f.id} f={f} conPercepcion={conPercepcion} volver={volver} />
      ))}
      {conSubtotal && g.titulo && (
        <FilaTotal titulo={`Subtotal · ${g.totales.comprobantes}`} t={g.totales} conPercepcion={conPercepcion} />
      )}
    </>
  )
}

function Fila({ f, conPercepcion, volver }: { f: FilaBusqueda; conPercepcion: boolean; volver: string }) {
  const s = f.signo
  const neto = s * (f.neto_gravado + f.neto_no_gravado + f.exento)
  const anulado = f.estado === 'anulado'
  const sinCae = f.estado === 'pendiente' || f.estado === 'rechazado'

  return (
    <tr className={anulado ? 'text-piedra-400' : ''}>
      <td className="py-2 pr-3 pl-3 align-top sm:pl-4">
        <p className="font-mono text-xs text-tinta">{f.comprobante}</p>
        <p className="text-xs text-piedra-500">
          {f.tipo}
          {anulado && ' · anulado'}
          {sinCae && ` · ${f.estado === 'rechazado' ? 'rechazado' : 'sin CAE'}`}
          {f.modalidad === 'caea' && ' · CAEA'}
        </p>
        <p className="text-xs text-piedra-500 lg:hidden">{fechaAr(f.fecha)}</p>
        <p className="truncate text-xs text-tinta sm:hidden">{f.receptor_nombre}</p>
        {/* Sin las columnas de neto e IVA, van debajo: son las que pidieron ver. */}
        <p className="text-xs tabular-nums text-piedra-500 md:hidden">
          Neto {moneda.format(neto)} · IVA {moneda.format(s * f.iva_total)}
        </p>
      </td>
      <td className="hidden py-2 pr-3 align-top text-xs text-piedra-600 lg:table-cell">{fechaAr(f.fecha)}</td>
      <td className="hidden max-w-56 py-2 pr-3 align-top sm:table-cell">
        <p className="truncate text-tinta">{f.receptor_nombre}</p>
        {f.receptor_documento && <p className="font-mono text-xs text-piedra-400">{f.receptor_documento}</p>}
      </td>
      <Importe v={neto} className="hidden md:table-cell" />
      <Importe v={s * f.iva_total} className="hidden md:table-cell" />
      {conPercepcion ? (
        <>
          <Importe v={s * f.tributos_total} className="font-medium" />
          <Importe v={s * f.total} className="hidden xl:table-cell" />
        </>
      ) : (
        <>
          <Importe v={s * f.tributos_total} className="hidden xl:table-cell" vacioSiCero />
          <Importe v={s * f.total} className="font-medium" />
        </>
      )}
      <td className="py-2 pr-3 text-right align-top sm:pr-4">
        {f.cae ? (
          <Link to={`/comprobante/${f.id}`} state={{ volver }} className={`whitespace-nowrap ${botonChico.secundario}`}>
            Ver
          </Link>
        ) : (
          <span className="text-xs text-piedra-300">—</span>
        )}
      </td>
    </tr>
  )
}

function Importe({ v, className = '', vacioSiCero }: { v: number; className?: string; vacioSiCero?: boolean }) {
  return (
    <td className={`whitespace-nowrap py-2 pr-3 text-right align-top tabular-nums ${className}`}>
      {vacioSiCero && v === 0 ? <span className="text-piedra-300">—</span> : moneda.format(v)}
    </td>
  )
}

function FilaTotal({
  titulo,
  t,
  conPercepcion,
  fuerte,
}: {
  titulo: string
  t: Totales
  conPercepcion: boolean
  fuerte?: boolean
}) {
  const peso = fuerte ? 'font-semibold text-tinta' : 'font-medium text-piedra-700'
  return (
    <tr className={fuerte ? '' : 'bg-piedra-50/60'}>
      <td className={`py-2 pr-3 pl-3 align-top text-xs sm:pl-4 ${peso}`}>
        {titulo}
        <p className="font-normal tabular-nums text-piedra-500 md:hidden">
          Neto {moneda.format(t.neto)} · IVA {moneda.format(t.iva)}
        </p>
      </td>
      <td className="hidden lg:table-cell" />
      <td className="hidden sm:table-cell" />
      <Importe v={t.neto} className={`hidden md:table-cell ${peso}`} />
      <Importe v={t.iva} className={`hidden md:table-cell ${peso}`} />
      {conPercepcion ? (
        <>
          <Importe v={t.percepciones} className={peso} />
          <Importe v={t.total} className={`hidden xl:table-cell ${peso}`} />
        </>
      ) : (
        <>
          <Importe v={t.percepciones} className={`hidden xl:table-cell ${peso}`} vacioSiCero />
          <Importe v={t.total} className={peso} />
        </>
      )}
      <td />
    </tr>
  )
}
