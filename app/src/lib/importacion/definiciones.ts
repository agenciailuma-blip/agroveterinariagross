import type { DefinicionPlanilla } from '@/lib/importacion/planilla'

/*
  ─────────────────────────────────────────────────────────────
  Las planillas del día del corte

  Lo que se trae de OBTech además del catálogo: los clientes con lo que
  debe cada uno, y lo que Gross le debe a cada proveedor. Los nombres de
  columna salen de cómo lo escribiría una persona o lo exportaría un
  sistema de gestión; lo que no se reconozca, la pantalla lo pregunta.

  Las reglas que importan —el CUIT que no cierra, la condición de IVA que
  no se entiende, el saldo que queda igual al de la planilla— las pone
  la base (importar_clientes, importar_saldos_proveedores).
  ─────────────────────────────────────────────────────────────
*/

export const CAMPOS_CLIENTE = {
  codigo: 'Código',
  nombre: 'Nombre o razón social',
  condicion_iva: 'Condición frente al IVA',
  documento: 'CUIT o DNI',
  domicilio: 'Domicilio',
  localidad: 'Localidad',
  provincia: 'Provincia',
  codigo_postal: 'Código postal',
  telefono: 'Teléfono',
  email: 'Email',
  cuenta_corriente: 'Tiene cuenta corriente (sí/no)',
  limite_credito: 'Límite de crédito',
  dias_vencimiento: 'Días de plazo',
  saldo: 'Saldo que debe',
} as const

export type CampoCliente = keyof typeof CAMPOS_CLIENTE

export const CLIENTES: DefinicionPlanilla<CampoCliente> = {
  campos: CAMPOS_CLIENTE,
  obligatorios: ['nombre'],
  numericos: ['limite_credito', 'dias_vencimiento', 'saldo'],
  // Un saldo negativo es plata a favor del cliente: pagó de más o tiene
  // una nota de crédito sin usar.
  negativos: ['saldo'],
  clave: 'codigo',
  sinonimos: {
    codigo: ['codigo', 'cod', 'codigo cliente', 'cod cliente', 'nro cliente', 'numero cliente', 'n cliente', 'id'],
    nombre: [
      'nombre', 'razon social', 'cliente', 'nombre y apellido', 'apellido y nombre', 'denominacion',
      'nombre cliente', 'titular',
    ],
    condicion_iva: [
      'condicion iva', 'condicion frente al iva', 'iva', 'condicion', 'cond iva', 'situacion iva',
      'categoria iva', 'tipo iva', 'responsabilidad iva',
    ],
    documento: [
      'cuit', 'dni', 'cuit dni', 'cuit o dni', 'documento', 'nro documento', 'numero documento',
      'nro doc', 'cuit cuil', 'cuil', 'doc', 'c u i t', 'd n i',
    ],
    domicilio: ['domicilio', 'direccion', 'calle', 'domicilio fiscal'],
    localidad: ['localidad', 'ciudad', 'pueblo'],
    provincia: ['provincia', 'prov'],
    codigo_postal: ['codigo postal', 'cp', 'c p', 'cod postal'],
    telefono: ['telefono', 'tel', 'telefonos', 'celular', 'cel', 'whatsapp', 'movil'],
    email: ['email', 'mail', 'correo', 'e mail', 'correo electronico'],
    cuenta_corriente: ['cuenta corriente', 'cta cte', 'cc', 'tiene cuenta corriente', 'cuenta', 'habilitado cta cte'],
    limite_credito: ['limite', 'limite de credito', 'limite credito', 'credito', 'tope'],
    dias_vencimiento: ['dias', 'dias de plazo', 'plazo', 'dias vencimiento', 'dias de vencimiento', 'vencimiento dias'],
    saldo: ['saldo', 'deuda', 'saldo actual', 'debe', 'saldo cta cte', 'saldo cuenta corriente', 'saldo deudor', 'total adeudado'],
  },
}

export const CAMPOS_PROVEEDOR = {
  nombre: 'Proveedor',
  documento: 'CUIT',
  telefono: 'Teléfono',
  email: 'Email',
  saldo: 'Saldo que se le debe',
  detalle: 'Detalle',
} as const

export type CampoProveedor = keyof typeof CAMPOS_PROVEEDOR

export const SALDOS_PROVEEDORES: DefinicionPlanilla<CampoProveedor> = {
  campos: CAMPOS_PROVEEDOR,
  obligatorios: ['nombre'],
  numericos: ['saldo'],
  // Negativo: el proveedor le debe a Gross (una nota de crédito sin usar).
  negativos: ['saldo'],
  clave: 'nombre',
  sinonimos: {
    nombre: ['proveedor', 'nombre', 'razon social', 'denominacion', 'nombre proveedor', 'laboratorio'],
    documento: ['cuit', 'c u i t', 'documento', 'nro cuit', 'cuit proveedor'],
    telefono: ['telefono', 'tel', 'celular', 'whatsapp'],
    email: ['email', 'mail', 'correo', 'e mail'],
    saldo: ['saldo', 'deuda', 'saldo actual', 'le debemos', 'a pagar', 'saldo acreedor', 'total adeudado', 'debe'],
    detalle: ['detalle', 'observaciones', 'observacion', 'concepto', 'nota'],
  },
}
