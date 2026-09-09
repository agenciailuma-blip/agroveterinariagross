import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  aumentarPrecios,
  contarParaAumento,
  listarAumentos,
  revertirAumento,
} from '@/lib/api/proveedores'
import type { AlcanceAumento, Proveedor } from '@/lib/api/proveedores'
import { cargarReferencias } from '@/lib/api/catalogo'
import { confirmar } from '@/components/Dialogo'
import { numero } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  Ajustar precios de una — punto 4 de Lucas

  Es lo que duele todos los días: cuando se mueve la lista de un
  laboratorio, hoy hay que corregir producto por producto sobre 2.261.
  Lucas mandó la foto de la pantalla que quiere — elegís proveedor,
  ponés el porcentaje, listo.

  ─── SE DICE "AJUSTAR", NO "AUMENTAR" ───

  Corrección de Francisco, 09/09: **también baja**. En el sistema que
  usan hoy escriben `-8` y resta, `8` y suma, y con el país como está
  eso va a seguir siendo así por un buen tiempo. Llamarlo "aumento"
  hace que nadie busque acá cuando necesita bajar un precio.

  El signo del número es toda la interfaz que hace falta: no hay dos
  botones ni un selector de "subir/bajar" que se pueda dejar mal
  puesto. Se escribe lo que se quiere que pase.

  ─── LAS DOS COSAS QUE HACEN QUE SE PUEDA USAR SIN MIEDO ───

  1. **Dice a cuántos productos les va a pegar, antes de aplicar.**
     Un aumento masivo a ciegas no se aplica: se adivina. Y el número
     es también la última verificación de que el filtro es el correcto
     — si dice 1.800 cuando esperabas 40, algo elegiste mal.

  2. **Se puede deshacer.** Un +70% tipeado donde iba +7% arruina el
     mostrador entero y se descubre con el primer cliente. La base
     guarda el precio anterior de cada producto y el historial de abajo
     tiene el botón para volver atrás.

  Sin lo segundo esta pantalla sería peligrosa. Con eso, es una
  pantalla que Lucas va a usar de verdad, que es el punto.
  ─────────────────────────────────────────────────────────────
*/

export default function AjusteDePrecios({
  proveedores,
  onCerrar,
  onAplicado,
}: {
  proveedores: Proveedor[]
  onCerrar: () => void
  onAplicado: () => void
}) {
  const qc = useQueryClient()
  const [proveedorId, setProveedorId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [porcentaje, setPorcentaje] = useState('')
  const [alcance, setAlcance] = useState<AlcanceAumento>('precio')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const referencias = useQuery({
    queryKey: ['referencias'],
    queryFn: cargarReferencias,
    staleTime: 10 * 60_000,
  })

  const cuantos = useQuery({
    queryKey: ['contar-aumento', proveedorId, categoriaId],
    queryFn: () => contarParaAumento(proveedorId || null, categoriaId || null),
  })

  const historial = useQuery({ queryKey: ['aumentos'], queryFn: listarAumentos })

  const n = Number(porcentaje.replace(',', '.'))
  const hayNumero = porcentaje.trim() !== '' && Number.isFinite(n) && n !== 0
  const aTodo = !proveedorId && !categoriaId
  const faltaMotivo = aTodo && motivo.trim().length < 3
  const excedido = hayNumero && Math.abs(n) > 100

  const puedeAplicar =
    hayNumero && !excedido && !faltaMotivo && (cuantos.data ?? 0) > 0

  const aplicar = useMutation({
    mutationFn: () =>
      aumentarPrecios({
        porcentaje: n,
        proveedorId: proveedorId || null,
        categoriaId: categoriaId || null,
        alcance,
        motivo: motivo.trim() || null,
      }),
    onSuccess: () => {
      setError(null)
      setAviso(
        `Listo: ${numero.format(cuantos.data ?? 0)} productos ${n > 0 ? 'aumentados' : 'rebajados'} un ${Math.abs(n)}%. Si te equivocaste, abajo está el botón para deshacerlo.`,
      )
      setPorcentaje('')
      setMotivo('')
      qc.invalidateQueries({ queryKey: ['aumentos'] })
      qc.invalidateQueries({ queryKey: ['contar-aumento'] })
      onAplicado()
    },
    onError: (e) => {
      setAviso(null)
      setError(e instanceof Error ? e.message : 'No se pudo aplicar el aumento.')
    },
  })

  const revertir = useMutation({
    mutationFn: revertirAumento,
    onSuccess: (devueltos) => {
      setError(null)
      setAviso(`Se devolvieron ${numero.format(devueltos)} productos a su precio anterior.`)
      qc.invalidateQueries({ queryKey: ['aumentos'] })
      qc.invalidateQueries({ queryKey: ['productos'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo revertir.'),
  })

  useEffect(() => {
    setAviso(null)
  }, [proveedorId, categoriaId, porcentaje])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCerrar()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-lg ring-1 ring-borde">
        <h2 className="font-semibold text-tinta">Ajustar precios</h2>
        <p className="mt-1 text-sm text-piedra-600">
          Le cambia el precio a varios productos de una. En negativo <strong>baja</strong>. Se
          puede deshacer.
        </p>

        {/* ── A qué le pega ── */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-piedra-400 uppercase">
              Proveedor
            </span>
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className={clase}
            >
              <option value="">Todos</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre_fantasia || p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-piedra-400 uppercase">
              Rubro
            </span>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className={clase}
            >
              <option value="">Todos</option>
              {(referencias.data?.categorias ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/*
          El número que hace que esto sea usable. Va grande y arriba del
          botón: es la última verificación de que el filtro es el que se
          quería. Si dice 1.800 cuando esperabas 40, algo se eligió mal.
        */}
        <div
          className={`mt-3 rounded-lg px-3 py-2.5 text-sm ring-1 ${
            aTodo ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-piedra-50 text-piedra-700 ring-borde'
          }`}
        >
          {cuantos.isPending ? (
            'Contando…'
          ) : (
            <>
              Le va a pegar a{' '}
              <strong className="tabular-nums">{numero.format(cuantos.data ?? 0)}</strong>{' '}
              {(cuantos.data ?? 0) === 1 ? 'producto' : 'productos'}
              {aTodo && ' — o sea, al catálogo entero'}.
            </>
          )}
        </div>

        {/* ── Cuánto ── */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-piedra-400 uppercase">
              Porcentaje
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                value={porcentaje}
                onChange={(e) => setPorcentaje(e.target.value)}
                placeholder="7"
                className={`${clase} text-right tabular-nums`}
              />
              <span className="text-lg text-piedra-400">%</span>
            </div>
            <span className="mt-1 block text-xs text-piedra-400">
              <strong>7</strong> sube un 7% · <strong>-8</strong> baja un 8%
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-piedra-400 uppercase">
              Sobre qué
            </span>
            <select
              value={alcance}
              onChange={(e) => setAlcance(e.target.value as AlcanceAumento)}
              className={clase}
            >
              <option value="precio">El precio de venta</option>
              <option value="costo">El costo</option>
              <option value="ambos">Los dos</option>
            </select>
            <span className="mt-1 block text-xs text-piedra-400">
              Cuando se mueve la lista de un laboratorio suelen moverse los dos.
            </span>
          </label>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-piedra-400 uppercase">
            Motivo {aTodo ? '(obligatorio)' : '(opcional)'}
          </span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Lista nueva de septiembre"
            className={clase}
          />
        </label>

        {excedido && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
            Un {n > 0 ? 'aumento' : 'descuento'} de {Math.abs(n)}% es casi seguro un error de
            tipeo. Si es a propósito, hacelo en dos veces.
          </p>
        )}
        {faltaMotivo && hayNumero && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
            Estás por tocar el catálogo entero. Escribí por qué — queda registrado.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {aviso && (
          <p className="mt-3 rounded-lg bg-verde-50 px-3 py-2 text-sm text-verde-800 ring-1 ring-verde-200">
            {aviso}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-piedra-600 hover:bg-piedra-100"
          >
            Cerrar
          </button>
          <button
            onClick={async () => {
              const sigue = await confirmar({
                titulo: `¿${n > 0 ? 'Aumentar' : 'Bajar'} un ${Math.abs(n)}% a ${numero.format(cuantos.data ?? 0)} productos?`,
                detalle:
                  alcance === 'ambos'
                    ? 'Cambia el precio de venta y el costo. Se puede deshacer desde el historial.'
                    : `Cambia ${alcance === 'precio' ? 'el precio de venta' : 'el costo'}. Se puede deshacer desde el historial.`,
                aceptar: 'Aplicar',
              })
              if (sigue) aplicar.mutate()
            }}
            disabled={!puedeAplicar || aplicar.isPending}
            className="rounded-lg bg-marca-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-marca-800 disabled:opacity-40"
          >
            {aplicar.isPending ? 'Aplicando…' : 'Aplicar'}
          </button>
        </div>

        {/* ── El historial, que es lo que permite deshacer ── */}
        {(historial.data?.length ?? 0) > 0 && (
          <div className="mt-6 border-t border-borde pt-4">
            <h3 className="text-xs font-medium tracking-wide text-piedra-400 uppercase">
              Últimos ajustes
            </h3>
            <ul className="mt-2 space-y-1.5">
              {historial.data!.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-piedra-50 px-3 py-2 text-sm ring-1 ring-borde"
                >
                  <span className="font-medium tabular-nums text-tinta">
                    {a.porcentaje > 0 ? '+' : ''}
                    {a.porcentaje}%
                  </span>
                  <span className="min-w-0 flex-1 truncate text-piedra-600">
                    {a.proveedor?.nombre ?? a.categoria?.nombre ?? 'Todo el catálogo'}
                    {a.motivo ? ` · ${a.motivo}` : ''}
                  </span>
                  <span className="tabular-nums text-xs text-piedra-500">
                    {numero.format(a.productos)} prod.
                  </span>
                  <span className="text-xs text-piedra-400">
                    {new Date(a.aplicado_en).toLocaleDateString('es-AR')}
                    {a.aplicado_por ? ` · ${a.aplicado_por.nombre}` : ''}
                  </span>
                  {a.revertido_en ? (
                    <span className="text-xs text-piedra-400">deshecho</span>
                  ) : (
                    <button
                      onClick={async () => {
                        const sigue = await confirmar({
                          titulo: `¿Deshacer el ${a.porcentaje > 0 ? 'aumento' : 'descuento'} del ${Math.abs(a.porcentaje)}%?`,
                          detalle:
                            'Cada producto vuelve al precio exacto que tenía antes. Los que alguien corrigió a mano después se dejan como están: esa corrección es más nueva.',
                          aceptar: 'Deshacer',
                          peligro: true,
                        })
                        if (sigue) revertir.mutate(a.id)
                      }}
                      disabled={revertir.isPending}
                      className="text-xs font-medium text-marca-700 hover:underline disabled:opacity-40"
                    >
                      Deshacer
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

const clase =
  'w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-1 focus:ring-marca-500'
