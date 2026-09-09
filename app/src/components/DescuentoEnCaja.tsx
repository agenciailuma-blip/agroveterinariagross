import { useEffect, useRef, useState } from 'react'
import { moneda } from '@/lib/tipos'
import { MOTIVOS_DE_AJUSTE } from '@/lib/motivos'

/*
  ─────────────────────────────────────────────────────────────
  El descuento de la caja

  Pedido por Lucas el 07/09. Antes esto eran dos `window.prompt`
  seguidos: "¿en cuánto queda?" y "¿por qué?". Tres problemas, y los
  tres los nombró él:

  1. Sólo se podía llevar el total a un número. "Hacele un 10%" era
     una cuenta mental con el cliente adelante — y la cuenta mental
     al lado de la caja registradora es de donde salen las
     diferencias del arqueo.
  2. El motivo se escribía. Ver `lib/motivos.ts` para por qué eso
     hace que después no se pueda contar nada.
  3. El cartel decía "tauri localhost dice".

  Lo que se ve mientras se decide es el punto de todo esto: los dos
  números, el de antes y el de después, y cuánto se está regalando.
  Un porcentaje sin el peso al lado no dice nada — 8% puede ser
  cuatrocientos pesos o cuarenta mil.
  ─────────────────────────────────────────────────────────────
*/

interface Props {
  totalActual: number
  trabajando: boolean
  onAplicar: (nuevoTotal: number, motivo: string) => void
  onCerrar: () => void
}

type Forma = 'porcentaje' | 'total'

export default function DescuentoEnCaja({ totalActual, trabajando, onAplicar, onCerrar }: Props) {
  const [forma, setForma] = useState<Forma>('porcentaje')
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState<string>(MOTIVOS_DE_AJUSTE[0])
  const [propio, setPropio] = useState('')
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    campo.current?.focus()
    campo.current?.select()
  }, [forma])

  const n = Number(valor.replace(',', '.'))
  const hayNumero = valor.trim() !== '' && Number.isFinite(n)

  /*
    El total que queda. Se redondea a centavos acá y no al enviarlo:
    lo que se muestra tiene que ser exactamente lo que se manda, o el
    cajero ve un número y la base guarda otro.
  */
  const nuevoTotal = !hayNumero
    ? totalActual
    : forma === 'porcentaje'
      ? Math.round(totalActual * (1 - n / 100) * 100) / 100
      : Math.round(n * 100) / 100

  const rebaja = totalActual - nuevoTotal
  const porcentaje = totalActual > 0 ? (rebaja / totalActual) * 100 : 0

  const motivoFinal = motivo === '__otro__' ? propio.trim() : motivo
  const sube = nuevoTotal > totalActual

  const problema = !hayNumero
    ? null
    : nuevoTotal <= 0
      ? 'El total tiene que quedar arriba de cero.'
      : motivoFinal.length < 3
        ? 'Falta el motivo. Queda registrado con tu nombre.'
        : null

  const puedeAplicar = hayNumero && !problema && !trabajando

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCerrar()
        if (e.key === 'Enter' && puedeAplicar) {
          e.preventDefault()
          onAplicar(nuevoTotal, motivoFinal)
        }
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg ring-1 ring-borde">
        <h2 className="font-semibold text-tinta">Descuento</h2>
        <p className="mt-1 text-sm text-piedra-600">
          Total actual <strong className="tabular-nums">{moneda.format(totalActual)}</strong>
        </p>

        {/* Dos formas de decir lo mismo. La de porcentaje va primera
            porque es la que faltaba y la que se usa hablando. */}
        <div className="mt-4 flex gap-1 rounded-lg bg-piedra-100 p-1">
          {(
            [
              ['porcentaje', 'Un porcentaje'],
              ['total', 'Dejarlo en…'],
            ] as const
          ).map(([f, texto]) => (
            <button
              key={f}
              onClick={() => {
                setForma(f)
                setValor('')
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                forma === f ? 'bg-white text-tinta shadow-sm' : 'text-piedra-500 hover:text-tinta'
              }`}
            >
              {texto}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          {forma === 'total' && <span className="text-lg text-piedra-400">$</span>}
          <input
            ref={campo}
            type="number"
            step={forma === 'porcentaje' ? '1' : '0.01'}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={forma === 'porcentaje' ? '10' : String(Math.round(totalActual))}
            className="w-full rounded-lg border border-borde bg-white px-3 py-2 text-lg tabular-nums text-tinta focus:border-marca-500 focus:ring-1 focus:ring-marca-500 focus:outline-none"
          />
          {forma === 'porcentaje' && <span className="text-lg text-piedra-400">%</span>}
        </div>

        {/*
          Lo que de verdad se está decidiendo. Aparece recién cuando
          hay un número, así no titila mientras se tipea.
        */}
        {hayNumero && (
          <div className="mt-3 rounded-lg bg-piedra-50 px-3 py-2.5 ring-1 ring-borde">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-piedra-600">Queda en</span>
              <span className="text-xl font-semibold tabular-nums text-tinta">
                {moneda.format(nuevoTotal)}
              </span>
            </div>
            <p className={`mt-0.5 text-xs ${sube ? 'text-amber-700' : 'text-piedra-500'}`}>
              {sube
                ? `Sube ${moneda.format(-rebaja)} — verificá que sea lo que querés`
                : `Se descuentan ${moneda.format(rebaja)} · ${porcentaje.toFixed(1)}%`}
            </p>
          </div>
        )}

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium tracking-wide text-piedra-400 uppercase">
            Motivo
          </label>
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-500 focus:ring-1 focus:ring-marca-500 focus:outline-none"
          >
            {MOTIVOS_DE_AJUSTE.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value="__otro__">Otro (escribirlo)…</option>
          </select>
          {motivo === '__otro__' && (
            <input
              autoFocus
              value={propio}
              onChange={(e) => setPropio(e.target.value)}
              placeholder="¿Por qué se rebaja?"
              className="mt-2 w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-500 focus:ring-1 focus:ring-marca-500 focus:outline-none"
            />
          )}
        </div>

        {problema && <p className="mt-2 text-xs text-red-600">{problema}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-piedra-600 hover:bg-piedra-100"
          >
            Cancelar
          </button>
          <button
            onClick={() => onAplicar(nuevoTotal, motivoFinal)}
            disabled={!puedeAplicar}
            className="rounded-lg bg-marca-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-marca-800 disabled:opacity-40"
          >
            {trabajando ? 'Aplicando…' : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>
  )
}
