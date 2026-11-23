import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import NuevaNotaManual, { type FacturaElegida } from '@/components/NuevaNotaManual'
import type { FamiliaNota } from '@/lib/api/notasManuales'

/*
  Desde la vista de una factura: una nota de crédito o débito escrita a
  mano, ya asociada a esa factura. Para una bonificación o un recargo
  que no es devolver mercadería.
*/
export default function NotaDeEstaFactura({ factura }: { factura: FacturaElegida }) {
  const { tienePermiso } = useAuth()
  const [abierta, setAbierta] = useState<FamiliaNota | null>(null)
  if (!tienePermiso('facturacion.emitir')) return null

  const clase =
    'rounded-lg px-3 py-1.5 text-sm font-medium text-piedra-600 ring-1 ring-borde hover:bg-marca-50 hover:text-marca-700'

  return (
    <div className="mx-auto mb-4 flex max-w-[21cm] flex-wrap items-center justify-end gap-2 px-4 print:hidden">
      <span className="mr-auto text-xs text-piedra-500">¿Una bonificación o un recargo sobre esta factura?</span>
      <button onClick={() => setAbierta('nota_credito')} className={clase}>
        Nota de crédito
      </button>
      <button onClick={() => setAbierta('nota_debito')} className={clase}>
        Nota de débito
      </button>
      {abierta && <NuevaNotaManual familia={abierta} factura={factura} onCerrar={() => setAbierta(null)} />}
    </div>
  )
}
