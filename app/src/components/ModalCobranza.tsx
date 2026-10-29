import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { cargarPrecios, mediosParaElegir } from '@/lib/api/precios'
import { chequeVacio, faltaEnCheque, paraLaBase } from '@/lib/api/cheques'
import type { DatosCheque } from '@/lib/api/cheques'
import { emitirRecibo, type FormaDeCobro, type ReciboEmitido } from '@/lib/api/recibos'
import { enCastellano } from '@/lib/errores'
import CamposCheque from '@/components/CamposCheque'
import { moneda } from '@/lib/tipos'
import { avanzarConEnter } from '@/lib/teclado'

/*
  La cobranza de una cuenta corriente, que sale con su recibo.

  La usan la ficha del cliente y la orden de recibo del vendedor de
  calle: al aceptar una orden se abre esta misma ventana con lo que dijo
  el vendedor —importe y forma— ya puesto, para corregirlo si en el banco
  entró otra cosa.
*/
export default function ModalCobranza({
  cliente,
  saldo,
  cajaId,
  inicial,
  onListo,
  onCancelar,
}: {
  cliente: { id: string; nombre: string }
  saldo: number
  cajaId: string | null
  /** Lo que trae la orden de recibo del vendedor. */
  inicial?: { importe: number; forma: FormaDeCobro; ordenId: string; ordenNumero: number; detalle: string | null }
  onListo: (r: ReciboEmitido) => void
  onCancelar: () => void
}) {
  // Uno por cobranza: si se corta la conexión y se aprieta de nuevo, es el mismo recibo.
  const [reciboId] = useState(() => crypto.randomUUID())
  const [importe, setImporte] = useState(String(inicial?.importe ?? Math.max(saldo, 0)))
  const [medioPagoId, setMedioPagoId] = useState<string>('')
  const [concepto, setConcepto] = useState('')
  const [error, setError] = useState<string | null>(null)
  /*
    Con cheque, lo que se paga es la suma de los cheques: cada uno con
    su importe, porque cada uno se deposita, se endosa o rebota por su
    cuenta.
  */
  const [cheques, setCheques] = useState<{ datos: DatosCheque; importe: string }[]>([])

  const precios = useQuery({ queryKey: ['precios'], queryFn: cargarPrecios })
  const medios = mediosParaElegir(precios.data?.medios ?? []).filter((m) => m.tipo !== 'cuenta_corriente')

  // La forma que dijo el vendedor elige el medio sola, una vez que llegan los medios.
  const [elegidoDeLaOrden, setElegidoDeLaOrden] = useState(false)
  if (inicial && !elegidoDeLaOrden && medios.length > 0) {
    setElegidoDeLaOrden(true)
    const m = medios.find((x) => x.tipo === inicial.forma)
    if (m) elegir(m.id)
  }

  const medio = medios.find((m) => m.id === medioPagoId)
  const conCheque = medio?.tipo === 'cheque'

  const importeCheques = Math.round(cheques.reduce((s, c) => s + (Number(c.importe.replace(',', '.')) || 0), 0) * 100) / 100
  const aCobrar = conCheque ? importeCheques : Number(importe || 0)
  const chequeIncompleto =
    conCheque &&
    (cheques.length === 0 ||
      cheques.some((c) => faltaEnCheque(c.datos) || !(Number(c.importe.replace(',', '.')) > 0)))

  function elegir(id: string) {
    setMedioPagoId(id)
    const m = medios.find((x) => x.id === id)
    // El primer cheque arranca con lo que debe, igual que el importe.
    if (m?.tipo === 'cheque' && cheques.length === 0) {
      setCheques([{ datos: chequeVacio(cliente.nombre), importe: importe || String(saldo) }])
    }
  }

  const cobrar = useMutation({
    mutationFn: () =>
      emitirRecibo({
        id: reciboId,
        clienteId: cliente.id,
        medioPagoId,
        importe: conCheque ? null : Number(importe),
        cheques: conCheque
          ? cheques.map((c) => paraLaBase(c.datos, Number(c.importe.replace(',', '.'))))
          : null,
        cajaId,
        concepto: concepto.trim() || null,
        ordenId: inicial?.ordenId ?? null,
      }),
    onSuccess: onListo,
    onError: (e) => setError(enCastellano(e, 'No se pudo registrar.')),
  })

  const faltaCaja = medio?.afecta_caja && !cajaId
  const restante = Math.round((saldo - aCobrar) * 100) / 100

  return (
    // Con varios cheques la ventana crece hacia abajo: se desplaza entera,
    // en vez de quedar cortada arriba y abajo.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-tinta/50 p-4">
      <div className={`mx-auto my-8 w-full rounded-xl bg-white p-6 shadow-xl ${conCheque ? 'max-w-2xl' : 'max-w-md'}`} onKeyDown={avanzarConEnter}>
        <h2 className="font-semibold text-tinta">
          {inicial ? `Aceptar la orden de recibo ${inicial.ordenNumero}` : 'Cobranza'}
        </h2>
        <p className="mt-0.5 text-sm text-piedra-500">
          {cliente.nombre} · debe {moneda.format(saldo)}
        </p>
        {inicial?.detalle && (
          <p className="mt-2 rounded-lg bg-piedra-50 px-3 py-2 text-sm whitespace-pre-wrap break-words text-piedra-700 ring-1 ring-borde">
            {inicial.detalle}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {!conCheque && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">Importe</span>
              <input
                type="number"
                min="0"
                step="0.01"
                autoFocus
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                className="w-full rounded-lg border border-borde px-3 py-2.5 text-right text-lg tabular-nums outline-none focus:border-marca-500"
              />
            </label>
          )}
          {aCobrar > 0 && (
            <span className="block text-xs text-piedra-400">
              {conCheque && `Los cheques suman ${moneda.format(aCobrar)}. `}
              {restante > 0
                ? `Queda debiendo ${moneda.format(restante)}`
                : restante < 0
                  ? `Paga de más ${moneda.format(-restante)} — le queda a favor`
                  : 'Cancela la cuenta'}
            </span>
          )}

          <div>
            <span className="mb-1 block text-xs font-medium text-piedra-600">¿Con qué paga?</span>
            <div className="flex flex-wrap gap-1.5">
              {medios.map((m) => (
                <button
                  key={m.id}
                  onClick={() => elegir(m.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-colors ${
                    medioPagoId === m.id
                      ? 'bg-marca-700 text-white ring-marca-700'
                      : 'bg-white text-piedra-600 ring-borde hover:bg-piedra-50'
                  }`}
                >
                  {m.nombre}
                </button>
              ))}
            </div>
          </div>

          {conCheque && (
            <div className="space-y-2">
              {cheques.map((c, i) => (
                <div key={i} className="rounded-lg bg-piedra-50 p-3 ring-1 ring-borde">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-piedra-600">Cheque {i + 1}</span>
                    {cheques.length > 1 && (
                      <button
                        onClick={() => setCheques(cheques.filter((_, j) => j !== i))}
                        className="rounded px-2 py-0.5 text-xs text-piedra-400 hover:bg-red-50 hover:text-red-700"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  <CamposCheque
                    valor={c.datos}
                    onChange={(d) => setCheques(cheques.map((x, j) => (j === i ? { ...x, datos: d } : x)))}
                    importe={c.importe}
                    onImporte={(t) => setCheques(cheques.map((x, j) => (j === i ? { ...x, importe: t } : x)))}
                    autoFocus={i === cheques.length - 1}
                  />
                </div>
              ))}
              <button
                onClick={() =>
                  setCheques([
                    ...cheques,
                    { datos: chequeVacio(cliente.nombre), importe: restante > 0 ? String(restante) : '' },
                  ])
                }
                className="text-sm font-medium text-marca-700 hover:underline"
              >
                + Otro cheque
              </button>
              <p className="text-xs text-piedra-500">
                Los cheques quedan en la cartera y no entran a la caja: se depositan o se endosan desde
                Tesorería.
              </p>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">
              Concepto <span className="font-normal text-piedra-400">(opcional, sale en el recibo)</span>
            </span>
            <input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Pago a cuenta"
              className="w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm outline-none focus:border-marca-500"
            />
          </label>

          {medio?.afecta_caja && cajaId && (
            <p className="rounded-lg bg-verde-50 px-3 py-2 text-xs text-verde-800 ring-1 ring-verde-200">
              Este importe también entra a la caja abierta, así el arqueo del turno lo contempla.
            </p>
          )}

          {faltaCaja && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              Cobrar en {medio.nombre} mueve efectivo y no hay una caja abierta en esta terminal. Si
              se registra igual, el dinero entra y el arqueo no lo ve. Abrí la caja primero.
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => cobrar.mutate()}
            disabled={!medioPagoId || aCobrar <= 0 || faltaCaja || chequeIncompleto || cobrar.isPending}
            className="flex-1 rounded-lg bg-verde-600 px-4 py-2.5 font-medium text-white hover:bg-verde-500 disabled:opacity-40"
          >
            {cobrar.isPending ? 'Registrando…' : 'Emitir el recibo'}
          </button>
          <button
            onClick={onCancelar}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-piedra-500 hover:bg-piedra-100"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
