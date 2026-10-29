import { useState } from 'react'
import { moneda } from '@/lib/tipos'
import type { Vencido } from '@/lib/vencido'

/*
  Lo que debe vencido el cliente, y el PIN del encargado que deja pasar
  la venta a cuenta corriente. Con efectivo o tarjeta no hace falta: el
  que debe puede seguir comprando, lo que no puede es sumar deuda.
*/
export default function AvisoVencido({
  vencido,
  aCuentaCorriente,
  autorizo,
  onAutorizar,
}: {
  vencido: Vencido
  aCuentaCorriente: boolean
  autorizo: { nombre: string } | null
  onAutorizar: (pin: string) => Promise<void>
}) {
  const [pin, setPin] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debe = `Debe ${moneda.format(vencido.monto)} vencido${
    vencido.desde ? ` desde el ${new Date(`${vencido.desde}T12:00:00`).toLocaleDateString('es-AR')}` : ''
  }.`

  if (autorizo) {
    return (
      <p className="mt-3 rounded-lg bg-piedra-50 px-3 py-2 text-xs text-piedra-600 ring-1 ring-borde">
        {debe} A cuenta corriente: autorizó {autorizo.nombre}.
      </p>
    )
  }

  if (!aCuentaCorriente) {
    return (
      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
        {debe} A cuenta corriente, lo tiene que autorizar un encargado.
      </p>
    )
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-red-50 px-3 py-2.5 ring-1 ring-red-200">
      <p className="text-sm text-red-800">
        {debe} Para venderle a cuenta corriente, lo tiene que autorizar un encargado.
      </p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!pin.trim()) return
          setTrabajando(true)
          setError(null)
          try {
            await onAutorizar(pin.trim())
          } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo autorizar.')
          } finally {
            setPin('')
            setTrabajando(false)
          }
        }}
      >
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN del encargado"
          aria-label="PIN del encargado"
          className="min-w-0 flex-1 basis-40 rounded-lg border border-borde bg-white px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={!pin.trim() || trabajando}
          className="rounded-lg bg-marca-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
        >
          {trabajando ? 'Verificando…' : 'Autorizar'}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
