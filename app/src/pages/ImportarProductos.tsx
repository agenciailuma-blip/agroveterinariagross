import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { leerArchivo } from '@/lib/importacion/archivo'
import type { HojaLeida } from '@/lib/importacion/archivo'
import {
  CAMPOS,
  detectarEncabezado,
  elegirHoja,
  OBLIGATORIOS,
  codigosDuplicados,
  prepararFilas,
  proponerMapeo,
} from '@/lib/importacion/planilla'
import type { Campo, FilaImportada } from '@/lib/importacion/planilla'
import { importarProductos } from '@/lib/api/importacion'
import type { ResumenImportacion } from '@/lib/api/importacion'
import { numero } from '@/lib/tipos'
import { barraDeAvance } from '@/estilos'
import { Dato, ElegirArchivo, Mapeo } from '@/components/importacion/Piezas'

/*
  Importación del catálogo.

  La usa el personal contratado para la carga, no alguien técnico. Por
  eso está partida en pasos y muestra lo que va a hacer ANTES de
  hacerlo: sobre 3.000 productos, un mapeo mal elegido se arregla
  volviendo a importar, pero recién después de que alguien se dé cuenta.
*/
export default function ImportarProductos() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()

  const [archivo, setArchivo] = useState<File | null>(null)
  const [hojas, setHojas] = useState<HojaLeida[]>([])
  const [hoja, setHoja] = useState(0)
  const [encabezados, setEncabezados] = useState<string[]>([])
  const [primeraLinea, setPrimeraLinea] = useState(2)
  const [crudas, setCrudas] = useState<unknown[][]>([])
  const [mapeo, setMapeo] = useState<Record<number, Campo | null>>({})
  const [crearReferencias, setCrearReferencias] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null)
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null)

  const puedeImportar = tienePermiso('productos.crear')

  /*
    Toma una hoja y decide dónde arranca la tabla. Se usa al abrir el
    archivo y cada vez que la persona cambia de hoja a mano.
  */
  function tomarHoja(leidas: HojaLeida[], indice: number, encabezado?: number) {
    const filas = leidas[indice]?.filas ?? []
    const fila = encabezado ?? detectarEncabezado(filas)
    const cabecera = (filas[fila] ?? []).map((c) => String(c ?? ''))

    setHoja(indice)
    setEncabezados(cabecera)
    setCrudas(filas.slice(fila + 1))
    // En Excel las filas se cuentan desde 1, y los datos empiezan
    // justo después del encabezado.
    setPrimeraLinea(fila + 2)
    setMapeo(proponerMapeo(cabecera))
  }

  const abrir = useMutation({
    mutationFn: async (f: File) => leerArchivo(f),
    onSuccess: (leidas, f) => {
      if (!leidas.length || leidas.every((h) => h.filas.length < 2)) {
        setError('El archivo no tiene filas de datos, sólo el encabezado (o está vacío).')
        return
      }
      const elegida = elegirHoja(leidas)
      setArchivo(f)
      setHojas(leidas)
      tomarHoja(leidas, elegida.indice, elegida.encabezado)
      setResumen(null)
      setError(null)
    },
    onError: (e) =>
      setError(
        e instanceof Error
          ? `No se pudo leer el archivo: ${e.message}`
          : 'No se pudo leer el archivo.',
      ),
  })

  const preparadas: FilaImportada[] = crudas.length
    ? prepararFilas(crudas, mapeo, primeraLinea)
    : []
  const conError = preparadas.filter((f) => f.errores.length > 0)
  const validas = preparadas.filter((f) => f.errores.length === 0)
  const duplicados = codigosDuplicados(validas)

  const campoMapeado = (c: Campo) => Object.values(mapeo).includes(c)
  const faltanObligatorios = OBLIGATORIOS.filter((c) => !campoMapeado(c))

  const importar = useMutation({
    mutationFn: () => {
      setAvance({ hechas: 0, total: validas.length })
      return importarProductos(
        validas.map((f) => f.datos),
        crearReferencias,
        (hechas, total) => setAvance({ hechas, total }),
      )
    },
    onSuccess: (r) => {
      setResumen(r)
      setAvance(null)
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['avance-carga'] })
      qc.invalidateQueries({ queryKey: ['referencias'] })
    },
    onError: (e) => {
      setAvance(null)
      setError(e instanceof Error ? e.message : 'La importación se cortó.')
    },
  })

  function empezarDeNuevo() {
    setArchivo(null)
    setEncabezados([])
    setCrudas([])
    setMapeo({})
    setResumen(null)
    setError(null)
  }

  if (!puedeImportar) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        No tenés permiso para importar productos.
      </p>
    )
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <Link to="/productos" className="text-sm text-marca-700 hover:underline">
          ← Volver a Productos
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-tinta">Importar productos</h1>
        <p className="text-sm text-piedra-500">
          Desde la planilla de Excel o CSV. Se puede importar la misma planilla las veces que haga
          falta: los productos se reconocen por su código y se actualizan, no se duplican.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {resumen ? (
        <Resultado resumen={resumen} onOtra={empezarDeNuevo} />
      ) : !archivo ? (
        <ElegirArchivo cargando={abrir.isPending} onElegir={(f) => abrir.mutate(f)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
            <div className="min-w-0">
              <p className="truncate font-medium text-tinta">{archivo.name}</p>
              <p className="text-sm text-piedra-500">
                {numero.format(crudas.length)} filas · {encabezados.length} columnas
                {hojas.length > 1 && ` · hoja “${hojas[hoja]?.nombre}”`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/*
                El archivo puede traer varias hojas. Se elige sola la que
                tiene pinta de productos, pero se muestra cuál: si la
                planilla cambia, la persona tiene que poder corregirlo
                sin volver a armar el archivo.
              */}
              {hojas.length > 1 && (
                <label className="flex items-center gap-2 text-sm text-piedra-600">
                  Hoja
                  <select
                    value={hoja}
                    onChange={(e) => tomarHoja(hojas, Number(e.target.value))}
                    className="rounded-lg border border-borde px-2 py-1 text-sm text-tinta"
                  >
                    {hojas.map((h, i) => (
                      <option key={h.nombre} value={i}>
                        {h.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button onClick={empezarDeNuevo} className="text-sm text-marca-700 hover:underline">
                Elegir otro archivo
              </button>
            </div>
          </div>

          <Mapeo
            campos={CAMPOS}
            obligatorios={OBLIGATORIOS}
            encabezados={encabezados}
            crudas={crudas}
            mapeo={mapeo}
            onCambio={(indice, campo) => setMapeo({ ...mapeo, [indice]: campo })}
          />

          {faltanObligatorios.length > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              Falta indicar qué columna tiene{' '}
              <strong>{faltanObligatorios.map((c) => CAMPOS[c].toLowerCase()).join(' y ')}</strong>.
              Sin eso no se puede importar.
            </p>
          )}

          {faltanObligatorios.length === 0 && (
            <Revision
              validas={validas.length}
              conError={conError}
              duplicados={duplicados}
              crearReferencias={crearReferencias}
              onCrearReferencias={setCrearReferencias}
              avance={avance}
              importando={importar.isPending}
              onImportar={() => importar.mutate()}
            />
          )}
        </>
      )}
    </div>
  )
}

function Revision({
  validas,
  conError,
  duplicados,
  crearReferencias,
  onCrearReferencias,
  avance,
  importando,
  onImportar,
}: {
  validas: number
  conError: FilaImportada[]
  duplicados: Map<string, number[]>
  crearReferencias: boolean
  onCrearReferencias: (v: boolean) => void
  avance: { hechas: number; total: number } | null
  importando: boolean
  onImportar: () => void
}) {
  const [verTodos, setVerTodos] = useState(false)
  const aMostrar = verTodos ? conError : conError.slice(0, 10)

  return (
    <div className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <div className="flex flex-wrap gap-6">
        <Dato valor={numero.format(validas)} etiqueta="se van a importar" tono="bien" />
        {conError.length > 0 && (
          <Dato valor={numero.format(conError.length)} etiqueta="se saltean por error" tono="mal" />
        )}
        {duplicados.size > 0 && (
          <Dato valor={numero.format(duplicados.size)} etiqueta="códigos repetidos" tono="aviso" />
        )}
      </div>

      {duplicados.size > 0 && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-medium">Hay códigos que aparecen más de una vez en la planilla.</p>
          <p className="mt-0.5 text-xs">
            Se van a importar todas, así que <strong>manda la última</strong>. Si no es lo que
            querés, corregí la planilla antes de seguir.
          </p>
          <ul className="mt-2 space-y-0.5 text-xs">
            {[...duplicados].slice(0, 5).map(([codigo, lineas]) => (
              <li key={codigo} className="font-mono">
                {codigo} → filas {lineas.join(', ')}
              </li>
            ))}
            {duplicados.size > 5 && <li>y {duplicados.size - 5} más…</li>}
          </ul>
        </div>
      )}

      {conError.length > 0 && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          <p className="font-medium">Estas filas no se van a importar:</p>
          <ul className="mt-2 space-y-0.5 text-xs">
            {aMostrar.map((f) => (
              <li key={f.linea}>
                <span className="font-medium">Fila {f.linea}:</span> {f.errores.join(' ')}
              </li>
            ))}
          </ul>
          {conError.length > 10 && (
            <button
              onClick={() => setVerTodos(!verTodos)}
              className="mt-2 text-xs font-medium underline"
            >
              {verTodos ? 'Ver menos' : `Ver las ${conError.length}`}
            </button>
          )}
        </div>
      )}

      <label className="flex items-start gap-2 text-sm text-tinta">
        <input
          type="checkbox"
          checked={crearReferencias}
          onChange={(e) => onCrearReferencias(e.target.checked)}
          className="mt-0.5 size-4 rounded border-borde text-marca-700 focus:ring-marca-500"
        />
        <span>
          Crear las categorías y marcas que no existan
          <span className="block text-xs text-piedra-500">
            Si lo destildás, los productos se importan igual pero sin categoría ni marca. Conviene
            dejarlo tildado la primera vez y revisar el listado después.
          </span>
        </span>
      </label>

      {avance && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-piedra-500">
            <span>Importando…</span>
            <span className="tabular-nums">
              {numero.format(avance.hechas)} de {numero.format(avance.total)}
            </span>
          </div>
          <div className={barraDeAvance.fondo}>
            <div
              className={barraDeAvance.relleno}
              style={{ width: `${Math.round((avance.hechas / Math.max(avance.total, 1)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <button
        onClick={onImportar}
        disabled={validas === 0 || importando}
        className="rounded-lg bg-marca-700 px-5 py-2.5 font-medium text-white hover:bg-marca-600 disabled:opacity-40"
      >
        {importando ? 'Importando…' : `Importar ${numero.format(validas)} productos`}
      </button>
    </div>
  )
}

function Resultado({ resumen, onOtra }: { resumen: ResumenImportacion; onOtra: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-verde-50 p-5 ring-1 ring-verde-200">
        <p className="font-medium text-verde-900">Importación terminada</p>
        <div className="mt-3 flex flex-wrap gap-6">
          <Dato valor={numero.format(resumen.creados)} etiqueta="productos nuevos" tono="bien" />
          <Dato valor={numero.format(resumen.actualizados)} etiqueta="actualizados" tono="bien" />
          {resumen.errores.length > 0 && (
            <Dato valor={numero.format(resumen.errores.length)} etiqueta="con error" tono="mal" />
          )}
        </div>
        <p className="mt-3 text-sm text-verde-900">
          Los productos entraron <strong>sin marcar como revisados</strong>: que el dato haya venido
          de la planilla no significa que alguien lo haya verificado. El operativo de carga sigue
          midiendo lo que una persona miró de verdad.
        </p>
      </div>

      {resumen.errores.length > 0 && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
          <p className="font-medium">Filas que el servidor rechazó:</p>
          <ul className="mt-2 space-y-0.5 text-xs">
            {resumen.errores.slice(0, 30).map((e, i) => (
              <li key={i}>
                <span className="font-medium">Fila {e.fila}</span>
                {e.codigo && <span className="font-mono"> ({e.codigo})</span>}: {e.detalle}
              </li>
            ))}
            {resumen.errores.length > 30 && <li>y {resumen.errores.length - 30} más…</li>}
          </ul>
        </div>
      )}

      {resumen.avisos.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-medium">Entraron, pero conviene mirarlas:</p>
          <ul className="mt-2 space-y-0.5 text-xs">
            {resumen.avisos.slice(0, 30).map((a, i) => (
              <li key={i}>
                <span className="font-medium">Fila {a.fila}</span>
                {a.codigo && <span className="font-mono"> ({a.codigo})</span>}: {a.detalle}
              </li>
            ))}
            {resumen.avisos.length > 30 && <li>y {resumen.avisos.length - 30} más…</li>}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <Link
          to="/productos"
          className="rounded-lg bg-marca-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-marca-600"
        >
          Ver los productos
        </Link>
        <button
          onClick={onOtra}
          className="rounded-lg px-5 py-2.5 text-sm font-medium text-piedra-600 ring-1 ring-borde hover:bg-piedra-50"
        >
          Importar otra planilla
        </button>
      </div>
    </div>
  )
}
