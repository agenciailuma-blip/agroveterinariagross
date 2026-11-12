import { Link } from 'react-router-dom'
import { esPrecioAConvenir } from '@/lib/api/remitoInterno'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTerminal } from '@/lib/terminal'
import { IdentificarOperador, useOperador } from '@/components/IdentificarOperador'
import {
  buscarClientes,
  buscarProductosVenta,
  clienteConsumidorFinal,
  enviarACaja,
  esFraccionable,
  leerCantidad,
} from '@/lib/api/ventas'
import type { ClienteVenta, LineaVenta, ProductoVenta } from '@/lib/api/ventas'
import { clienteDesdeArca } from '@/lib/api/clientes'
import { autorizarVencidoEnCaja, cajaAbierta, deudaVencida } from '@/lib/api/caja'
import { mandarALaCola } from '@/lib/api/ventas'
import type { Operador } from '@/lib/api/ventas'
import CobroDeVenta from '@/components/CobroDeVenta'
import { cuitValido } from '@/lib/api/cheques'
import { cargarPrecios, mediosParaElegir, previsualizarPrecio } from '@/lib/api/precios'
import type { MedioPago } from '@/lib/api/precios'
import { useSync } from '@/lib/local/SyncProvider'
import { subirPendientes } from '@/lib/local/sync'
import { listaConfig, valorConfig } from '@/lib/local/consultas'
import AsociarProductos from '@/components/AsociarProductos'
import { totalesPorConcepto } from '@/lib/conceptos'
import { emitirPresupuesto, emitirRemitoDirecto, numeroNoFiscal } from '@/lib/api/noFiscal'
import { useAuth } from '@/auth/AuthProvider'
import AvisoVencido from '@/components/AvisoVencido'
import { ConsultaFiado } from '@/components/CamposFiado'
import { abrirNoFiscal } from '@/lib/escritorio'
import { moneda, numero } from '@/lib/tipos'
import { confirmar, pedirNumero, pedirTexto } from '@/components/Dialogo'
import { MOTIVOS_DE_PRECIO } from '@/lib/motivos'
import LineaLibre from '@/components/LineaLibre'
import type { DatosLineaLibre } from '@/components/LineaLibre'
import { useAtajo, useBotonConAtajo } from '@/lib/atajos'
import { TeclaAtajo } from '@/components/Atajos'
import { primeroElCodigoExacto, useEscribirEnElBuscador, useListaConFlechas } from '@/lib/buscador'

const BORRADOR = 'gross.venta-en-curso'

/* El botón grande es lo que se hace siempre con ese cliente; el otro queda a mano. */
const PRINCIPAL =
  'rounded-xl bg-marca-700 px-4 py-4 text-base font-medium text-white hover:bg-marca-600 disabled:opacity-40'
const SECUNDARIO =
  'rounded-xl border border-borde px-4 py-2.5 text-sm font-medium text-tinta hover:bg-piedra-50 disabled:opacity-40'

/** El cobro en el puesto que está en curso, recordado por si se cierra el programa. */
const COBRANDO = 'gross.mostrador.cobrando'
interface Cobrando {
  ventaId: string | null
  codigo: string
  cajaId: string
  operador: Operador
}

export default function PuntoDeVenta() {
  const { terminal, disponibles, cargando: cargandoTerminal, elegir } = useTerminal()
  const { operador, identificar, salir, renovar } = useOperador()
  const { listo: copiaLocalLista, enLinea, sincronizando } = useSync()
  const { tienePermiso } = useAuth()

  /*
    Vender y cobrar en el mismo puesto, aprobado el 11/11.

    La venta se arma igual que siempre y se manda a la caja; en vez de
    esperar en la cola, se cobra ahí mismo. Quien puso el PIN queda como
    vendedor y como cajero. El efectivo va al cajón de la caja del local,
    que es una sola para todos los puestos.

    Se guarda el operador del momento: el cobro tiene que quedar a nombre
    de quien vendió aunque el PIN se venza mientras tanto.
  */
  const [cobrando, setCobrandoEstado] = useState<Cobrando | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(COBRANDO) ?? 'null') as Cobrando | null
    } catch {
      return null
    }
  })
  /*
    Recordado en la máquina: la venta se arma en borrador y no está en
    la cola. Si el programa se cierra a mitad del cobro, al volver se
    retoma acá en lugar de quedar perdida.
  */
  function setCobrando(c: Cobrando | null | ((c: Cobrando | null) => Cobrando | null)) {
    setCobrandoEstado((antes) => {
      const nuevo = typeof c === 'function' ? c(antes) : c
      try {
        if (nuevo?.ventaId) localStorage.setItem(COBRANDO, JSON.stringify(nuevo))
        else localStorage.removeItem(COBRANDO)
      } catch {
        // Sin lugar para guardarlo: el cobro sigue igual.
      }
      return nuevo
    })
  }
  const puedeCobrar = tienePermiso('ventas.cobrar')

  const [lineas, setLineas] = useState<LineaVenta[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(BORRADOR) ?? '[]') as LineaVenta[]
    } catch {
      return []
    }
  })
  const [cliente, setCliente] = useState<ClienteVenta | null>(null)
  /*
    Respuesta 7 de Lucas: el aviso apenas se elige al cliente. El freno
    está en la caja, que es donde la venta se pone a cuenta corriente;
    acá el vendedor se entera antes de armarle la venta.
  */
  const vencido = useQuery({
    queryKey: ['vencido-cc', cliente?.id],
    queryFn: () => deudaVencida(cliente!.id),
    enabled: !!cliente?.cuenta_corriente,
  })
  /*
    El remito interno (fase-03, punto 2): la mercadería sale ahora y el
    precio se pone después, en Pendientes de facturar. Con deuda vencida
    lo autoriza un encargado con su PIN, igual que en la caja.
  */
  const [quiereRemito, setQuiereRemito] = useState(false)
  const [autorizoRemito, setAutorizoRemito] = useState<{ usuario_id: string; nombre: string } | null>(null)
  useEffect(() => {
    setQuiereRemito(false)
    setAutorizoRemito(null)
  }, [cliente?.id])
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [textoCliente, setTextoCliente] = useState('')
  const [consultandoArca, setConsultandoArca] = useState(false)
  const [errorArca, setErrorArca] = useState<string | null>(null)
  const [medioAnticipado, setMedioAnticipado] = useState<string | null>(null)
  const [cuotasAnticipadas, setCuotasAnticipadas] = useState(1)
  const [texto, setTexto] = useState('')
  const [debounced, setDebounced] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [pasoEnvio, setPasoEnvio] = useState<string | null>(null)
  const busqueda = useRef<HTMLInputElement>(null)

  // F2 vuelve al buscador, F3 abre el del cliente y F10 manda a caja.
  useAtajo('F2', () => {
    busqueda.current?.focus()
    busqueda.current?.select()
  })
  useAtajo('F3', () => setBuscandoCliente(true))
  const botonEnviar = useBotonConAtajo('F10')
  /*
    F10 es lo principal de la pantalla. Para quien cobra, lo principal es
    Cobrar —y en la pantalla de cobro F10 confirma, así que F10 y F10
    cobra—; «Enviar a caja» pasa a F9. Para quien no cobra, sigue en F10.
  */
  const botonF9 = useBotonConAtajo('F9')

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
  const [decimalesEnTodos, setDecimalesEnTodos] = useState(false)
  useEffect(() => {
    valorConfig('ventas.pedir_cantidad_al_agregar', 1).then((v) => setPedirCantidad(v === 1))
    valorConfig('ventas.decimales_en_todos', 0).then((v) => setDecimalesEnTodos(v === 1))
  }, [copiaLocalLista])

  /*
    Productos asociados (fase-03, punto 3): F11 abre la ventana para
    marcar renglones y elegir el concepto con que los muestra la
    factura. La lista de conceptos se edita en Configuración y se lee de
    la copia local, como todo lo del mostrador.
  */
  const [conceptos, setConceptos] = useState<string[]>([])
  const [asociando, setAsociando] = useState(false)
  useEffect(() => {
    listaConfig('ventas.conceptos_asociados', ['Repuestos pulverizadora', 'Fumigación', 'Veneno']).then(setConceptos)
  }, [copiaLocalLista])
  useAtajo('F11', () => {
    if (lineas.length && conceptos.length) setAsociando(true)
  })

  function asociar(ids: string[], concepto: string | null) {
    renovar()
    setLineas((prev) => prev.map((l) => (ids.includes(l.id) ? { ...l, concepto } : l)))
    setAsociando(false)
  }

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

  /*
    El teclado del mostrador, pedido en la reunión del 05/11 (ver
    lib/buscador.ts): flechas y Enter en los resultados, una letra en
    cualquier lado vuelve a buscar, y Tab va del buscador al cliente.
  */
  const encontrados = useMemo(
    () => primeroElCodigoExacto(resultados.data ?? [], debounced),
    [resultados.data, debounced],
  )
  const flechasProductos = useListaConFlechas(encontrados, (p) => void agregar(p))
  useEscribirEnElBuscador(busqueda)

  const botonCliente = useRef<HTMLButtonElement>(null)
  const zonaDePago = useRef<HTMLDivElement>(null)

  /*
    Enter antes de que aparezca la lista. El lector de códigos manda el
    código y el Enter enseguida, antes de que la búsqueda termine: se
    busca ahí mismo lo escrito y, si es uno solo —el código de barra, el
    código exacto—, entra. Si son varios, se muestra la lista ya.
  */
  async function agregarLoEscrito() {
    const escrito = texto.trim()
    if (!escrito) return
    const lista = primeroElCodigoExacto(await buscarProductosVenta(escrito), escrito)
    if (lista.length === 1 || lista[0]?.codigo.trim().toLowerCase() === escrito.toLowerCase()) {
      await agregar(lista[0])
      return
    }
    setDebounced(escrito)
  }

  function teclasDelBuscador(e: KeyboardEvent<HTMLInputElement>) {
    // Del buscador al cliente: los renglones se saltean. Elegido el
    // cliente, el próximo paso es cómo paga y enviar a caja.
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      if (buscandoCliente) document.getElementById('buscador-de-cliente')?.focus()
      else botonCliente.current?.focus()
      return
    }
    const listaAlDia = debounced === texto.trim() && !resultados.isFetching
    if (e.key === 'Enter' && !listaAlDia) {
      e.preventDefault()
      void agregarLoEscrito()
      return
    }
    flechasProductos.teclas(e)
  }

  /*
    Elegido el cliente, el cursor va a cómo paga si ya hay productos: es
    lo que sigue antes de enviar. Sin productos, vuelve al buscador.
  */
  function elegirCliente(c: ClienteVenta) {
    setCliente(c)
    setBuscandoCliente(false)
    setTextoCliente('')
    const primerMedio = zonaDePago.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    if (lineas.length && primerMedio) primerMedio.focus()
    else busqueda.current?.focus()
  }
  const flechasClientes = useListaConFlechas(clientes.data, elegirCliente)

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

    /*
      «Accesorios varios» y los demás que en la góndola son muchos: el
      precio se pregunta acá y es el de este renglón. Va como precio de
      lista del renglón —igual que una línea escrita a mano—, así que no
      pide motivo: nadie se aparta de un precio, el precio es éste.
    */
    let precio = p.precio_venta
    if (p.precio_en_cada_venta) {
      const escrito = await pedirNumero({
        titulo: p.nombre_interno,
        detalle: 'Cada uno va en su renglón, con su precio.',
        etiqueta: 'Precio',
        aceptar: 'Seguir',
      })
      if (escrito === null) {
        busqueda.current?.focus()
        return
      }
      if (!(escrito > 0)) {
        setError('El precio tiene que ser mayor que cero.')
        busqueda.current?.focus()
        return
      }
      precio = Math.round(escrito * 100) / 100
    }

    let cuantos = 1
    if (pedirCantidad) {
      const pedido = await pedirNumero({
        titulo: p.nombre_interno,
        detalle: `${moneda.format(precio)} por ${p.unidad_medida} · quedan ${numero.format(p.cantidad)}${
          p.sueltas !== undefined ? ` (${numero.format(p.sueltas)} sueltas)` : ''
        }`,
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
      cuantos = esFraccionable(p.unidad_medida, decimalesEnTodos) ? pedido : Math.round(pedido)
      if (cuantos <= 0) {
        setError(`${p.nombre_interno} se vende por unidad: la cantidad va sin decimales.`)
        busqueda.current?.focus()
        return
      }
    }

    setLineas((prev) => {
      // El de precio en cada venta nunca se suma: cada uno es otra cosa de la góndola.
      const existente = !p.precio_en_cada_venta && prev.find((l) => l.producto_id === p.producto_id && !l.precio_en_cada_venta)
      if (existente) {
        return prev.map((l) =>
          l.id === existente.id ? { ...l, cantidad: l.cantidad + cuantos } : l,
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
          precio_original: precio,
          precio_unitario: precio,
          motivo_modificacion: null,
          autorizado_por: null,
          alicuota_iva_id: p.alicuota_iva_id,
          condicion_iva: p.condicion_iva,
          stock_disponible: p.cantidad,
          ...(p.precio_en_cada_venta ? { precio_en_cada_venta: true } : {}),
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
              cantidad: esFraccionable(l.unidad_medida, decimalesEnTodos) ? cantidad : Math.round(cantidad),
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

  const remitoInterno = useMutation({
    mutationFn: () =>
      emitirRemitoDirecto(
        cliente!.id,
        lineas.map((l) => ({
          producto_id: l.producto_id,
          codigo: l.codigo_producto,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
        })),
        {
          facturarDespues: true,
          vencidoAutorizadoPor: autorizoRemito?.usuario_id ?? null,
          terminalId: terminal!.id,
          serie: terminal!.prefijo ?? null,
        },
      ),
    onSuccess: ({ id, serie, numero }) => {
      setLineas([])
      setMedioAnticipado(null)
      setCuotasAnticipadas(1)
      setQuiereRemito(false)
      setAutorizoRemito(null)
      setError(null)
      setExito(`${numeroNoFiscal('remito', serie, numero)} listo. Queda en Pendientes de facturar.`)
      setTimeout(() => setExito(null), 4000)
      abrirNoFiscal(id)
      // Como al enviar a caja: el remito queda a nombre de quien lo hizo.
      salir()
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo hacer el remito.'),
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

  const cobrarAca = useMutation({
    mutationFn: async () => {
      const caja = await cajaAbierta()
      if (!caja) throw new Error('La caja no está abierta: la abre el encargado desde Caja.')
      // En borrador: no entra a la cola de la Caja mientras se cobra acá.
      const v = await enviarACaja(
        {
          estado: 'borrador',
          clienteId: cliente!.id,
          vendedorId: operador!.usuario_id,
          terminalId: terminal!.id,
          terminalPrefijo: terminal!.prefijo ?? 'T',
          lineas,
          observaciones: null,
          nombreParaLlamar: null,
          listaPrecioId: medio?.lista_precio_id ?? null,
          medioPagoId: medioAnticipado,
          cuotas: cuotasAnticipadas,
        },
        setPasoEnvio,
      )
      // Con conexión, que la venta llegue antes de cobrarla: el cobro y la
      // factura se arman en el servidor sobre ella.
      if (navigator.onLine) await subirPendientes()
      return { venta: v, caja }
    },
    onSuccess: ({ venta, caja }) => {
      setPasoEnvio(null)
      setLineas([])
      setMedioAnticipado(null)
      setCuotasAnticipadas(1)
      setError(null)
      setCobrando({ ventaId: venta.id, codigo: venta.codigo, cajaId: caja.id, operador: operador! })
    },
    onError: (e) => {
      setPasoEnvio(null)
      setError(e instanceof Error ? e.message : 'No se pudo cobrar.')
    },
  })

  /*
    Se cierra el cobro: el PIN también, como al enviar a caja, para que
    la próxima venta quede a nombre de quien la haga.
  */
  async function terminarCobro(sinCobrar: boolean) {
    if (sinCobrar && cobrando?.ventaId) {
      try {
        await mandarALaCola(cobrando.ventaId, cobrando.codigo)
        setExito(`Venta ${cobrando.codigo} sin cobrar: quedó en la cola de la caja`)
        setTimeout(() => setExito(null), 5000)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo mandar la venta a la caja.')
        return
      }
    }
    setCobrando(null)
    salir()
    busqueda.current?.focus()
  }

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

  /*
    Cobrando en el puesto. Va antes de pedir el PIN: si se vence mientras
    se cobra, el cobro sigue a nombre de quien vendió.
  */
  if (cobrando)
    return (
      <div className="flex flex-col gap-3 lg:h-full">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Cobrar venta {cobrando.codigo}</h1>
          <p className="text-sm text-piedra-500">
            {terminal.nombre} · <span className="font-medium text-tinta">{cobrando.operador.nombre}</span>
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <CobroDeVenta
            ventaId={cobrando.ventaId}
            cajaId={cobrando.cajaId}
            terminal={terminal}
            operador={cobrando.operador}
            sinVenta={
              <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-borde bg-white/60 py-10">
                <p className="text-sm text-piedra-500">Venta {cobrando.codigo} cobrada.</p>
                <button autoFocus onClick={() => void terminarCobro(false)} className={PRINCIPAL}>
                  Nueva venta
                </button>
              </div>
            }
            onTerminada={() => setCobrando((c) => (c ? { ...c, ventaId: null } : c))}
            onCancelar={() => void terminarCobro(true)}
          />
        </div>
      </div>
    )

  if (!operador) {
    return (
      <div className="-m-4 min-h-[calc(100vh-3.5rem)] md:-m-6">
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

  /*
    En la PC el panel del cliente y el total va a la derecha con 20 rem
    fijos. Debajo de lg no entra al lado de la tabla: va debajo, a todo
    el ancho, y la página se desplaza hacia abajo. Medido el 15/10.
  */
  /*
    El remito interno, para el cliente de cuenta corriente que se lleva
    la mercadería y el precio se arregla después. Con la marca «Precio a
    convenir» es lo primero que se ofrece, con su F10; mandarlo a la caja
    queda abajo. Sin la marca, al revés.
  */
  const aConvenir = esPrecioAConvenir(cliente)
  const bloqueRemitoInterno = cliente?.cuenta_corriente && lineas.length > 0 && tienePermiso('facturacion.no_fiscal_emitir') && (
          <div>
            <button
              onClick={async () => {
                if ((vencido.data?.monto ?? 0) > 0 && !autorizoRemito) {
                  setQuiereRemito(true)
                  return
                }
                const sigue = await confirmar({
                  titulo: `¿Remito interno a ${cliente.nombre}?`,
                  detalle: `${numero.format(totales.unidades)} ${totales.unidades === 1 ? 'unidad' : 'unidades'}. Sale sin precio y descuenta stock. Se factura después desde Pendientes de facturar.`,
                  aceptar: 'Hacer el remito',
                })
                if (sigue) remitoInterno.mutate()
              }}
              disabled={
                lineas.some((l) => !l.producto_id) ||
                enviar.isPending ||
                presupuestar.isPending ||
                remitoInterno.isPending
              }
              ref={aConvenir ? botonEnviar : undefined}
              className={`w-full ${aConvenir ? PRINCIPAL : SECUNDARIO}`}
            >
              {remitoInterno.isPending ? (
                'Haciendo el remito…'
              ) : (
                <>
                  Remito interno · precio después
                  {aConvenir && <TeclaAtajo tecla="F10" clara />}
                </>
              )}
            </button>
            {lineas.some((l) => !l.producto_id) && (
              <p className="mt-1 text-xs text-piedra-500">
                Lleva sólo productos del catálogo: sacá las líneas escritas a mano.
              </p>
            )}
            {(quiereRemito || autorizoRemito) && vencido.data && vencido.data.monto > 0 && (
              <AvisoVencido
                vencido={vencido.data}
                aCuentaCorriente
                autorizo={autorizoRemito}
                onAutorizar={async (pin) => setAutorizoRemito(await autorizarVencidoEnCaja(pin, terminal.id))}
              />
            )}
          </div>
        )

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:flex-row" onKeyDown={renovar}>
      {asociando && (
        <AsociarProductos
          lineas={lineas}
          conceptos={conceptos}
          onAsociar={asociar}
          onCerrar={() => setAsociando(false)}
        />
      )}

      {escribiendoLinea && (
        <LineaLibre onAgregar={agregarLibre} onCerrar={() => setEscribiendoLinea(false)} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-tinta">Punto de venta</h1>
            <p className="text-sm text-piedra-500">
              <Link
                to="/configuracion?pestana=computadora"
                title="Cambiar el puesto de esta computadora"
                className="hover:text-marca-700 hover:underline"
              >
                {terminal.nombre}
              </Link>{' '}
              · atiende{' '}
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
            onKeyDown={teclasDelBuscador}
            placeholder="Escaneá un código de barra o buscá por nombre…"
            className="w-full min-w-0 rounded-xl border border-borde bg-white py-3 pr-4 pl-4 text-lg text-tinta shadow-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
          />

          {/*
            El producto comodín, pedido por Lucas el 07/09.

            Va al lado del buscador y no escondido en un menú: el momento
            en que hace falta es exactamente cuando el buscador no
            encontró nada, y ahí tiene que estar a la vista.
          */}
          <button
            onClick={() => setEscribiendoLinea(true)}
            // El Tab del buscador va al cliente, no acá: se llega con el mouse.
            tabIndex={-1}
            title="Escribir una línea que no está en el catálogo"
            className="shrink-0 rounded-xl border border-borde bg-white px-4 text-sm font-medium text-piedra-600 shadow-sm hover:bg-piedra-50 hover:text-marca-700"
          >
            Escribir
          </button>

          {debounced.length >= 2 && (
            <div
              ref={(el) => {
                flechasProductos.lista.current = el
              }}
              className="absolute top-full right-0 left-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-xl bg-white shadow-lg ring-1 ring-borde"
            >
              {resultados.isPending && (
                <p className="px-4 py-3 text-sm text-piedra-400">Buscando…</p>
              )}
              {!resultados.isPending && !resultados.data?.length && (
                <p className="px-4 py-3 text-sm text-piedra-400">Sin resultados.</p>
              )}
              {encontrados.map((p, i) => (
                <button
                  key={p.producto_id}
                  onClick={() => agregar(p)}
                  onMouseMove={() => flechasProductos.setMarcado(i)}
                  tabIndex={-1}
                  data-marcado={i === flechasProductos.marcado}
                  className={`flex w-full items-center justify-between gap-4 border-b border-piedra-100 px-4 py-2.5 text-left last:border-0 ${
                    i === flechasProductos.marcado ? 'bg-marca-50' : ''
                  }`}
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
                    {/* Una suelta: cuántas hay sueltas; el resto sale de abrir una caja. */}
                    {p.sueltas !== undefined && (
                      <p className="text-[11px] tabular-nums text-piedra-400">
                        {numero.format(p.sueltas)} sueltas
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/*
          La tabla mira el ancho que le queda, no el de la pantalla.

          Al lado del panel de 20 rem, a 1024 px a la tabla le quedan unos
          400 px y sus columnas fijas sumaban 408 más el nombre: se
          desplazaba hacia el costado (visto el 30/09, medido el 15/10).
          Por eso es un contenedor: cuando tiene menos de 32 rem, el
          importe deja de ser columna y pasa debajo del precio.

          Y con menos de 24 rem —el teléfono, con todo apilado— se
          ajusta más: márgenes chicos, «Cant.», el % arriba del precio y
          el nombre que puede cortarse en cualquier letra. A 375 px se
          pasaba 6 px (medido el 15/10).
        */}
        <div className="@container min-h-0 flex-1 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
          <div className="h-full overflow-y-auto">
            {!lineas.length ? (
              <p className="px-4 py-16 text-center text-sm text-piedra-400">
                Escaneá o buscá un producto para empezar.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
                  <tr>
                    <th className="px-2 py-2.5 font-medium @sm:px-4">Producto</th>
                    <th className="w-16 px-1.5 py-2.5 text-center font-medium @sm:w-24 @sm:px-3">
                      <span className="@sm:hidden">Cant.</span>
                      <span className="hidden @sm:inline">Cantidad</span>
                    </th>
                    <th className="w-24 px-1.5 py-2.5 text-right font-medium @sm:w-32 @sm:px-3">Precio</th>
                    <th className="hidden w-32 px-4 py-2.5 text-right font-medium @lg:table-cell">Importe</th>
                    <th className="w-8 @sm:w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-piedra-100">
                  {lineas.map((l) => {
                    // Una línea libre no tiene existencias: nunca falta.
                    const falta = !!l.producto_id && l.cantidad > l.stock_disponible
                    return (
                      <tr key={l.id} className={falta ? 'bg-amber-50/60' : ''}>
                        <td className="px-2 py-2.5 @sm:px-4">
                          <p className="font-medium [overflow-wrap:anywhere] text-tinta">{l.descripcion}</p>
                          <p className="font-mono text-xs [overflow-wrap:anywhere] text-piedra-400">{l.codigo_producto}</p>
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
                          {l.concepto && (
                            <p className="mt-0.5 text-xs [overflow-wrap:anywhere] text-marca-700">
                              Se factura como {l.concepto}
                            </p>
                          )}
                        </td>
                        <td className="px-1.5 py-2.5 @sm:px-3">
                          <CampoCantidad
                            valor={l.cantidad}
                            decimales={esFraccionable(l.unidad_medida, decimalesEnTodos)}
                            onCambio={(n) => cambiarCantidad(l.id, n)}
                          />
                          {esFraccionable(l.unidad_medida) && (
                            <p className="mt-0.5 text-center text-xs text-piedra-400">
                              {l.unidad_medida}
                            </p>
                          )}
                        </td>
                        <td className="px-1.5 py-2.5 text-right @sm:px-3">
                          <div className="flex flex-col items-end gap-0.5 @sm:flex-row @sm:items-center @sm:justify-end @sm:gap-1.5">
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
                          {/* Sin la columna del importe, va acá cuando no es el mismo precio. */}
                          {l.cantidad !== 1 && (
                            <p className="text-xs font-medium tabular-nums text-tinta @lg:hidden">
                              {moneda.format(l.cantidad * l.precio_unitario)}
                            </p>
                          )}
                        </td>
                        <td className="hidden px-4 py-2.5 text-right font-medium tabular-nums text-tinta @lg:table-cell">
                          {moneda.format(l.cantidad * l.precio_unitario)}
                        </td>
                        <td className="pr-1 @sm:pr-3">
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

      <aside className="flex flex-col gap-4 lg:w-80 lg:shrink-0">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
          <p className="mb-2 text-xs font-medium tracking-wide text-piedra-400 uppercase">Cliente</p>
          {buscandoCliente ? (
            <div>
              <input
                id="buscador-de-cliente"
                autoFocus
                value={textoCliente}
                onChange={(e) => {
                  setTextoCliente(e.target.value)
                  setErrorArca(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setBuscandoCliente(false)
                    setTimeout(() => botonCliente.current?.focus())
                    return
                  }
                  if (flechasClientes.teclas(e)) return
                  // Un CUIT que no está entre los clientes: Enter lo trae de ARCA.
                  if (e.key === 'Enter') document.getElementById('traer-de-arca')?.click()
                }}
                placeholder="Nombre, documento o CUIT…"
                className="w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm outline-none focus:border-marca-500"
              />
              <div
                ref={(el) => {
                  flechasClientes.lista.current = el
                }}
                className="mt-1 max-h-56 overflow-y-auto"
              >
                {clientes.data?.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => elegirCliente(c)}
                    onMouseMove={() => flechasClientes.setMarcado(i)}
                    tabIndex={-1}
                    data-marcado={i === flechasClientes.marcado}
                    className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                      i === flechasClientes.marcado ? 'bg-marca-50' : ''
                    }`}
                  >
                    <span className="font-medium text-tinta">{c.nombre}</span>
                    {c.numero_documento && (
                      <span className="ml-1 text-xs text-piedra-400">{c.numero_documento}</span>
                    )}
                  </button>
                ))}
              </div>
              {/*
                El cliente que dice «factura A» y da su CUIT. Si no está
                entre los clientes, se trae de ARCA y queda elegido: nadie
                le pregunta si es responsable inscripto.
              */}
              {cuitValido(textoCliente) &&
                !clientes.data?.some(
                  (c) => (c.numero_documento ?? '').replace(/\D/g, '') === textoCliente.replace(/\D/g, ''),
                ) && (
                  <button
                    onClick={async () => {
                      setConsultandoArca(true)
                      setErrorArca(null)
                      const r = await clienteDesdeArca(textoCliente)
                      setConsultandoArca(false)
                      if (!r.ok) {
                        setErrorArca(r.error)
                        return
                      }
                      elegirCliente(r.cliente as ClienteVenta)
                    }}
                    id="traer-de-arca"
                    disabled={consultandoArca}
                    className="mt-1 block w-full rounded-lg bg-marca-50 px-2 py-1.5 text-left text-sm font-medium text-marca-700 ring-1 ring-marca-200 hover:bg-marca-100 disabled:opacity-60"
                  >
                    {consultandoArca ? 'Consultando a ARCA…' : 'Traer de ARCA y agregarlo'}
                  </button>
                )}
              {errorArca && (
                <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800 ring-1 ring-amber-200">
                  {errorArca}
                </p>
              )}
              <button
                onClick={() => setBuscandoCliente(false)}
                className="mt-1 text-xs text-piedra-500 hover:underline"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              ref={botonCliente}
              onClick={() => setBuscandoCliente(true)}
              className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-piedra-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-marca-500"
            >
              <span className="font-medium text-tinta">{cliente?.nombre ?? 'Cargando…'}</span>
              {cliente && cliente.descuento_porcentaje > 0 && (
                <span className="ml-2 rounded-full bg-verde-100 px-2 py-0.5 text-xs text-verde-800">
                  {numero.format(cliente.descuento_porcentaje)}% dto.
                </span>
              )}
              {aConvenir && (
                <span className="ml-2 rounded-full bg-marca-50 px-2 py-0.5 text-xs text-marca-700">Precio a convenir</span>
              )}
              <span className="mt-0.5 block text-xs text-piedra-400">
                {cliente?.condicion_iva_id === 1 ? 'Responsable Inscripto · Factura A · ' : ''}tocá para cambiar
              </span>
            </button>
          )}
          {!buscandoCliente && cliente?.cuenta_corriente && (vencido.data?.monto ?? 0) > 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800 ring-1 ring-amber-200">
              Debe {moneda.format(vencido.data!.monto)} vencido
              {vencido.data!.desde
                ? ` desde el ${new Date(`${vencido.data!.desde}T12:00:00`).toLocaleDateString('es-AR')}`
                : ''}
              . A cuenta corriente, en la caja lo tiene que autorizar un encargado.
            </p>
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
            <div ref={zonaDePago} className="flex flex-wrap gap-1.5">
              {mediosParaElegir(medios)
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
            {medio?.tipo === 'fiado' && tienePermiso('fiados.ver') && <ConsultaFiado />}
          </div>
        )}

        {totalesPorConcepto(lineas).length > 0 && (
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">Se factura como</p>
              <button
                onClick={() => setAsociando(true)}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50"
              >
                Cambiar
                <TeclaAtajo tecla="F11" />
              </button>
            </div>
            {totalesPorConcepto(lineas).map((c) => (
              <p key={c.concepto} className="mt-2 flex justify-between gap-3 text-sm">
                <span className="min-w-0 [overflow-wrap:anywhere] text-tinta">{c.concepto}</span>
                <span className="shrink-0 tabular-nums text-tinta">{moneda.format(c.total)}</span>
              </p>
            ))}
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

        {aConvenir && bloqueRemitoInterno}

        {puedeCobrar && (
          <button
            onClick={() => cobrarAca.mutate()}
            ref={aConvenir ? undefined : botonEnviar}
            disabled={!lineas.length || !cliente || cobrarAca.isPending || enviar.isPending || presupuestar.isPending}
            className={aConvenir ? SECUNDARIO : PRINCIPAL}
          >
            {cobrarAca.isPending ? (
              `Preparando… ${pasoEnvio ?? ''}`
            ) : (
              <>
                Cobrar
                {!aConvenir && <TeclaAtajo tecla="F10" clara />}
              </>
            )}
          </button>
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
          ref={aConvenir ? undefined : puedeCobrar ? botonF9 : botonEnviar}
          disabled={!lineas.length || !cliente || enviar.isPending || presupuestar.isPending || cobrarAca.isPending}
          className={aConvenir || puedeCobrar ? SECUNDARIO : PRINCIPAL}
        >
          {enviar.isPending ? (
            `Enviando… ${pasoEnvio ?? ''}`
          ) : (
            <>
              Enviar a caja
              {!aConvenir && <TeclaAtajo tecla={puedeCobrar ? 'F9' : 'F10'} clara={!puedeCobrar} />}
            </>
          )}
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

        {!aConvenir && bloqueRemitoInterno}

        {lineas.length > 0 && conceptos.length > 0 && !totalesPorConcepto(lineas).length && (
          <button
            onClick={() => setAsociando(true)}
            className="text-sm text-piedra-500 hover:text-marca-700 hover:underline"
          >
            Asociar productos a un concepto
            <TeclaAtajo tecla="F11" />
          </button>
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

// Hasta tres decimales —0,374 kg— y sin el punto de los miles, que se leería como coma.
const formatoCantidad = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3, useGrouping: false })

/*
  La cantidad de un renglón.

  Es un campo de texto y no numérico para aceptar la coma: el vendedor
  escribe «0,374» como se escribe acá, y el campo numérico del
  navegador la toma o no según cómo esté configurada la PC.

  Mientras se escribe, sólo se aplica lo que ya es una cantidad: «0,»
  todavía no es nada, y aplicar el 0 borraría el renglón a mitad de
  camino. Un 0 o un campo vacío se resuelven al salir: el 0 quita el
  renglón, como siempre; vacío vuelve a lo que había.
*/
function CampoCantidad({
  valor,
  decimales,
  onCambio,
}: {
  valor: number
  decimales: boolean
  onCambio: (cantidad: number) => void
}) {
  const [texto, setTexto] = useState(() => formatoCantidad.format(valor))
  const enfocado = useRef(false)

  // Lo que cambia desde afuera —un escaneo más del mismo producto— se ve.
  useEffect(() => {
    if (!enfocado.current) setTexto(formatoCantidad.format(valor))
  }, [valor])

  return (
    <input
      type="text"
      inputMode={decimales ? 'decimal' : 'numeric'}
      value={texto}
      onFocus={(e) => {
        enfocado.current = true
        e.currentTarget.select()
      }}
      onChange={(e) => {
        const escrito = e.target.value
        // Sin decimales, la coma y el punto no entran: un collar no se parte.
        if (!decimales && /[.,]/.test(escrito)) return
        setTexto(escrito)
        const n = leerCantidad(escrito)
        if (n !== null && n > 0) onCambio(n)
      }}
      onBlur={() => {
        enfocado.current = false
        const n = leerCantidad(texto)
        if (n === 0) onCambio(0)
        else setTexto(formatoCantidad.format(valor))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className="w-full rounded-lg border border-borde px-2 py-1 text-center tabular-nums outline-none focus:border-marca-500"
    />
  )
}
