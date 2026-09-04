import { createRoot } from 'react-dom/client'
import TicketNoFiscal from '@/components/TicketNoFiscal'
import type { NoFiscalCompleto, TipoNoFiscal } from '@/lib/api/noFiscal'
import '@/index.css'

/*
  Vista de los tres papeles, para mirarlos sin iniciar sesión.

  Existe porque las pruebas automáticas verifican QUÉ dice cada
  comprobante —que no haya un CAE, que no se discrimine IVA— pero no
  CÓMO se ve, y el ancho de 72 mm es justamente donde un renglón de más
  se sale del papel.

  Sólo la sirve el servidor de desarrollo: `vite build` empaqueta
  únicamente index.html, así que esto no llega a ninguna terminal.
  Abrirla en http://localhost:5173/pruebas/vista/
*/

const EMISOR = {
  razon_social: 'GROSS ERNESTO HUGO',
  nombre_fantasia: 'Agroveterinaria Gross',
  cuit: '20146369767',
  domicilio: 'Av. Libertad 315',
  localidad: 'Oberá, Misiones',
  telefono: '3755-421829/401829',
  logo: '',
}

function doc(extra: Partial<NoFiscalCompleto>): NoFiscalCompleto {
  return {
    id: 'x',
    tipo_clave: 'comprobante_interno' as TipoNoFiscal,
    tipo_descripcion: 'Comprobante interno',
    serie: 'CAJA1',
    numero: 45,
    fecha: '2026-09-04',
    estado: 'emitido',
    receptor_nombre: 'Juan Pérez',
    receptor_documento: '20111111112',
    receptor_documento_sigla: 'CUIT',
    receptor_condicion: 'Consumidor Final',
    receptor_domicilio: 'Sarmiento 1200, Oberá',
    total: 148500,
    observaciones: null,
    valido_hasta: null,
    entrega_domicilio: null,
    entrega_localidad: null,
    entrega_contacto: null,
    transportista: null,
    venta_codigo: 'CAJA1-000123',
    creado_en: '2026-09-04T13:00:00Z',
    lineas: [
      { orden: 1, codigo_producto: 'A-100', descripcion: 'Alimento Perro Adulto Raza Grande 15 kg', cantidad: 4, precio_unitario: 28500, importe: 114000 },
      { orden: 2, codigo_producto: 'V-220', descripcion: 'Ivermectina inyectable 500 ml', cantidad: 1, precio_unitario: 22500, importe: 22500 },
      { orden: 3, codigo_producto: 'F-011', descripcion: 'Glifosato 20 L', cantidad: 1, precio_unitario: 12000, importe: 12000 },
    ],
    emisor: EMISOR,
    ...extra,
  }
}

const CASOS: [string, NoFiscalCompleto][] = [
  ['Comprobante interno — el que sale al cobrar sin factura', doc({})],
  [
    'Remito — con entrega, transporte y recibí conforme',
    doc({
      tipo_clave: 'remito' as TipoNoFiscal,
      tipo_descripcion: 'Remito',
      numero: 12,
      entrega_domicilio: 'Ruta 14 km 8, Chacra 42',
      entrega_localidad: 'Campo Ramón',
      entrega_contacto: '3755-556677',
      transportista: 'Camioneta 1 — Diego',
    }),
  ],
  [
    'Remito sin valorizar — la mercadería sin los precios',
    doc({
      tipo_clave: 'remito' as TipoNoFiscal,
      tipo_descripcion: 'Remito',
      numero: 13,
      total: 0,
      entrega_domicilio: 'Ruta 14 km 8, Chacra 42',
      entrega_localidad: 'Campo Ramón',
      lineas: doc({}).lineas.map((l) => ({ ...l, precio_unitario: 0, importe: 0 })),
    }),
  ],
  [
    'Presupuesto — con su fecha de validez',
    doc({
      tipo_clave: 'presupuesto' as TipoNoFiscal,
      tipo_descripcion: 'Presupuesto',
      numero: 7,
      valido_hasta: '2026-09-19',
      observaciones: 'Precios sujetos a confirmación de stock.',
    }),
  ],
  ['Anulado — se reimprime para el archivo, marcado', doc({ estado: 'anulado' })],
]

createRoot(document.getElementById('raiz')!).render(
  <div className="min-h-screen bg-piedra-100 p-8">
    <h1 className="mb-1 text-xl font-bold text-tinta">Comprobantes no fiscales · ticket 80 mm</h1>
    <p className="mb-6 text-sm text-piedra-500">
      Vista de desarrollo. Ninguno lleva CAE, QR ni discriminación de IVA — no pueden parecerse a
      una factura.
    </p>
    <div className="flex flex-wrap items-start gap-6">
      {CASOS.map(([titulo, d], i) => (
        <div key={i} className="w-[76mm]">
          <p className="mb-2 text-xs font-medium text-piedra-600">{titulo}</p>
          <div className="bg-white shadow-sm ring-1 ring-borde">
            <TicketNoFiscal c={d} />
          </div>
        </div>
      ))}
    </div>
  </div>,
)
