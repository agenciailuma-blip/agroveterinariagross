import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { boton, campo } from '@/estilos'
import type { ComprobanteCompleto } from '@/lib/api/comprobante'
import { correoSugerido, enviarFacturaPorMail, enviosDe } from '@/lib/api/facturaPorMail'
import { enCastellano } from '@/lib/errores'

/*
  «Mandar por mail», en la factura.

  Propone el mail del pedido de la tienda o el del cliente; se puede
  cambiar. Abajo queda a quién se mandó y cuándo, para contestar «¿me la
  mandaste?» sin buscar en ningún otro lado.
*/
export default function MandarPorMail({ c }: { c: ComprobanteCompleto }) {
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [destinatario, setDestinatario] = useState('')

  const sugerido = useQuery({
    queryKey: ['correo-sugerido', c.venta_id],
    queryFn: () => correoSugerido(c.venta_id ?? null),
    enabled: abierto,
  })
  useEffect(() => {
    if (sugerido.data && !destinatario) setDestinatario(sugerido.data)
  }, [sugerido.data, destinatario])

  const envios = useQuery({ queryKey: ['envios', c.id], queryFn: () => enviosDe(c.id) })

  const mandar = useMutation({
    mutationFn: () => enviarFacturaPorMail(c, destinatario),
    onSuccess: () => setAbierto(false),
    onSettled: () => qc.invalidateQueries({ queryKey: ['envios', c.id] }),
  })

  const ultimo = envios.data?.[0]

  return (
    <div className="mx-auto mb-4 max-w-[21cm] px-4 print:hidden">
      {!abierto ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            onClick={() => setAbierto(true)}
            disabled={!c.cae}
            className="rounded-lg px-4 py-2 text-sm font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50 disabled:opacity-40"
          >
            Mandar por mail
          </button>
          {ultimo && (
            <span className={`text-xs ${ultimo.estado === 'enviado' ? 'text-piedra-500' : 'text-red-700'}`}>
              {ultimo.estado === 'enviado' ? 'Enviada' : 'No salió'} a {ultimo.destinatario} el{' '}
              {new Date(ultimo.creado_en).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
              {ultimo.automatico && ' (sola, con el pedido)'}
              {ultimo.estado === 'error' && ultimo.error && `: ${ultimo.error}`}
            </span>
          )}
        </div>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-borde"
          onSubmit={(e) => {
            e.preventDefault()
            mandar.mutate()
          }}
        >
          <label htmlFor="mail-factura" className="text-sm text-piedra-600">
            Mandar a
          </label>
          <input
            id="mail-factura"
            type="email"
            value={destinatario}
            onChange={(e) => setDestinatario(e.target.value)}
            placeholder={sugerido.isPending ? 'Buscando el mail del cliente…' : 'cliente@ejemplo.com'}
            className={`${campo} min-w-0 flex-1 basis-48`}
            autoFocus
          />
          <button type="submit" disabled={mandar.isPending || !destinatario.trim()} className={boton.principal}>
            {mandar.isPending ? 'Mandando…' : 'Mandar'}
          </button>
          <button type="button" onClick={() => setAbierto(false)} disabled={mandar.isPending} className={boton.suave}>
            Cancelar
          </button>
          {mandar.isError && (
            <p role="alert" className="basis-full text-sm text-red-700">
              {enCastellano(mandar.error)}
            </p>
          )}
        </form>
      )}
      {mandar.isSuccess && !abierto && (
        <p className="mt-1 text-xs text-verde-700">Mandada. Le llega con la factura en PDF.</p>
      )}
    </div>
  )
}
