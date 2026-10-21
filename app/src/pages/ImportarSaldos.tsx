import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { Dato, ElegirArchivo, Mapeo } from '@/components/importacion/Piezas'
import { leerArchivo } from '@/lib/importacion/archivo'
import type { HojaLeida } from '@/lib/importacion/archivo'
import { CLIENTES, PROVEEDORES, SALDOS_PROVEEDORES } from '@/lib/importacion/definiciones'
import { codigosDuplicados, detectarEncabezado, elegirHoja, prepararFilas, proponerMapeo } from '@/lib/importacion/planilla'
import type { DefinicionPlanilla, FilaImportada } from '@/lib/importacion/planilla'
import {
  aFilasDelArchivo,
  clientesActuales,
  importarClientes,
  importarProveedores,
  importarSaldosProveedores,
  proveedoresActuales,
} from '@/lib/api/importacion'
import {
  aOpciones,
  armarEnvio,
  clasificar,
  opcionesIniciales,
  type Clasificacion,
  type Comparador,
  type EstadoOpciones,
  type Registro,
} from '@/lib/importacion/comparar'
import { COMPARADOR_CLIENTES, COMPARADOR_PROVEEDORES } from '@/lib/importacion/comparadores'
import OpcionesDeImportacion from '@/components/importacion/OpcionesDeImportacion'
import type { ResumenImportacion, ResultadoFila } from '@/lib/api/importacion'
import { moneda, numero } from '@/lib/tipos'
import { barraDeAvance, boton, campo, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Importar las planillas del día del corte

  Una sola pantalla para tres planillas: los clientes con lo que debe
  cada uno, lo que Gross le debe a cada proveedor y, desde el 21/10, la
  ficha de los proveedores —la que baja «Descargar planilla» en
  Proveedores—. Las de saldos se traen de OBTech el día que se deja de
  usar, y tienen lo mismo que cuidar: que entren completas y una sola vez.

  Por eso, antes de importar, la pantalla muestra LA SUMA de los saldos:
  es el número que hay que comparar con el total que muestra OBTech. Si
  no coincide, falta una fila o sobra una, y es mejor verlo acá que
  cuando un cliente reclame.
  ─────────────────────────────────────────────────────────────
*/

type Tipo = 'clientes' | 'proveedores' | 'fichas_proveedores'

interface Configuracion {
  titulo: string
  bajada: string
  def: DefinicionPlanilla
  permisos: string[]
  volverA: string
  volverTexto: string
  sustantivo: [string, string]
  /** Los campos en los que un valor repetido es sospechoso. */
  claves: string[]
  importar: (filas: Record<string, string>[], fecha: string, avance: (h: number, t: number) => void) => Promise<ResumenImportacion>
  explicacionSaldo: string
  sinPermiso: string
  /*
    Con qué se compara antes de importar, para decir qué es nuevo y qué
    cambia, y elegir qué tocar. Los saldos de proveedores no: son un
    número por proveedor, y la base ya lo deja igual al de la planilla.
  */
  comparar?: { actuales: () => Promise<Registro[]>; comparador: Comparador<string> }
}

const CONFIGURACION: Record<Tipo, Configuracion> = {
  clientes: {
    titulo: 'Importar clientes',
    bajada:
      'Desde la planilla de Excel o CSV, con el saldo que debe cada uno. Se puede importar la misma planilla las veces que haga falta: los clientes se reconocen por su código o su CUIT, y el saldo queda igual al de la planilla, no se suma.',
    def: CLIENTES as unknown as DefinicionPlanilla,
    permisos: ['clientes.editar', 'cuentacorriente.limite'],
    volverA: '/clientes',
    volverTexto: 'Clientes',
    sustantivo: ['cliente', 'clientes'],
    claves: ['codigo', 'documento'],
    importar: importarClientes,
    explicacionSaldo:
      'Cada saldo entra en la cuenta corriente del cliente a esta fecha, y vence a los días de plazo de ese cliente (30 si la planilla no dice). Un saldo negativo es plata a favor del cliente.',
    sinPermiso: 'No tenés permiso para importar clientes con sus saldos.',
    comparar: { actuales: clientesActuales, comparador: COMPARADOR_CLIENTES as unknown as Comparador<string> },
  },
  proveedores: {
    titulo: 'Importar saldos de proveedores',
    bajada:
      'Lo que se le debe a cada proveedor, desde una planilla de Excel o CSV. Los proveedores que no existan se crean. Se reconocen por CUIT o por el nombre, así que se puede volver a importar sin duplicar.',
    def: SALDOS_PROVEEDORES as unknown as DefinicionPlanilla,
    permisos: ['proveedores.gestionar', 'proveedores.pagar'],
    volverA: '/proveedores/cuentas',
    volverTexto: 'Cuentas de proveedores',
    sustantivo: ['proveedor', 'proveedores'],
    claves: ['nombre', 'documento'],
    importar: importarSaldosProveedores,
    explicacionSaldo:
      'Cada saldo queda como el saldo inicial de ese proveedor a esta fecha, y se le pueden imputar pagos como a una factura. Las facturas de antes de esta fecha no se cargan: ya están adentro del saldo.',
    sinPermiso: 'No tenés permiso para importar los saldos de los proveedores.',
  },
  fichas_proveedores: {
    titulo: 'Importar proveedores',
    bajada:
      'La ficha de cada proveedor, desde una planilla de Excel o CSV: la que baja «Descargar planilla», u otra. Se reconocen por su código, su CUIT o su nombre. Una celda vacía no borra nada. El saldo va por su lado, en Cuentas de proveedores.',
    def: PROVEEDORES as unknown as DefinicionPlanilla,
    permisos: ['proveedores.gestionar'],
    volverA: '/proveedores',
    volverTexto: 'Proveedores',
    sustantivo: ['proveedor', 'proveedores'],
    claves: ['codigo', 'documento'],
    importar: importarProveedores,
    explicacionSaldo: '',
    sinPermiso: 'No tenés permiso para importar proveedores.',
    comparar: { actuales: proveedoresActuales, comparador: COMPARADOR_PROVEEDORES as unknown as Comparador<string> },
  },
}

const hoy = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export default function ImportarSaldos({ tipo }: { tipo: Tipo }) {
  const c = CONFIGURACION[tipo]
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()

  const [archivo, setArchivo] = useState<File | null>(null)
  const [hojas, setHojas] = useState<HojaLeida[]>([])
  const [hoja, setHoja] = useState(0)
  const [encabezados, setEncabezados] = useState<string[]>([])
  const [primeraLinea, setPrimeraLinea] = useState(2)
  const [crudas, setCrudas] = useState<unknown[][]>([])
  const [mapeo, setMapeo] = useState<Record<number, string | null>>({})
  const [fecha, setFecha] = useState(hoy)
  const [error, setError] = useState<string | null>(null)
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null)
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null)
  const [opciones, setOpciones] = useState<EstadoOpciones>(opcionesIniciales)

  function tomarHoja(leidas: HojaLeida[], indice: number, encabezado?: number) {
    const filas = leidas[indice]?.filas ?? []
    const fila = encabezado ?? detectarEncabezado(filas, c.def)
    const cabecera = (filas[fila] ?? []).map((x) => String(x ?? ''))
    setHoja(indice)
    setEncabezados(cabecera)
    setCrudas(filas.slice(fila + 1))
    setPrimeraLinea(fila + 2)
    setMapeo(proponerMapeo(cabecera, c.def))
  }

  const abrir = useMutation({
    mutationFn: (f: File) => leerArchivo(f),
    onSuccess: (leidas, f) => {
      if (!leidas.length || leidas.every((h) => h.filas.length < 2)) {
        setError('El archivo no tiene filas de datos, sólo el encabezado (o está vacío).')
        return
      }
      const elegida = elegirHoja(leidas, c.def)
      setArchivo(f)
      setHojas(leidas)
      tomarHoja(leidas, elegida.indice, elegida.encabezado)
      setResumen(null)
      setError(null)
      setOpciones(opcionesIniciales())
    },
    onError: (e) => setError(e instanceof Error ? `No se pudo leer el archivo: ${e.message}` : 'No se pudo leer el archivo.'),
  })

  const preparadas: FilaImportada<string>[] = crudas.length ? prepararFilas(crudas, mapeo, primeraLinea, c.def) : []
  const validas = preparadas.filter((f) => f.errores.length === 0)
  const conError = preparadas.filter((f) => f.errores.length > 0)
  const faltan = c.def.obligatorios.filter((o) => !Object.values(mapeo).includes(o))
  const conSaldo = Object.values(mapeo).includes('saldo')

  // Se dice antes qué es nuevo y qué cambia, y se elige qué tocar, como con los productos.
  const comparar = c.comparar
  const conOpciones = !!comparar
  const actuales = useQuery({
    queryKey: [`${tipo}-actuales`, archivo?.name, archivo?.lastModified],
    queryFn: () => comparar!.actuales(),
    enabled: conOpciones && !!archivo,
    staleTime: 0,
  })
  const clasificacion: Clasificacion<string> | null =
    comparar && actuales.data ? clasificar(validas, actuales.data, comparar.comparador) : null
  const aMandar: FilaImportada<string>[] = !comparar
    ? validas
    : clasificacion
      ? armarEnvio(clasificacion, aOpciones(opciones), comparar.comparador)
      : []
  const faltaElegir =
    !!clasificacion &&
    clasificacion.existentes.some((e) => e.cambios.length > 0) &&
    opciones.actualizarExistentes === null

  const importar = useMutation({
    mutationFn: () => {
      setAvance({ hechas: 0, total: aMandar.length })
      return c.importar(
        aMandar.map((f) => f.datos as Record<string, string>),
        fecha,
        (hechas, total) => setAvance({ hechas, total }),
      )
    },
    onSuccess: (r) => {
      setResumen(aFilasDelArchivo(r, aMandar.map((f) => f.linea)))
      setAvance(null)
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['saldos-proveedores'] })
      qc.invalidateQueries({ queryKey: [`${tipo}-actuales`] })
      qc.invalidateQueries({ queryKey: ['proveedores'] })
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

  if (!c.permisos.every((p) => tienePermiso(p))) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        {c.sinPermiso}
      </p>
    )
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <Link to={c.volverA} className="text-sm text-marca-700 hover:underline">
          ← Volver a {c.volverTexto}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-tinta">{c.titulo}</h1>
        <p className="text-sm text-piedra-500">{c.bajada}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {resumen ? (
        <Resultado resumen={resumen} c={c} onOtra={empezarDeNuevo} />
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
            campos={c.def.campos}
            obligatorios={c.def.obligatorios}
            encabezados={encabezados}
            crudas={crudas}
            mapeo={mapeo}
            onCambio={(indice, campo) => setMapeo({ ...mapeo, [indice]: campo })}
          />

          {faltan.length > 0 ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              Falta indicar qué columna tiene{' '}
              <strong>{faltan.map((f) => c.def.campos[f].toLowerCase()).join(' y ')}</strong>.
            </p>
          ) : (
            <Revision
              c={c}
              validas={validas}
              aMandar={aMandar.length}
              listo={!conOpciones || (!!clasificacion && !faltaElegir)}
              opcionesDeImportacion={
                !conOpciones ? null : actuales.isPending ? (
                  <p className="text-sm text-piedra-500">Comparando con los {c.sustantivo[1]} que ya están cargados…</p>
                ) : actuales.error ? (
                  <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                    {(actuales.error as Error).message} Sin eso no se puede decir qué es nuevo y qué cambia, así
                    que no se importa.
                  </p>
                ) : (
                  clasificacion &&
                  comparar && (
                    <OpcionesDeImportacion
                      clasificacion={clasificacion}
                      comparador={comparar.comparador}
                      opciones={opciones}
                      onCambio={setOpciones}
                      sustantivo={c.sustantivo}
                    />
                  )
                )
              }
              conError={conError}
              conSaldo={conSaldo}
              fecha={fecha}
              onFecha={setFecha}
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
  c,
  validas,
  aMandar,
  listo,
  opcionesDeImportacion,
  conError,
  conSaldo,
  fecha,
  onFecha,
  avance,
  importando,
  onImportar,
}: {
  c: Configuracion
  validas: FilaImportada<string>[]
  aMandar: number
  listo: boolean
  opcionesDeImportacion: React.ReactNode
  conError: FilaImportada<string>[]
  conSaldo: boolean
  fecha: string
  onFecha: (f: string) => void
  avance: { hechas: number; total: number } | null
  importando: boolean
  onImportar: () => void
}) {
  const [verTodos, setVerTodos] = useState(false)
  const aMostrar = verTodos ? conError : conError.slice(0, 10)

  const saldos = validas.map((f) => Number(f.datos.saldo ?? 0)).filter((n) => Number.isFinite(n))
  const deuda = saldos.filter((n) => n > 0).reduce((s, n) => s + n, 0)
  const aFavor = saldos.filter((n) => n < 0).reduce((s, n) => s + n, 0)
  const conDeuda = saldos.filter((n) => n !== 0).length

  const repetidos = c.claves
    .map((clave) => ({ clave, dup: codigosDuplicados(validas, clave) }))
    .filter((r) => r.dup.size > 0)

  return (
    <div className={`${tarjeta} space-y-4 p-5`}>
      <div className="flex flex-wrap gap-6">
        <Dato valor={numero.format(validas.length)} etiqueta="filas que se pueden importar" tono="bien" />
        {conError.length > 0 && <Dato valor={numero.format(conError.length)} etiqueta="se saltean por error" tono="mal" />}
        {conSaldo && <Dato valor={moneda.format(deuda)} etiqueta={`suma de los saldos · ${conDeuda} con saldo`} tono="bien" />}
        {conSaldo && aFavor < 0 && <Dato valor={moneda.format(aFavor)} etiqueta="a favor" tono="aviso" />}
      </div>

      {conSaldo && (
        <div className="rounded-lg bg-marca-50 px-4 py-3 text-sm text-marca-900 ring-1 ring-marca-100">
          <p className="font-medium">Compará la suma con el total de OBTech antes de importar.</p>
          <p className="mt-0.5 text-xs">
            Si no coincide, falta una fila o sobra una. {c.explicacionSaldo}
          </p>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            Saldos al día
            <input type="date" value={fecha} onChange={(e) => onFecha(e.target.value)} className={`${campo} w-44`} />
            <span className="text-xs text-marca-800">normalmente, el día que se deja de usar OBTech</span>
          </label>
        </div>
      )}

      {repetidos.map(({ clave, dup }) => (
        <div key={clave} className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-medium">
            {clave === 'documento' && c.comparar
              ? `Hay documentos que aparecen en más de un ${c.sustantivo[0]}. El sistema no puede tener dos ${c.sustantivo[1]} con el mismo documento: entra el primero, y los demás quedan frenados con el motivo, para que decidas si son el mismo o hay un documento mal escrito.`
              : `Hay ${c.def.campos[clave].toLowerCase()} que aparecen más de una vez. Se importan todas y manda la última.`}
          </p>
          <ul className="mt-2 space-y-0.5 text-xs">
            {[...dup].slice(0, 5).map(([valor, lineas]) => (
              <li key={valor} className="font-mono">
                {valor} → filas {lineas.join(', ')}
              </li>
            ))}
            {dup.size > 5 && <li>y {dup.size - 5} más…</li>}
          </ul>
        </div>
      ))}

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
            <button onClick={() => setVerTodos(!verTodos)} className="mt-2 text-xs font-medium underline">
              {verTodos ? 'Ver menos' : `Ver las ${conError.length}`}
            </button>
          )}
        </div>
      )}

      {opcionesDeImportacion}

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

      <button onClick={onImportar} disabled={aMandar === 0 || importando || !fecha || !listo} className={boton.principal}>
        {importando
          ? 'Importando…'
          : aMandar === 0
            ? 'No hay nada para importar con lo elegido'
            : `Importar ${numero.format(aMandar)} ${aMandar === 1 ? c.sustantivo[0] : c.sustantivo[1]}`}
      </button>
    </div>
  )
}

function ListaDeFilas({ titulo, filas, clase }: { titulo: string; filas: ResultadoFila[]; clase: string }) {
  return (
    <div className={`rounded-xl p-4 text-sm ring-1 ${clase}`}>
      <p className="font-medium">{titulo}</p>
      <ul className="mt-2 space-y-0.5 text-xs">
        {filas.slice(0, 50).map((f, i) => (
          <li key={i}>
            <span className="font-medium">Fila {f.fila}</span>
            {f.codigo && <span> ({f.codigo})</span>}: {f.detalle}
          </li>
        ))}
        {filas.length > 50 && <li>y {filas.length - 50} más…</li>}
      </ul>
    </div>
  )
}

function Resultado({ resumen, c, onOtra }: { resumen: ResumenImportacion; c: Configuracion; onOtra: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-verde-50 p-5 ring-1 ring-verde-200">
        <p className="font-medium text-verde-900">Importación terminada</p>
        <div className="mt-3 flex flex-wrap gap-6">
          <Dato valor={numero.format(resumen.creados)} etiqueta={`${c.sustantivo[1]} nuevos`} tono="bien" />
          <Dato valor={numero.format(resumen.actualizados)} etiqueta="actualizados" tono="bien" />
          {resumen.errores.length > 0 && <Dato valor={numero.format(resumen.errores.length)} etiqueta="con error" tono="mal" />}
        </div>
        {resumen.errores.length > 0 && (
          <p className="mt-3 text-sm text-verde-900">
            Las filas con error no entraron: se corrigen en la planilla y se vuelve a importar el
            archivo entero. Lo que ya entró no se duplica.
          </p>
        )}
      </div>

      {resumen.errores.length > 0 && (
        <ListaDeFilas titulo="Filas que no entraron:" filas={resumen.errores} clase="bg-red-50 text-red-800 ring-red-200" />
      )}
      {resumen.avisos.length > 0 && (
        <ListaDeFilas titulo="Entraron, pero conviene mirarlas:" filas={resumen.avisos} clase="bg-amber-50 text-amber-900 ring-amber-200" />
      )}

      <div className="flex gap-2">
        <Link to={c.volverA} className={boton.principal}>
          Ver {c.volverTexto.toLowerCase()}
        </Link>
        <button onClick={onOtra} className={boton.secundario}>
          Importar otra planilla
        </button>
      </div>
    </div>
  )
}
