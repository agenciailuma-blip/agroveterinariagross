import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

/*
  ─────────────────────────────────────────────────────────────
  Los diálogos del sistema, no los del navegador

  Reportado por Lucas el 07/09: al ajustar un total en la caja
  aparecía un cartel que decía "tauri localhost dice". Eso es
  `window.prompt`: el navegador antepone quién está preguntando, y
  adentro del programa instalado el navegador se llama "tauri
  localhost". No hay forma de cambiar ese título — es del sistema
  operativo, no nuestro.

  Y no era sólo feo. Los diálogos del navegador:

  · Bloquean el hilo entero mientras están abiertos. Con el
    sincronizador corriendo cada 60 segundos, eso es una pausa.
  · No se pueden validar: `prompt` devuelve texto, y si la persona
    escribe "mil quinientos" hay que rechazarlo DESPUÉS de cerrar,
    con otro cartel encima.
  · No se ven como el resto del sistema, que es lo que Lucas notó.

  Se reemplazan por estos, una sola vez, para los dieciséis lugares
  donde estaban. La forma de llamarlos es casi igual —se espera una
  promesa en vez de un valor— así que cada lugar cambia una línea.
  ─────────────────────────────────────────────────────────────
*/

interface BaseDialogo {
  titulo: string
  /** Renglón chico abajo del título. Para el dato que hace falta ver. */
  detalle?: string
  /** Texto del botón que confirma. Por defecto "Aceptar". */
  aceptar?: string
  /** Pinta el botón de rojo. Para lo que no se puede deshacer. */
  peligro?: boolean
}

interface Confirmacion extends BaseDialogo {
  clase: 'confirmar'
}

interface Pedido extends BaseDialogo {
  clase: 'texto' | 'numero'
  etiqueta: string
  valorInicial?: string
  /** Texto gris adentro del campo vacío. */
  ejemplo?: string
  /**
    Mínimo de caracteres para el texto. Los motivos que quedan
    registrados no pueden ser una letra suelta: si no dice nada, el
    registro de "quién y por qué" no sirve para nada.
  */
  minimo?: number
  /** Opciones para elegir en vez de escribir. */
  opciones?: readonly string[]
  /** Con opciones cargadas, si además se puede escribir una propia. */
  permiteOtro?: boolean
}

type Pendiente = { turno: number } & (
  | { pedido: Confirmacion; resolver: (v: boolean) => void }
  | { pedido: Pedido; resolver: (v: string | null) => void }
)

let abierto: Pendiente | null = null
let turno = 0
const oyentes = new Set<() => void>()

function publicar(p: Omit<Pendiente, 'turno'> | null) {
  abierto = p ? ({ ...p, turno: ++turno } as Pendiente) : null
  for (const avisar of oyentes) avisar()
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar)
  return () => {
    oyentes.delete(avisar)
  }
}

/** ¿Seguro? Devuelve true si la persona confirmó. */
export function confirmar(pedido: Omit<Confirmacion, 'clase'>): Promise<boolean> {
  return new Promise((resolver) => publicar({ pedido: { ...pedido, clase: 'confirmar' }, resolver }))
}

/** Pide un texto. Devuelve null si se canceló. */
export function pedirTexto(pedido: Omit<Pedido, 'clase'>): Promise<string | null> {
  return new Promise((resolver) => publicar({ pedido: { ...pedido, clase: 'texto' }, resolver }))
}

/** Pide un número. Devuelve null si se canceló o si no era un número. */
export async function pedirNumero(pedido: Omit<Pedido, 'clase'>): Promise<number | null> {
  const crudo = await new Promise<string | null>((resolver) =>
    publicar({ pedido: { ...pedido, clase: 'numero' }, resolver }),
  )
  if (crudo === null) return null
  const n = Number(crudo.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/*
  Se monta una sola vez, arriba de todo. Mientras no haya nada que
  preguntar no dibuja nada.
*/
export function Dialogos() {
  const actual = useSyncExternalStore(suscribir, () => abierto)
  if (!actual) return null
  // La clave por turno reinicia el estado interno: dos preguntas
  // seguidas no comparten el valor tipeado en la primera.
  return <Ventana key={actual.turno} pendiente={actual} />
}

function Ventana({ pendiente }: { pendiente: Pendiente }) {
  const { pedido } = pendiente
  const esPedido = pedido.clase !== 'confirmar'
  const campo = esPedido ? (pedido as Pedido) : null

  const [valor, setValor] = useState(campo?.valorInicial ?? '')
  const [propio, setPropio] = useState(false)
  const entrada = useRef<HTMLInputElement | HTMLSelectElement>(null)

  /*
    El foco tiene que caer en el campo, no en el botón: en el
    mostrador se escribe y se aprieta Enter sin tocar el mouse. Y en
    una confirmación cae en Cancelar a propósito — un Enter de
    reflejo no puede dar de baja un producto.
  */
  useEffect(() => {
    entrada.current?.focus()
    if (entrada.current instanceof HTMLInputElement) entrada.current.select()
  }, [])

  const listaCerrada = !!campo?.opciones?.length && !propio
  const corto = campo?.clase === 'texto' && valor.trim().length < (campo.minimo ?? 0)
  const vacio = campo?.clase === 'numero' && valor.trim() === ''
  const puedeAceptar = !corto && !vacio

  function cerrar(confirmado: boolean) {
    publicar(null)
    if (pendiente.pedido.clase === 'confirmar') {
      ;(pendiente.resolver as (v: boolean) => void)(confirmado)
    } else {
      ;(pendiente.resolver as (v: string | null) => void)(confirmado ? valor.trim() : null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === 'Escape') cerrar(false)
        if (e.key === 'Enter' && puedeAceptar && !(e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault()
          cerrar(true)
        }
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg ring-1 ring-borde">
        <h2 className="font-semibold text-tinta">{pedido.titulo}</h2>
        {pedido.detalle && (
          <p className="mt-1.5 text-sm whitespace-pre-line text-piedra-600">{pedido.detalle}</p>
        )}

        {campo && (
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium tracking-wide text-piedra-400 uppercase">
              {campo.etiqueta}
            </label>

            {listaCerrada ? (
              <select
                ref={entrada as React.RefObject<HTMLSelectElement>}
                value={valor}
                onChange={(e) => {
                  if (e.target.value === '__otro__') {
                    setPropio(true)
                    setValor('')
                  } else setValor(e.target.value)
                }}
                className="w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-500 focus:ring-1 focus:ring-marca-500 focus:outline-none"
              >
                <option value="">Elegí uno…</option>
                {campo.opciones!.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
                {campo.permiteOtro && <option value="__otro__">Otro (escribirlo)…</option>}
              </select>
            ) : (
              <input
                ref={entrada as React.RefObject<HTMLInputElement>}
                type={campo.clase === 'numero' ? 'number' : 'text'}
                step={campo.clase === 'numero' ? '0.01' : undefined}
                value={valor}
                placeholder={campo.ejemplo}
                onChange={(e) => setValor(e.target.value)}
                className="w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-500 focus:ring-1 focus:ring-marca-500 focus:outline-none"
              />
            )}

            {corto && valor.length > 0 && (
              <p className="mt-1.5 text-xs text-piedra-500">
                Escribí al menos {campo.minimo} caracteres — queda registrado y alguien lo va a
                leer.
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={(n) => {
              if (!esPedido) n?.focus()
            }}
            onClick={() => cerrar(false)}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-piedra-600 hover:bg-piedra-100"
          >
            Cancelar
          </button>
          <button
            onClick={() => cerrar(true)}
            disabled={!puedeAceptar}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium text-white disabled:opacity-40 ${
              pedido.peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-marca-700 hover:bg-marca-800'
            }`}
          >
            {pedido.aceptar ?? 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  )
}
