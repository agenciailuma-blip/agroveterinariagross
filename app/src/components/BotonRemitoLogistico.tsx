import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useTerminal } from '@/lib/terminal'
import { confirmar } from '@/components/Dialogo'
import { emitirEnServidor } from '@/lib/api/noFiscal'
import { abrirRemitoR } from '@/lib/escritorio'
import { enCastellano } from '@/lib/errores'

/*
  El remito logístico desde la factura (propuesta aprobada el 13/11).

  Lucas lo quiere en cualquier factura y nunca en una proforma: un
  remito con CAI no puede acompañar mercadería sin factura. Si la venta
  ya tiene su remito, el botón abre esa hoja R; si no, lo emite.
*/
export default function BotonRemitoLogistico({ ventaId }: { ventaId: string }) {
  const { tienePermiso } = useAuth()
  const { terminal } = useTerminal()
  const qc = useQueryClient()
  const puede = tienePermiso('facturacion.no_fiscal_emitir')

  const existente = useQuery({
    queryKey: ['remito-de-venta', ventaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('comprobante_no_fiscal')
        .select('id')
        .eq('venta_id', ventaId)
        .eq('tipo_clave', 'remito')
        .neq('estado', 'anulado')
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle()
      return (data?.id as string | undefined) ?? null
    },
    enabled: puede,
  })

  const emitir = useMutation({
    mutationFn: async () => {
      const r = await emitirEnServidor(ventaId, 'remito', terminal?.id ?? null, {
        serie: terminal?.prefijo ?? null,
      })
      return r.id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['remito-de-venta', ventaId] })
      qc.invalidateQueries({ queryKey: ['remitos'] })
      abrirRemitoR(id)
    },
  })

  if (!puede || existente.isPending) return null

  async function alTocar() {
    if (existente.data) return abrirRemitoR(existente.data)
    const sigue = await confirmar({
      titulo: '¿Emitir el remito logístico?',
      detalle: 'Sale sobre la hoja R, con esta factura. Queda en Comprobantes → Remito logístico.',
      aceptar: 'Emitir',
    })
    if (sigue) emitir.mutate()
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        onClick={alTocar}
        disabled={emitir.isPending}
        className="rounded-lg px-4 py-2 text-sm font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50 disabled:opacity-40"
      >
        {emitir.isPending ? 'Emitiendo…' : 'Remito logístico'}
      </button>
      {emitir.isError && <span className="text-xs text-red-700">{enCastellano(emitir.error)}</span>}
    </span>
  )
}
