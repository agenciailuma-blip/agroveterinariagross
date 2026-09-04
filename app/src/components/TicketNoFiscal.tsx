import type { NoFiscalCompleto } from '@/lib/api/noFiscal'
import { LEYENDA_NO_FISCAL, numeroNoFiscal } from '@/lib/api/noFiscal'
import { fechaCorta } from '@/lib/comprobante/presentacion'
import { moneda, numero } from '@/lib/tipos'

/*
  El presupuesto, el remito y el comprobante interno en rollo de 80 mm.

  ES UN COMPONENTE APARTE DE TicketComprobante, Y ESO ES LA GARANTÍA.

  Lo fácil habría sido meterle una bandera al ticket fiscal para ocultar
  el CAE y el QR. Pero entonces existiría un camino de código que imprime
  algo con forma de factura sin autorización de ARCA, a un `if` de
  distancia. Con dos componentes, el ticket fiscal no tiene manera de
  omitir el CAE y este no tiene de dónde sacarlo: `NoFiscalCompleto` ni
  siquiera tiene el campo.

  Por lo mismo acá no hay recuadro de letra A/B, no se discrimina IVA
  —discriminar IVA es lo que le da a un papel aspecto de factura— y la
  leyenda va arriba y abajo, no en una nota al pie que nadie lee.

  Lo que sí comparte con el fiscal es el ancho útil de 72 mm: los 80 mm
  son el papel, y el resto se lo comen los márgenes del cabezal.
*/

const LINEA = 'my-1.5 border-t border-dashed border-black'

export default function TicketNoFiscal({ c }: { c: NoFiscalCompleto }) {
  const esRemito = c.tipo_clave === 'remito'
  const esPresupuesto = c.tipo_clave === 'presupuesto'

  return (
    <div className="mx-auto w-[72mm] bg-white px-2 py-3 font-mono text-[8.5px] leading-[1.35] text-black">
      {/* ── La leyenda va primero. Es lo que este papel es. ── */}
      <p className="border border-black py-1 text-center text-[9px] font-bold">
        {LEYENDA_NO_FISCAL}
      </p>

      {/* ── Emisor ── */}
      {c.emisor.logo && (
        <img
          src={c.emisor.logo}
          alt=""
          className="mx-auto my-2 max-h-[16mm] max-w-[52mm] object-contain"
        />
      )}

      <p className="mt-2 text-[10px] font-bold">{c.emisor.razon_social}</p>
      <Dato k="CUIT" v={c.emisor.cuit} />
      <Dato k="Domicilio" v={c.emisor.domicilio} />
      <Dato k="Localidad" v={c.emisor.localidad} />
      {c.emisor.telefono && <Dato k="Teléfono" v={c.emisor.telefono} />}

      {c.emisor.nombre_fantasia && (
        <p className="mt-2 text-center text-[9.5px] font-bold uppercase">
          {c.emisor.nombre_fantasia}
        </p>
      )}

      {/* ── Identificación ── */}
      <div className={LINEA} />
      <div className="flex justify-between font-bold">
        <span className="uppercase">{c.tipo_descripcion}</span>
        <span className="tabular-nums">
          {numeroNoFiscal(c.tipo_clave, c.serie, c.numero)}
        </span>
      </div>
      <p className="text-right">Fecha {fechaCorta(c.fecha)}</p>
      {esPresupuesto && c.valido_hasta && (
        <p className="text-right font-bold">Válido hasta {fechaCorta(c.valido_hasta)}</p>
      )}
      {c.estado === 'anulado' && (
        <p className="mt-1 border border-black py-0.5 text-center font-bold">ANULADO</p>
      )}

      {/* ── Receptor ── */}
      <div className={LINEA} />
      <Dato k="Cliente" v={c.receptor_nombre} />
      <Dato k="Domicilio" v={c.receptor_domicilio || 'n/n'} />
      {c.receptor_documento && (
        <Dato k={c.receptor_documento_sigla || 'CUIT/DNI'} v={c.receptor_documento} />
      )}

      {/* ── Entrega: sólo el remito la tiene ── */}
      {esRemito && (
        <>
          <div className={LINEA} />
          <p className="font-bold">ENTREGA</p>
          <Dato k="Domicilio" v={c.entrega_domicilio || 'n/n'} />
          {c.entrega_localidad && <Dato k="Localidad" v={c.entrega_localidad} />}
          {c.entrega_contacto && <Dato k="Contacto" v={c.entrega_contacto} />}
          {c.transportista && <Dato k="Transporte" v={c.transportista} />}
        </>
      )}

      {/* ── Detalle ──
          Dos líneas por renglón, igual que el ticket fiscal: en 72 mm no
          entran en una sola sin cortar la descripción, que es justo lo
          que el cliente mira para reclamar. */}
      <div className={LINEA} />
      {c.lineas.map((l) => (
        <div key={l.orden} className="mb-0.5">
          <p className="break-words">{l.descripcion}</p>
          <div className="flex justify-between tabular-nums">
            <span>
              {numero.format(l.cantidad)}
              {l.precio_unitario > 0 && ` x ${moneda.format(l.precio_unitario)}`}
            </span>
            {l.precio_unitario > 0 && <span>{moneda.format(l.importe)}</span>}
          </div>
        </div>
      ))}
      {c.lineas.length === 0 && <p className="text-center">Sin detalle de líneas.</p>}

      {/* ── Total ──
          Sin desglose de IVA a propósito: un papel que discrimina IVA se
          parece a una factura, y este no puede parecerse. */}
      {c.total > 0 && (
        <>
          <div className={LINEA} />
          <div className="flex justify-between text-[11px] font-bold">
            <span>TOTAL:</span>
            <span className="tabular-nums">{moneda.format(c.total)}</span>
          </div>
        </>
      )}

      {c.observaciones && (
        <>
          <div className={LINEA} />
          <p className="break-words">{c.observaciones}</p>
        </>
      )}

      {/* ── Recibí conforme: sólo tiene sentido si algo se entrega ── */}
      {esRemito && (
        <>
          <div className={LINEA} />
          <p className="mt-3">Recibí conforme</p>
          <p className="mt-4">Firma: ____________________</p>
          <p className="mt-1.5">Aclaración: ________________</p>
          <p className="mt-1.5">Fecha: ____/____/________</p>
        </>
      )}

      <div className={LINEA} />
      <p className="text-center text-[9px] font-bold">{LEYENDA_NO_FISCAL}</p>
      {c.venta_codigo && (
        <p className="mt-1 text-center text-[7.5px]">Operación {c.venta_codigo}</p>
      )}
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <p className="break-words">
      <span className="font-bold">{k}:</span> {v}
    </p>
  )
}
