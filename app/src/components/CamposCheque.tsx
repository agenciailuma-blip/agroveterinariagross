import { useId } from 'react'
import { BANCOS, diasEntre, faltaEnCheque, hoyEnObera, sumarDias } from '@/lib/api/cheques'
import type { DatosCheque } from '@/lib/api/cheques'
import { campo } from '@/estilos'

/*
  Los datos de un cheque, en el mismo orden en que se leen en el papel:
  banco, número, fecha de pago y quién lo firmó.

  Es el mismo formulario en la caja, en la cobranza de la cuenta y al
  pagarle a un proveedor con uno propio. Un solo lugar, así los tres
  piden lo mismo y un cheque cargado en la caja se puede endosar sin
  completar nada.

  En una grilla que se acomoda al ancho DEL LUGAR donde está, no al de la
  pantalla: el panel de cobro de la caja es angosto aunque el monitor
  sea ancho, y con cuatro columnas ahí el librador se cortaba. De a dos
  por renglón donde no entra más, sin desplazarse hacia el costado.
*/
export default function CamposCheque({
  valor,
  onChange,
  importe,
  onImporte,
  origen = 'tercero',
  conLibrador = true,
  autoFocus = false,
}: {
  valor: DatosCheque
  onChange: (d: DatosCheque) => void
  /** Si se pasa, el importe se escribe acá. Si no, lo pone quien lo usa. */
  importe?: string
  onImporte?: (t: string) => void
  origen?: 'tercero' | 'propio'
  conLibrador?: boolean
  autoFocus?: boolean
}) {
  const id = useId()
  const hoy = hoyEnObera()
  const cambiar = (c: Partial<DatosCheque>) => onChange({ ...valor, ...c })
  const dias = /^\d{4}-\d{2}-\d{2}$/.test(valor.fecha_pago) ? diasEntre(hoy, valor.fecha_pago) : null
  const falta = faltaEnCheque(valor, origen, hoy)
  // Un error de fecha o de CUIT se dice ya; «falta el banco» recién
  // cuando la persona empezó a escribir, no con el formulario vacío.
  const empezado = valor.banco.trim() || valor.numero.trim()
  const mostrarFalta = falta && (empezado || !/^Falta/.test(falta))

  return (
    <div className="@container space-y-2">
      <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-piedra-600">Banco</span>
          <input
            list={`${id}-bancos`}
            value={valor.banco}
            onChange={(e) => cambiar({ banco: e.target.value })}
            autoFocus={autoFocus}
            className={campo}
          />
          <datalist id={`${id}-bancos`}>
            {BANCOS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-piedra-600">Número</span>
          <input
            value={valor.numero}
            onChange={(e) => cambiar({ numero: e.target.value })}
            inputMode="numeric"
            className={campo}
          />
        </label>
        {onImporte && (
          <label className="block min-w-0">
            <span className="mb-1 block text-xs text-piedra-600">Importe</span>
            <input
              value={importe ?? ''}
              onChange={(e) => onImporte(e.target.value)}
              inputMode="decimal"
              className={`${campo} text-right tabular-nums`}
            />
          </label>
        )}
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-piedra-600">Fecha de pago</span>
          <input
            type="date"
            value={valor.fecha_pago}
            onChange={(e) => cambiar({ fecha_pago: e.target.value })}
            className={campo}
          />
        </label>
        {conLibrador && (
          <>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs text-piedra-600">Librador</span>
              <input
                value={valor.librador}
                onChange={(e) => cambiar({ librador: e.target.value })}
                placeholder="Quién lo firmó"
                className={campo}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs text-piedra-600">
                CUIT <span className="text-piedra-400">(opcional)</span>
              </span>
              <input
                value={valor.librador_cuit}
                onChange={(e) => cambiar({ librador_cuit: e.target.value })}
                inputMode="numeric"
                className={campo}
              />
            </label>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <label className="flex items-center gap-1.5 text-piedra-600">
          <input type="checkbox" checked={valor.electronico} onChange={(e) => cambiar({ electronico: e.target.checked })} />
          Es e-cheq
        </label>
        {/*
          Al día o diferido, dicho en días. Los botones cubren los plazos
          que más se usan, para no abrir el calendario del navegador.
        */}
        <span className="flex flex-wrap items-center gap-1 text-piedra-500">
          {[0, 30, 60, 90].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => cambiar({ fecha_pago: sumarDias(hoy, n) })}
              className={`rounded-full px-2 py-0.5 ring-1 ${
                dias === n ? 'bg-marca-700 text-white ring-marca-700' : 'text-marca-700 ring-borde hover:bg-marca-50'
              }`}
            >
              {n === 0 ? 'Al día' : `${n} días`}
            </button>
          ))}
        </span>
        {dias !== null && dias > 0 && ![30, 60, 90].includes(dias) && (
          <span className="text-piedra-500">Diferido a {dias} días</span>
        )}
      </div>

      {mostrarFalta && <p className="text-xs text-red-700">{falta}</p>}
    </div>
  )
}
