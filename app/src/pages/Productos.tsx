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
import { barraDeAvance, boton, campoDeFiltro } from '@/estilos'
import {
  cambiaLoQueVeLaTienda,
  definirVentaOnline,
  definirVentaOnlinePorClasificacion,
  estadoEnTienda,
  normalizarColchon,
} from '@/lib/api/ventaOnline'
import type { EstadoEnTienda } from '@/lib/api/ventaOnline'

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
  // Nada sale a la tienda hasta que alguien lo decide.
  tienda: { vender: false, colchon: '' },
}

function tiendaDelFormulario(e: EstadoEnTienda | null): EstadoFormulario['tienda'] {
  return {
    vender: e?.vender_online ?? false,
    colchon: e?.colchon_propio === null || e?.colchon_propio === undefined ? '' : String(e.colchon_propio),
  }
}

/*
  Lo que se avisa después de prender o apagar. Cuenta lo que cambió de
  verdad, y si alguno quedó prendido sin cumplir las condiciones lo dice:
  si no, alguien lo busca en la web y no lo encuentra.
*/
function avisoDeVentaOnline(cambiados: number, sinSalir: number, vender: boolean) {
  const cuantos = `${numero.format(cambiados)} ${cambiados === 1 ? 'producto' : 'productos'}`
  if (cambiados === 0) {
    return vender ? 'Ya estaban todos a la venta online.' : 'Ninguno estaba a la venta online.'
  }
  const hecho = vender ? `${cuantos} a la venta online.` : `${cuantos} dejaron de venderse online.`
  if (!sinSalir) return hecho
  return `${hecho} ${numero.format(sinSalir)} todavía no ${sinSalir === 1 ? 'sale' : 'salen'} a la tienda: abrí la ficha para ver qué le falta.`
}

export default function Productos() {
  const { perfil, tienePermiso } = useAuth()
  const qc = useQueryClient()

  const [texto, setTexto] = useState('')
  const [debounced, setDebounced] = useState('')
  const [soloSinRevisar, setSoloSinRevisar] = useState(false)
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [marcaId, setMarcaId] = useState<string | null>(null)
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<EstadoFormulario>(FORM_VACIO)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const [verBajas, setVerBajas] = useState(false)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [aviso, setAviso] = useState<string | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)
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
    queryKey: ['productos', debounced, soloSinRevisar, categoriaId, marcaId],
    queryFn: () => listarProductos(debounced, soloSinRevisar, categoriaId, marcaId),
  })

  /*
    Cómo está en la tienda cada producto que se ve. Es una consulta
    aparte y no una columna del listado: la cuenta la hace la base con
    las mismas reglas que la API, y el listado lo usa también el
    mostrador, que no tiene por qué pagarla.
  */
  const idsVisibles = useMemo(
    () => (listado.data?.filas ?? []).map((f) => f.producto_id),
    [listado.data],
  )
  const enTienda = useQuery({
    queryKey: ['tienda-listado', idsVisibles],
    queryFn: () => estadoEnTienda(idsVisibles),
    enabled: idsVisibles.length > 0,
  })

  const avance = useQuery({ queryKey: ['avance-carga'], queryFn: contarAvance })

  const bajas = useQuery({
    queryKey: ['productos-baja', debounced],
    queryFn: () => listarProductosDeBaja(debounced),
    enabled: verBajas,
  })

  function avisar(texto: string) {
    setAviso(texto)
    setErrorLista(null)
    setTimeout(() => setAviso(null), 6000)
  }

  function refrescarListados() {
    qc.invalidateQueries({ queryKey: ['productos'] })
    qc.invalidateQueries({ queryKey: ['productos-baja'] })
    qc.invalidateQueries({ queryKey: ['avance-carga'] })
    qc.invalidateQueries({ queryKey: ['tienda-listado'] })
    setMarcados(new Set())
  }

  // Vender online a un grupo marcado, o dejar de venderlo.
  const ventaOnline = useMutation({
    mutationFn: async ({ ids, vender }: { ids: string[]; vender: boolean }) => {
      const cambiados = await definirVentaOnline(ids, vender)
      const estados = vender ? await estadoEnTienda(ids) : new Map<string, EstadoEnTienda>()
      const sinSalir = [...estados.values()].filter((e) => e.vender_online && e.motivo).length
      return { cambiados, sinSalir, vender }
    },
    onSuccess: ({ cambiados, sinSalir, vender }) => {
      avisar(avisoDeVentaOnline(cambiados, sinSalir, vender))
      refrescarListados()
      qc.invalidateQueries({ queryKey: ['producto'] })
    },
    onError: (e) => setErrorLista(e instanceof Error ? e.message : 'No se pudo cambiar la venta online.'),
  })

  // Una categoría o una marca entera: la hace la base, sobre todos los
  // del grupo y no sólo los 100 que muestra la lista.
  const ventaOnlineDelGrupo = useMutation({
    mutationFn: ({ vender }: { vender: boolean }) =>
      definirVentaOnlinePorClasificacion(categoriaId, marcaId, vender),
    onSuccess: ({ cambiados, sinSalir }, { vender }) => {
      avisar(avisoDeVentaOnline(cambiados, sinSalir, vender))
      refrescarListados()
      qc.invalidateQueries({ queryKey: ['producto'] })
    },
    onError: (e) => setErrorLista(e instanceof Error ? e.message : 'No se pudo cambiar la venta online.'),
  })

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
      tienda: tiendaDelFormulario(detalle.data.tienda),
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
        tienda: { vender: form.tienda.vender, colchon: normalizarColchon(form.tienda.colchon) },
        tiendaAntes: creando
          ? { vender: false, colchon: null }
          : {
              vender: detalle.data?.tienda?.vender_online ?? false,
              colchon: detalle.data?.tienda?.colchon_propio ?? null,
            },
      }),
    onSuccess: (_id, variables) => {
      setErrorGuardado(null)
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['avance-carga'] })
      qc.invalidateQueries({ queryKey: ['producto', seleccionado] })
      qc.invalidateQueries({ queryKey: ['tienda-listado'] })

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

  /*
    ¿Hay cambios sin guardar que cambian lo que ve la tienda? Entonces la
    línea de la ficha no describe lo guardado: diría «le falta el nombre
    público» con el nombre recién escrito.
  */
  const tiendaPendiente = useMemo(() => {
    if (creando || !detalle.data) return false
    const g = detalle.data.producto
    return cambiaLoQueVeLaTienda(
      {
        ...tiendaDelFormulario(detalle.data.tienda),
        nombre_publico: g.nombre_publico,
        precio_venta: g.precio_venta,
        activo: g.activo,
        es_fitosanitario: g.es_fitosanitario,
      },
      {
        ...form.tienda,
        nombre_publico: form.campos.nombre_publico,
        precio_venta: form.campos.precio_venta,
        activo: form.campos.activo,
        es_fitosanitario: form.campos.es_fitosanitario,
      },
    )
  }, [creando, detalle.data, form])

  /*
    Con una categoría o una marca elegida, y nada más filtrando, lo que
    se ve es el grupo entero —aunque la lista muestre los primeros 100—
    y se lo puede prender o apagar de una. Con la búsqueda o «sólo sin
    revisar» encima, el total ya no es el del grupo y la acción se
    esconde: prendería más de lo que dice la pantalla.
  */
  const puedeMarcar = puedeDarDeBaja || puedeEditar
  const grupoEntero =
    puedeEditar && !verBajas && !debounced && !soloSinRevisar && (!!categoriaId || !!marcaId)
  const nombreDelGrupo = [
    categoriaId && `la categoría «${referencias.data?.categorias.find((c) => c.id === categoriaId)?.nombre ?? ''}»`,
    marcaId && `la marca «${referencias.data?.marcas.find((m) => m.id === marcaId)?.nombre ?? ''}»`,
  ]
    .filter(Boolean)
    .join(' y ')
  const visibles = listado.data?.filas ?? []
  const todosMarcados = visibles.length > 0 && visibles.every((f) => marcados.has(f.producto_id))
  const conCasillas = verBajas ? puedeDarDeBaja : puedeMarcar

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Productos</h1>
          <p className="text-sm text-piedra-500">
            {listado.data ? `${numero.format(listado.data.total)} en el catálogo` : 'Cargando…'}
          </p>
        </div>
        {puedeCrear && (
          <div className="flex gap-2">
            <Link
              to="/productos/importar"
              className={boton.secundario}
            >
              Importar planilla
            </Link>
            <button
              onClick={nuevo}
              className={boton.principal}
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
      {/*
        Mientras la ficha está abierta en una pantalla angosta, el avance y
        el buscador se esconden: le dejaban a la ficha menos de media
        pantalla del teléfono, justo cuando lo que se quiere es ver el
        precio y guardarlo.
      */}
      {avance.data && avance.data.total > 0 && (
        <div
          className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde ${
            editorAbierto ? 'hidden lg:block' : ''
          }`}
        >
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-medium text-piedra-700">Avance de la carga</span>
            <span className="tabular-nums text-piedra-500">
              {numero.format(avance.data.revisados)} de {numero.format(avance.data.total)} revisados
              · {porcentaje}%
            </span>
          </div>
          <div className={barraDeAvance.fondo}>
            <div
              className={barraDeAvance.relleno}
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        </div>
      )}

      <div className={`flex-wrap items-center gap-3 ${editorAbierto ? 'hidden lg:flex' : 'flex'}`}>
        <div className="relative min-w-64 flex-1">
          <svg
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-piedra-400"
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
            className="w-full rounded-xl border border-borde bg-white py-2.5 pr-4 pl-11 text-tinta shadow-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
          />
        </div>
        {!verBajas && (
          <label className="flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap text-piedra-600">
            <input
              type="checkbox"
              checked={soloSinRevisar}
              onChange={(e) => setSoloSinRevisar(e.target.checked)}
              className="size-4 rounded border-borde text-marca-600 focus:ring-marca-500"
            />
            Sólo sin revisar
          </label>
        )}
        {!verBajas && referencias.data && (
          <>
            <select
              aria-label="Categoría"
              value={categoriaId ?? ''}
              onChange={(e) => {
                setCategoriaId(e.target.value || null)
                setMarcados(new Set())
              }}
              className={campoDeFiltro}
            >
              <option value="">Todas las categorías</option>
              {referencias.data.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select
              aria-label="Marca"
              value={marcaId ?? ''}
              onChange={(e) => {
                setMarcaId(e.target.value || null)
                setMarcados(new Set())
              }}
              className={campoDeFiltro}
            >
              <option value="">Todas las marcas</option>
              {referencias.data.marcas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </>
        )}
        {puedeDarDeBaja && (
          <button
            onClick={() => {
              setVerBajas(!verBajas)
              setMarcados(new Set())
              cerrar()
            }}
            className={`whitespace-nowrap ${verBajas ? boton.principal : boton.secundario}`}
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
      {errorLista && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {errorLista}
        </p>
      )}

      {grupoEntero && listado.data && listado.data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-marca-50 px-4 py-2.5 ring-1 ring-marca-200">
          <span className="text-sm text-marca-900">
            Toda {nombreDelGrupo}: <strong>{numero.format(listado.data.total)}</strong>{' '}
            {listado.data.total === 1 ? 'producto' : 'productos'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const n = listado.data!.total
                const sigue = await confirmar({
                  titulo: `¿Vender online ${numero.format(n)} ${n === 1 ? 'producto' : 'productos'}?`,
                  detalle: `Todos los de ${nombreDelGrupo} que hay hoy. Los que se carguen después se prenden en su ficha. Salen a la tienda los que tengan nombre público y precio.`,
                  aceptar: 'Vender online',
                })
                if (sigue) ventaOnlineDelGrupo.mutate({ vender: true })
              }}
              disabled={ventaOnlineDelGrupo.isPending}
              className={boton.principal}
            >
              Vender online todos
            </button>
            <button
              onClick={async () => {
                const n = listado.data!.total
                const sigue = await confirmar({
                  titulo: `¿Dejar de vender online ${numero.format(n)} ${n === 1 ? 'producto' : 'productos'}?`,
                  detalle: `Todos los de ${nombreDelGrupo}. Salen de la tienda en la próxima consulta de la tienda.`,
                  aceptar: 'Dejar de vender online',
                })
                if (sigue) ventaOnlineDelGrupo.mutate({ vender: false })
              }}
              disabled={ventaOnlineDelGrupo.isPending}
              className={boton.secundario}
            >
              Dejar de vender online
            </button>
          </div>
        </div>
      )}

      {/*
        Barra de acciones sobre lo marcado. Aparece sólo cuando hay algo
        seleccionado: una barra siempre visible con botones apagados es
        ruido, y sobre 3.000 productos la pantalla ya tiene bastante.
      */}
      {marcados.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-piedra-800 px-4 py-2.5 text-white">
          <span className="text-sm">
            {marcados.size} {marcados.size === 1 ? 'seleccionado' : 'seleccionados'}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setMarcados(new Set())}
              className="rounded-lg px-3 py-1.5 text-sm text-piedra-300 hover:bg-white/10"
            >
              Quitar selección
            </button>
            {verBajas ? (
              <button
                onClick={() => restaurar.mutate([...marcados])}
                disabled={restaurar.isPending}
                className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-tinta hover:bg-piedra-100 disabled:opacity-50"
              >
                {restaurar.isPending ? 'Restaurando…' : 'Restaurar'}
              </button>
            ) : (
              <>
                {puedeEditar && (
                  <>
                    <button
                      onClick={() => ventaOnline.mutate({ ids: [...marcados], vender: true })}
                      disabled={ventaOnline.isPending}
                      className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-tinta hover:bg-piedra-100 disabled:opacity-50"
                    >
                      Vender online
                    </button>
                    <button
                      onClick={() => ventaOnline.mutate({ ids: [...marcados], vender: false })}
                      disabled={ventaOnline.isPending}
                      className="rounded-lg px-3 py-1.5 text-sm text-white ring-1 ring-white/30 hover:bg-white/10 disabled:opacity-50"
                    >
                      Dejar de vender online
                    </button>
                  </>
                )}
                {puedeDarDeBaja && (
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
              </>
            )}
          </div>
        </div>
      )}

      {/*
        La lista y la ficha, una al lado de la otra desde una pantalla ancha.

        Por debajo —un teléfono, una tablet— la ficha de 36 rem no entra al
        lado de la lista: se abría a la derecha, fuera de la pantalla, y
        tocar un producto parecía no hacer nada. Ahí la ficha reemplaza a
        la lista, y cerrarla la trae de vuelta.
      */}
      <div className="flex min-h-0 flex-1 gap-4">
        <div
          className={`min-w-0 flex-1 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde ${
            editorAbierto ? 'hidden lg:block' : ''
          }`}
        >
          <div className="h-full overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
                <tr>
                  {conCasillas && (
                    <th className="hidden w-10 px-4 py-2.5 sm:table-cell">
                      {/* Marca los que se ven. Para una categoría entera, el
                          filtro de arriba: la lista muestra de a 100. */}
                      {!verBajas && (
                        <input
                          type="checkbox"
                          aria-label="Marcar todos los que se ven"
                          title="Marcar todos los que se ven"
                          checked={todosMarcados}
                          onChange={() =>
                            setMarcados(todosMarcados ? new Set() : new Set(visibles.map((f) => f.producto_id)))
                          }
                          className="size-4 rounded border-borde text-marca-600 focus:ring-marca-500"
                        />
                      )}
                    </th>
                  )}
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Código</th>
                  <th className="px-4 py-2.5 font-medium">Producto</th>
                  <th className="px-4 py-2.5 text-right font-medium">Precio</th>
                  {verBajas ? (
                    <th className="px-4 py-2.5 font-medium">Dado de baja</th>
                  ) : (
                    <>
                      <th className="px-4 py-2.5 text-right font-medium">Stock</th>
                      <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Estado</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-piedra-100">
                {(verBajas ? bajas.isPending : listado.isPending) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-piedra-400">
                      Buscando…
                    </td>
                  </tr>
                )}

                {verBajas && !bajas.isPending && bajas.data?.filas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-piedra-400">
                      No hay productos dados de baja.
                    </td>
                  </tr>
                )}

                {!verBajas && !listado.isPending && listado.data?.filas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-piedra-400">
                      {debounced
                        ? `No hay productos que coincidan con “${debounced}”.`
                        : 'Todavía no hay productos cargados. Van a llegar con la importación del listado.'}
                    </td>
                  </tr>
                )}

                {verBajas &&
                  bajas.data?.filas.map((p) => (
                    <tr key={p.id} className="hover:bg-piedra-50">
                      {conCasillas && (
                        <td className="hidden px-4 py-2.5 sm:table-cell">
                          <input
                            type="checkbox"
                            checked={marcados.has(p.id)}
                            onChange={() => alternarMarca(p.id)}
                            className="size-4 rounded border-borde text-marca-600 focus:ring-marca-500"
                          />
                        </td>
                      )}
                      <td className="hidden px-4 py-2.5 font-mono text-xs text-piedra-500 sm:table-cell">{p.codigo}</td>
                      <td className="px-4 py-2.5 text-piedra-600">
                        {p.nombre_interno}
                        <p className="font-mono text-xs text-piedra-400 sm:hidden">{p.codigo}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-piedra-600">
                        {moneda.format(p.precio_venta)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-piedra-500">
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
                        className={activa ? 'bg-marca-50' : 'hover:bg-piedra-50'}
                      >
                        {conCasillas && (
                          <td className="hidden px-4 py-2.5 sm:table-cell">
                            <input
                              type="checkbox"
                              checked={marcados.has(p.producto_id)}
                              onChange={() => alternarMarca(p.producto_id)}
                              className="size-4 rounded border-borde text-marca-600 focus:ring-marca-500"
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
                          className="hidden cursor-pointer px-4 py-2.5 font-mono text-xs text-piedra-500 sm:table-cell"
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
                            <span className="font-medium text-tinta">{p.nombre_interno}</span>
                            <MarcaWeb estado={enTienda.data?.get(p.producto_id)} />
                          </div>
                          {/* Sin la columna del código, va debajo del nombre. */}
                          <p className="font-mono text-xs text-piedra-400 sm:hidden">{p.codigo}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-tinta">
                          {moneda.format(p.precio_venta)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-piedra-700">
                          {numero.format(p.cantidad)}
                        </td>
                        <td className="hidden px-4 py-2.5 sm:table-cell">
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
              <p className="border-t border-borde bg-piedra-50 px-4 py-2.5 text-center text-xs text-piedra-500">
                Mostrando {listado.data.filas.length} de {numero.format(listado.data.total)}. Afiná
                la búsqueda para ver el resto.
              </p>
            )}
          </div>
        </div>

        {editorAbierto && referencias.data && (
          <div className="w-full overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde lg:w-[36rem] lg:shrink-0">
            {detalle.isPending && !creando ? (
              <p className="p-8 text-center text-sm text-piedra-400">Cargando producto…</p>
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
                enTienda={creando ? null : (detalle.data?.tienda ?? null)}
                tiendaPendiente={tiendaPendiente}
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

/*
  «Web» al lado del nombre: verde si la tienda lo muestra, ámbar si está
  prendido pero no sale (el motivo, al pasar el mouse). Apagado no se
  marca: en un catálogo de 3.000 productos, marcar lo que NO se vende
  llenaría la lista de ruido.
*/
function MarcaWeb({ estado }: { estado: EstadoEnTienda | undefined }) {
  if (!estado?.vender_online) return null
  const sale = estado.motivo === null
  return (
    <span
      title={sale ? 'Se vende online' : `Prendido, pero no sale: ${estado.motivo}`}
      className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase ring-1 ${
        sale ? 'bg-verde-50 text-verde-700 ring-verde-200' : 'bg-amber-50 text-amber-700 ring-amber-200'
      }`}
    >
      Web
    </span>
  )
}
