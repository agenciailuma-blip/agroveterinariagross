import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { UNIDADES } from '@/lib/api/catalogo'
import type { Referencia, ProductoDetalle, Referencias } from '@/lib/api/catalogo'
import { ChipsConAlta, SelectConAlta } from '@/components/SelectConAlta'
import { numero } from '@/lib/tipos'

export interface EstadoFormulario {
  campos: Partial<ProductoDetalle>
  codigosBarra: string[]
  animales: string[]
  etapas: string[]
  stockContado: string
}

interface Props {
  referencias: Referencias
  estado: EstadoFormulario
  onCambio: (e: EstadoFormulario) => void
  stockActual: number
  esNuevo: boolean
  guardando: boolean
  error: string | null
  onGuardar: (marcarRevisado: boolean, avanzar: boolean) => void
  onCancelar: () => void
  onReferenciaCreada: (grupo: keyof Referencias, nueva: Referencia) => void
}

function Campo({
  etiqueta,
  children,
  ancho = 'col-span-2',
}: {
  etiqueta: string
  children: React.ReactNode
  ancho?: string
}) {
  return (
    <label className={`block ${ancho}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{etiqueta}</span>
      {children}
    </label>
  )
}

const claseInput =
  'w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-slate-200 pt-4">
      <legend className="sr-only">{titulo}</legend>
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">
        {titulo}
      </h3>
      <div className="grid grid-cols-4 gap-3">{children}</div>
    </fieldset>
  )
}

export default function ProductoEditor({
  referencias,
  estado,
  onCambio,
  stockActual,
  esNuevo,
  guardando,
  error,
  onGuardar,
  onCancelar,
  onReferenciaCreada,
}: Props) {
  const [codigoBarra, setCodigoBarra] = useState('')
  const refNombre = useRef<HTMLInputElement>(null)

  const set = (parcial: Partial<ProductoDetalle>) =>
    onCambio({ ...estado, campos: { ...estado.campos, ...parcial } })

  // Al cambiar de producto el foco vuelve arriba, así se puede recorrer
  // el listado entero sin tocar el mouse.
  useEffect(() => {
    if (esNuevo) refNombre.current?.focus()
  }, [esNuevo, estado.campos.id])

  function agregarCodigo(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const codigo = codigoBarra.trim()
    if (!codigo || estado.codigosBarra.includes(codigo)) {
      setCodigoBarra('')
      return
    }
    onCambio({ ...estado, codigosBarra: [...estado.codigosBarra, codigo] })
    setCodigoBarra('')
  }

  const contado = estado.stockContado === '' ? null : Number(estado.stockContado)
  const diferencia = contado === null ? null : contado - stockActual

  // Rentabilidad. Todo opcional: sin costo no hay margen y el producto
  // funciona igual, que es como está el catálogo hoy.
  const costo = estado.campos.costo ?? null
  const precio = estado.campos.precio_venta ?? 0
  const margenReal = costo && costo > 0 ? Math.round((precio / costo - 1) * 10000) / 100 : null
  // El mismo negocio expresado sobre la venta, que es como lo mira un
  // contador. Se muestran los dos porque "margen" significa las dos cosas
  // según quién lo diga, y confundirlas es un error caro.
  const margenSobreVenta =
    costo && costo > 0 && precio > 0 ? Math.round(((precio - costo) / precio) * 10000) / 100 : null
  const objetivo = estado.campos.margen_sobre_costo ?? null
  const desvio = margenReal !== null && objetivo !== null ? margenReal - objetivo : null
  const puedeCalcular = !!costo && costo > 0 && objetivo !== null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="font-semibold text-slate-900">
          {esNuevo ? 'Nuevo producto' : estado.campos.nombre_interno || 'Producto'}
        </h2>
        <button
          onClick={onCancelar}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Cerrar"
        >
          <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <Seccion titulo="Identificación">
          <Campo etiqueta="Código">
            <input
              value={estado.campos.codigo ?? ''}
              onChange={(e) => set({ codigo: e.target.value })}
              className={`${claseInput} font-mono`}
            />
          </Campo>
          <Campo etiqueta="Unidad">
            <select
              value={estado.campos.unidad_medida ?? 'unidad'}
              onChange={(e) => set({ unidad_medida: e.target.value })}
              className={claseInput}
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Nombre interno (el que ve el vendedor)" ancho="col-span-4">
            <input
              ref={refNombre}
              value={estado.campos.nombre_interno ?? ''}
              onChange={(e) => set({ nombre_interno: e.target.value })}
              className={claseInput}
              placeholder="ALIM BAL LIVRA 15KG"
            />
          </Campo>
          <Campo etiqueta="Nombre público (el que ve el cliente en la tienda)" ancho="col-span-4">
            <input
              value={estado.campos.nombre_publico ?? ''}
              onChange={(e) => set({ nombre_publico: e.target.value || null })}
              className={claseInput}
              placeholder="Alimento Balanceado Livra Adulto 15 kg"
            />
          </Campo>
        </Seccion>

        <Seccion titulo="Precio y rentabilidad">
          <Campo etiqueta="Precio de venta (con IVA)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={estado.campos.precio_venta ?? 0}
              onChange={(e) => set({ precio_venta: Number(e.target.value) })}
              className={`${claseInput} text-right tabular-nums`}
            />
          </Campo>
          <Campo etiqueta="Costo">
            <input
              type="number"
              step="0.01"
              min="0"
              value={estado.campos.costo ?? ''}
              onChange={(e) => set({ costo: e.target.value === '' ? null : Number(e.target.value) })}
              className={`${claseInput} text-right tabular-nums`}
            />
          </Campo>
          <Campo etiqueta="Margen sobre costo">
            <div className="relative">
              <input
                type="number"
                step="0.5"
                value={estado.campos.margen_sobre_costo ?? ''}
                onChange={(e) =>
                  set({
                    margen_sobre_costo: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className={`${claseInput} pr-6 text-right tabular-nums`}
                placeholder="—"
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-piedra-400">
                %
              </span>
            </div>
          </Campo>
          <div className="col-span-1 flex items-end">
            <button
              type="button"
              disabled={!puedeCalcular}
              onClick={() =>
                set({
                  precio_venta:
                    Math.round(costo! * (1 + estado.campos.margen_sobre_costo! / 100) * 100) / 100,
                })
              }
              className="w-full rounded-lg bg-marca-50 px-2 py-1.5 text-xs font-medium text-marca-700 ring-1 ring-marca-200 hover:bg-marca-100 disabled:opacity-40"
              title="Lleva el precio al que corresponde por costo y margen"
            >
              Calcular precio
            </button>
          </div>

          {/*
            El precio es siempre el valor guardado. El margen no lo
            recalcula solo: cambiar un costo no puede mover un precio de
            góndola sin que nadie se entere. Acá se muestra el desvío y
            alguien decide.
          */}
          {margenReal !== null && (
            <div className="col-span-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-piedra-50 px-3 py-2 text-xs">
              <span className="text-piedra-600">
                Margen real:{' '}
                <strong className="text-tinta">{numero.format(margenReal)}%</strong> sobre costo
              </span>
              <span className="text-piedra-500">
                ({numero.format(margenSobreVenta!)}% sobre venta)
              </span>
              {desvio !== null && Math.abs(desvio) >= 0.5 && (
                <span
                  className={`font-medium ${desvio > 0 ? 'text-verde-700' : 'text-amber-700'}`}
                >
                  {desvio > 0 ? '+' : ''}
                  {numero.format(desvio)} puntos {desvio > 0 ? 'por encima' : 'por debajo'} del
                  objetivo
                </span>
              )}
            </div>
          )}
        </Seccion>

        <Seccion titulo="Impuestos">
          <Campo etiqueta="Alícuota de IVA">
            <select
              value={estado.campos.alicuota_iva_id ?? 5}
              onChange={(e) => set({ alicuota_iva_id: Number(e.target.value) })}
              className={claseInput}
            >
              {referencias.alicuotas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.descripcion}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Condición">
            <select
              value={estado.campos.condicion_iva ?? 'gravado'}
              onChange={(e) =>
                set({ condicion_iva: e.target.value as ProductoDetalle['condicion_iva'] })
              }
              className={claseInput}
            >
              <option value="gravado">Gravado</option>
              <option value="exento">Exento</option>
              <option value="no_gravado">No gravado</option>
            </select>
          </Campo>
        </Seccion>

        <Seccion titulo="Stock">
          <Campo etiqueta="En el sistema">
            <div className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-right text-sm tabular-nums text-slate-600">
              {numero.format(stockActual)}
            </div>
          </Campo>
          <Campo etiqueta="Contado">
            <input
              type="number"
              step="0.01"
              min="0"
              value={estado.stockContado}
              onChange={(e) => onCambio({ ...estado, stockContado: e.target.value })}
              className={`${claseInput} text-right tabular-nums`}
              placeholder="—"
            />
          </Campo>
          <div className="col-span-2 flex items-end">
            {diferencia !== null && diferencia !== 0 && (
              <p
                className={`w-full rounded-lg px-3 py-1.5 text-xs ${
                  diferencia > 0
                    ? 'bg-marca-50 text-marca-700 ring-1 ring-marca-200'
                    : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                }`}
              >
                Se registra un movimiento de {diferencia > 0 ? '+' : ''}
                {numero.format(diferencia)}
              </p>
            )}
          </div>
        </Seccion>

        <Seccion titulo="Clasificación">
          <SelectConAlta
            etiqueta="Categoría"
            tabla="categoria"
            opciones={referencias.categorias}
            valor={estado.campos.categoria_id ?? null}
            onCambio={(id) => set({ categoria_id: id })}
            onCreada={(r) => onReferenciaCreada('categorias', r)}
          />
          <SelectConAlta
            etiqueta="Marca"
            tabla="marca"
            opciones={referencias.marcas}
            valor={estado.campos.marca_id ?? null}
            onCambio={(id) => set({ marca_id: id })}
            onCreada={(r) => onReferenciaCreada('marcas', r)}
          />
          <SelectConAlta
            etiqueta="Presentación"
            tabla="presentacion"
            opciones={referencias.presentaciones}
            valor={estado.campos.presentacion_id ?? null}
            onCambio={(id) => set({ presentacion_id: id })}
            onCreada={(r) => onReferenciaCreada('presentaciones', r)}
          />
          <div className="col-span-2" />

          <ChipsConAlta
            etiqueta="Animal"
            tabla="animal"
            opciones={referencias.animales}
            seleccion={estado.animales}
            onCambio={(animales) => onCambio({ ...estado, animales })}
            onCreada={(r) => onReferenciaCreada('animales', r)}
          />
          <ChipsConAlta
            etiqueta="Etapa de vida"
            tabla="etapa_vida"
            opciones={referencias.etapas}
            seleccion={estado.etapas}
            onCambio={(etapas) => onCambio({ ...estado, etapas })}
            onCreada={(r) => onReferenciaCreada('etapas', r)}
          />
        </Seccion>

        <Seccion titulo="Códigos de barra">
          <Campo etiqueta="Escaneá o tipeá y presioná Enter" ancho="col-span-4">
            <input
              value={codigoBarra}
              onChange={(e) => setCodigoBarra(e.target.value)}
              onKeyDown={agregarCodigo}
              className={`${claseInput} font-mono`}
              placeholder="7790000000000"
            />
          </Campo>
          {estado.codigosBarra.length > 0 && (
            <div className="col-span-4 flex flex-wrap gap-2">
              {estado.codigosBarra.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 py-1 pr-1 pl-2.5 font-mono text-xs text-slate-700"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() =>
                      onCambio({
                        ...estado,
                        codigosBarra: estado.codigosBarra.filter((x) => x !== c),
                      })
                    }
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    aria-label={`Quitar ${c}`}
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </Seccion>

        <Seccion titulo="Trazabilidad y normativa">
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={estado.campos.es_producto_veterinario ?? false}
              onChange={(e) => set({ es_producto_veterinario: e.target.checked })}
              className="size-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
            />
            Producto veterinario
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={estado.campos.requiere_receta ?? false}
              onChange={(e) => set({ requiere_receta: e.target.checked })}
              className="size-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
            />
            Requiere receta
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={estado.campos.es_fitosanitario ?? false}
              onChange={(e) => set({ es_fitosanitario: e.target.checked })}
              className="size-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
            />
            Fitosanitario
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={estado.campos.controla_vencimiento ?? false}
              onChange={(e) => set({ controla_vencimiento: e.target.checked })}
              className="size-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
            />
            Controla vencimiento
          </label>
          <p className="col-span-4 text-xs text-slate-400">
            Estas marcas todavía no cambian nada en la operación. Se cargan ahora para no tener que
            revisar 3.000 productos de nuevo cuando SENASA defina el mecanismo de SIGTRAZAVET.
          </p>
        </Seccion>
      </div>

      {error && (
        <p role="alert" className="mx-5 mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
        <button
          onClick={() => onGuardar(true, true)}
          disabled={guardando}
          className="flex-1 rounded-lg bg-marca-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-marca-700 disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Revisado y siguiente'}
        </button>
        <button
          onClick={() => onGuardar(false, false)}
          disabled={guardando}
          className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100 disabled:opacity-60"
        >
          Guardar
        </button>
      </div>
    </div>
  )
}
