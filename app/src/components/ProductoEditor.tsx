import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { UNIDADES } from '@/lib/api/catalogo'
import type { Referencia, ProductoDetalle, Referencias } from '@/lib/api/catalogo'
import { ChipsConAlta, SelectConAlta } from '@/components/SelectConAlta'
import { numero } from '@/lib/tipos'
import { boton } from '@/estilos'

export interface EstadoFormulario {
  campos: Partial<ProductoDetalle>
  codigosBarra: string[]
  animales: string[]
  etapas: string[]
  stockContado: string
  /*
    Aviso de stock bajo.

    `propio` distingue las dos situaciones que se ven igual en pantalla
    y se guardan distinto: un producto con umbral puesto a mano, y uno
    que muestra el mismo número porque lo hereda de su categoría.
    Apagarlo borra el umbral del producto y lo devuelve a heredar.
  */
  umbral: { bajo: string; critico: string; propio: boolean }
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
  /** Sin permiso de baja no se pasa, y el botón no aparece. */
  onDarDeBaja?: () => void
  /*
    Configurar umbrales es un permiso aparte (`stock.configurar_umbrales`)
    y lo verifica la RLS. Sin él, el umbral que rige se muestra igual
    —es información útil— pero no se puede tocar: ofrecer un control que
    la base va a rechazar es peor que no ofrecerlo.
  */
  puedeUmbrales: boolean
  onReferenciaCreada: (grupo: keyof Referencias, nueva: Referencia) => void
}

function Campo({
  etiqueta,
  children,
  ancho = 'col-span-2',
  ayuda,
}: {
  etiqueta: string
  children: React.ReactNode
  ancho?: string
  ayuda?: string
}) {
  return (
    <label className={`block ${ancho}`}>
      <span className="mb-1 block text-xs font-medium text-piedra-600">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-piedra-400">{ayuda}</span>}
    </label>
  )
}

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-borde pt-4">
      <legend className="sr-only">{titulo}</legend>
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-piedra-400 uppercase">
        {titulo}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
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
  onDarDeBaja,
  puedeUmbrales,
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

  // La base tiene la misma restricción (`umbral_critico_menor_o_igual`).
  // Se avisa acá igual para que el error no aparezca recién al guardar,
  // que es cuando ya se perdió de vista qué se estaba tocando.
  const umbralInvalido =
    estado.umbral.propio &&
    estado.umbral.bajo !== '' &&
    estado.umbral.critico !== '' &&
    Number(estado.umbral.critico) > Number(estado.umbral.bajo)

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
      <div className="flex items-center justify-between border-b border-borde px-5 py-3">
        <h2 className="font-semibold text-tinta">
          {esNuevo ? 'Nuevo producto' : estado.campos.nombre_interno || 'Producto'}
        </h2>
        <button
          onClick={onCancelar}
          className="rounded-lg p-1.5 text-piedra-400 hover:bg-piedra-100 hover:text-piedra-600"
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
          <Campo etiqueta="Nombre interno (el que ve el vendedor)" ancho="col-span-2 sm:col-span-4">
            <input
              ref={refNombre}
              value={estado.campos.nombre_interno ?? ''}
              onChange={(e) => set({ nombre_interno: e.target.value })}
              className={claseInput}
              placeholder="ALIM BAL LIVRA 15KG"
            />
          </Campo>
          <Campo etiqueta="Nombre público (el que ve el cliente en la tienda)" ancho="col-span-2 sm:col-span-4">
            <input
              value={estado.campos.nombre_publico ?? ''}
              onChange={(e) => set({ nombre_publico: e.target.value || null })}
              className={claseInput}
              placeholder="Alimento Balanceado Livra Adulto 15 kg"
            />
          </Campo>
          {/*
            Sugerencia 22 de Lucas. El campo existía en la base desde el
            principio, pensado para la tienda de Zubu; lo que faltaba era
            mostrarlo. Se escribe una vez acá y viaja a la web.
          */}
          <Campo
            etiqueta="Descripción (la que va a la tienda web)"
            ancho="col-span-2 sm:col-span-4"
            ayuda="Para qué sirve, cómo se usa, qué trae. Se sincroniza con la tienda."
          >
            <textarea
              rows={3}
              value={estado.campos.descripcion ?? ''}
              onChange={(e) => set({ descripcion: e.target.value || null })}
              className={`${claseInput} resize-y`}
              placeholder="Alimento balanceado para perros adultos de razas medianas y grandes…"
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
            <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-piedra-50 px-3 py-2 text-xs">
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
          <Campo
            etiqueta="Rubro ARCA"
            ancho="col-span-2"
            ayuda="Actividad de ARCA para separar las ventas del contador. Distinto de la categoría de arriba."
          >
            <select
              value={estado.campos.rubro_arca_id ?? ''}
              onChange={(e) =>
                set({ rubro_arca_id: e.target.value === '' ? null : Number(e.target.value) })
              }
              className={claseInput}
            >
              <option value="">Sin clasificar</option>
              {referencias.rubrosArca.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.descripcion}
                </option>
              ))}
            </select>
          </Campo>
        </Seccion>

        <Seccion titulo="Stock">
          <Campo etiqueta="En el sistema">
            <div className="rounded-lg bg-piedra-100 px-2.5 py-1.5 text-right text-sm tabular-nums text-piedra-600">
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

          {/*
            Aviso de stock bajo. Sugerencia 7 de Lucas.

            Estaba construido en la base desde el principio —dos niveles,
            por producto o por categoría entera— y el listado ya pintaba
            "Stock bajo" y "Crítico" con esto. Lo único que faltaba era
            dónde tocarlo, y por eso el 07/09 no se lo pudo mostrar.

            Va acá adentro de Stock y no en una pantalla aparte: ¿cuántos
            me quedan? y ¿a partir de cuántos me avisás? son la misma
            conversación.
          */}
          <div className="col-span-2 sm:col-span-4 rounded-lg bg-piedra-50 p-3 ring-1 ring-borde">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-piedra-600">Avisarme cuando queden pocos</p>
              {puedeUmbrales && (
                <label className="flex items-center gap-2 text-xs text-piedra-500">
                  <input
                    type="checkbox"
                    checked={estado.umbral.propio}
                    onChange={(e) =>
                      onCambio({
                        ...estado,
                        umbral: { ...estado.umbral, propio: e.target.checked },
                      })
                    }
                    className="size-3.5 rounded border-borde accent-marca-700"
                  />
                  Poner un aviso propio para este producto
                </label>
              )}
            </div>

            {estado.umbral.propio && puedeUmbrales ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Campo etiqueta="Stock bajo (amarillo)" ayuda="Hay que ir pidiendo">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={estado.umbral.bajo}
                    onChange={(e) =>
                      onCambio({ ...estado, umbral: { ...estado.umbral, bajo: e.target.value } })
                    }
                    className={`${claseInput} text-right tabular-nums`}
                  />
                </Campo>
                <Campo etiqueta="Crítico (rojo)" ayuda="Se queda sin stock">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={estado.umbral.critico}
                    onChange={(e) =>
                      onCambio({ ...estado, umbral: { ...estado.umbral, critico: e.target.value } })
                    }
                    className={`${claseInput} text-right tabular-nums`}
                  />
                </Campo>
                <div className="col-span-2 flex items-end">
                  {umbralInvalido && (
                    <p className="w-full rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800 ring-1 ring-amber-200">
                      El crítico tiene que ser menor o igual que el bajo.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              /*
                Sin aviso propio se muestra el que rige igual. Un campo
                vacío daría a entender que no hay ninguno, y sí lo hay:
                el de su categoría o el general.
              */
              <p className="mt-2 text-xs text-piedra-500">
                Hoy avisa con <strong>{estado.umbral.bajo || 'sin definir'}</strong> (bajo) y{' '}
                <strong>{estado.umbral.critico || 'sin definir'}</strong> (crítico)
                {estado.umbral.propio
                  ? ', puesto para este producto.'
                  : ', heredado de su categoría o del valor general.'}
              </p>
            )}
          </div>
        </Seccion>

        <Seccion titulo="Proveedor">
          {/*
            Punto 5 de Lucas. Está en su propia sección y no metido en
            Clasificación porque no clasifica el producto: dice de dónde
            viene. Y es lo que hace posible el punto 4 —aumentar los
            precios de un laboratorio de una— que es lo que duele todos
            los días.
          */}
          <Campo
            etiqueta="A quién se le compra"
            ancho="col-span-2 sm:col-span-4"
            ayuda="Permite aumentarle el precio a todos los productos de este proveedor de una sola vez, desde Proveedores."
          >
            <select
              value={estado.campos.proveedor_id ?? ''}
              onChange={(e) => set({ proveedor_id: e.target.value || null })}
              className={claseInput}
            >
              <option value="">Sin proveedor</option>
              {referencias.proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>
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
          <Campo etiqueta="Escaneá o tipeá y presioná Enter" ancho="col-span-2 sm:col-span-4">
            <input
              value={codigoBarra}
              onChange={(e) => setCodigoBarra(e.target.value)}
              onKeyDown={agregarCodigo}
              className={`${claseInput} font-mono`}
              placeholder="7790000000000"
            />
          </Campo>
          {estado.codigosBarra.length > 0 && (
            <div className="col-span-2 sm:col-span-4 flex flex-wrap gap-2">
              {estado.codigosBarra.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-piedra-100 py-1 pr-1 pl-2.5 font-mono text-xs text-piedra-700"
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
                    className="rounded p-0.5 text-piedra-400 hover:bg-piedra-200 hover:text-piedra-700"
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
          <label className="col-span-2 flex items-center gap-2 text-sm text-piedra-700">
            <input
              type="checkbox"
              checked={estado.campos.es_producto_veterinario ?? false}
              onChange={(e) => set({ es_producto_veterinario: e.target.checked })}
              className="size-4 rounded border-borde text-marca-600 focus:ring-marca-500"
            />
            Producto veterinario
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm text-piedra-700">
            <input
              type="checkbox"
              checked={estado.campos.requiere_receta ?? false}
              onChange={(e) => set({ requiere_receta: e.target.checked })}
              className="size-4 rounded border-borde text-marca-600 focus:ring-marca-500"
            />
            Requiere receta
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm text-piedra-700">
            <input
              type="checkbox"
              checked={estado.campos.es_fitosanitario ?? false}
              onChange={(e) => set({ es_fitosanitario: e.target.checked })}
              className="size-4 rounded border-borde text-marca-600 focus:ring-marca-500"
            />
            Fitosanitario
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm text-piedra-700">
            <input
              type="checkbox"
              checked={estado.campos.controla_vencimiento ?? false}
              onChange={(e) => set({ controla_vencimiento: e.target.checked })}
              className="size-4 rounded border-borde text-marca-600 focus:ring-marca-500"
            />
            Controla vencimiento
          </label>
          <p className="col-span-2 sm:col-span-4 text-xs text-piedra-400">
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

      <div className="flex items-center gap-2 border-t border-borde bg-piedra-50 px-5 py-3">
        <button
          onClick={() => onGuardar(true, true)}
          disabled={guardando || umbralInvalido}
          className={`flex-1 ${boton.principal}`}
        >
          {guardando ? 'Guardando…' : 'Revisado y siguiente'}
        </button>
        <button
          onClick={() => onGuardar(false, false)}
          disabled={guardando || umbralInvalido}
          className={boton.secundario}
        >
          Guardar
        </button>
        {/* Sólo sobre un producto que ya existe, y separado de los
            botones de guardar para que no se apriete sin querer. */}
        {!esNuevo && onDarDeBaja && (
          <button
            onClick={onDarDeBaja}
            disabled={guardando || umbralInvalido}
            className="ml-auto rounded-lg px-3 py-2.5 text-sm font-medium text-piedra-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
          >
            Dar de baja
          </button>
        )}
      </div>
    </div>
  )
}
