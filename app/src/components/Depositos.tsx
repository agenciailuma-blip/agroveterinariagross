import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  activarDeposito,
  crearDeposito,
  listarDepositos,
  marcarPrincipal,
  renombrarDeposito,
} from '@/lib/api/depositos'
import { enCastellano } from '@/lib/errores'
import { boton, botonChico, campo, tarjeta } from '@/estilos'

/*
  Dónde está la mercadería.

  Hoy hay uno y en breve son dos, porque abre el segundo local. Esta
  pantalla es la de una sección de catálogo: dar de alta, renombrar,
  elegir el principal y dar de baja.

  Lo que NO hace, y conviene decirlo acá para que no se busque: mover
  mercadería entre depósitos, ni mostrar el stock separado por depósito.
  Eso es el módulo de V1-B. Lo que sí pasa desde ya es que cada
  movimiento de stock queda registrado con su depósito, así que el día
  que exista el módulo el historial ya está repartido.
*/
export default function Depositos() {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [error, setError] = useState<string | null>(null)

  const depositos = useQuery({ queryKey: ['depositos'], queryFn: listarDepositos })

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['depositos'] })
    setError(null)
  }

  const fallo = (e: unknown) => setError(enCastellano(e, 'No se pudo guardar.'))

  const crear = useMutation({
    mutationFn: () => crearDeposito(nombre),
    onSuccess: () => {
      setNombre('')
      refrescar()
    },
    onError: fallo,
  })

  const renombrar = useMutation({
    mutationFn: () => renombrarDeposito(editando!, nuevoNombre),
    onSuccess: () => {
      setEditando(null)
      refrescar()
    },
    onError: fallo,
  })

  const principal = useMutation({
    mutationFn: (id: string) => marcarPrincipal(id),
    onSuccess: refrescar,
    onError: fallo,
  })

  const activar = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => activarDeposito(id, activo),
    onSuccess: refrescar,
    onError: fallo,
  })

  const filas = depositos.data ?? []

  return (
    <div className={`${tarjeta} p-5`}>
      <h2 className="font-medium text-tinta">Depósitos</h2>
      <p className="mt-1 text-sm text-piedra-500">
        Dónde está la mercadería. El <strong>principal</strong> es el que se asume cuando un
        movimiento de stock no dice de dónde salió, que hoy es siempre.
      </p>

      <table className="mt-4 w-full text-sm">
        <thead className="border-b border-borde text-left text-xs tracking-wide text-piedra-500 uppercase">
          <tr>
            <th className="py-2 font-medium">Nombre</th>
            <th className="py-2 font-medium">Principal</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-piedra-100">
          {filas.map((d) => (
            <tr key={d.id}>
              <td className="py-2 text-tinta">
                {editando === d.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={nuevoNombre}
                      onChange={(e) => setNuevoNombre(e.target.value)}
                      autoFocus
                      className={`${campo} max-w-56`}
                    />
                    <button
                      onClick={() => renombrar.mutate()}
                      disabled={nuevoNombre.trim().length < 2 || renombrar.isPending}
                      className={botonChico.principal}
                    >
                      Guardar
                    </button>
                    <button onClick={() => setEditando(null)} className={botonChico.suave}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    {d.nombre}
                    {!d.activo && <span className="ml-2 text-xs text-piedra-400">dado de baja</span>}
                  </>
                )}
              </td>

              <td className="py-2">
                {d.es_principal ? (
                  <span className="rounded-full bg-marca-50 px-2.5 py-1 text-xs font-medium text-marca-700 ring-1 ring-marca-100">
                    Principal
                  </span>
                ) : (
                  d.activo && (
                    <button
                      onClick={() => principal.mutate(d.id)}
                      disabled={principal.isPending}
                      className="text-xs text-marca-700 hover:underline"
                    >
                      Hacer principal
                    </button>
                  )
                )}
              </td>

              <td className="py-2 text-right">
                {editando !== d.id && (
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => {
                        setEditando(d.id)
                        setNuevoNombre(d.nombre)
                      }}
                      className={botonChico.suave}
                    >
                      Renombrar
                    </button>
                    {/*
                      El principal no se puede dar de baja: sin él, el
                      próximo movimiento de stock no sabría dónde ocurrió
                      y la venta fallaría. La base lo rechaza también, por
                      si alguien llega por otro camino.
                    */}
                    {!d.es_principal && (
                      <button
                        onClick={() => activar.mutate({ id: d.id, activo: !d.activo })}
                        disabled={activar.isPending}
                        className={botonChico.suave}
                      >
                        {d.activo ? 'Dar de baja' : 'Reactivar'}
                      </button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}

          {filas.length === 0 && !depositos.isPending && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-sm text-piedra-400">
                No hay depósitos cargados.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-piedra-100 pt-4">
        <label className="block min-w-56 flex-1">
          <span className="mb-1 block text-xs font-medium text-piedra-600">
            Agregar un depósito
          </span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Local 2 · Oberá centro"
            className={campo}
          />
        </label>
        <button
          onClick={() => crear.mutate()}
          disabled={nombre.trim().length < 2 || crear.isPending}
          className={boton.principal}
        >
          {crear.isPending ? 'Agregando…' : 'Agregar'}
        </button>
      </div>

      <p className="mt-3 text-xs text-piedra-400">
        Mover mercadería de un depósito a otro, y ver el stock separado por depósito, es lo que
        sigue: está previsto para después del 26/10. Lo que ya pasa desde ahora es que{' '}
        <strong>cada movimiento de stock queda registrado con su depósito</strong>, así que ese día
        el historial va a estar bien repartido y no habrá que inventarlo.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200"
        >
          {error}
        </p>
      )}
    </div>
  )
}
