import type { ComprobanteCompleto } from '@/lib/api/comprobante'
import { fechaCorta, horaDe, presentacionDe } from '@/lib/comprobante/presentacion'
import { moneda, numero } from '@/lib/tipos'

/*
  El comprobante en rollo de 80 mm — el formato del mostrador.

  Sigue el orden y las etiquetas del ticket que Gross entrega hoy, a
  propósito: los clientes del local leen ese papel desde hace años y el
  cambio de sistema no tiene por qué obligarlos a aprender otro. Lo que
  sí cambia es lo que estaba mal: en la Factura A los precios van sin
  IVA, y el detalle cierra con el neto gravado.

  El ancho útil es 72 mm. Los 80 mm son el papel; el resto se lo comen
  los márgenes del cabezal y, si uno los usa, el texto sale cortado del
  lado derecho — que es donde caen los importes.
*/

const LINEA = 'my-1.5 border-t border-dashed border-black'

export default function TicketComprobante({
  c,
  qr,
}: {
  c: ComprobanteCompleto
  qr: string | null
}) {
  const { esA, porcentajeDe, sinIva, codigo, identificado } = presentacionDe(c)

  return (
    <div className="mx-auto w-[72mm] bg-white px-2 py-3 font-mono text-[8.5px] leading-[1.35] text-black">
      {/* ── Emisor ── */}
      {c.emisor.logo && (
        <img
          src={c.emisor.logo}
          alt=""
          className="mx-auto mb-2 max-h-[16mm] max-w-[52mm] object-contain"
        />
      )}

      <p className="text-[10px] font-bold">{c.emisor.razon_social}</p>
      <Dato k="CUIT" v={c.emisor.cuit} />
      <Dato k="Ingresos Brutos" v={c.emisor.ingresos_brutos || '—'} />
      <Dato k="Domicilio" v={c.emisor.domicilio} />
      <Dato k="Localidad" v={c.emisor.localidad} />
      <Dato k="Inicio de Actividades" v={c.emisor.inicio_actividades || '—'} />
      <p>IVA Responsable Inscripto</p>
      {c.emisor.telefono && <Dato k="Teléfono" v={c.emisor.telefono} />}

      {c.emisor.nombre_fantasia && (
        <p className="mt-2 text-center text-[9.5px] font-bold uppercase">
          {c.emisor.nombre_fantasia}
        </p>
      )}

      {/* ── Identificación del comprobante ── */}
      <div className={LINEA} />
      <div className="flex justify-between font-bold">
        <span className="uppercase">{c.tipo_descripcion}</span>
        <span className="tabular-nums">
          {String(c.punto_venta).padStart(4, '0')} {String(c.numero).padStart(8, '0')}
        </span>
        <span>COD. {codigo}</span>
      </div>
      <p className="text-right">Fecha {fechaCorta(c.fecha)}</p>
      <p className="text-right">Hora {horaDe(c)}</p>

      {/* ── Receptor ── */}
      <div className={LINEA} />
      <Dato k="Cliente" v={c.receptor_nombre} />
      <Dato k="Domicilio" v={c.receptor_domicilio || 'n/n'} />
      <Dato k={identificado ? c.receptor_documento_sigla : 'CUIT/DNI'} v={c.receptor_documento || ''} />
      <Dato k="Condición de IVA" v={c.receptor_condicion} />

      {/* ── Detalle ──
          Cada renglón ocupa dos líneas: la descripción entera arriba y
          los números abajo. En 72 mm no entran en una sola sin cortar
          la descripción, y el nombre del producto es justamente lo que
          el cliente mira para reclamar. */}
      <div className={LINEA} />
      {esA && <p className="mb-1 text-[8px]">Precios sin IVA</p>}
      {c.lineas.map((l) => (
        <div key={l.orden} className="mb-0.5">
          <p className="break-words">{l.descripcion}</p>
          <div className="flex justify-between tabular-nums">
            <span>
              {numero.format(l.cantidad)} x {moneda.format(sinIva(l.precio_unitario, l.alicuota_iva_id))}
              {esA && ` · IVA ${porcentajeDe(l.alicuota_iva_id)}%`}
            </span>
            <span>{moneda.format(sinIva(l.importe, l.alicuota_iva_id))}</span>
          </div>
        </div>
      ))}
      {c.lineas.length === 0 && <p className="text-center">Sin detalle de líneas.</p>}

      {/* ── Impuestos ── */}
      <div className={LINEA} />
      {esA ? (
        <>
          <Renglon k="Subtotal" v={c.neto_gravado + c.exento + c.neto_no_gravado} />
          {c.exento > 0 && <Renglon k="Importe exento" v={c.exento} />}
          {c.alicuotas.map((a) => (
            <Renglon key={a.alicuota_iva_id} k={`IVA ${a.porcentaje}%`} v={a.importe} />
          ))}
        </>
      ) : (
        <>
          <p className="text-[8px]">
            Régimen de transparencia fiscal al consumidor (Ley 27.743)
          </p>
          <div className="mt-1 flex justify-between font-bold">
            <span>Alícuota IVA</span>
            <span>Neto</span>
            <span>IVA</span>
          </div>
          {c.alicuotas.map((a) => (
            <div key={a.alicuota_iva_id} className="flex justify-between tabular-nums">
              <span>{a.porcentaje.toFixed(2)} %</span>
              <span>{moneda.format(a.base_imponible)}</span>
              <span>{moneda.format(a.importe)}</span>
            </div>
          ))}
        </>
      )}

      {c.tributos.map((t, i) => (
        <Renglon key={i} k={`${t.descripcion} ${t.alicuota}%`} v={t.importe} />
      ))}

      {/* ── Total ── */}
      <div className={LINEA} />
      <div className="flex justify-between text-[11px] font-bold">
        <span>TOTAL:</span>
        <span className="tabular-nums">{moneda.format(c.total)}</span>
      </div>

      {/* ── Autorización ── */}
      <p className="mt-1.5">
        {c.modalidad === 'caea' ? 'CAEA' : 'CAE'} Nro: {c.cae ?? '—'}
      </p>
      {c.cae_vencimiento && (
        <p>
          Fecha Vencimiento de {c.modalidad === 'caea' ? 'CAEA' : 'CAE'}:{' '}
          {fechaCorta(c.cae_vencimiento)}
        </p>
      )}

      {qr && <img src={qr} alt="Código QR del comprobante" className="mx-auto mt-2 w-[38mm]" />}

      <p className="mt-2 text-center text-[7.5px]">
        Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación.
      </p>
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

function Renglon({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between tabular-nums">
      <span>{k}</span>
      <span>{moneda.format(v)}</span>
    </div>
  )
}
