import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { confirmar } from '@/components/Dialogo'
import { supabase } from '@/lib/supabase'
import { equipoDeEstaPc, useTerminal } from '@/lib/terminal'
import { boton, campo, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Qué puesto es esta computadora

  Se elegía una sola vez, en Ventas, y para cambiarlo no había por dónde.
  El 12/11 se vio lo que eso cuesta: dos PC del local habían quedado como
  «Caja 1», la Caja 2 figuraba «nunca» conectada, y la impresora de una
  aparecía en la otra. Ahora se cambia desde Configuración → Esta
  computadora, y si dos PC usan el mismo puesto, el sistema lo avisa
  arriba de todo.
  ─────────────────────────────────────────────────────────────
*/
export function PuestoDeEstaPc() {
  const { terminal, disponibles, cargando, elegir } = useTerminal()
  const [elegido, setElegido] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => setElegido(terminal?.id ?? ''), [terminal])

  async function cambiar() {
    const nuevo = disponibles.find((t) => t.id === elegido)
    if (!nuevo || nuevo.id === terminal?.id) return
    const sigue = await confirmar({
      titulo: `¿Esta computadora pasa a ser ${nuevo.nombre}?`,
      detalle: `Lo que se venda desde acá sale con la numeración de ${nuevo.nombre} (${nuevo.prefijo}). Lo hecho hasta ahora no cambia. La impresora sigue siendo la de esta computadora.`,
      aceptar: 'Cambiar',
    })
    if (!sigue) return
    elegir(nuevo)
    setAviso(`Ahora esta computadora es ${nuevo.nombre}.`)
    setTimeout(() => setAviso(null), 4000)
  }

  return (
    <div className={`${tarjeta} p-5`}>
      <h2 className="font-medium text-tinta">Puesto de esta computadora</h2>
      <p className="mt-1 text-sm text-piedra-500">
        Cada computadora es un puesto distinto: define la numeración de lo que se vende desde acá. Dos
        computadoras no pueden ser el mismo puesto.
      </p>

      {!cargando && disponibles.length === 0 ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          Hace falta internet para ver los puestos.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block min-w-0 flex-1 basis-56">
            <span className="mb-1 block text-xs font-medium text-piedra-600">Esta computadora es</span>
            <select value={elegido} onChange={(e) => setElegido(e.target.value)} className={campo}>
              {!terminal && <option value="">— Elegí un puesto —</option>}
              {disponibles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} ({t.prefijo})
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={cambiar}
            disabled={!elegido || elegido === terminal?.id}
            className={boton.principal}
          >
            Cambiar
          </button>
        </div>
      )}
      {aviso && <p className="mt-3 text-sm text-verde-800">{aviso}</p>}
    </div>
  )
}

/*
  El aviso de puesto repetido.

  Cada PC anuncia su identificador al abrir y cada diez minutos. Si el
  puesto lo había anunciado otra PC en las últimas 12 horas, la base
  contesta que sí. Como las dos se anuncian, las dos terminan avisando.
*/
let repetidoEnEstaSesion = false

export function AvisoPuestoRepetido() {
  const { terminal } = useTerminal()
  const [repetido, setRepetido] = useState(repetidoEnEstaSesion)

  useEffect(() => {
    if (!terminal) return
    let vigente = true
    const anunciar = async () => {
      if (!navigator.onLine) return
      const { data, error } = await supabase.rpc('anunciar_equipo', {
        p_terminal_id: terminal.id,
        p_equipo: equipoDeEstaPc(),
      })
      if (!vigente || error) return
      if (data === true) {
        repetidoEnEstaSesion = true
        setRepetido(true)
      }
    }
    // Al cambiar de puesto, el aviso del anterior ya no corre.
    repetidoEnEstaSesion = false
    setRepetido(false)
    void anunciar()
    const cada = setInterval(anunciar, 10 * 60 * 1000)
    return () => {
      vigente = false
      clearInterval(cada)
    }
  }, [terminal?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!repetido || !terminal) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span>
        Otra computadora también está entrando como <strong>{terminal.nombre}</strong>. Cada computadora
        tiene que ser un puesto distinto.
      </span>
      <Link to="/configuracion?pestana=computadora" className="font-medium underline">
        Elegir el puesto de esta computadora
      </Link>
    </div>
  )
}
