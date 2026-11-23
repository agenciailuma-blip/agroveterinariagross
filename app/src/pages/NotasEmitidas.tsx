import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import BuscadorDeComprobantes from '@/components/BuscadorDeComprobantes'
import NuevaNotaManual from '@/components/NuevaNotaManual'
import { NOMBRE_NOTA, type FamiliaNota } from '@/lib/api/notasManuales'
import { boton } from '@/estilos'

/*
  Notas de crédito y Notas de débito: dos pestañas de Comprobantes
  (reunión del 19/11). El mismo buscador de Facturas emitidas, abierto
  en ese tipo, para verlas, reimprimirlas o bajarlas; y el botón para
  hacer una nueva a mano, libre o asociada a una factura.
*/

const TEXTOS: Record<FamiliaNota, { titulo: string; detalle: string }> = {
  nota_credito: {
    titulo: 'Notas de crédito',
    detalle: 'Las de las devoluciones y las hechas a mano, por fecha, cliente o número.',
  },
  nota_debito: {
    titulo: 'Notas de débito',
    detalle: 'Intereses, recargos y demás, por fecha, cliente o número.',
  },
}

export default function NotasEmitidas({ familia }: { familia: FamiliaNota }) {
  const { tienePermiso } = useAuth()
  const [params, setParams] = useSearchParams()
  const [nueva, setNueva] = useState(false)

  // La pestaña abre el buscador en su tipo; después se puede cambiar.
  useEffect(() => {
    if (!params.get('t')) {
      const p = new URLSearchParams(params)
      p.set('t', familia)
      setParams(p, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familia])

  if (!tienePermiso('facturacion.ver')) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        No tenés permiso para ver los comprobantes.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-tinta">{TEXTOS[familia].titulo}</h1>
          <p className="text-sm text-piedra-500">{TEXTOS[familia].detalle}</p>
        </div>
        {tienePermiso('facturacion.emitir') && (
          <button onClick={() => setNueva(true)} className={boton.principal}>
            Nueva {NOMBRE_NOTA[familia].toLowerCase()}
          </button>
        )}
      </div>
      {/* Hasta que la dirección tenga el tipo, no se busca: si no, la primera búsqueda trae todo. */}
      {params.get('t') && <BuscadorDeComprobantes key={familia} modo="facturas" />}
      {nueva && <NuevaNotaManual familia={familia} onCerrar={() => setNueva(false)} />}
    </div>
  )
}
