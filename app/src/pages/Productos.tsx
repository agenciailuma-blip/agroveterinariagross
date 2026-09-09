import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { confirmar } from '@/components/Dialogo'
import {
  cargarReferencias,
  contarAvance,
  darDeBajaProductos,
  guardarProducto,
  listarProductos,
  listarProductosDeBaja,
  obtenerProducto,
  restaurarProductos,
} from '@/lib/api/catalogo'
import type { FilaListado, Referencias } from '@/lib/api/catalogo'
import ProductoEditor from '@/components/ProductoEditor'
import type { EstadoFormulario } from '@/components/ProductoEditor'
import { ESTADO_STOCK, moneda, numero } from '@/lib/tipos'

const FORM_VACIO: EstadoFormulario = {
  campos: {
    codigo: '',
    nombre_interno: '',
    nombre_publico: null,
    precio_venta: 0,
    costo: null,
    alicuota_iva_id: 5,
    condicion_iva: 'gravado',
    unidad_medida: 'unidad',
    activo: true,
  },
  codigosBarra: [],
  animales: [],
  etapas: [],
  stockContado: '',
  // Un producto nuevo hereda el aviso de su categoría o el general.
  // Ponerle uno propio es una decisión, no el estado inicial.
  umbral: { bajo: '', critico: '', propio: false },
}

export default function Productos() {
  const { perfil, tienePermiso } = useAuth()
  const qc = useQueryClient()

  const [texto, setTexto] = useState('')
  const [debounced, setDebounced] = useState('')
  const [soloSinRevisar, setSoloSinRevisar] = useState(false)
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<EstadoFormulario>(FORM_VACIO)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const [verBajas, setVerBajas] = useState(false)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [aviso, setAviso] = useState<string | null>(null)
  const inputBusqueda = useRef<HTMLInputElement>(null)

  const puedeEditar = tienePermiso('productos.editar')
  const puedeCrear = tienePermiso('productos.crear')
  const puedeDarDeBaja = tienePermiso('productos.eliminar')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(texto.trim()), 250)
    return () => clearTimeout(t)
  }, [texto])

  useEffect(() => {
    inputBusqueda.current?.focus()
  }, [])

  const listado = useQuery({
    queryKey: ['productos', debounced, soloSinRevisar],
    queryFn: () => listarProductos(debounced, soloSinRevisar),
  })

  const avance = useQuery({ queryKey: ['avance-carga'], queryFn: contarAvance })

  const bajas = useQuery({
    queryKey: ['productos-baja', debounced],
    queryFn: () => listarProductosDeBaja(debounced),
    enabled: verBajas,
  })

  function avisar(texto: string) {
    setAviso(texto)
    setTimeout(() => setAviso(null), 6000)
  }

  function refrescarListados() {
    qc.invalidateQueries({ queryKey: ['productos'] })
    qc.invalidateQueries({ queryKey: ['productos-baja'] })
    qc.invalidateQueries({ queryKey: ['avance-carga'] })
    setMarcados(new Set())
  }

  /*
    Dar de baja. Es baja lógica: el producto sale del catálogo y del
    mostrador, pero su historial de ventas y movimientos queda intacto y
    se puede restaurar.
  */
  const darDeBaja = useMutation({
    mutationFn: (ids: string[]) => darDeBajaProductos(ids),
    onSuccess: (resultados) => {
      const dados = resultados.filter((r) => r.resultado === 'baja')
      const conStock = dados.filter((r) => r.detalle)
      avisar(
        `${dados.length} ${dados.length === 1 ? 'producto dado' : 'productos dados'} de baja.` +
          (conStock.length
            ? ` ${conStock.length} todavía tenía stock registrado — revisalos en “Dados de baja”.`
            : ''),
      )
      refrescarListados()
      if (seleccionado && resultados.some((r) => r.id === seleccionado)) cerrar()
    },
    onError: (e) => setErrorGuardado(e instanceof Error ? e.message : 'No se pudo dar de baja.'),
  })

  const restaurar = useMutation({
    mutationFn: (ids: string[]) => restaurarProductos(ids),
    onSuccess: (n) => {
      avisar(`${n} ${n === 1 ? 'producto restaurado' : 'productos restaurados'}.`)
      refrescarListados()
    },
    onError: (e) => setErrorGuardado(e instanceof Error ? e.message : 'No se pudo restaurar.'),
  })

  function alternarMarca(id: string) {
    const nuevo = new Set(marcados)
    if (nuevo.has(id)) nuevo.delete(id)
    else nuevo.add(id)
    setMarcados(nuevo)
  }

  const referencias = useQuery({
    queryKey: ['referencias'],
    queryFn: cargarReferencias,
    staleTime: 10 * 60_000,
  })

  const detalle = useQuery({
    queryKey: ['producto', seleccionado],
    queryFn: () => obtenerProducto(seleccionado!),
    enabled: !!seleccionado,
  })

  // Al traer el detalle se vuelca al formulario. El stock contado arranca
  // vacío a propósito: si viniera precargado con el saldo actual, apretar
  // guardar sin contar registraría un movimiento falso de cero.
  useEffect(() => {
    if (!detalle.data) return
    setForm({
      campos: detalle.data.producto,
      codigosBarra: detalle.data.codigosBarra.map((c) => c.codigo as string),
      animales: detalle.data.animales,
      etapas: detalle.data.etapas,
      stockContado: '',
      umbral: {
        bajo: String(detalle.data.umbral.bajo),
        critico: String(detalle.data.umbral.critico),
        propio: detalle.data.umbral.propio,
      },
    })
    setErrorGuardado(null)
  }, [detalle.data])

  const filaActual = useMemo(
    () => listado.data?.filas.find((f) => f.producto_id === seleccionado) ?? null,
    [listado.data, seleccionado],
  )

  const siguienteSinRevisar = useCallback(
    (desde: string | null) => {
      const filas = listado.data?.filas ?? []
      const i = filas.findIndex((f) => f.producto_id === desde)
      return filas.slice(i + 1).find((f) => !f.revisado_en)?.producto_id ?? null
    },
    [listado.data],
  )

  const guardar = useMutation({
    mutationFn: async ({ marcarRevisado }: { marcarRevisado: boolean; avanzar: boolean }) =>
      guardarProducto({
        id: creando ? undefined : (seleccionado ?? undefined),
        campos: form.campos,
        codigosBarra: form.codigosBarra,
        animales: form.animales,
        etapas: form.etapas,
        stockContado: form.stockContado === '' ? null : Number(form.stockContado),
        stockActual: filaActual?.cantidad ?? 0,
        /*
          Sin la marca de "propio" se manda null, que borra el umbral y
          devuelve el producto a heredar. Es la única forma de deshacer
          un aviso puesto por error.
        */
        umbral: form.umbral.propio
          ? { bajo: Number(form.umbral.bajo || 0), critico: Number(form.umbral.critico || 0) }
          : null,
        marcarRevisado,
        usuarioId: perfil!.id,
      }),
    onSuccess: (_id, variables) => {
      setErrorGuardado(null)
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['avance-carga'] })
      qc.invalidateQueries({ queryKey: ['producto', seleccionado] })

      if (variables.avanzar) {
        const siguiente = siguienteSinRevisar(seleccionado)
        if (siguiente) {
          setCreando(false)
          setSeleccionado(siguiente)
        } else {
          cerrar()
        }
      } else if (creando) {
        cerrar()
      }
    },
    onError: (e) => setErrorGuardado(e instanceof Error ? e.message : 'No se pudo guardar.'),
  })

  function cerrar() {
    setSeleccionado(null)
    setCreando(false)
    setForm(FORM_VACIO)
    setErrorGuardado(null)
    inputBusqueda.current?.focus()
  }

  function nuevo() {
    setCreando(true)
    setSeleccionado(null)
    setForm(FORM_VACIO)
    setErrorGuardado(null)
  }

  const porcentaje = avance.data?.total
    ? Math.round((avance.data.revisados / avance.data.total) * 100)
    : 0

  const editorAbierto = creando || !!seleccionado

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Productos</h1>
          <p className="text-sm text-slate-500">
            {listado.data ? `${numero.format(listado.data.total)} en el catálogo` : 'Cargando…'}
          </p>
        </div>
        {puedeCrear && (
          <div className="flex gap-2">
            <Link
              to="/productos/importar"
              className="rounded-lg px-4 py-2 text-sm font-medium text-marca-700 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Importar planilla
            </Link>
            <button
              onClick={nuevo}
              className="rounded-lg bg-marca-600 px-4 py-2 text-sm font-medium text-white hover:bg-marca-700"
            >
              Nuevo producto
            </button>
          </div>
        )}
      </div>

      {/*
        Barra de avance del operativo de carga. El personal contratado
        trabaja contra este número: saber cuánto falta es lo que permite
        organizar las jornadas.
      */}
      {avance.data && avance.data.total > 0 && (
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-700">Avance de la carga</span>
            <span className="tabular-nums text-slate-500">
              {numero.format(avance.data.revisados)} de {numero.format(avance.data.total)} revisados
              · {porcentaje}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-marca-500 transition-[width] duration-500"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <svg
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.3-4.3M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            ref={inputBusqueda}
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por código, nombre o escanear un código de barra…"
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pr-4 pl-11 text-slate-900 shadow-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
          />
        </div>
        {!verBajas && (
          <label className="flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap text-slate-600">
            <input
              type="checkbox"
              checked={soloSinRevisar}
              onChange={(e) => setSoloSinRevisar(e.target.checked)}
              className="size-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
            />
            Sólo sin revisar
          </label>
        )}
        {puedeDarDeBaja && (
          <button
            onClick={() => {
              setVerBajas(!verBajas)
              setMarcados(new Set())
              cerrar()
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ring-1 ${
              verBajas
                ? 'bg-slate-700 text-white ring-slate-700'
                : 'text-slate-600 ring-slate-300 hover:bg-slate-50'
            }`}
          >
            {verBajas ? 'Ver el catálogo' : 'Dados de baja'}
          </button>
        )}
      </div>

      {aviso && (
        <p className="rounded-xl bg-verde-50 px-4 py-3 text-sm font-medium text-verde-800 ring-1 ring-verde-200">
          {aviso}
        </p>
      )}

      {/*
        Barra de acciones sobre lo marcado. Aparece sólo cuando hay algo
        seleccionado: una barra siempre visible con botones apagados es
        ruido, y sobre 3.000 productos la pantalla ya tiene bastante.
      */}
      {marcados.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-800 px-4 py-2.5 text-white">
          <span className="text-sm">
            {marcados.size} {marcados.size === 1 ? 'seleccionado' : 'seleccionados'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setMarcados(new Set())}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
            >
              Quitar selección
            </button>
            {verBajas ? (
              <button
                onClick={() => restaurar.mutate([...marcados])}
                disabled={restaurar.isPending}
                className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50"
              >
                {restaurar.isPending ? 'Restaurando…' : 'Restaurar'}
              </button>
            ) : (
              <button
                onClick={async () => {
                  const n = marcados.size
                  const sigue = await confirmar({
                    titulo: `¿Dar de baja ${n} ${n === 1 ? 'producto' : 'productos'}?`,
                    detalle:
                      'Salen del catálogo y del mostrador, pero no se borra nada: el historial de ventas y movimientos queda, y se pueden restaurar desde "Dados de baja".',
                    aceptar: 'Dar de baja',
                    peligro: true,
                  })
                  if (sigue) darDeBaja.mutate([...marcados])
                }}
                disabled={darDeBaja.isPending}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {darDeBaja.isPending ? 'Dando de baja…' : 'Dar de baja'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="h-full overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  {puedeDarDeBaja && <th className="w-10 px-4 py-2.5" />}
                  <th className="px-4 py-2.5 font-medium">Código</th>
                  <th className="px-4 py-2.5 font-medium">Producto</th>
                  <th className="px-4 py-2.5 text-right font-medium">Precio</th>
                  {verBajas ? (
                    <th className="px-4 py-2.5 font-medium">Dado de baja</th>
                  ) : (
                    <>
                      <th className="px-4 py-2.5 text-right font-medium">Stock</th>
                      <th className="px-4 py-2.5 font-medium">Estado</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(verBajas ? bajas.isPending : listado.isPending) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      Buscando…
                    </td>
                  </tr>
                )}

                {verBajas && !bajas.isPending && bajas.data?.filas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      No hay productos dados de baja.
                    </td>
                  </tr>
                )}

                {!verBajas && !listado.isPending && listado.data?.filas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      {debounced
                        ? `No hay productos que coincidan con “${debounced}”.`
                        : 'Todavía no hay productos cargados. Van a llegar con la importación del listado.'}
                    </td>
                  </tr>
                )}

                {verBajas &&
                  bajas.data?.filas.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      {puedeDarDeBaja && (
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={marcados.has(p.id)}
                            onChange={() => alternarMarca(p.id)}
                            className="size-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
                          />
                        </td>
                      )}
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{p.codigo}</td>
                      <td className="px-4 py-2.5 text-slate-600">{p.nombre_interno}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                        {moneda.format(p.precio_venta)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">
                        {new Date(p.eliminado_en).toLocaleDateString('es-AR')}
                      </td>
                    </tr>
                  ))}

                {!verBajas &&
                  listado.data?.filas.map((p: FilaListado) => {
                    const estado = ESTADO_STOCK[p.estado]
                    const activa = p.producto_id === seleccionado
                    return (
                      <tr
                        key={p.producto_id}
                        className={activa ? 'bg-marca-50' : 'hover:bg-slate-50'}
                      >
                        {puedeDarDeBaja && (
                          <td className="px-4 py-2.5">
                            <input
                              type="checkbox"
                              checked={marcados.has(p.producto_id)}
                              onChange={() => alternarMarca(p.producto_id)}
                              className="size-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
                            />
                          </td>
                        )}
                        {/* La fila abre el editor, pero el casillero no:
                            marcar para dar de baja y abrir para editar son
                            dos intenciones distintas. */}
                        <td
                          onClick={() => {
                            if (!puedeEditar) return
                            setCreando(false)
                            setSeleccionado(p.producto_id)
                          }}
                          className="cursor-pointer px-4 py-2.5 font-mono text-xs text-slate-500"
                        >
                          {p.codigo}
                        </td>
                        <td
                          onClick={() => {
                            if (!puedeEditar) return
                            setCreando(false)
                            setSeleccionado(p.producto_id)
                          }}
                          className="cursor-pointer px-4 py-2.5"
                        >
                          <div className="flex items-center gap-2">
                            {!p.revisado_en && (
                              <span
                                className="size-1.5 shrink-0 rounded-full bg-amber-400"
                                title="Sin revisar"
                              />
                            )}
                            <span className="font-medium text-slate-900">{p.nombre_interno}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">
                          {moneda.format(p.precio_venta)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                          {numero.format(p.cantidad)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${estado.clase}`}
                          >
                            {estado.etiqueta}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>

            {!verBajas && listado.data && listado.data.total > listado.data.filas.length && (
              <p className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-xs text-slate-500">
                Mostrando {listado.data.filas.length} de {numero.format(listado.data.total)}. Afiná
                la búsqueda para ver el resto.
              </p>
            )}
          </div>
        </div>

        {editorAbierto && referencias.data && (
          <div className="w-[36rem] shrink-0 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            {detalle.isPending && !creando ? (
              <p className="p-8 text-center text-sm text-slate-400">Cargando producto…</p>
            ) : (
              <ProductoEditor
                referencias={referencias.data}
                estado={form}
                onCambio={setForm}
                stockActual={filaActual?.cantidad ?? 0}
                puedeUmbrales={tienePermiso('stock.configurar_umbrales')}
                esNuevo={creando}
                guardando={guardar.isPending}
                error={errorGuardado}
                onGuardar={(marcarRevisado, avanzar) => guardar.mutate({ marcarRevisado, avanzar })}
                onCancelar={cerrar}
                onDarDeBaja={
                  puedeDarDeBaja && seleccionado
                    ? async () => {
                        const sigue = await confirmar({
                          titulo: `¿Dar de baja "${form.campos.nombre_interno}"?`,
                          detalle:
                            'Sale del catálogo y del mostrador, pero no se borra: el historial de ventas y movimientos queda, y se puede restaurar desde "Dados de baja".',
                          aceptar: 'Dar de baja',
                          peligro: true,
                        })
                        if (sigue) darDeBaja.mutate([seleccionado])
                      }
                    : undefined
                }
                onReferenciaCreada={(grupo, nueva) =>
                  qc.setQueryData(['referencias'], (prev: Referencias | undefined) =>
                    prev ? { ...prev, [grupo]: [...prev[grupo], nueva] } : prev,
                  )
                }
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
