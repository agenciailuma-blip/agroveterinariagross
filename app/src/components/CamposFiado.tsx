import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sumarDias, hoyEnObera, diasEntre } from '@/lib/api/cheques'
import { avisoFiado, dniValido, faltaEnFiado, soloDigitos, textoDelAviso } from '@/lib/api/fiados'
import type { DatosFiado } from '@/lib/api/fiados'
import { useSync } from '@/lib/local/SyncProvider'
import { campo } from '@/estilos'
import { avanzarConEnter } from '@/lib/teclado'

/*
  ─────────────────────────────────────────────────────────────
  Los datos del fiado, en la caja

  Fase 03, punto 7. Primero el DNI: es por lo que se busca a la persona.
  Si ya tuvo un fiado, aparece el aviso —«ojo, este DNI ya tiene una
  carga anterior»— con lo que debe o debió, y la ficha se completa sola.

  El aviso necesita conexión. Sin ella el fiado se carga igual y sube
  cuando vuelve internet; lo que no se puede es mirar si ya debía.
  ─────────────────────────────────────────────────────────────
*/
export default function CamposFiado({
  valor,
  onChange,
}: {
  valor: DatosFiado
  onChange: (d: DatosFiado) => void
}) {
  const { enLinea } = useSync()
  const hoy = hoyEnObera()
  const cambiar = (c: Partial<DatosFiado>) => onChange({ ...valor, ...c })
  const dni = soloDigitos(valor.documento)

  const aviso = useAvisoFiado(dni)

  // La ficha que ya existe completa lo que todavía está vacío, una vez por DNI.
  const completado = useRef<string | null>(null)
  useEffect(() => {
    const a = aviso.data
    if (!a || completado.current === a.documento) return
    completado.current = a.documento
    onChange({
      ...valor,
      nombre: valor.nombre.trim() ? valor.nombre : a.nombre,
      domicilio: valor.domicilio.trim() ? valor.domicilio : (a.domicilio ?? ''),
      telefono: valor.telefono.trim() ? valor.telefono : (a.telefono ?? ''),
    })
  }, [aviso.data])

  const dias = /^\d{4}-\d{2}-\d{2}$/.test(valor.vence) ? diasEntre(hoy, valor.vence) : null
  const falta = faltaEnFiado(valor, hoy)
  const mostrarFalta = falta && (dni.length > 0 || !/^Falta/.test(falta))

  return (
    <div className="@container space-y-2" onKeyDown={avanzarConEnter}>
      <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-piedra-600">DNI</span>
          <input
            value={valor.documento}
            onChange={(e) => cambiar({ documento: e.target.value })}
            inputMode="numeric"
            autoFocus
            className={campo}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-piedra-600">Nombre</span>
          <input value={valor.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} className={campo} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-piedra-600">Domicilio</span>
          <input value={valor.domicilio} onChange={(e) => cambiar({ domicilio: e.target.value })} className={campo} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-piedra-600">Teléfono</span>
          <input
            value={valor.telefono}
            onChange={(e) => cambiar({ telefono: e.target.value })}
            inputMode="tel"
            className={campo}
          />
        </label>
      </div>

      {aviso.data && <AvisoDeFiado texto={textoDelAviso(aviso.data)} nombre={aviso.data.nombre} debe={aviso.data.debe} />}
      {!enLinea && dniValido(dni) && (
        <p className="text-xs text-piedra-500">Sin conexión no se puede ver si este DNI ya tiene fiados.</p>
      )}

      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-piedra-600">Paga el</span>
          <input
            type="date"
            value={valor.vence}
            min={hoy}
            onChange={(e) => cambiar({ vence: e.target.value })}
            className={campo}
          />
        </label>
        <span className="flex flex-wrap items-center gap-1 pb-1.5 text-xs text-piedra-500">
          {[7, 15, 30].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => cambiar({ vence: sumarDias(hoy, n) })}
              className={`rounded-full px-2 py-0.5 ring-1 ${
                dias === n ? 'bg-marca-700 text-white ring-marca-700' : 'text-marca-700 ring-borde hover:bg-marca-50'
              }`}
            >
              {n} días
            </button>
          ))}
        </span>
      </div>
      <p className="text-[11px] text-piedra-400">Más de una fecha se arma después, desde Fiados.</p>

      {mostrarFalta && <p className="text-xs text-red-700">{falta}</p>}
    </div>
  )
}

function useAvisoFiado(documento: string) {
  const { enLinea } = useSync()
  const dni = soloDigitos(documento)
  return useQuery({
    queryKey: ['fiado-aviso', dni],
    queryFn: () => avisoFiado(dni),
    enabled: enLinea && dniValido(dni),
    staleTime: 30_000,
  })
}

/*
  En el mostrador: el vendedor marcó que va fiado y puede mirar, antes
  de mandarlo a la caja, si esa persona ya debe. Los datos se cargan en
  la caja; esto sólo consulta.
*/
export function ConsultaFiado() {
  const { enLinea } = useSync()
  const [dni, setDni] = useState('')
  const aviso = useAvisoFiado(dni)
  return (
    <div className="mt-3 space-y-2">
      <label className="block">
        <span className="mb-1 block text-xs text-piedra-600">DNI de quien se lo lleva</span>
        <input value={dni} onChange={(e) => setDni(e.target.value)} inputMode="numeric" className={campo} />
      </label>
      {aviso.data && <AvisoDeFiado texto={textoDelAviso(aviso.data)} nombre={aviso.data.nombre} debe={aviso.data.debe} />}
      {aviso.isSuccess && !aviso.data && <p className="text-xs text-verde-700">No tiene fiados anteriores.</p>}
      {!enLinea && dniValido(dni) && <p className="text-xs text-piedra-500">Sin conexión no se puede consultar.</p>}
    </div>
  )
}

/** «Ojo, este DNI ya tiene una carga anterior». En la caja y en el mostrador. */
export function AvisoDeFiado({ nombre, texto, debe }: { nombre: string; texto: string; debe: number }) {
  return (
    <div
      role="alert"
      className={`rounded-lg px-3 py-2 text-xs ring-1 ${
        debe > 0.009 ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-piedra-50 text-piedra-700 ring-borde'
      }`}
    >
      <p className="font-medium">Ojo: este DNI ya tiene una carga anterior, a nombre de {nombre}.</p>
      <p>{texto}</p>
    </div>
  )
}
