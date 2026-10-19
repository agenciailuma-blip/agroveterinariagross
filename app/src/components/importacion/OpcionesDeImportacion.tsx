import { useState } from 'react'
import { cuantosCambian, type Clasificacion, type Comparador, type EstadoOpciones } from '@/lib/importacion/comparar'
import { numero } from '@/lib/tipos'
import { Dato } from '@/components/importacion/Piezas'

/*
  ─────────────────────────────────────────────────────────────
  Qué hacer con lo nuevo y con lo que ya está

  La parte del importador que decide, con casillas, qué se toca. Va
  antes del botón de importar y muestra los números de lo que va a
  pasar: cuántos se crean, cuántos se actualizan y en qué, y cuántos
  quedan como están. Con lo que ya está no hay respuesta por defecto: la
  persona elige actualizar o no tocar, para que nadie cambie el catálogo
  entero por no haber leído una casilla.
  ─────────────────────────────────────────────────────────────
*/

export default function OpcionesDeImportacion<C extends string>({
  clasificacion,
  comparador,
  opciones,
  onCambio,
  sustantivo,
}: {
  clasificacion: Clasificacion<C>
  comparador: Comparador<C>
  opciones: EstadoOpciones
  onCambio: (o: EstadoOpciones) => void
  sustantivo: [string, string]
}) {
  const [verCambios, setVerCambios] = useState(false)
  const [verTodos, setVerTodos] = useState(false)

  const { nuevos, existentes } = clasificacion
  const porGrupo = cuantosCambian(clasificacion)
  const conCambios = existentes.filter((e) => e.cambios.length > 0)
  const iguales = existentes.length - conCambios.length
  const grupos = comparador.grupos.filter((g) => porGrupo.has(g.id))

  // Lo que se va a actualizar con lo elegido: cada uno con lo suyo.
  const aActualizar = opciones.actualizarExistentes
    ? conCambios
        .map((e) => ({ ...e, cambios: e.cambios.filter((x) => opciones.grupos.has(x.grupo)) }))
        .filter((e) => e.cambios.length > 0)
    : []
  const lista = verTodos ? aActualizar : aActualizar.slice(0, 50)

  function grupo(id: string, si: boolean) {
    const g = new Set(opciones.grupos)
    if (si) g.add(id)
    else g.delete(id)
    onCambio({ ...opciones, grupos: g })
  }

  return (
    <div className="space-y-4 rounded-lg bg-piedra-50 p-4 ring-1 ring-borde">
      <div className="flex flex-wrap gap-6">
        <Dato valor={numero.format(nuevos.length)} etiqueta={nuevos.length === 1 ? `${sustantivo[0]} nuevo` : `${sustantivo[1]} nuevos`} tono="bien" />
        <Dato valor={numero.format(conCambios.length)} etiqueta="ya están y cambian" tono="aviso" />
        <Dato valor={numero.format(iguales)} etiqueta="ya están, iguales" tono="bien" />
      </div>

      <ul className="space-y-1 text-xs text-piedra-600">
        <li>
          <strong className="text-tinta">Nada se borra:</strong> {sustantivo[1]} que no están en la planilla quedan
          como están.
        </li>
        <li>
          <strong className="text-tinta">Una celda vacía no borra</strong> el dato que ya está.
        </li>
        {iguales > 0 && <li>Los {numero.format(iguales)} que están iguales no se tocan.</li>}
      </ul>

      {nuevos.length > 0 && (
        <Casilla
          marcada={opciones.crearNuevos}
          onCambio={(v) => onCambio({ ...opciones, crearNuevos: v })}
          titulo={
            nuevos.length === 1
              ? `Crear el ${sustantivo[0]} nuevo`
              : `Crear los ${numero.format(nuevos.length)} ${sustantivo[1]} nuevos`
          }
          detalle={`Los que tienen un código que el sistema todavía no tiene.`}
        />
      )}

      {conCambios.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-tinta">
            {conCambios.length === 1
              ? 'Con el que ya está y la planilla dice otra cosa:'
              : `Con los ${numero.format(conCambios.length)} que ya están y la planilla dice otra cosa:`}
          </legend>
          <Opcion
            marcada={opciones.actualizarExistentes === true}
            onElegir={() =>
              onCambio({
                ...opciones,
                actualizarExistentes: true,
                // La primera vez se marcan todos: es lo que se trajo en la planilla.
                grupos: opciones.grupos.size ? opciones.grupos : new Set(grupos.map((g) => g.id)),
              })
            }
            titulo="Actualizar los datos que elija"
          />
          <Opcion
            marcada={opciones.actualizarExistentes === false}
            onElegir={() => onCambio({ ...opciones, actualizarExistentes: false })}
            titulo="No tocarlos: sólo crear los nuevos"
          />
          {opciones.actualizarExistentes === null && (
            <p className="text-xs font-medium text-amber-700">Elegí una de las dos para poder importar.</p>
          )}

          {opciones.actualizarExistentes && (
            <div className="ml-6 space-y-1.5 border-l-2 border-borde pl-3">
              <p className="text-xs text-piedra-500">Qué datos se actualizan:</p>
              {grupos.map((g) => (
                <Casilla
                  key={g.id}
                  marcada={opciones.grupos.has(g.id)}
                  onCambio={(v) => grupo(g.id, v)}
                  titulo={g.etiqueta}
                  detalle={
                    g.actual
                      ? `Cambia en ${numero.format(porGrupo.get(g.id) ?? 0)}`
                      : `Viene en ${numero.format(porGrupo.get(g.id) ?? 0)} · no se puede comparar antes, se carga como viene`
                  }
                />
              ))}
            </div>
          )}
        </fieldset>
      )}

      {aActualizar.length > 0 && (
        <div>
          <button onClick={() => setVerCambios(!verCambios)} className="text-sm font-medium text-marca-700 underline">
            {verCambios ? 'Ocultar los cambios' : `Ver qué cambia en los ${numero.format(aActualizar.length)}`}
          </button>
          {verCambios && (
            <ul className="mt-2 divide-y divide-piedra-100 rounded-lg bg-white text-xs ring-1 ring-borde">
              {lista.map((e) => (
                <li key={e.fila.linea} className="px-3 py-2">
                  <p className="text-tinta">
                    <span className="text-piedra-400">Fila {e.fila.linea} · </span>
                    <span className="break-words font-medium">{comparador.nombre(e.registro)}</span>
                  </p>
                  {e.cambios.map((x) => (
                    <p key={x.grupo} className="break-words text-piedra-600">
                      {x.etiqueta}:{' '}
                      {x.comparado ? (
                        <>
                          <span className="text-piedra-400 line-through">{x.antes ?? 'vacío'}</span> →{' '}
                          <span className="font-medium text-tinta">{x.despues}</span>
                        </>
                      ) : (
                        <span className="italic">se carga lo de la planilla</span>
                      )}
                    </p>
                  ))}
                </li>
              ))}
              {aActualizar.length > 50 && (
                <li className="px-3 py-2">
                  <button onClick={() => setVerTodos(!verTodos)} className="font-medium text-marca-700 underline">
                    {verTodos ? 'Ver menos' : `Ver los ${numero.format(aActualizar.length)}`}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Casilla({
  marcada,
  onCambio,
  titulo,
  detalle,
}: {
  marcada: boolean
  onCambio: (v: boolean) => void
  titulo: string
  detalle?: string
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-tinta">
      <input
        type="checkbox"
        checked={marcada}
        onChange={(e) => onCambio(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-borde text-marca-700 focus:ring-marca-500"
      />
      <span>
        {titulo}
        {detalle && <span className="block text-xs text-piedra-500">{detalle}</span>}
      </span>
    </label>
  )
}

function Opcion({ marcada, onElegir, titulo }: { marcada: boolean; onElegir: () => void; titulo: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-tinta">
      <input
        type="radio"
        checked={marcada}
        onChange={onElegir}
        className="mt-0.5 size-4 shrink-0 border-borde text-marca-700 focus:ring-marca-500"
      />
      {titulo}
    </label>
  )
}
