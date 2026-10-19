import { useAuth } from '@/auth/AuthProvider'
import BuscadorDeComprobantes from '@/components/BuscadorDeComprobantes'
import type { Modo } from '@/lib/api/buscarComprobantes'

/*
  Facturas emitidas y Percepciones: dos pestañas de Comprobantes con el
  mismo buscador.

  Van aparte de Facturación a propósito. Facturación es lo que necesita
  atención —lo que ARCA no autorizó, lo cobrado sin factura, lo que se
  devuelve— y por eso calcula, comprobante por comprobante, cosas que
  para recorrer un mes entero no hacen falta. Acá se busca, se mira, se
  reimprime y se baja.
*/

const TEXTOS: Record<Modo, { titulo: string; detalle: string }> = {
  facturas: {
    titulo: 'Facturas emitidas',
    detalle: 'Todas las facturas y notas de crédito, por fecha, cliente o número. Para reimprimirlas o bajarlas.',
  },
  percepciones: {
    titulo: 'Percepciones',
    detalle:
      'Las facturas a las que se les cobró percepción de IIBB, con su neto, IVA y lo percibido. Las notas de crédito la devuelven y restan.',
  },
}

export default function ComprobantesEmitidos({ modo }: { modo: Modo }) {
  const { tienePermiso } = useAuth()

  if (!tienePermiso('facturacion.ver')) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        No tenés permiso para ver los comprobantes.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">{TEXTOS[modo].titulo}</h1>
        <p className="text-sm text-piedra-500">{TEXTOS[modo].detalle}</p>
      </div>
      {/* La clave hace que, al pasar de una pestaña a la otra, el buscador arranque de cero. */}
      <BuscadorDeComprobantes key={modo} modo={modo} />
    </div>
  )
}
