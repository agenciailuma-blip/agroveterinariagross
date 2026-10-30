import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { enCastellano } from '@/lib/errores'
import { moneda, numero } from '@/lib/tipos'
import { boton, botonChico, campoDeFiltro, tarjeta } from '@/estilos'
import BotonBajarPlanilla from '@/components/BotonBajarPlanilla'
import { leerArchivo } from '@/lib/importacion/archivo'
import { leerPlanillaDeLista, type CambioDeLista, type LecturaDeLista } from '@/lib/importacion/listaMayorista'
import {
  bajarPlanillaDeLista,
  buscarParaLista,
  catalogoDeLaLista,
  guardarPrecio,
  guardarPrecios,
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

  const [lectura, setLectura] = useState<LecturaDeLista | null>(null)
  const [leyendo, setLeyendo] = useState(false)

  const puede = tienePermiso('productos.editar_precio')

  async function alElegirPlanilla(archivo: File) {
    setLeyendo(true)
    setAviso(null)
    setError(null)
    setLectura(null)
    try {
      const [hojas, catalogo] = await Promise.all([leerArchivo(archivo), catalogoDeLaLista()])
      const leida = hojas.map((h) => leerPlanillaDeLista(h.filas, catalogo)).find((l) => l !== null)
      if (!leida) setError('La planilla tiene que tener las columnas «Código» y «Precio mayorista».')
      else setLectura(leida)
    } catch (e) {
      setError(enCastellano(e, 'No se pudo leer la planilla.'))
    } finally {
      setLeyendo(false)
    }
  }

  const aplicar = useMutation({
    mutationFn: (cambios: CambioDeLista[]) =>
      guardarPrecios(cambios.map((c) => ({ producto_id: c.producto_id, precio: c.precio }))),
    onSuccess: (n) => {
      setError(null)
      setLectura(null)
      setAviso(n === 1 ? 'Se guardó 1 cambio en la lista.' : `Se guardaron ${numero.format(n)} cambios en la lista.`)
      qc.invalidateQueries({ queryKey: ['mayorista-lista'] })
      qc.invalidateQueries({ queryKey: ['mayorista-catalogo'] })
    },
    onError: (e) => {
      setAviso(null)
      setError(enCastellano(e))
    },
  })

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Lista de precios mayorista</h1>
          <p className="text-sm text-piedra-500">
            Lo que el vendedor de calle puede ofrecer, y a cuánto. Lo que no está acá, no lo ve.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BotonBajarPlanilla bajar={bajarPlanillaDeLista} />
          <label className={`${boton.secundario} cursor-pointer`}>
            {leyendo ? 'Leyendo…' : 'Importar planilla'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv,text/csv"
              disabled={leyendo}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) alElegirPlanilla(f)
                e.target.value = ''
              }}
              className="hidden"
            />
          </label>
        </div>
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

      {lectura && (
        <VistaDePlanilla
          lectura={lectura}
          ocupado={aplicar.isPending}
          onAplicar={(cambios) => aplicar.mutate(cambios)}
          onCancelar={() => setLectura(null)}
        />
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
  Lo que va a pasar, antes de guardar. Sacar productos es aparte y hay que
  pedirlo: un precio borrado sin querer dejaría al vendedor sin ese producto.
*/
function VistaDePlanilla({
  lectura,
  ocupado,
  onAplicar,
  onCancelar,
}: {
  lectura: LecturaDeLista
  ocupado: boolean
  onAplicar: (cambios: CambioDeLista[]) => void
  onCancelar: () => void
}) {
  const [sacar, setSacar] = useState(false)
  const { entran, cambian, salen, iguales, problemas } = lectura
  const cambios = [...entran, ...cambian, ...(sacar ? salen : [])]

  return (
    <section className={`${tarjeta} space-y-3 p-4`}>
      <h2 className="text-sm font-semibold text-tinta">Lo que trae la planilla</h2>
      {entran.length + cambian.length + salen.length + problemas.length === 0 && (
        <p className="text-sm text-piedra-500">
          {iguales > 0 ? 'No hay nada para cambiar: los precios son los mismos.' : 'No trae ningún precio.'}
        </p>
      )}

      <Grupo titulo="Entran a la lista" filas={entran} />
      <Grupo titulo="Cambian de precio" filas={cambian} />
      <Grupo titulo="Sin precio: salen de la lista" filas={salen} />
      {salen.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-tinta">
          <input type="checkbox" checked={sacar} onChange={(e) => setSacar(e.target.checked)} />
          Sacarlos de la lista
        </label>
      )}
      {iguales > 0 && <p className="text-xs text-piedra-500">{numero.format(iguales)} sin cambios.</p>}

      {problemas.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-red-700">
            No se cargan ({numero.format(problemas.length)})
          </h3>
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs text-red-700">
            {problemas.map((p) => (
              <li key={p.fila} className="[overflow-wrap:anywhere]">
                Fila {p.fila}
                {p.codigo && ` · ${p.codigo}`}: {p.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => onAplicar(cambios)} disabled={ocupado || cambios.length === 0} className={boton.principal}>
          {ocupado
            ? 'Guardando…'
            : cambios.length === 1
              ? 'Guardar 1 cambio'
              : `Guardar ${numero.format(cambios.length)} cambios`}
        </button>
        <button onClick={onCancelar} disabled={ocupado} className={boton.secundario}>
          Cancelar
        </button>
      </div>
    </section>
  )
}

function Grupo({ titulo, filas }: { titulo: string; filas: CambioDeLista[] }) {
  if (filas.length === 0) return null
  return (
    <div>
      <h3 className="text-sm font-medium text-tinta">
        {titulo} ({numero.format(filas.length)})
      </h3>
      <ul className="mt-1 max-h-48 divide-y divide-piedra-100 overflow-y-auto">
        {filas.map((c) => (
          <li key={c.producto_id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1 text-xs">
            <span className="min-w-0 flex-1 basis-40 [overflow-wrap:anywhere] text-tinta">{c.nombre}</span>
            <span className="shrink-0 tabular-nums text-piedra-600">
              {c.antes !== null && moneda.format(c.antes)}
              {c.antes !== null && c.precio !== null && ' → '}
              {c.precio !== null && <span className="font-medium text-tinta">{moneda.format(c.precio)}</span>}
            </span>
          </li>
        ))}
      </ul>
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
