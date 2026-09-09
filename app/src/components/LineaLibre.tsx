import { useState } from 'react'
import { ALICUOTAS_IVA, moneda } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  El producto comodín

  Pedido de Lucas el 07/09, y el mejor pensado de la reunión:

    "Agregar productos sin que existan en la base de datos. Al
     agregarse a la venta, remito o presupuesto que no cree el
     producto, sino que simplemente se escriba para la ocasión."

  Para qué le sirve: productos que todavía no se pidieron, muy
  particulares, que se venden sólo por pedido a ciertos clientes; y
  poder facturar cosas que no llegaron al local todavía.

  ─── POR QUÉ EL ESQUEMA YA LO PERMITÍA ───

  `venta_linea.producto_id` es anulable desde la primera migración, y
  `codigo_producto` y `descripcion` son fotos de texto. Toda la
  maquinaria de stock —cobrar, remitir, anular— ya filtra
  `producto_id is not null`. O sea que una línea sin producto no mueve
  stock sola, que es exactamente lo que corresponde. No hubo que
  cambiar el modelo: había que usar una puerta que ya estaba abierta.

  ─── EL LÍMITE, ESCRITO UNA VEZ ───

  Una línea libre NO reemplaza al catálogo. No mueve stock, no entra al
  inventario y no tiene costo, así que no aparece en ningún margen. Es
  para lo que pasa una vez. Si algo se vende dos veces, va al catálogo.

  ─── POR QUÉ SE PREGUNTA EL IVA ───

  Es lo único de este formulario que no es obvio, y por eso está.
  Esta línea puede terminar en una factura, y ahí la alícuota no es un
  detalle: en una agroveterinaria conviven el 21% y el 10,5% todo el
  tiempo. Dejarla fija en 21 sería facturar mal la mitad de las veces,
  en silencio.
  ─────────────────────────────────────────────────────────────
*/

export interface DatosLineaLibre {
  descripcion: string
  cantidad: number
  precio: number
  alicuotaIvaId: number
}

export default function LineaLibre({
  onAgregar,
  onCerrar,
}: {
  onAgregar: (d: DatosLineaLibre) => void
  onCerrar: () => void
}) {
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [precio, setPrecio] = useState('')
  const [alicuota, setAlicuota] = useState<number>(ALICUOTAS_IVA[0].id)

  const n = Number(cantidad.replace(',', '.'))
  const p = Number(precio.replace(',', '.'))
  const listo = descripcion.trim().length >= 2 && n > 0 && Number.isFinite(p) && p >= 0

  function agregar() {
    if (!listo) return
    onAgregar({
      descripcion: descripcion.trim(),
      cantidad: n,
      precio: Math.round(p * 100) / 100,
      alicuotaIvaId: alicuota,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCerrar()
        if (e.key === 'Enter' && listo) {
          e.preventDefault()
          agregar()
        }
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg ring-1 ring-borde">
        <h2 className="font-semibold text-tinta">Escribir una línea</h2>
        <p className="mt-1 text-sm text-piedra-600">
          Para lo que no está en el catálogo: un pedido especial, algo que todavía no llegó al
          local. No se crea ningún producto.
        </p>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-piedra-400 uppercase">
            ¿Qué es?
          </span>
          <input
            autoFocus
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Comedero de acero inoxidable 40 cm"
            className={clase}
          />
        </label>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-piedra-400 uppercase">
              Cantidad
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className={`${clase} text-right tabular-nums`}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-piedra-400 uppercase">
              Precio c/u
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="0,00"
              className={`${clase} text-right tabular-nums`}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-piedra-400 uppercase">
              IVA
            </span>
            <select
              value={alicuota}
              onChange={(e) => setAlicuota(Number(e.target.value))}
              className={clase}
            >
              {ALICUOTAS_IVA.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>

        {listo && (
          <p className="mt-3 rounded-lg bg-piedra-50 px-3 py-2 text-sm text-piedra-600 ring-1 ring-borde">
            {n} × {moneda.format(p)} ={' '}
            <strong className="tabular-nums text-tinta">{moneda.format(n * p)}</strong>
          </p>
        )}

        <p className="mt-3 text-xs text-piedra-500">
          No descuenta stock ni entra al inventario: no es un producto del catálogo. Si esto se
          vende seguido, conviene darlo de alta en Productos.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-piedra-600 hover:bg-piedra-100"
          >
            Cancelar
          </button>
          <button
            onClick={agregar}
            disabled={!listo}
            className="rounded-lg bg-marca-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-marca-800 disabled:opacity-40"
          >
            Agregar a la venta
          </button>
        </div>
      </div>
    </div>
  )
}

const clase =
  'w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta focus:border-marca-500 focus:ring-1 focus:ring-marca-500 focus:outline-none'
