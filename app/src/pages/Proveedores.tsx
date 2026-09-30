import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { confirmar } from '@/components/Dialogo'
import AjusteDePrecios from '@/components/AjusteDePrecios'
import {
  PROVEEDOR_NUEVO,
  darDeBajaProveedor,
  guardarProveedor,
  listarProveedores,
  productosPorProveedor,
} from '@/lib/api/proveedores'
import type { Proveedor } from '@/lib/api/proveedores'
import { bancoDelCbu, limpiarCbu, problemaConAlias, problemaConCbu } from '@/lib/cbu'
import { numero } from '@/lib/tipos'

/*
  Proveedores — puntos 5 y 4 de Lucas.

  La ficha es corta a propósito. Lo que el proveedor tiene que resolver
  hoy no es llevarle una cuenta corriente ni condiciones de pago —eso es
  el módulo de compras de V1-B— sino **agrupar productos para poder
  aumentarles el precio de una**.

  Por eso la columna que importa del listado es "cuántos productos
  tiene": es la que dice a cuántos les va a pegar un aumento.
*/
export default function Proveedores() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()

  const [texto, setTexto] = useState('')
  const [debounced, setDebounced] = useState('')
  const [editando, setEditando] = useState<Proveedor | null>(null)
  const [creando, setCreando] = useState(false)
  const [aumentando, setAumentando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(texto.trim()), 250)
    return () => clearTimeout(t)
  }, [texto])

  const puedeVer = tienePermiso('proveedores.ver')
  const puedeGestionar = tienePermiso('proveedores.gestionar')
  const puedeAumentar = tienePermiso('productos.aumentar_precios')

  const proveedores = useQuery({
    queryKey: ['proveedores', debounced],
    queryFn: () => listarProveedores(debounced),
    enabled: puedeVer,
  })

  const cuenta = useQuery({
    queryKey: ['productos-por-proveedor'],
    queryFn: productosPorProveedor,
    enabled: puedeVer,
  })

  const baja = useMutation({
    mutationFn: darDeBajaProveedor,
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: ['proveedores'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo dar de baja.'),
  })

  if (!puedeVer) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para ver los proveedores.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {aumentando && (
        <AjusteDePrecios
          proveedores={proveedores.data ?? []}
          onCerrar={() => setAumentando(false)}
          onAplicado={() => {
            setAumentando(false)
            qc.invalidateQueries({ queryKey: ['productos'] })
          }}
        />
      )}

      {(editando || creando) && puedeGestionar && (
        <FichaProveedor
          proveedor={editando}
          onCerrar={() => {
            setEditando(null)
            setCreando(false)
          }}
          onGuardado={() => {
            setEditando(null)
            setCreando(false)
            setError(null)
            qc.invalidateQueries({ queryKey: ['proveedores'] })
          }}
        />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Proveedores</h1>
          <p className="text-sm text-piedra-500">
            A quién se le compra cada producto. Es lo que permite ajustar precios de una.
          </p>
        </div>
        <div className="flex gap-2">
          {puedeAumentar && (
            <button
              onClick={() => setAumentando(true)}
              className="rounded-lg border border-borde bg-white px-4 py-2 text-sm font-medium text-tinta hover:bg-piedra-50"
            >
              Ajustar precios
            </button>
          )}
          {puedeGestionar && (
            <button
              onClick={() => setCreando(true)}
              className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600"
            >
              Nuevo proveedor
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar por nombre o CUIT"
        className="w-full max-w-md rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-marca-500"
      />

      {proveedores.isPending ? (
        <p className="text-sm text-piedra-500">Cargando…</p>
      ) : !proveedores.data?.length ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 py-12 text-center">
          <p className="text-sm text-piedra-500">
            {debounced ? 'No se encontró ningún proveedor.' : 'Todavía no hay proveedores cargados.'}
          </p>
        </div>
      ) : (
        /*
          Sin desplazamiento hacia el costado: en el celular el CUIT y el
          contacto van debajo del nombre, y vuelven a su columna cuando
          hay lugar.
        */
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
              <tr>
                <th className="px-3 py-2.5 font-medium sm:px-4">Proveedor</th>
                <th className="hidden py-2.5 pr-3 font-medium md:table-cell">CUIT</th>
                <th className="hidden py-2.5 pr-3 font-medium lg:table-cell">Contacto</th>
                <th className="hidden py-2.5 text-right font-medium sm:table-cell">Productos</th>
                <th className="px-3 py-2.5 sm:px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-piedra-100">
              {proveedores.data.map((p) => (
                <tr key={p.id} className={p.activo ? '' : 'opacity-50'}>
                  <td className="px-3 py-2.5 align-top sm:px-4">
                    <p className="font-medium text-tinta">{p.nombre}</p>
                    {p.nombre_fantasia && (
                      <p className="text-xs text-piedra-400">{p.nombre_fantasia}</p>
                    )}
                    <p className="text-xs text-piedra-500 lg:hidden">
                      <span className="tabular-nums md:hidden">{p.numero_documento}</span>
                      {p.numero_documento && (p.contacto || p.telefono) && <span className="md:hidden"> · </span>}
                      {[p.contacto, p.telefono].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-xs text-piedra-500 sm:hidden">
                      {numero.format(cuenta.data?.get(p.id) ?? 0)} productos
                    </p>
                  </td>
                  <td className="hidden py-2.5 pr-3 align-top tabular-nums text-piedra-600 md:table-cell">
                    {p.numero_documento || '—'}
                  </td>
                  <td className="hidden py-2.5 pr-3 align-top text-piedra-600 lg:table-cell">
                    {[p.contacto, p.telefono].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="hidden py-2.5 text-right align-top tabular-nums text-piedra-600 sm:table-cell">
                    {numero.format(cuenta.data?.get(p.id) ?? 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top sm:px-4">
                    {puedeGestionar && (
                      <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:justify-end sm:gap-3">
                        <button
                          onClick={() => setEditando(p)}
                          className="text-xs text-marca-700 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          onClick={async () => {
                            const n = cuenta.data?.get(p.id) ?? 0
                            const sigue = await confirmar({
                              titulo: `¿Dar de baja a ${p.nombre}?`,
                              detalle:
                                n > 0
                                  ? `Tiene ${n} ${n === 1 ? 'producto asignado' : 'productos asignados'}. Los productos NO se dan de baja: quedan sin proveedor y se les puede asignar otro.`
                                  : 'No tiene productos asignados.',
                              aceptar: 'Dar de baja',
                              peligro: true,
                            })
                            if (sigue) baja.mutate(p.id)
                          }}
                          className="whitespace-nowrap text-xs text-piedra-400 hover:text-red-600"
                        >
                          Dar de baja
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-piedra-400">
        El proveedor de cada producto se asigna en su ficha, dentro de Productos. Sus facturas y lo
        que se le debe están en las otras dos pestañas de Compras.
      </p>
    </div>
  )
}

/* ───────────────────────────────────────────── */

function FichaProveedor({
  proveedor,
  onCerrar,
  onGuardado,
}: {
  proveedor: Proveedor | null
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [form, setForm] = useState<Partial<Proveedor>>(proveedor ?? PROVEEDOR_NUEVO)
  const [error, setError] = useState<string | null>(null)

  const guardar = useMutation({
    mutationFn: () => guardarProveedor(form, proveedor?.id),
    onSuccess: onGuardado,
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar.'),
  })

  const set = (parcial: Partial<Proveedor>) => setForm({ ...form, ...parcial })
  // Un número cambiado en el CBU es una transferencia a otra persona:
  // no se guarda hasta que los dígitos verificadores cierren.
  const problemaCbu = problemaConCbu(form.cbu ?? '')
  const problemaAlias = problemaConAlias(form.alias ?? '')
  const listo = (form.nombre ?? '').trim().length >= 2 && !problemaCbu && !problemaAlias

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCerrar()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-lg ring-1 ring-borde">
        <h2 className="font-semibold text-tinta">
          {proveedor ? proveedor.nombre : 'Nuevo proveedor'}
        </h2>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Campo etiqueta="Razón social" ancho="col-span-2">
            <input
              autoFocus
              value={form.nombre ?? ''}
              onChange={(e) => set({ nombre: e.target.value })}
              placeholder="Laboratorios Bagó S.A."
              className={clase}
            />
          </Campo>
          <Campo etiqueta="Nombre corto" ancho="col-span-2" ayuda="Como lo llaman en el local">
            <input
              value={form.nombre_fantasia ?? ''}
              onChange={(e) => set({ nombre_fantasia: e.target.value || null })}
              placeholder="Bagó"
              className={clase}
            />
          </Campo>
          <Campo etiqueta="CUIT">
            <input
              value={form.numero_documento ?? ''}
              onChange={(e) => set({ numero_documento: e.target.value || null })}
              placeholder="30712345678"
              className={`${clase} tabular-nums`}
            />
          </Campo>
          <Campo etiqueta="Código interno" ayuda="Opcional">
            <input
              value={form.codigo ?? ''}
              onChange={(e) => set({ codigo: e.target.value || null })}
              className={clase}
            />
          </Campo>
          <Campo etiqueta="Persona de contacto">
            <input
              value={form.contacto ?? ''}
              onChange={(e) => set({ contacto: e.target.value || null })}
              placeholder="Marcelo, el viajante"
              className={clase}
            />
          </Campo>
          <Campo etiqueta="Teléfono">
            <input
              value={form.telefono ?? ''}
              onChange={(e) => set({ telefono: e.target.value || null })}
              className={clase}
            />
          </Campo>
          <Campo etiqueta="Correo" ancho="col-span-2">
            <input
              type="email"
              value={form.email ?? ''}
              onChange={(e) => set({ email: e.target.value || null })}
              className={clase}
            />
          </Campo>
          <Campo etiqueta="Domicilio" ancho="col-span-2">
            <input
              value={form.domicilio ?? ''}
              onChange={(e) => set({ domicilio: e.target.value || null })}
              className={clase}
            />
          </Campo>
          <Campo etiqueta="Localidad">
            <input
              value={form.localidad ?? ''}
              onChange={(e) => set({ localidad: e.target.value || null })}
              className={clase}
            />
          </Campo>
          <Campo etiqueta="Provincia">
            <input
              value={form.provincia ?? ''}
              onChange={(e) => set({ provincia: e.target.value || null })}
              className={clase}
            />
          </Campo>
          {/*
            Para transferirle sin pedirle cada vez adónde. Aparece listo
            para copiar al registrar un pago por transferencia.
          */}
          <p className="col-span-2 border-t border-borde pt-3 text-xs font-semibold tracking-wide text-piedra-400 uppercase">
            Para transferirle
          </p>
          <Campo
            etiqueta="CBU o CVU"
            ancho="col-span-2"
            ayuda={
              problemaCbu ??
              (form.cbu && limpiarCbu(form.cbu).length === 22
                ? `${bancoDelCbu(form.cbu) ?? 'Banco'} · los dígitos verificadores cierran`
                : 'Los 22 números. Se puede pegar con espacios o guiones.')
            }
          >
            <input
              value={form.cbu ?? ''}
              onChange={(e) => set({ cbu: e.target.value || null })}
              inputMode="numeric"
              placeholder="2850590940090418135201"
              aria-invalid={!!problemaCbu}
              className={`${clase} tabular-nums ${problemaCbu ? 'border-red-400' : ''}`}
            />
          </Campo>
          <Campo etiqueta="Alias" ancho="col-span-2" ayuda={problemaAlias ?? undefined}>
            <input
              value={form.alias ?? ''}
              onChange={(e) => set({ alias: e.target.value || null })}
              placeholder="MESA.SOL.CASA"
              aria-invalid={!!problemaAlias}
              className={`${clase} ${problemaAlias ? 'border-red-400' : ''}`}
            />
          </Campo>

          <Campo etiqueta="Observaciones" ancho="col-span-2">
            <textarea
              rows={2}
              value={form.observaciones ?? ''}
              onChange={(e) => set({ observaciones: e.target.value || null })}
              className={`${clase} resize-y`}
            />
          </Campo>
        </div>

        {(problemaCbu || problemaAlias) && (
          <p className="mt-3 text-sm text-red-600">
            {problemaCbu ? `CBU: ${problemaCbu}` : `Alias: ${problemaAlias}`}
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-piedra-600 hover:bg-piedra-100"
          >
            Cancelar
          </button>
          <button
            onClick={() => guardar.mutate()}
            disabled={!listo || guardar.isPending}
            className="rounded-lg bg-marca-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-marca-800 disabled:opacity-40"
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const clase =
  'w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-1 focus:ring-marca-500'

function Campo({
  etiqueta,
  children,
  ancho = '',
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
