import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { clientesConCuit, consultarCuitEnArca, guardarCliente, referenciasFiscales } from '@/lib/api/clientes'
import type { ClienteConCuit, DatosDeArca } from '@/lib/api/clientes'
import { numero } from '@/lib/tipos'
import { barraDeAvance, boton, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Verificar los clientes contra ARCA

  Para el día del corte. Los clientes vienen de OBTech con la condición
  frente al IVA que alguien cargó a mano hace años, y una condición
  vieja es una factura con la letra equivocada: un monotributista que
  pasó a responsable inscripto sigue recibiendo B, y ARCA la autoriza
  igual. Acá se le pregunta a ARCA por cada CUIT y se muestran sólo los
  que no coinciden, para corregirlos de una vez.

  Se corrige sólo la condición. El nombre de ARCA se muestra al lado
  pero no se pisa: en el local los clientes se conocen por cómo los
  llaman —«Cabaña Don Ramón»—, no por la razón social.

  Se pregunta de a uno, con una pausa: son cientos de consultas y ARCA
  no es un servicio para apurar.
  ─────────────────────────────────────────────────────────────
*/

type Hallazgo =
  | { tipo: 'distinta'; cliente: ClienteConCuit; arca: DatosDeArca }
  | { tipo: 'sin_condicion'; cliente: ClienteConCuit; arca: DatosDeArca }
  | { tipo: 'no_existe'; cliente: ClienteConCuit }
  | { tipo: 'cuit_invalido'; cliente: ClienteConCuit }
  | { tipo: 'avisos'; cliente: ClienteConCuit; arca: DatosDeArca }

const PAUSA_MS = 300

export default function VerificarClientesArca() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const puedeEditar = tienePermiso('clientes.editar')

  const clientes = useQuery({ queryKey: ['clientes-con-cuit'], queryFn: clientesConCuit })
  const referencias = useQuery({ queryKey: ['referencias-fiscales'], queryFn: referenciasFiscales, staleTime: 10 * 60_000 })

  const [estado, setEstado] = useState<'inicio' | 'verificando' | 'listo'>('inicio')
  const [hechos, setHechos] = useState(0)
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([])
  const [coinciden, setCoinciden] = useState(0)
  const [corte, setCorte] = useState<string | null>(null)
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [corregidos, setCorregidos] = useState<number | null>(null)
  const seguir = useRef(true)

  const condiciones = referencias.data?.condiciones ?? []
  const describir = (id: number | null) => {
    const c = condiciones.find((x) => x.id === id)
    return c ? `${c.descripcion} (Factura ${c.tipo_comprobante})` : 'Sin condición'
  }

  async function verificar() {
    const lista = clientes.data ?? []
    seguir.current = true
    setEstado('verificando')
    setHechos(0)
    setHallazgos([])
    setCoinciden(0)
    setCorte(null)
    setCorregidos(null)

    const encontrados: Hallazgo[] = []
    let iguales = 0
    for (const [i, cliente] of lista.entries()) {
      if (!seguir.current) break
      const r = await consultarCuitEnArca(cliente.numero_documento)

      if (!r.ok) {
        if (r.motivo === 'no_existe' || r.motivo === 'cuit_invalido') {
          encontrados.push({ tipo: r.motivo, cliente })
        } else {
          // ARCA no contesta, no está autorizado o se cortó internet:
          // seguir sería preguntar cientos de veces lo mismo.
          setCorte(r.error)
          break
        }
      } else if (r.datos.condicion_iva_id === null) {
        encontrados.push({ tipo: 'sin_condicion', cliente, arca: r.datos })
      } else if (r.datos.condicion_iva_id !== cliente.condicion_iva_id) {
        encontrados.push({ tipo: 'distinta', cliente, arca: r.datos })
      } else if (r.datos.avisos.length) {
        encontrados.push({ tipo: 'avisos', cliente, arca: r.datos })
      } else {
        iguales++
      }

      setHechos(i + 1)
      setHallazgos([...encontrados])
      setCoinciden(iguales)
      await new Promise((res) => setTimeout(res, PAUSA_MS))
    }

    // Lo que ARCA dice distinto viene marcado para corregir: es para
    // lo que se entró a esta pantalla.
    setElegidos(new Set(encontrados.filter((h) => h.tipo === 'distinta').map((h) => h.cliente.id)))
    setEstado('listo')
  }

  async function corregir() {
    setCorrigiendo(true)
    let n = 0
    for (const h of hallazgos) {
      if (h.tipo !== 'distinta' || !elegidos.has(h.cliente.id)) continue
      try {
        await guardarCliente(h.cliente.id, { condicion_iva_id: h.arca.condicion_iva_id! })
        n++
      } catch (e) {
        setCorte(`No se pudo corregir a ${h.cliente.nombre}: ${e instanceof Error ? e.message : String(e)}`)
        break
      }
    }
    setCorrigiendo(false)
    setCorregidos(n)
    setHallazgos((prev) => prev.filter((h) => !(h.tipo === 'distinta' && elegidos.has(h.cliente.id))))
    setElegidos(new Set())
    qc.invalidateQueries({ queryKey: ['clientes'] })
    qc.invalidateQueries({ queryKey: ['clientes-con-cuit'] })
  }

  const total = clientes.data?.length ?? 0
  const distintas = hallazgos.filter((h): h is Extract<Hallazgo, { tipo: 'distinta' }> => h.tipo === 'distinta')
  const otros = hallazgos.filter((h) => h.tipo !== 'distinta')

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link to="/clientes" className="text-sm text-marca-700 hover:underline">
          ← Volver a Clientes
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-tinta">Verificar con ARCA</h1>
        <p className="text-sm text-piedra-500">
          Le pregunta a ARCA la condición frente al IVA de cada cliente con CUIT y muestra los que no coinciden con
          lo cargado. Conviene hacerlo después de importar los clientes, antes de empezar a facturar.
        </p>
      </div>

      {!puedeEditar ? (
        <p className={`${tarjeta} p-4 text-sm text-piedra-600`}>Corregir clientes necesita el permiso de editarlos.</p>
      ) : (
        <div className={`${tarjeta} space-y-3 p-4`}>
          {estado === 'inicio' && (
            <>
              <p className="text-sm text-tinta">
                {clientes.isLoading
                  ? 'Contando los clientes…'
                  : `${numero.format(total)} ${total === 1 ? 'cliente tiene' : 'clientes tienen'} CUIT.`}{' '}
                <span className="text-piedra-500">Tarda alrededor de medio segundo cada uno.</span>
              </p>
              <button onClick={() => void verificar()} disabled={!total} className={boton.principal}>
                Verificar
              </button>
            </>
          )}

          {estado === 'verificando' && (
            <>
              <p className="text-sm text-tinta">
                Consultando {numero.format(hechos)} de {numero.format(total)}…
              </p>
              <div className={barraDeAvance.fondo}>
                <div className={barraDeAvance.relleno} style={{ width: `${total ? (hechos / total) * 100 : 0}%` }} />
              </div>
              <button onClick={() => (seguir.current = false)} className={boton.suave}>
                Detener
              </button>
            </>
          )}

          {estado === 'listo' && (
            <>
              <p className="text-sm text-tinta">
                Se consultaron {numero.format(hechos)} de {numero.format(total)}.{' '}
                <strong>{numero.format(coinciden)}</strong> {coinciden === 1 ? 'coincide' : 'coinciden'} con ARCA.
                {distintas.length > 0 && (
                  <> <strong>{distintas.length}</strong> {distintas.length === 1 ? 'tiene' : 'tienen'} otra condición.</>
                )}
              </p>
              <button onClick={() => void verificar()} className={boton.secundario}>
                Verificar de nuevo
              </button>
            </>
          )}

          {corte && (
            <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
              Se detuvo: {corte}
            </p>
          )}
          {corregidos !== null && (
            <p className="rounded-lg bg-verde-50 px-3 py-2 text-sm text-verde-800 ring-1 ring-verde-200">
              {corregidos === 1 ? 'Se corrigió 1 cliente.' : `Se corrigieron ${numero.format(corregidos)} clientes.`}
            </p>
          )}
        </div>
      )}

      {distintas.length > 0 && (
        <div className={`${tarjeta} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-4 py-3">
            <p className="text-sm font-medium text-tinta">ARCA dice otra condición</p>
            <button
              onClick={() => void corregir()}
              disabled={!elegidos.size || corrigiendo || estado === 'verificando'}
              className={boton.principal}
            >
              {corrigiendo ? 'Corrigiendo…' : `Corregir ${elegidos.size}`}
            </button>
          </div>
          <ul className="divide-y divide-borde">
            {distintas.map((h) => (
              <li key={h.cliente.id}>
                <label className="flex items-start gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={elegidos.has(h.cliente.id)}
                    onChange={(e) =>
                      setElegidos((prev) => {
                        const n = new Set(prev)
                        if (e.target.checked) n.add(h.cliente.id)
                        else n.delete(h.cliente.id)
                        return n
                      })
                    }
                    className="mt-1 size-4 rounded border-borde text-marca-700 focus:ring-marca-500"
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium text-tinta">{h.cliente.nombre}</span>
                    <span className="block text-xs text-piedra-500">
                      CUIT {h.cliente.numero_documento} · en ARCA: {h.arca.nombre}
                    </span>
                    <span className="mt-1 block text-xs">
                      <span className="text-piedra-500 line-through">{describir(h.cliente.condicion_iva_id)}</span>{' '}
                      → <span className="font-medium text-tinta">{describir(h.arca.condicion_iva_id)}</span>
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {otros.length > 0 && (
        <div className={`${tarjeta} overflow-hidden`}>
          <p className="border-b border-borde px-4 py-3 text-sm font-medium text-tinta">Para revisar a mano</p>
          <ul className="divide-y divide-borde">
            {otros.map((h) => (
              <li key={h.cliente.id} className="px-4 py-3 text-sm">
                <span className="block font-medium text-tinta">{h.cliente.nombre}</span>
                <span className="block text-xs text-piedra-500">CUIT {h.cliente.numero_documento}</span>
                <span className="mt-1 block text-xs text-amber-800">
                  {h.tipo === 'cuit_invalido'
                    ? 'El CUIT está mal escrito: el último número, el verificador, no corresponde. No se consultó a ARCA.'
                    : h.tipo === 'no_existe'
                      ? 'ARCA no tiene ningún contribuyente con ese CUIT: probablemente está mal cargado.'
                      : h.arca.avisos.join(' ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
