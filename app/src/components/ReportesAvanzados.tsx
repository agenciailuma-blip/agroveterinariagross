import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { hoyEnObera } from '@/lib/api/cheques'
import {
  CORTES_DE_MARGEN,
  CORTES_DE_STOCK,
  DIAS_PARADA,
  PERIODOS,
  fechaCorta,
  margen,
  margenAListado,
  masVendidos,
  mercaderiaParada,
  obtenerMercaderia,
  obtenerRubros,
  obtenerVentas,
  paradaAListado,
  rangoDe,
  rubrosAListado,
  stockAListado,
  totalesParada,
  valorDelStock,
  valorPor,
  ventasPorCanal,
  ventasPorRubro,
  type CorteDeMargen,
  type CorteDeStock,
  type Periodo,
} from '@/lib/api/reportes'
import { bajarListado } from '@/lib/importacion/exportar'
import { enCastellano } from '@/lib/errores'
import { moneda, numero } from '@/lib/tipos'
import { botonChico, campoDeFiltro, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Las dos pestañas nuevas de Reportes: la mercadería y las ventas

  Los cálculos están en `lib/api/reportes.ts`, con sus pruebas. Acá sólo
  se muestran, y cada tabla se baja en Excel con todas sus filas: en la
  pantalla se ven las primeras, que son las que importan para decidir.

  En el teléfono cada tabla deja el nombre y el importe que manda; el
  resto aparece desde tablet. Nada se desplaza hacia el costado.
  ─────────────────────────────────────────────────────────────
*/

const FILAS_EN_PANTALLA = 30

/* ═══════════════════════ La mercadería ═══════════════════════ */

export function ReporteMercaderia() {
  const datos = useQuery({ queryKey: ['reporte-mercaderia'], queryFn: obtenerMercaderia })
  const rubros = useQuery({ queryKey: ['reporte-rubros'], queryFn: obtenerRubros, staleTime: Infinity })
  const [corte, setCorte] = useState<CorteDeStock>('categoria')
  const [dias, setDias] = useState<number>(90)

  if (datos.isPending) return <p className="text-sm text-piedra-400">Buscando…</p>
  if (datos.isError) return <NoSePudo e={datos.error} que="la mercadería" />

  const m = datos.data
  const v = valorDelStock(m.productos)
  const filas = valorPor(m.productos, corte, rubros.data ?? [])
  const parada = mercaderiaParada(m, dias)
  const tp = totalesParada(parada)
  const depositos = m.depositos.filter((d) => d.unidades > 0)
  const hoy = m.hoy

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <Encabezado
          titulo="Lo que vale la mercadería"
          detalle="El stock de hoy, a costo y a precio de lista"
          bajar={() => bajarListado(`valor-del-stock-${hoy}.xlsx`, stockAListado(m.productos, rubros.data ?? []))}
        />

        {v.sin_costo > 0 && (
          <Aviso>
            {v.sin_costo === v.productos
              ? `Ninguno de los ${numero.format(v.productos)} productos con stock tiene costo cargado: por ahora sólo se puede mostrar el valor a precio de venta.`
              : `${numero.format(v.sin_costo)} de los ${numero.format(v.productos)} productos con stock no tienen costo cargado. El valor a costo y la ganancia cuentan sólo los otros ${numero.format(v.productos - v.sin_costo)}.`}{' '}
            El costo se carga en la ficha del producto, con la planilla o al recibir mercadería.
          </Aviso>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Dato titulo="A precio de venta" valor={moneda.format(v.valor_venta)}
            detalle={v.sin_precio > 0 ? `${numero.format(v.sin_precio)} sin precio` : 'todo con precio'} />
          <Dato titulo="A costo" valor={v.valor_costo > 0 ? moneda.format(v.valor_costo) : '—'}
            detalle={`de ${numero.format(v.productos - v.sin_costo)} con costo`} />
          <Dato titulo="Ganancia en el estante" valor={v.valor_costo > 0 ? moneda.format(v.ganancia) : '—'}
            detalle="si se vende todo a precio de lista" />
          <Dato titulo="Productos con stock" valor={numero.format(v.productos)}
            detalle={v.negativos > 0 ? `${numero.format(v.negativos)} en negativo, no suman` : `${numero.format(v.unidades)} unidades`}
            alerta={v.negativos > 0} />
        </div>

        {depositos.length > 1 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {depositos.map((d) => (
              <div key={d.nombre} className={`${tarjeta} flex items-baseline justify-between gap-3 px-4 py-3`}>
                <span className="min-w-0 truncate text-sm text-tinta">{d.nombre}</span>
                <span className="text-sm font-medium tabular-nums text-tinta">{moneda.format(d.valor_venta)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm text-piedra-600">
          <span>Por</span>
          <select value={corte} onChange={(e) => setCorte(e.target.value as CorteDeStock)} className={campoDeFiltro}>
            {(Object.keys(CORTES_DE_STOCK) as CorteDeStock[]).map((c) => (
              <option key={c} value={c}>{CORTES_DE_STOCK[c].toLowerCase()}</option>
            ))}
          </select>
        </div>

        <Tabla
          vacia="No hay productos con stock."
          columnas={[
            { titulo: CORTES_DE_STOCK[corte] },
            { titulo: 'Productos', derecha: true, solo: 'sm' },
            { titulo: 'A costo', derecha: true, solo: 'sm' },
            { titulo: 'A precio', derecha: true },
          ]}
          filas={filas.slice(0, FILAS_EN_PANTALLA).map((f) => ({
            clave: f.nombre,
            celdas: [
              <span className="break-words">{f.nombre}</span>,
              numero.format(f.productos),
              f.valor_costo > 0 ? moneda.format(f.valor_costo) : '—',
              moneda.format(f.valor_venta),
            ],
          }))}
          resto={filas.length - FILAS_EN_PANTALLA}
        />
      </section>

      <section className="space-y-3">
        <Encabezado
          titulo="Mercadería parada"
          detalle="Con stock y sin ventas ni compras en los últimos días"
          bajar={() => bajarListado(`mercaderia-parada-${dias}-dias-${hoy}.xlsx`, paradaAListado(parada, dias))}
        />

        <Pildoras
          opciones={DIAS_PARADA.map((d) => [d, `${d} días o más`] as const)}
          elegida={dias}
          elegir={setDias}
        />

        {m.primera_venta && (
          <p className="text-xs text-piedra-500">
            Las ventas se cuentan desde el {fechaCorta(m.primera_venta)}, cuando empezó a usarse el sistema.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Dato titulo="Productos" valor={numero.format(tp.productos)} detalle={`quietos hace ${dias} días o más`} />
          <Dato titulo="A precio de venta" valor={moneda.format(tp.a_precio)} detalle="lo que valen vendidos" />
          <Dato titulo="A costo" valor={tp.a_costo > 0 ? moneda.format(tp.a_costo) : '—'} detalle="la plata que está quieta" />
        </div>

        <Tabla
          vacia={`Nada lleva ${dias} días sin moverse.`}
          columnas={[
            { titulo: 'Producto' },
            { titulo: 'Cantidad', derecha: true, solo: 'sm' },
            { titulo: 'Última venta', solo: 'sm' },
            { titulo: 'Días', derecha: true },
            { titulo: 'Valor', derecha: true },
          ]}
          filas={parada.slice(0, FILAS_EN_PANTALLA).map((p) => ({
            clave: p.id,
            celdas: [
              <span className="break-words">
                {p.nombre}
                <span className="block text-xs text-piedra-400">{p.codigo}</span>
              </span>,
              numero.format(p.cantidad),
              p.ultima_venta ? fechaCorta(p.ultima_venta) : 'sin ventas',
              numero.format(p.dias),
              <span title={p.a_costo ? 'A costo' : 'A precio de venta: no tiene costo'}>
                {moneda.format(p.valor)}
                {!p.a_costo && <span className="block text-xs text-piedra-400">a precio</span>}
              </span>,
            ],
          }))}
          resto={parada.length - FILAS_EN_PANTALLA}
        />
      </section>
    </div>
  )
}

/* ═══════════════════════ Las ventas ═══════════════════════ */

export function ReporteVentas() {
  const hoy = hoyEnObera()
  const [periodo, setPeriodo] = useState<Periodo | 'otro'>('este_mes')
  const [propio, setPropio] = useState(() => rangoDe('este_mes', hoy))
  const [corte, setCorte] = useState<CorteDeMargen>('producto')

  const { desde, hasta } = periodo === 'otro' ? propio : rangoDe(periodo, hoy)
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta) && desde <= hasta

  const datos = useQuery({
    queryKey: ['reporte-ventas', desde, hasta],
    queryFn: () => obtenerVentas(desde, hasta),
    enabled: valido,
  })

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(PERIODOS) as Periodo[]).map((p) => (
            <Pildora key={p} activa={periodo === p} onClick={() => setPeriodo(p)}>{PERIODOS[p]}</Pildora>
          ))}
          <Pildora
            activa={periodo === 'otro'}
            onClick={() => {
              setPropio({ desde, hasta })
              setPeriodo('otro')
            }}
          >
            Otras fechas
          </Pildora>
        </div>
        {periodo === 'otro' && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-piedra-600">
            <span>Del</span>
            <input type="date" value={propio.desde} onChange={(e) => setPropio({ ...propio, desde: e.target.value })} className={campoDeFiltro} />
            <span>al</span>
            <input type="date" value={propio.hasta} onChange={(e) => setPropio({ ...propio, hasta: e.target.value })} className={campoDeFiltro} />
            {!valido && <span className="text-xs text-red-700">La primera fecha va antes que la segunda.</span>}
          </div>
        )}
        {valido && (
          <p className="text-xs text-piedra-500">
            Del {fechaCorta(desde)} al {fechaCorta(hasta)}. Ventas cobradas, con las devoluciones ya restadas.
          </p>
        )}
      </div>

      {!valido ? null : datos.isPending ? (
        <p className="text-sm text-piedra-400">Buscando…</p>
      ) : datos.isError ? (
        <NoSePudo e={datos.error} que="las ventas" />
      ) : (
        <VentasDelPeriodo datos={datos.data} desde={desde} hasta={hasta} corte={corte} setCorte={setCorte} />
      )}
    </div>
  )
}

function VentasDelPeriodo({
  datos,
  desde,
  hasta,
  corte,
  setCorte,
}: {
  datos: Awaited<ReturnType<typeof obtenerVentas>>
  desde: string
  hasta: string
  corte: CorteDeMargen
  setCorte: (c: CorteDeMargen) => void
}) {
  const canales = ventasPorCanal(datos.canales)
  const online = canales.find((c) => c.canal === 'online')!
  const topOnline = masVendidos(datos.lineas, 'online')
  const rubros = ventasPorRubro(datos.lineas, datos.rubros)
  const sinRubro = rubros.find((r) => r.id === null)
  const totalRubros = rubros.reduce((s, r) => s + r.importe, 0)
  const mg = margen(datos.lineas, corte, datos.rubros)
  const tramo = `${desde}-al-${hasta}`

  return (
    <>
      {/* ─── Por canal: el local, la tienda online y el mayorista ─── */}
      <section className="space-y-3">
        <Encabezado titulo="Ventas por canal" detalle="El local, la tienda online y el mayorista" />
        <div className="grid gap-3 sm:grid-cols-3">
          {canales.map((c) => (
            <div key={c.canal} className={`${tarjeta} p-5`}>
              <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">{c.nombre}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-tinta">{moneda.format(c.neto)}</p>
              <p className="mt-1 text-xs text-piedra-500">
                {c.ventas === 1 ? '1 venta' : `${numero.format(c.ventas)} ventas`}
                {c.ticket !== null && ` · ${moneda.format(c.ticket)} promedio`}
              </p>
              <p className="mt-1 text-xs text-piedra-500">
                {Math.round(c.parte)}% del total
                {c.devuelto > 0 && ` · ${moneda.format(c.devuelto)} devuelto`}
              </p>
            </div>
          ))}
        </div>

        {online.ventas > 0 && (
          <>
            <h3 className="pt-2 text-sm font-medium text-tinta">Lo más vendido online</h3>
            <Tabla
              vacia="Sin ventas online en el período."
              columnas={[
                { titulo: 'Producto' },
                { titulo: 'Cantidad', derecha: true },
                { titulo: 'Vendido', derecha: true },
              ]}
              filas={topOnline.map((p) => ({
                clave: p.producto_id ?? p.descripcion,
                celdas: [<span className="break-words">{p.descripcion}</span>, numero.format(p.cantidad), moneda.format(p.importe)],
              }))}
            />
          </>
        )}
      </section>

      {/* ─── Por rubro de ARCA ─── */}
      <section className="space-y-3">
        <Encabezado
          titulo="Ventas por rubro de ARCA"
          detalle="Por actividad, como la separa el contador"
          bajar={() => bajarListado(`ventas-por-rubro-${tramo}.xlsx`, rubrosAListado(rubros, desde, hasta))}
        />
        {sinRubro && totalRubros > 0 && (
          <Aviso>
            {Math.round((sinRubro.importe / totalRubros) * 100)}% de lo vendido ({moneda.format(sinRubro.importe)}) es de productos
            sin rubro de ARCA cargado. Se carga en la ficha del producto, en Impuestos.
          </Aviso>
        )}
        <Tabla
          vacia="Sin ventas en el período."
          columnas={[
            { titulo: 'Rubro' },
            { titulo: 'Neto sin IVA', derecha: true, solo: 'sm' },
            { titulo: 'Sin factura', derecha: true, solo: 'sm' },
            { titulo: 'Total', derecha: true },
          ]}
          filas={rubros.map((r) => ({
            clave: String(r.id),
            celdas: [
              <span className={`break-words ${r.id === null ? 'text-piedra-500' : ''}`}>{r.descripcion}</span>,
              moneda.format(r.neto),
              r.sin_factura !== 0 ? moneda.format(r.sin_factura) : '—',
              moneda.format(r.importe),
            ],
          }))}
        />
      </section>

      {/* ─── El margen ─── */}
      <section className="space-y-3">
        <Encabezado
          titulo="Margen"
          detalle="Lo vendido menos lo que cuesta hoy reponerlo"
          bajar={() => bajarListado(`margen-por-${corte}-${tramo}.xlsx`, margenAListado(mg, corte, desde, hasta))}
        />

        {mg.cobertura < 100 && (
          <Aviso>
            {mg.cobertura === 0
              ? 'Ninguno de los productos vendidos tiene costo cargado: todavía no se puede calcular el margen.'
              : `Sólo el ${Math.round(mg.cobertura)}% de lo vendido es de productos con costo cargado. El margen se calcula sobre esa parte; ${moneda.format(mg.sin_costo)} quedan afuera.`}
          </Aviso>
        )}

        {mg.filas.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Dato titulo="Vendido" valor={moneda.format(mg.total.vendido)} detalle="de productos con costo" />
              <Dato titulo="Costo" valor={moneda.format(mg.total.costo)} detalle="al costo de hoy" />
              <Dato
                titulo="Margen"
                valor={moneda.format(mg.total.margen)}
                detalle={mg.total.porcentaje === null ? '—' : `${Math.round(mg.total.porcentaje)}% de lo vendido`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-piedra-600">
              <span>Por</span>
              <select value={corte} onChange={(e) => setCorte(e.target.value as CorteDeMargen)} className={campoDeFiltro}>
                {(Object.keys(CORTES_DE_MARGEN) as CorteDeMargen[]).map((c) => (
                  <option key={c} value={c}>{CORTES_DE_MARGEN[c].toLowerCase()}</option>
                ))}
              </select>
              <span className="text-xs text-piedra-400">El que más deja, arriba</span>
            </div>

            <Tabla
              vacia=""
              columnas={[
                { titulo: CORTES_DE_MARGEN[corte] },
                { titulo: 'Vendido', derecha: true, solo: 'sm' },
                { titulo: 'Costo', derecha: true, solo: 'sm' },
                { titulo: '%', derecha: true },
                { titulo: 'Margen', derecha: true },
              ]}
              filas={mg.filas.slice(0, FILAS_EN_PANTALLA).map((f) => ({
                clave: f.nombre + (f.codigo ?? ''),
                celdas: [
                  <span className="break-words">{f.nombre}</span>,
                  moneda.format(f.vendido),
                  moneda.format(f.costo),
                  <span className={f.margen < 0 ? 'font-medium text-red-700' : ''}>
                    {f.porcentaje === null ? '—' : `${Math.round(f.porcentaje)}%`}
                  </span>,
                  <span className={f.margen < 0 ? 'font-medium text-red-700' : ''}>{moneda.format(f.margen)}</span>,
                ],
              }))}
              resto={mg.filas.length - FILAS_EN_PANTALLA}
            />
          </>
        )}
      </section>
    </>
  )
}

/* ═══════════════════════ Piezas ═══════════════════════ */

function Encabezado({ titulo, detalle, bajar }: { titulo: string; detalle: string; bajar?: () => Promise<void> }) {
  const [bajando, setBajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-tinta">{titulo}</h2>
        <p className="text-xs text-piedra-500">{detalle}</p>
      </div>
      {bajar && (
        <button
          type="button"
          disabled={bajando}
          className={botonChico.secundario}
          onClick={async () => {
            setBajando(true)
            setError(null)
            try {
              await bajar()
            } catch (e) {
              setError(enCastellano(e))
            } finally {
              setBajando(false)
            }
          }}
        >
          {bajando ? 'Preparando…' : 'Bajar en Excel'}
        </button>
      )}
      {error && <p role="alert" className="basis-full text-sm text-red-700">No se pudo armar el Excel: {error}</p>}
    </div>
  )
}

function Dato({ titulo, valor, detalle, alerta = false }: { titulo: string; valor: string; detalle: string; alerta?: boolean }) {
  return (
    <div className={`${tarjeta} min-w-0 p-4`}>
      <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">{titulo}</p>
      {/* En el teléfono, más chico y sin cortar: un importe con «…» no sirve. */}
      <p className="mt-1 text-base font-semibold break-all tabular-nums text-tinta sm:text-xl">{valor}</p>
      <p className={`mt-1 text-xs ${alerta ? 'text-amber-700' : 'text-piedra-500'}`}>{detalle}</p>
    </div>
  )
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{children}</p>
  )
}

function NoSePudo({ e, que }: { e: unknown; que: string }) {
  return (
    <p role="alert" className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
      {enCastellano(e, `No se pudo traer ${que}: hace falta conexión con el servidor.`)}
    </p>
  )
}

function Pildora({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm ring-1 ${
        activa ? 'bg-marca-700 text-white ring-marca-700' : 'text-marca-700 ring-borde hover:bg-marca-50'
      }`}
    >
      {children}
    </button>
  )
}

function Pildoras<T extends string | number>({
  opciones,
  elegida,
  elegir,
}: {
  opciones: readonly (readonly [T, string])[]
  elegida: T
  elegir: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {opciones.map(([v, texto]) => (
        <Pildora key={String(v)} activa={v === elegida} onClick={() => elegir(v)}>{texto}</Pildora>
      ))}
    </div>
  )
}

interface ColumnaDeTabla {
  titulo: string
  derecha?: boolean
  /** 'sm': sólo desde tablet. En el teléfono queda lo que manda. */
  solo?: 'sm'
}

function Tabla({
  columnas,
  filas,
  vacia,
  resto = 0,
}: {
  columnas: ColumnaDeTabla[]
  filas: { clave: string; celdas: ReactNode[] }[]
  vacia: string
  resto?: number
}) {
  if (filas.length === 0) {
    return vacia ? <p className={`${tarjeta} px-4 py-3 text-sm text-piedra-500`}>{vacia}</p> : null
  }
  const clase = (c: ColumnaDeTabla, i: number) =>
    [
      'px-3 py-2.5 sm:px-4',
      c.derecha ? 'text-right tabular-nums whitespace-nowrap' : '',
      c.solo === 'sm' ? 'hidden sm:table-cell' : '',
      i === 0 ? 'w-full min-w-0' : '',
    ].join(' ')
  return (
    <div className={`${tarjeta} overflow-hidden`}>
      <table className="w-full table-auto text-sm">
        <thead>
          <tr className="border-b border-borde text-left text-xs text-piedra-500">
            {columnas.map((c, i) => (
              <th key={c.titulo + i} className={`${clase(c, i)} font-medium`}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave} className="border-b border-borde last:border-0 align-top">
              {f.celdas.map((celda, i) => (
                <td key={i} className={`${clase(columnas[i], i)} ${i === 0 ? 'text-tinta' : 'text-piedra-700'}`}>{celda}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {resto > 0 && (
        <p className="border-t border-borde px-4 py-2 text-xs text-piedra-500">
          Y {numero.format(resto)} más en el Excel.
        </p>
      )}
    </div>
  )
}
