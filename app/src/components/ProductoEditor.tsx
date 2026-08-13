import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { UNIDADES } from '@/lib/api/catalogo'
import type { ProductoDetalle, Referencias } from '@/lib/api/catalogo'
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

  function alternar(lista: string[], id: string) {
    return lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]
  }

  const contado = estado.stockContado === '' ? null : Number(estado.stockContado)
  const diferencia = contado === null ? null : contado - stockActual

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

        <Seccion titulo="Precio e impuestos">
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
          <Campo etiqueta="Categoría">
            <select
              value={estado.campos.categoria_id ?? ''}
              onChange={(e) => set({ categoria_id: e.target.value || null })}
              className={claseInput}
            >
              <option value="">—</option>
              {referencias.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Marca">
            <select
              value={estado.campos.marca_id ?? ''}
              onChange={(e) => set({ marca_id: e.target.value || null })}
              className={claseInput}
            >
              <option value="">—</option>
              {referencias.marcas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Presentación">
            <select
              value={estado.campos.presentacion_id ?? ''}
              onChange={(e) => set({ presentacion_id: e.target.value || null })}
              className={claseInput}
            >
              <option value="">—</option>
              {referencias.presentaciones.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <div className="col-span-1" />

          <div className="col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Animal</span>
            <div className="flex flex-wrap gap-1.5">
              {referencias.animales.map((a) => {
                const activo = estado.animales.includes(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onCambio({ ...estado, animales: alternar(estado.animales, a.id) })}
                    className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                      activo
                        ? 'bg-marca-600 text-white ring-marca-600'
                        : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {a.nombre}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Etapa de vida</span>
            <div className="flex flex-wrap gap-1.5">
              {referencias.etapas.map((e) => {
                const activo = estado.etapas.includes(e.id)
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onCambio({ ...estado, etapas: alternar(estado.etapas, e.id) })}
                    className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                      activo
                        ? 'bg-marca-600 text-white ring-marca-600'
                        : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {e.nombre}
                  </button>
                )
              })}
            </div>
          </div>
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
