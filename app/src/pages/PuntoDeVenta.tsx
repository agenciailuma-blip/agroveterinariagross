import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTerminal } from '@/lib/terminal'
import { IdentificarOperador, useOperador } from '@/components/IdentificarOperador'
import {
  buscarClientes,
  buscarProductosVenta,
  clienteConsumidorFinal,
  enviarACaja,
  esFraccionable,
  pasoCantidad,
} from '@/lib/api/ventas'
import type { ClienteVenta, LineaVenta, ProductoVenta } from '@/lib/api/ventas'
import { cargarPrecios, previsualizarPrecio } from '@/lib/api/precios'
import type { MedioPago } from '@/lib/api/precios'
import { useSync } from '@/lib/local/SyncProvider'
import { subirPendientes } from '@/lib/local/sync'
import { valorConfig } from '@/lib/local/consultas'
import { emitirPresupuesto } from '@/lib/api/noFiscal'
import { abrirNoFiscal } from '@/lib/escritorio'
import { moneda, numero } from '@/lib/tipos'
import { confirmar, pedirNumero, pedirTexto } from '@/components/Dialogo'
import { MOTIVOS_DE_PRECIO } from '@/lib/motivos'
import LineaLibre from '@/components/LineaLibre'
import type { DatosLineaLibre } from '@/components/LineaLibre'

const BORRADOR = 'gross.venta-en-curso'

export default function PuntoDeVenta() {
  const { terminal, disponibles, cargando: cargandoTerminal, elegir } = useTerminal()
  const { operador, identificar, salir, renovar } = useOperador()
  const { listo: copiaLocalLista, enLinea, sincronizando } = useSync()

  const [lineas, setLineas] = useState<LineaVenta[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(BORRADOR) ?? '[]') as LineaVenta[]
    } catch {
      return []
    }
  })
  const [cliente, setCliente] = useState<ClienteVenta | null>(null)
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [textoCliente, setTextoCliente] = useState('')
  const [medioAnticipado, setMedioAnticipado] = useState<string | null>(null)
  const [cuotasAnticipadas, setCuotasAnticipadas] = useState(1)
  const [texto, setTexto] = useState('')
  const [debounced, setDebounced] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [pasoEnvio, setPasoEnvio] = useState<string | null>(null)
  const busqueda = useRef<HTMLInputElement>(null)

  /*
    La rebaja que está esperando el PIN que la autorice.

    Se guarda entera —línea, precio nuevo y motivo— y se aplica recién
    cuando alguien se identifica. Al revés (aplicar y después pedir el
    PIN) la rebaja quedaría hecha si la persona cierra el cartel, que es
    justo lo que el PIN tiene que impedir.
  */
  const [autorizando, setAutorizando] = useState<{
    lineaId: string
    precio: number
    motivo: string
    porcentaje: number
  } | null>(null)

  /** El cartel para escribir una línea que no está en el catálogo. */
  const [escribiendoLinea, setEscribiendoLinea] = useState(false)

  /*
    Sugerencia 18 de Lucas: preguntar cuántos al agregar.

    Se lee de la configuración y no está fijo en el código porque cambia
    el ritmo de la venta entera, y cuál conviene depende de qué se está
    vendiendo. Cinco bolsas de alimento agradecen la pregunta; doce
    collares distintos la sufren. Que lo prueben una semana y lo apaguen
    desde Configuración si molesta.

    Se lee de la base local: el mostrador no puede quedarse esperando al
    servidor para saber cómo agregar un producto.
  */
  const [pedirCantidad, setPedirCantidad] = useState(false)
  useEffect(() => {
    valorConfig('ventas.pedir_cantidad_al_agregar', 1).then((v) => setPedirCantidad(v === 1))
  }, [copiaLocalLista])

  // El borrador sobrevive a un refresco accidental. Una venta a medio
  // armar que se pierde por un F5 es media hora de mostrador tirada.
  useEffect(() => {
    localStorage.setItem(BORRADOR, JSON.stringify(lineas))
  }, [lineas])

  useEffect(() => {
    const t = setTimeout(() => setDebounced(texto.trim()), 200)
    return () => clearTimeout(t)
  }, [texto])

  useEffect(() => {
    if (!cliente) clienteConsumidorFinal().then((c) => c && setCliente(c))
  }, [cliente])

  const resultados = useQuery({
    queryKey: ['venta-buscar', debounced],
    queryFn: () => buscarProductosVenta(debounced),
    enabled: debounced.length >= 2,
  })

  const clientes = useQuery({
    queryKey: ['venta-clientes', textoCliente],
    queryFn: () => buscarClientes(textoCliente),
    enabled: buscandoCliente,
  })

  const precios = useQuery({ queryKey: ['precios'], queryFn: cargarPrecios, staleTime: 300_000 })

  const listaTarjeta = precios.data?.listas.find((l) => !l.es_predeterminada)
  const medios = precios.data?.medios ?? []
  const medio = medios.find((m) => m.id === medioAnticipado)
  const listaElegida = medio
    ? precios.data?.listas.find((l) => l.id === medio.lista_precio_id)
    : undefined
  const recargoElegido =
    medio?.medio_pago_cuota.find((c) => c.cuotas === cuotasAnticipadas)?.recargo_porcentaje ?? 0

  const totales = useMemo(() => {
    const bruto = lineas.reduce((s, l) => s + l.cantidad * l.precio_original, 0)
    const neto = lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0)
    const descuentoCliente = cliente?.descuento_porcentaje ?? 0
    const conDescuento = neto * (1 - descuentoCliente / 100)
    return {
      bruto,
      descuentoLineas: bruto - neto,
      descuentoCliente: neto - conDescuento,
      contado: Math.round(conDescuento * 100) / 100,
      conTarjeta: previsualizarPrecio(conDescuento, listaTarjeta, 0),
      elegido: previsualizarPrecio(conDescuento, listaElegida, recargoElegido),
      unidades: lineas.reduce((s, l) => s + l.cantidad, 0),
    }
  }, [lineas, cliente, listaTarjeta, listaElegida, recargoElegido])

  async function agregar(p: ProductoVenta) {
    renovar()
    setError(null)

    let cuantos = 1
    if (pedirCantidad) {
      const pedido = await pedirNumero({
        titulo: p.nombre_interno,
        detalle: `${moneda.format(p.precio_venta)} por ${p.unidad_medida} · quedan ${numero.format(p.cantidad)}`,
        etiqueta: '¿Cuántos?',
        valorInicial: '1',
        aceptar: 'Agregar',
      })
      // Cancelar no agrega nada. Es lo que se espera de Cancelar, y es
      // además la forma de corregir un escaneo equivocado sin tener que
      // agregarlo y después quitarlo de la lista.
      if (pedido === null) {
        busqueda.current?.focus()
        return
      }
      if (!(pedido > 0)) {
        setError('La cantidad tiene que ser mayor que cero.')
        busqueda.current?.focus()
        return
      }
      // Un collar no se vende por mitades. Mismo criterio que al
      // corregir la cantidad en la lista.
      cuantos = esFraccionable(p.unidad_medida) ? pedido : Math.round(pedido)
    }

    setLineas((prev) => {
      const existente = prev.find((l) => l.producto_id === p.producto_id)
      if (existente) {
        return prev.map((l) =>
          l.producto_id === p.producto_id ? { ...l, cantidad: l.cantidad + cuantos } : l,
        )
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          producto_id: p.producto_id,
          codigo_producto: p.codigo,
          descripcion: p.nombre_interno,
          unidad_medida: p.unidad_medida,
          cantidad: cuantos,
          precio_original: p.precio_venta,
          precio_unitario: p.precio_venta,
          motivo_modificacion: null,
          autorizado_por: null,
          alicuota_iva_id: p.alicuota_iva_id,
          condicion_iva: p.condicion_iva,
          stock_disponible: p.cantidad,
        },
      ]
    })
    setTexto('')
    busqueda.current?.focus()
  }

  /*
    Descuento por porcentaje sobre una línea. Sugerencia 19 de Lucas.

    El mecanismo ya existía —`cambiarPrecio` deja precio, motivo y
    responsable— pero el vendedor habla en porcentajes: "hacele el 10%".
    Obligarlo a calcular el precio con el cliente adelante es donde
    aparecen los errores de cuenta.

    Termina en el mismo lugar que un precio escrito a mano: un precio
    unitario con su motivo. No hay una segunda forma de rebajar que
    después haya que reconciliar con la primera.
  */
  async function descontarLinea(id: string) {
    const linea = lineas.find((l) => l.id === id)
    if (!linea) return

    const pct = await pedirNumero({
      titulo: `Descuento sobre ${linea.descripcion}`,
      detalle: `Precio actual ${moneda.format(linea.precio_unitario)}`,
      etiqueta: 'Porcentaje de descuento',
      ejemplo: '10',
      aceptar: 'Calcular',
    })
    if (pct === null) return
    if (!(pct > 0) || pct >= 100) {
      return setError('El descuento tiene que estar entre 0 y 100.')
    }

    const nuevo = Math.round(linea.precio_original * (1 - pct / 100) * 100) / 100

    const motivo = await pedirTexto({
      titulo: `${pct}% de descuento`,
      detalle: `${linea.descripcion}\nDe ${moneda.format(linea.precio_original)} a ${moneda.format(nuevo)}`,
      etiqueta: 'Motivo',
      opciones: MOTIVOS_DE_PRECIO,
      permiteOtro: true,
      minimo: 3,
      aceptar: 'Aplicar',
    })
    if (!motivo) return setError('Para rebajar el precio hay que indicar el motivo.')

    setError(null)
    setAutorizando({ lineaId: id, precio: nuevo, motivo, porcentaje: pct })
  }

  /* El PIN llegó: se aplica la rebaja firmada por quien lo puso. */
  function aplicarRebaja(usuarioId: string) {
    if (!autorizando) return
    const { lineaId, precio, motivo } = autorizando
    setAutorizando(null)
    renovar()
    setLineas((p) =>
      p.map((l) =>
        l.id === lineaId
          ? {
              ...l,
              precio_unitario: precio,
              motivo_modificacion: motivo,
              autorizado_por: usuarioId,
            }
          : l,
      ),
    )
  }

  /*
    Una línea escrita a mano. Ver `components/LineaLibre.tsx` para el
    porqué y para el límite.

    `precio_original` arranca igual al tipeado a propósito: la base
    exige motivo y responsable en toda línea cuyo unitario difiera del
    original, y acá no hay precio de lista del que se esté apartando —
    el precio ES el que alguien decidió. Si después se rebaja, el
    circuito de siempre pide motivo y PIN.
  */
  function agregarLibre(d: DatosLineaLibre) {
    setEscribiendoLinea(false)
    renovar()
    setError(null)
    setLineas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        producto_id: null,
        codigo_producto: 'LIBRE',
        descripcion: d.descripcion,
        unidad_medida: 'unidad',
        cantidad: d.cantidad,
        precio_original: d.precio,
        precio_unitario: d.precio,
        motivo_modificacion: null,
        autorizado_por: null,
        alicuota_iva_id: d.alicuotaIvaId,
        condicion_iva: 'gravado',
        // No tiene existencias que mirar: nunca falta.
        stock_disponible: Number.MAX_SAFE_INTEGER,
      },
    ])
    busqueda.current?.focus()
  }

  function cambiarCantidad(id: string, cantidad: number) {
    renovar()
    if (cantidad <= 0) return setLineas((p) => p.filter((l) => l.id !== id))
    setLineas((p) =>
      p.map((l) =>
        l.id === id
          ? {
              ...l,
              // Un collar o un frasco no se venden por mitades. Se
              // redondea acá y no sólo con el paso del campo, porque
              // tipear a mano también tiene que respetarlo.
              cantidad: esFraccionable(l.unidad_medida) ? cantidad : Math.round(cantidad),
            }
          : l,
      ),
    )
  }

  async function cambiarPrecio(id: string) {
    const linea = lineas.find((l) => l.id === id)
    if (!linea) return
    const valor = await pedirNumero({
      titulo: `Precio de ${linea.descripcion}`,
      detalle: `De lista: ${moneda.format(linea.precio_original)}`,
      etiqueta: 'Precio nuevo',
      valorInicial: String(linea.precio_unitario),
      aceptar: 'Aplicar',
    })
    if (valor === null) return
    if (valor < 0) return setError('El precio no es válido.')

    if (valor === linea.precio_original) {
      return setLineas((p) =>
        p.map((l) => (l.id === id ? { ...l, precio_unitario: valor, motivo_modificacion: null } : l)),
      )
    }

    // La base rechaza una línea con precio cambiado sin motivo. Se pide
    // acá para que el error no aparezca recién al enviar a caja.
    const motivo = await pedirTexto({
      titulo: '¿Por qué se modifica el precio?',
      detalle: `${linea.descripcion}\nDe ${moneda.format(linea.precio_original)} a ${moneda.format(valor)}`,
      etiqueta: 'Motivo',
      opciones: MOTIVOS_DE_PRECIO,
      permiteOtro: true,
      minimo: 3,
      aceptar: 'Aplicar',
    })
    if (!motivo) {
      return setError('Para cambiar el precio hay que indicar el motivo.')
    }
    setError(null)
    setLineas((p) =>
      p.map((l) => (l.id === id ? { ...l, precio_unitario: valor, motivo_modificacion: motivo } : l)),
    )
  }

  /*
    El presupuesto que el cliente se lleva a pensar.

    La venta se guarda en BORRADOR: no entra en la cola de la caja,
    porque nadie la está esperando para cobrar. Si el cliente vuelve, esa
    venta ya está armada y desde Presupuestos se manda a cobrar sin
    volver a cargar nada.

    Necesita conexión, y por eso el botón se apaga sin ella: un
    presupuesto que se guarda pero no se puede imprimir no le sirve a
    nadie — el cliente se tiene que ir con el papel en la mano.
  */
  const presupuestar = useMutation({
    mutationFn: async () => {
      const v = await enviarACaja(
        {
          estado: 'borrador',
          clienteId: cliente!.id,
          vendedorId: operador!.usuario_id,
          terminalId: terminal!.id,
          terminalPrefijo: terminal!.prefijo ?? 'T',
          lineas,
          observaciones: null,
          listaPrecioId: medio?.lista_precio_id ?? null,
          medioPagoId: medioAnticipado,
          cuotas: cuotasAnticipadas,
        },
        setPasoEnvio,
      )
      /*
        Con conexión conviene que la venta llegue antes: el servidor arma
        el comprobante sobre ella. Sin conexión no se espera nada — el
        presupuesto se guarda acá y viaja después, en el mismo lote y
        detrás de la venta.
      */
      if (navigator.onLine) await subirPendientes()
      const id = await emitirPresupuesto(v.id, terminal!.id, terminal!.prefijo ?? null)
      return { codigo: v.codigo, id }
    },
    onSuccess: ({ codigo, id }) => {
      setPasoEnvio(null)
      setLineas([])
      setMedioAnticipado(null)
      setCuotasAnticipadas(1)
      setError(null)
      setExito(`Presupuesto de la venta ${codigo} listo`)
      setTimeout(() => setExito(null), 4000)
      abrirNoFiscal(id)
      busqueda.current?.focus()
    },
    onError: (e) => {
      setPasoEnvio(null)
      setError(e instanceof Error ? e.message : 'No se pudo armar el presupuesto.')
    },
  })

  const enviar = useMutation({
    mutationFn: (nombreParaLlamar: string | null) =>
      enviarACaja({
        clienteId: cliente!.id,
        vendedorId: operador!.usuario_id,
        terminalId: terminal!.id,
        terminalPrefijo: terminal!.prefijo ?? 'T',
        lineas,
        observaciones: null,
        nombreParaLlamar,
        listaPrecioId: medio?.lista_precio_id ?? null,
        medioPagoId: medioAnticipado,
        cuotas: cuotasAnticipadas,
      }, setPasoEnvio),
    onSuccess: (v) => {
      setPasoEnvio(null)
      setLineas([])
      setMedioAnticipado(null)
      setCuotasAnticipadas(1)
      setError(null)
      setExito(
        navigator.onLine
          ? `Venta ${v.codigo} enviada a caja`
          : `Venta ${v.codigo} guardada — se envía cuando vuelva la conexión`,
      )
      setTimeout(() => setExito(null), 4000)
      /*
        Y se cierra la sesión del operador. Sugerencia 21 de Lucas,
        repetida el 07/09.

        No es seguridad de contraseña: el PIN es de cuatro dígitos y se
        tipea en un mostrador lleno de gente. Es atribución. Sin esto,
        el primer vendedor que pone su PIN a la mañana queda como autor
        de todo lo que carga cualquiera hasta que la pantalla se vence
        sola por inactividad — y entonces "quién vendió qué" no
        significa nada.

        Va acá y no antes: si se cerrara al apretar el botón, un error
        de la base dejaría la venta sin enviar y al vendedor afuera.
      */
      salir()
    },
    onError: (e) => {
      setPasoEnvio(null)
      setError(e instanceof Error ? e.message : 'No se pudo enviar.')
    },
  })

  if (cargandoTerminal) return <p className="text-sm text-piedra-500">Cargando…</p>

  if (!terminal) return <ElegirTerminal disponibles={disponibles} onElegir={elegir} />

  /*
    El PIN que autoriza la rebaja. Sugerencia 19 de Lucas.

    Se reusa la misma pantalla de identificación del mostrador en vez de
    inventar un segundo pedido de PIN: es el mismo gesto para la persona
    y, más importante, la misma verificación —servidor con conexión,
    verificador local sin ella— en un solo lugar.
  */
  if (autorizando) {
    const linea = lineas.find((l) => l.id === autorizando.lineaId)
    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-x-0 top-0 z-10 bg-marca-950 px-4 pt-6 text-center">
          <p className="text-sm text-marca-200">
            Autorizar {autorizando.porcentaje}% de descuento en {linea?.descripcion}
          </p>
          <p className="text-xs text-marca-300/70">
            {autorizando.motivo} · queda en {moneda.format(autorizando.precio)}
          </p>
        </div>
        <IdentificarOperador
          terminalId={terminal!.id}
          onIdentificado={(o) => aplicarRebaja(o.usuario_id)}
          onCancelar={() => setAutorizando(null)}
        />
      </div>
    )
  }

  if (!operador) {
    return (
      <div className="-m-6 min-h-[calc(100vh-3.5rem)]">
        <IdentificarOperador terminalId={terminal.id} onIdentificado={identificar} />
      </div>
    )
  }

  // Las líneas libres quedan afuera: no son productos del catálogo y no
  // tienen existencias con las que comparar.
  const sinStock = lineas.filter((l) => l.producto_id && l.cantidad > l.stock_disponible)

  /*
    Sin conexión y sin copia local no se puede vender, y hay que decirlo
    de frente. La versión anterior caía al servidor en silencio y la
    pantalla se quedaba "Buscando…" sin explicar nunca por qué.
  */
  if (!enLinea && !copiaLocalLista) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="rounded-xl bg-amber-50 p-6 ring-1 ring-amber-200">
          <h1 className="font-semibold text-amber-900">Esta computadora no puede vender sin conexión</h1>
          <p className="mt-2 text-sm text-amber-800">
            Todavía no tiene una copia local del catálogo. Hace falta conectarla a internet una vez
            y esperar a que el indicador de arriba diga <strong>Al día</strong>. Después va a poder
            trabajar desconectada.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full gap-4" onKeyDown={renovar}>
      {escribiendoLinea && (
        <LineaLibre onAgregar={agregarLibre} onCerrar={() => setEscribiendoLinea(false)} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-tinta">Punto de venta</h1>
            <p className="text-sm text-piedra-500">
              {terminal.nombre} · atiende{' '}
              <span className="font-medium text-tinta">{operador.nombre}</span>
              <button onClick={salir} className="ml-2 text-marca-700 hover:underline">
                cambiar
              </button>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!copiaLocalLista && enLinea && (
              <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 ring-1 ring-amber-300">
                {sincronizando ? 'Preparando copia local…' : 'Sin copia local todavía'}
              </span>
            )}
            {exito && (
              <span className="rounded-full bg-verde-100 px-3 py-1.5 text-sm font-medium text-verde-800 ring-1 ring-verde-200">
                {exito}
              </span>
            )}
          </div>
        </div>

        <div className="relative flex gap-2">
          <input
            ref={busqueda}
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escaneá un código de barra o buscá por nombre…"
            className="w-full rounded-xl border border-borde bg-white py-3 pr-4 pl-4 text-lg text-tinta shadow-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
          />

          {/*
            El producto comodín, pedido por Lucas el 07/09.

            Va al lado del buscador y no escondido en un menú: el momento
            en que hace falta es exactamente cuando el buscador no
            encontró nada, y ahí tiene que estar a la vista.
          */}
          <button
            onClick={() => setEscribiendoLinea(true)}
            title="Escribir una línea que no está en el catálogo"
            className="shrink-0 rounded-xl border border-borde bg-white px-4 text-sm font-medium text-piedra-600 shadow-sm hover:bg-piedra-50 hover:text-marca-700"
          >
            Escribir
          </button>

          {debounced.length >= 2 && (
            <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-xl bg-white shadow-lg ring-1 ring-borde">
              {resultados.isPending && (
                <p className="px-4 py-3 text-sm text-piedra-400">Buscando…</p>
              )}
              {!resultados.isPending && !resultados.data?.length && (
                <p className="px-4 py-3 text-sm text-piedra-400">Sin resultados.</p>
              )}
              {resultados.data?.map((p) => (
                <button
                  key={p.producto_id}
                  onClick={() => agregar(p)}
                  className="flex w-full items-center justify-between gap-4 border-b border-piedra-100 px-4 py-2.5 text-left last:border-0 hover:bg-marca-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-tinta">{p.nombre_interno}</p>
                    <p className="font-mono text-xs text-piedra-400">{p.codigo}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium tabular-nums text-tinta">
                      {moneda.format(p.precio_venta)}
                    </p>
                    <p
                      className={`text-xs tabular-nums ${
                        p.cantidad <= 0 ? 'text-red-600' : 'text-piedra-400'
                      }`}
                    >
                      {numero.format(p.cantidad)} {p.unidad_medida}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
          <div className="h-full overflow-y-auto">
            {!lineas.length ? (
              <p className="px-4 py-16 text-center text-sm text-piedra-400">
                Escaneá o buscá un producto para empezar.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Producto</th>
                    <th className="w-28 px-3 py-2.5 text-center font-medium">Cantidad</th>
                    <th className="w-32 px-3 py-2.5 text-right font-medium">Precio</th>
                    <th className="w-32 px-4 py-2.5 text-right font-medium">Importe</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-piedra-100">
                  {lineas.map((l) => {
                    // Una línea libre no tiene existencias: nunca falta.
                    const falta = !!l.producto_id && l.cantidad > l.stock_disponible
                    return (
                      <tr key={l.id} className={falta ? 'bg-amber-50/60' : ''}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-tinta">{l.descripcion}</p>
                          <p className="font-mono text-xs text-piedra-400">{l.codigo_producto}</p>
                          {falta && (
                            <p className="mt-0.5 text-xs text-amber-700">
                              Hay {numero.format(l.stock_disponible)} en stock
                            </p>
                          )}
                          {l.motivo_modificacion && (
                            <p className="mt-0.5 text-xs text-marca-700">
                              Precio modificado: {l.motivo_modificacion}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            min="0"
                            step={pasoCantidad(l.unidad_medida)}
                            value={l.cantidad}
                            onChange={(e) => cambiarCantidad(l.id, Number(e.target.value))}
                            className="w-full rounded-lg border border-borde px-2 py-1 text-center tabular-nums outline-none focus:border-marca-500"
                          />
                          {esFraccionable(l.unidad_medida) && (
                            <p className="mt-0.5 text-center text-xs text-piedra-400">
                              {l.unidad_medida}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/*
                              Sugerencia 19 de Lucas: descontar por
                              porcentaje. Va pegado al precio porque es
                              otra forma de decir lo mismo, y lleva su
                              propio botón porque "hacele el 10%" y
                              "dejámelo en 8.500" son dos gestos
                              distintos del vendedor.
                            */}
                            <button
                              onClick={() => descontarLinea(l.id)}
                              className="rounded px-1.5 py-0.5 text-xs font-medium text-piedra-400 hover:bg-marca-50 hover:text-marca-700"
                              title="Descontar un porcentaje"
                            >
                              %
                            </button>
                            <button
                              onClick={() => cambiarPrecio(l.id)}
                              className="tabular-nums text-tinta hover:text-marca-700 hover:underline"
                              title="Modificar el precio de esta línea"
                            >
                              {moneda.format(l.precio_unitario)}
                            </button>
                          </div>
                          {l.precio_unitario !== l.precio_original && (
                            <p className="text-xs text-piedra-400 line-through">
                              {moneda.format(l.precio_original)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums text-tinta">
                          {moneda.format(l.cantidad * l.precio_unitario)}
                        </td>
                        <td className="pr-3">
                          <button
                            onClick={() => cambiarCantidad(l.id, 0)}
                            className="rounded p-1 text-piedra-300 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Quitar ${l.descripcion}`}
                          >
                            <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <aside className="flex w-80 shrink-0 flex-col gap-4">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
          <p className="mb-2 text-xs font-medium tracking-wide text-piedra-400 uppercase">Cliente</p>
          {buscandoCliente ? (
            <div>
              <input
                autoFocus
                value={textoCliente}
                onChange={(e) => setTextoCliente(e.target.value)}
                placeholder="Nombre o documento…"
                className="w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm outline-none focus:border-marca-500"
              />
              <div className="mt-1 max-h-56 overflow-y-auto">
                {clientes.data?.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCliente(c)
                      setBuscandoCliente(false)
                      setTextoCliente('')
                      busqueda.current?.focus()
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-marca-50"
                  >
                    <span className="font-medium text-tinta">{c.nombre}</span>
                    {c.numero_documento && (
                      <span className="ml-1 text-xs text-piedra-400">{c.numero_documento}</span>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setBuscandoCliente(false)}
                className="mt-1 text-xs text-piedra-500 hover:underline"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setBuscandoCliente(true)}
              className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-piedra-50"
            >
              <span className="font-medium text-tinta">{cliente?.nombre ?? 'Cargando…'}</span>
              {cliente && cliente.descuento_porcentaje > 0 && (
                <span className="ml-2 rounded-full bg-verde-100 px-2 py-0.5 text-xs text-verde-800">
                  {numero.format(cliente.descuento_porcentaje)}% dto.
                </span>
              )}
              <span className="mt-0.5 block text-xs text-piedra-400">tocá para cambiar</span>
            </button>
          )}
        </div>

        {/*
          El vendedor pregunta cómo va a pagar antes de mandar a caja: le
          pide la tarjeta, mira si hay promoción, lo resuelve ahí. La caja
          recibe la venta con el precio correcto y el cliente no escucha
          dos números distintos. Se puede cambiar en la caja igual, porque
          la tarjeta puede no pasar.
        */}
        {lineas.length > 0 && (
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
            <p className="mb-2 text-xs font-medium tracking-wide text-piedra-400 uppercase">
              ¿Cómo va a pagar?
            </p>
            <div className="flex flex-wrap gap-1.5">
              {medios
                .filter((m) => m.tipo !== 'cuenta_corriente' || cliente?.cuenta_corriente)
                .flatMap((m: MedioPago) =>
                  m.admite_cuotas
                    ? Array.from({ length: m.cuotas_maximas }, (_, i) => i + 1).map((n) => ({
                        m,
                        n,
                        clave: `${m.id}-${n}`,
                        etiqueta: `${m.nombre} ${n}c`,
                      }))
                    : [{ m, n: 1, clave: m.id, etiqueta: m.nombre }],
                )
                .map(({ m, n, clave, etiqueta }) => {
                  const activo = medioAnticipado === m.id && cuotasAnticipadas === n
                  return (
                    <button
                      key={clave}
                      onClick={() => {
                        renovar()
                        if (activo) {
                          setMedioAnticipado(null)
                          setCuotasAnticipadas(1)
                        } else {
                          setMedioAnticipado(m.id)
                          setCuotasAnticipadas(n)
                        }
                      }}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition-colors ${
                        activo
                          ? 'bg-marca-700 text-white ring-marca-700'
                          : 'bg-white text-piedra-600 ring-borde hover:bg-piedra-50'
                      }`}
                    >
                      {etiqueta}
                    </button>
                  )
                })}
            </div>
            {!medio && (
              <p className="mt-2 text-xs text-piedra-400">
                Si no se elige, la caja decide y el total puede cambiar.
              </p>
            )}
          </div>
        )}

        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-piedra-500">
              <dt>{numero.format(totales.unidades)} unidades</dt>
              <dd className="tabular-nums">{moneda.format(totales.bruto)}</dd>
            </div>
            {totales.descuentoLineas > 0 && (
              <div className="flex justify-between text-marca-700">
                <dt>Ajustes de precio</dt>
                <dd className="tabular-nums">−{moneda.format(totales.descuentoLineas)}</dd>
              </div>
            )}
            {totales.descuentoCliente > 0 && (
              <div className="flex justify-between text-verde-700">
                <dt>Descuento del cliente</dt>
                <dd className="tabular-nums">−{moneda.format(totales.descuentoCliente)}</dd>
              </div>
            )}
            {/*
              Mientras no se sepa cómo paga, el número grande es el de
              tarjeta y el efectivo va debajo como beneficio: es como
              cotizan. Una vez elegido el medio, manda ese.
            */}
            <div className="flex items-baseline justify-between border-t border-borde pt-2">
              <dt className="font-medium text-tinta">
                {medio ? `Total ${medio.nombre.toLowerCase()}` : 'Total'}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums text-tinta">
                {moneda.format(medio ? totales.elegido : totales.conTarjeta)}
              </dd>
            </div>
            {!medio && listaTarjeta && listaTarjeta.ajuste_porcentaje !== 0 && totales.contado > 0 && (
              <div className="flex items-baseline justify-between rounded-lg bg-verde-50 px-2.5 py-1.5 ring-1 ring-verde-200">
                <dt className="text-sm font-medium text-verde-800">Pagando en efectivo</dt>
                <dd className="text-base font-semibold tabular-nums text-verde-800">
                  {moneda.format(totales.contado)}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {sinStock.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800 ring-1 ring-amber-200">
            {sinStock.length === 1 ? 'Un producto supera' : `${sinStock.length} productos superan`} el
            stock disponible. Se puede vender igual: el sistema lo va a marcar como sobrevendido para
            que alguien lo revise.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}

        <button
          onClick={async () => {
            /*
              Antes de mandarla, cómo llamar a la persona en la caja.
              Sugerencia 15 de Lucas.

              El campo puede quedar vacío: hay ventas donde el cliente
              está parado al lado del cajero y no hace falta nombrar a
              nadie. Enter manda igual. Lo que NO manda es Cancelar —
              ahí se vuelve a la venta, que es lo que se espera de un
              botón que dice Cancelar.

              Obligar a escribir un nombre sería agregarle un paso a la
              operación más frecuente del mostrador para resolver un
              caso que no siempre existe.
            */
            const nombre = await pedirTexto({
              titulo: '¿Cómo lo llamamos en la caja?',
              detalle: `${totales.unidades} ${totales.unidades === 1 ? 'unidad' : 'unidades'} · ${moneda.format(totales.elegido)}

Se muestra en la cola del cajero. Si no hace falta, dejalo vacío.`,
              etiqueta: 'Nombre o seña',
              ejemplo: 'Juan · el de la camioneta blanca',
              aceptar: 'Enviar a caja',
            })
            if (nombre === null) return
            enviar.mutate(nombre || null)
          }}
          disabled={!lineas.length || !cliente || enviar.isPending || presupuestar.isPending}
          className="rounded-xl bg-marca-700 px-4 py-4 text-base font-medium text-white hover:bg-marca-600 disabled:opacity-40"
        >
          {enviar.isPending ? `Enviando… ${pasoEnvio ?? ''}` : 'Enviar a caja'}
        </button>

        {/*
          El presupuesto va debajo y en segundo plano: lo habitual es
          cobrar. Pero está a la vista, porque el cliente lo pide en el
          momento y mandarlo a otra pantalla sería perderlo.
        */}
        <button
          onClick={() => presupuestar.mutate()}
          disabled={!lineas.length || !cliente || enviar.isPending || presupuestar.isPending}
          className="rounded-xl border border-borde px-4 py-2.5 text-sm font-medium text-tinta hover:bg-piedra-50 disabled:opacity-40"
        >
          {presupuestar.isPending ? `Armando… ${pasoEnvio ?? ''}` : 'Hacer un presupuesto'}
        </button>

        {!enLinea && lineas.length > 0 && (
          <p className="text-xs text-piedra-500">
            Sin conexión el presupuesto se imprime igual y viaja cuando vuelva internet.
          </p>
        )}

        {lineas.length > 0 && (
          <button
            onClick={async () => {
              const sigue = await confirmar({
                titulo: '¿Descartar la venta en curso?',
                detalle: `Se pierden las ${lineas.length} ${lineas.length === 1 ? 'línea' : 'líneas'} cargadas.`,
                aceptar: 'Descartar',
                peligro: true,
              })
              if (sigue) setLineas([])
            }}
            className="text-sm text-piedra-500 hover:text-red-600 hover:underline"
          >
            Descartar venta
          </button>
        )}
      </aside>
    </div>
  )
}

function ElegirTerminal({
  disponibles,
  onElegir,
}: {
  disponibles: { id: string; nombre: string; tipo: string; prefijo: string | null }[]
  onElegir: (t: never) => void
}) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-12">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-tinta">¿Qué terminal es esta máquina?</h1>
        <p className="mt-1 text-sm text-piedra-500">
          Se elige una vez por computadora. Define el prefijo de numeración y, en las cajas, a qué
          impresora sale el comprobante.
        </p>
      </div>
      <div className="space-y-2">
        {disponibles.map((t) => (
          <button
            key={t.id}
            onClick={() => onElegir(t as never)}
            className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-borde hover:ring-marca-400"
          >
            <span className="font-medium text-tinta">{t.nombre}</span>
            <span className="text-xs text-piedra-400">
              {t.tipo} · {t.prefijo}
            </span>
          </button>
        ))}
        {!disponibles.length && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
            No hay terminales configuradas. Hay que darlas de alta antes de poder vender.
          </p>
        )}
      </div>
    </div>
  )
}
