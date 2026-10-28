import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { enCastellano } from '@/lib/errores'
import { moneda, numero } from '@/lib/tipos'
import { botonChico, campoDeFiltro, tarjeta } from '@/estilos'
import {
  buscarParaLista,
  guardarPrecio,
  leerLista,
  type PrecioMayorista,
  type ProductoParaLista,
} from '@/lib/api/mayorista'

/*
  ─────────────────────────────────────────────────────────────
  La lista de precios mayorista

  Lo que el vendedor de calle puede ofrecer y a cuánto. «Él no va a
  poder elegir cualquier producto»: sólo lo que está acá sale en su
  catálogo. El precio es fijo por producto —no un porcentaje sobre el de
  mostrador— porque al mayorista se le pone el precio producto por
  producto.

  Se guarda al salir del campo: son muchos precios, de a uno, y un botón
  por fila sería un clic más en cada uno.
  ─────────────────────────────────────────────────────────────
*/

export default function MayoristaLista() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState('')
  const [buscar, setBuscar] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const puede = tienePermiso('productos.editar_precio')

  const lista = useQuery({ queryKey: ['mayorista-lista'], queryFn: leerLista, enabled: puede })
  const encontrados = useQuery({
    queryKey: ['mayorista-buscar', buscar],
    queryFn: () => buscarParaLista(buscar),
    enabled: puede && buscar.trim().length >= 2,
  })

  const guardar = useMutation({
    mutationFn: ({ id, precio }: { id: string; precio: number | null; nombre: string }) => guardarPrecio(id, precio),
    onSuccess: (_, v) => {
      setError(null)
      setAviso(v.precio === null ? `${v.nombre}: sacado de la lista.` : `${v.nombre}: ${moneda.format(v.precio)}.`)
      qc.invalidateQueries({ queryKey: ['mayorista-lista'] })
      qc.invalidateQueries({ queryKey: ['mayorista-catalogo'] })
    },
    onError: (e) => {
      setAviso(null)
      setError(enCastellano(e))
    },
  })

  const filas = useMemo(() => {
    const t = filtro.trim().toLowerCase()
    const todas = lista.data ?? []
    return t ? todas.filter((p) => `${p.codigo} ${p.nombre}`.toLowerCase().includes(t)) : todas
  }, [lista.data, filtro])

  const enLista = useMemo(() => new Set((lista.data ?? []).map((p) => p.producto_id)), [lista.data])

  if (!puede) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para cambiar precios.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Lista de precios mayorista</h1>
        <p className="text-sm text-piedra-500">
          Lo que el vendedor de calle puede ofrecer, y a cuánto. Lo que no está acá, no lo ve.
        </p>
      </div>

      {aviso && (
        <p className="rounded-xl bg-verde-50 px-4 py-3 text-sm font-medium text-verde-800 ring-1 ring-verde-200">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <section className={`${tarjeta} space-y-3 p-4`}>
        <h2 className="text-sm font-semibold text-tinta">Agregar productos</h2>
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar en el catálogo por nombre o código"
          className={`${campoDeFiltro} w-full`}
        />
        {encontrados.isError && (
          <p role="alert" className="text-sm text-red-700">
            {enCastellano(encontrados.error)}
          </p>
        )}
        {(encontrados.data?.length ?? 0) > 0 && (
          <ul className="divide-y divide-piedra-100 rounded-lg ring-1 ring-borde">
            {encontrados.data!.map((p) => (
              <ParaAgregar
                key={p.id}
                p={p}
                yaEsta={enLista.has(p.id)}
                ocupado={guardar.isPending}
                onAgregar={(precio) => guardar.mutate({ id: p.id, precio, nombre: p.nombre_interno })}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-tinta">
            En la lista{lista.data ? ` (${lista.data.length})` : ''}
          </h2>
          {(lista.data?.length ?? 0) > 10 && (
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar"
              className={`${campoDeFiltro} min-w-0 flex-1 basis-40 sm:flex-none`}
            />
          )}
        </div>
        {lista.isPending ? (
          <p className="text-sm text-piedra-500">Cargando…</p>
        ) : lista.isError ? (
          <p role="alert" className="text-sm text-red-700">
            {enCastellano(lista.error, 'No se pudo leer la lista.')}
          </p>
        ) : filas.length === 0 ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 px-4 py-10">
            <p className="text-center text-sm text-piedra-400">
              {(lista.data?.length ?? 0) === 0 ? 'La lista está vacía: agregá productos desde el buscador.' : 'Nada con ese filtro.'}
            </p>
          </div>
        ) : (
          <ul className={`${tarjeta} divide-y divide-piedra-100`}>
            {filas.map((p) => (
              <FilaPrecio
                key={`${p.producto_id}-${p.precio}`}
                p={p}
                ocupado={guardar.isPending}
                onGuardar={(precio) => guardar.mutate({ id: p.producto_id, precio, nombre: p.nombre })}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/*
  «1.250,50», «1250,5» y «1250.5» son el mismo precio. El punto es de
  miles sólo cuando separa grupos de tres: «1.250».
*/
function leerPrecio(texto: string): number | null {
  const t = texto.trim().replace(/\s|\$/g, '')
  const normal = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(t)
      ? t.replace(/\./g, '')
      : t
  const n = Number(normal)
  return t !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

function escribirPrecio(n: number): string {
  return String(n).replace('.', ',')
}

function ParaAgregar({
  p,
  yaEsta,
  ocupado,
  onAgregar,
}: {
  p: ProductoParaLista
  yaEsta: boolean
  ocupado: boolean
  onAgregar: (precio: number) => void
}) {
  const [texto, setTexto] = useState('')
  const precio = leerPrecio(texto)
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm text-tinta">{p.nombre_interno}</p>
        <p className="text-xs text-piedra-500">
          <span className="font-mono">{p.codigo}</span> · mostrador {moneda.format(p.precio_venta)}
        </p>
      </div>
      {yaEsta ? (
        <span className="text-xs text-piedra-500">Ya está en la lista</span>
      ) : (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (precio !== null) onAgregar(precio)
          }}
        >
          <input
            inputMode="decimal"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Precio"
            className="w-28 rounded-lg border border-borde px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-marca-500"
            aria-label={`Precio mayorista de ${p.nombre_interno}`}
          />
          <button type="submit" disabled={ocupado || precio === null} className={botonChico.principal}>
            Agregar
          </button>
        </form>
      )}
    </li>
  )
}

function FilaPrecio({
  p,
  ocupado,
  onGuardar,
}: {
  p: PrecioMayorista
  ocupado: boolean
  onGuardar: (precio: number | null) => void
}) {
  const [texto, setTexto] = useState(escribirPrecio(p.precio))

  function alSalir() {
    const precio = leerPrecio(texto)
    if (precio === null) {
      setTexto(escribirPrecio(p.precio))
      return
    }
    if (precio !== p.precio) onGuardar(precio)
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm text-tinta">{p.nombre}</p>
        <p className="text-xs text-piedra-500">
          <span className="font-mono">{p.codigo}</span> · mostrador {moneda.format(p.precio_venta)} · stock{' '}
          {numero.format(p.stock)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={alSalir}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          disabled={ocupado}
          className="w-28 rounded-lg border border-borde px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-marca-500"
          aria-label={`Precio mayorista de ${p.nombre}`}
        />
        <button onClick={() => onGuardar(null)} disabled={ocupado} className={botonChico.suave}>
          Sacar
        </button>
      </div>
    </li>
  )
}
