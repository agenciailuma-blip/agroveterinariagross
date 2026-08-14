import type { Cliente, CondicionIva, TipoDocumento } from '@/lib/api/clientes'

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

function Campo({
  etiqueta,
  ancho = 'col-span-2',
  ayuda,
  children,
}: {
  etiqueta: string
  ancho?: string
  ayuda?: string
  children: React.ReactNode
}) {
  return (
    <label className={`block ${ancho}`}>
      <span className="mb-1 block text-xs font-medium text-piedra-600">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-piedra-400">{ayuda}</span>}
    </label>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-borde pt-4">
      <legend className="sr-only">{titulo}</legend>
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-piedra-400 uppercase">
        {titulo}
      </h3>
      <div className="grid grid-cols-4 gap-3">{children}</div>
    </fieldset>
  )
}

export default function ClienteEditor({
  datos,
  onCambio,
  condiciones,
  documentos,
  listas,
  puedeEditar,
}: {
  datos: Partial<Cliente>
  onCambio: (c: Partial<Cliente>) => void
  condiciones: CondicionIva[]
  documentos: TipoDocumento[]
  listas: { id: string; nombre: string }[]
  puedeEditar: boolean
}) {
  const set = (parcial: Partial<Cliente>) => onCambio({ ...datos, ...parcial })

  const condicion = condiciones.find((c) => c.id === datos.condicion_iva_id)
  const esResponsableInscripto = datos.condicion_iva_id === 1

  return (
    <div className="space-y-4">
      <Seccion titulo="Identificación">
        <Campo etiqueta="Código" ancho="col-span-1">
          <input
            value={datos.codigo ?? ''}
            disabled={!puedeEditar}
            onChange={(e) => set({ codigo: e.target.value })}
            className={`${claseInput} font-mono`}
          />
        </Campo>
        <Campo etiqueta="Tipo" ancho="col-span-1">
          <select
            value={datos.tipo_persona ?? 'fisica'}
            disabled={!puedeEditar}
            onChange={(e) => set({ tipo_persona: e.target.value as Cliente['tipo_persona'] })}
            className={claseInput}
          >
            <option value="fisica">Persona</option>
            <option value="juridica">Empresa</option>
          </select>
        </Campo>
        <Campo etiqueta="Nombre o razón social" ancho="col-span-4">
          <input
            value={datos.nombre ?? ''}
            disabled={!puedeEditar}
            onChange={(e) => set({ nombre: e.target.value })}
            className={claseInput}
          />
        </Campo>
      </Seccion>

      <Seccion titulo="Datos fiscales">
        <Campo
          etiqueta="Condición frente al IVA"
          ancho="col-span-2"
          ayuda={condicion ? `Se le emite Factura ${condicion.tipo_comprobante}` : undefined}
        >
          <select
            value={datos.condicion_iva_id ?? 5}
            disabled={!puedeEditar}
            onChange={(e) => set({ condicion_iva_id: Number(e.target.value) })}
            className={claseInput}
          >
            {condiciones.map((c) => (
              <option key={c.id} value={c.id}>
                {c.descripcion}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Documento" ancho="col-span-1">
          <select
            value={datos.tipo_documento_id ?? 99}
            disabled={!puedeEditar}
            onChange={(e) => set({ tipo_documento_id: Number(e.target.value) })}
            className={claseInput}
          >
            {documentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.sigla}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Número" ancho="col-span-1">
          <input
            value={datos.numero_documento ?? ''}
            disabled={!puedeEditar}
            onChange={(e) => set({ numero_documento: e.target.value })}
            className={`${claseInput} font-mono`}
          />
        </Campo>

        {esResponsableInscripto && datos.tipo_documento_id !== 80 && (
          <p className="col-span-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            Un Responsable Inscripto necesita CUIT. Con otro documento no se le puede emitir Factura
            A y ARCA la rechaza.
          </p>
        )}
      </Seccion>

      <Seccion titulo="Contacto y domicilio">
        <Campo etiqueta="Teléfono" ancho="col-span-2">
          <input
            value={datos.telefono ?? ''}
            disabled={!puedeEditar}
            onChange={(e) => set({ telefono: e.target.value })}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Correo" ancho="col-span-2">
          <input
            type="email"
            value={datos.email ?? ''}
            disabled={!puedeEditar}
            onChange={(e) => set({ email: e.target.value })}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Calle" ancho="col-span-2">
          <input
            value={datos.calle ?? ''}
            disabled={!puedeEditar}
            onChange={(e) => set({ calle: e.target.value })}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Número" ancho="col-span-1">
          <input
            value={datos.numero ?? ''}
            disabled={!puedeEditar}
            onChange={(e) => set({ numero: e.target.value })}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Piso / depto" ancho="col-span-1">
          <input
            value={datos.piso_depto ?? ''}
            disabled={!puedeEditar}
            onChange={(e) => set({ piso_depto: e.target.value })}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Localidad" ancho="col-span-2">
          <input
            value={datos.localidad ?? ''}
            disabled={!puedeEditar}
            onChange={(e) => set({ localidad: e.target.value })}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Provincia" ancho="col-span-1">
          <input
            value={datos.provincia ?? ''}
            disabled={!puedeEditar}
            onChange={(e) => set({ provincia: e.target.value })}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Código postal" ancho="col-span-1">
          <input
            value={datos.codigo_postal ?? ''}
            disabled={!puedeEditar}
            onChange={(e) => set({ codigo_postal: e.target.value })}
            className={claseInput}
          />
        </Campo>
      </Seccion>

      <Seccion titulo="Condiciones comerciales">
        <Campo
          etiqueta="Descuento"
          ancho="col-span-1"
          ayuda="Se aplica solo en cada venta"
        >
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={datos.descuento_porcentaje ?? 0}
              disabled={!puedeEditar}
              onChange={(e) => set({ descuento_porcentaje: Number(e.target.value) })}
              className={`${claseInput} pr-6 text-right tabular-nums`}
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-piedra-400">
              %
            </span>
          </div>
        </Campo>
        <Campo
          etiqueta="Lista de precios"
          ancho="col-span-3"
          ayuda="Si tiene una propia, le gana a la del medio de pago"
        >
          <select
            value={datos.lista_precio_id ?? ''}
            disabled={!puedeEditar}
            onChange={(e) => set({ lista_precio_id: e.target.value || null })}
            className={claseInput}
          >
            <option value="">La que corresponda por medio de pago</option>
            {listas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </Seccion>

      <Seccion titulo="Cuenta corriente">
        <label className="col-span-4 flex items-center gap-2 text-sm text-tinta">
          <input
            type="checkbox"
            checked={datos.cuenta_corriente ?? false}
            disabled={!puedeEditar}
            onChange={(e) => set({ cuenta_corriente: e.target.checked })}
            className="size-4 rounded border-borde text-marca-700 focus:ring-marca-500"
          />
          Puede comprar en cuenta corriente
        </label>

        {datos.cuenta_corriente && (
          <>
            <Campo
              etiqueta="Límite de crédito"
              ancho="col-span-2"
              ayuda="Vacío es sin límite. La caja rechaza la venta que lo exceda."
            >
              <input
                type="number"
                min="0"
                step="1000"
                value={datos.limite_credito ?? ''}
                disabled={!puedeEditar}
                onChange={(e) =>
                  set({ limite_credito: e.target.value === '' ? null : Number(e.target.value) })
                }
                className={`${claseInput} text-right tabular-nums`}
              />
            </Campo>
            <Campo etiqueta="Días de plazo" ancho="col-span-2" ayuda="Para calcular el vencimiento">
              <input
                type="number"
                min="0"
                step="1"
                value={datos.dias_vencimiento ?? 30}
                disabled={!puedeEditar}
                onChange={(e) => set({ dias_vencimiento: Number(e.target.value) })}
                className={`${claseInput} text-right tabular-nums`}
              />
            </Campo>
          </>
        )}
      </Seccion>

      <Seccion titulo="Otros">
        <Campo etiqueta="Observaciones" ancho="col-span-4">
          <textarea
            rows={2}
            value={datos.observaciones ?? ''}
            disabled={!puedeEditar}
            onChange={(e) => set({ observaciones: e.target.value })}
            className={claseInput}
          />
        </Campo>
        <label className="col-span-4 flex items-center gap-2 text-sm text-tinta">
          <input
            type="checkbox"
            checked={datos.activo ?? true}
            disabled={!puedeEditar}
            onChange={(e) => set({ activo: e.target.checked })}
            className="size-4 rounded border-borde text-marca-700 focus:ring-marca-500"
          />
          Cliente activo
        </label>
      </Seccion>
    </div>
  )
}
