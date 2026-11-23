import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { cargarPrecios, mediosParaElegir } from '@/lib/api/precios'
import { cajaAbierta } from '@/lib/api/caja'
import { emitirReciboLibre, sirveParaReciboLibre } from '@/lib/api/recibos'
import { buscarClientes, type ClienteVenta } from '@/lib/api/ventas'
import { useTerminal } from '@/lib/terminal'
import { enCastellano } from '@/lib/errores'
import { avanzarConEnter } from '@/lib/teclado'
import { boton, campo } from '@/estilos'
import { moneda } from '@/lib/tipos'

/*
  El recibo libre (reunión del 19/11): para un pago que no es cobranza
  de cuenta corriente. El caso que se habló: una operación de urgencia
  que sale cara, el cliente paga una parte y se lleva el recibo de lo
  que pagó.

  El cliente se elige de la lista o se escribe a mano. La plata entra a
  la caja abierta —así cuadra en el cierre— y no toca ninguna cuenta.
*/
export default function ReciboLibre({ onCerrar }: { onCerrar: () => void }) {
  const qc = useQueryClient()
  const navegar = useNavigate()
  const { terminal } = useTerminal()
  // Uno por recibo: si se corta la conexión y se aprieta de nuevo, es el mismo recibo.
  const [reciboId] = useState(() => crypto.randomUUID())
  const [aMano, setAMano] = useState(false)
  const [cliente, setCliente] = useState<ClienteVenta | null>(null)
  const [buscar, setBuscar] = useState('')
  const [buscarDiferido, setBuscarDiferido] = useState('')
  const [nombre, setNombre] = useState('')
  const [documento, setDocumento] = useState('')
  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState('')
  const [medioPagoId, setMedioPagoId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setBuscarDiferido(buscar), 250)
    return () => clearTimeout(t)
  }, [buscar])

  const precios = useQuery({ queryKey: ['precios'], queryFn: cargarPrecios })
  const medios = mediosParaElegir(precios.data?.medios ?? []).filter((m) => sirveParaReciboLibre(m.tipo))
  const caja = useQuery({ queryKey: ['caja'], queryFn: () => cajaAbierta(), enabled: !!terminal })
  const clientes = useQuery({
    queryKey: ['recibo-libre-clientes', buscarDiferido],
    queryFn: () => buscarClientes(buscarDiferido),
    enabled: !aMano && !cliente,
  })

  const medio = medios.find((m) => m.id === medioPagoId)
  const cajaId = caja.data?.id ?? null
  const monto = Number(importe.replace(',', '.')) || 0
  const falta =
    !aMano && !cliente
      ? 'Elegí el cliente.'
      : aMano && !nombre.trim()
        ? 'Escribí a nombre de quién va.'
        : concepto.trim().length < 3
          ? 'Escribí por qué es el pago.'
          : !(monto > 0)
            ? 'Poné el importe.'
            : !medio
              ? 'Elegí cómo pagó.'
              : medio.afecta_caja && !cajaId
                ? `Cobrar en ${medio.nombre.toLowerCase()} necesita una caja abierta.`
                : null

  const emitir = useMutation({
    mutationFn: () =>
      emitirReciboLibre({
        id: reciboId,
        clienteId: aMano ? null : (cliente?.id ?? null),
        nombre: aMano ? nombre : null,
        documento: aMano ? documento : null,
        medioPagoId,
        importe: monto,
        cajaId,
        concepto,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['recibos'] })
      navegar(`/recibo/${r.id}`)
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo emitir el recibo.')),
  })

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-tinta/50 p-4">
      <div className="mx-auto my-8 w-full max-w-md rounded-xl bg-white p-5 shadow-xl sm:p-6" onKeyDown={avanzarConEnter}>
        <h2 className="font-semibold text-tinta">Recibo libre</h2>

        <div className="mt-3 flex gap-1 rounded-lg bg-piedra-100 p-1 text-sm">
          {[
            { valor: false, texto: 'Cliente de la lista' },
            { valor: true, texto: 'Escribir a mano' },
          ].map((o) => (
            <button
              key={o.texto}
              type="button"
              onClick={() => setAMano(o.valor)}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
                aMano === o.valor ? 'bg-white text-tinta shadow-sm' : 'text-piedra-500 hover:text-tinta'
              }`}
            >
              {o.texto}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {aMano ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-piedra-600">A nombre de</span>
                <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-piedra-600">DNI o CUIT</span>
                <input
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  inputMode="numeric"
                  placeholder="Opcional"
                  className={campo}
                />
              </label>
            </div>
          ) : cliente ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-piedra-50 px-3 py-2 ring-1 ring-borde">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-tinta">{cliente.nombre}</p>
                {cliente.numero_documento && <p className="text-xs text-piedra-500">{cliente.numero_documento}</p>}
              </div>
              <button type="button" onClick={() => setCliente(null)} className="text-xs font-medium text-marca-700 hover:underline">
                Cambiar
              </button>
            </div>
          ) : (
            <div>
              <input
                autoFocus
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Cliente: nombre, CUIT o código"
                className={campo}
              />
              <ul className="mt-1 max-h-48 divide-y divide-piedra-100 overflow-y-auto rounded-lg ring-1 ring-borde">
                {(clientes.data ?? []).map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setCliente(c)} className="w-full px-3 py-2 text-left text-sm hover:bg-marca-50">
                      <span className="font-medium text-tinta">{c.nombre}</span>
                      {c.numero_documento && <span className="ml-2 text-xs text-piedra-500">{c.numero_documento}</span>}
                    </button>
                  </li>
                ))}
                {!clientes.isFetching && (clientes.data ?? []).length === 0 && (
                  <li className="px-3 py-2 text-xs text-piedra-400">No hay clientes con esa búsqueda.</li>
                )}
              </ul>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">En concepto de</span>
            <textarea
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              rows={2}
              placeholder="Ej.: Pago parcial de la cirugía"
              className={campo}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">Importe</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                className={`${campo} text-right tabular-nums`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">Cómo pagó</span>
              <select value={medioPagoId} onChange={(e) => setMedioPagoId(e.target.value)} className={campo}>
                <option value="">Elegir…</option>
                {medios.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {medio?.afecta_caja && cajaId && monto > 0 && (
            <p className="text-xs text-piedra-500">Entran {moneda.format(monto)} a la caja abierta.</p>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {falta && <p className="mr-auto text-xs text-piedra-500">{falta}</p>}
          <button type="button" onClick={onCerrar} className={boton.suave}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null)
              emitir.mutate()
            }}
            disabled={!!falta || emitir.isPending}
            className={boton.principal}
          >
            {emitir.isPending ? 'Emitiendo…' : 'Emitir recibo'}
          </button>
        </div>
      </div>
    </div>
  )
}
