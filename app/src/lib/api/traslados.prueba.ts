import { describe, expect, it } from 'vitest'
import {
  duracion,
  enlaceMapaTraslado,
  enlaceTelefono,
  faltaEnTraslado,
  leerKm,
  leerMinutos,
  paraLaBase,
  puedeIrACaja,
  trasladoVacio,
  ventaVigente,
  type VentaDelTraslado,
} from '@/lib/api/traslados'

const hoy = '2026-10-29'
const completa = {
  ...trasladoVacio(hoy),
  motivo: 'retiro' as const,
  direccion: 'Calle Inventada 123',
  dueno_nombre: 'Dueño de Prueba',
}

const venta = (estado: VentaDelTraslado['estado']): VentaDelTraslado => ({
  venta_id: estado,
  codigo: 'TRA-000001',
  estado,
  total: 1000,
  comprobante_id: null,
  comprobante: null,
  no_fiscal_id: null,
})

describe('lo que falta para guardar una orden', () => {
  it('pide motivo, dirección y dueño', () => {
    expect(faltaEnTraslado(trasladoVacio(hoy))).toMatch(/motivo/)
    expect(faltaEnTraslado({ ...completa, direccion: ' ' })).toMatch(/dirección/)
    expect(faltaEnTraslado({ ...completa, dueno_nombre: '' })).toMatch(/dueño/)
    expect(faltaEnTraslado(completa)).toBeNull()
  })
  it('el monto puede quedar vacío o en cero, pero no puede ser cualquier cosa', () => {
    expect(faltaEnTraslado({ ...completa, monto: '0' })).toBeNull()
    expect(faltaEnTraslado({ ...completa, monto: 'mucho' })).toMatch(/monto/)
    expect(paraLaBase({ ...completa, monto: '25.000' }).monto).toBe(25000)
    expect(paraLaBase({ ...completa, monto: '' }).monto).toBe(0)
  })
  it('sin hora va nula', () => {
    expect(paraLaBase(completa).hora).toBeNull()
  })
})

describe('la caja', () => {
  it('va a la caja una sola vez, salvo que la venta se haya anulado', () => {
    const base = { estado: 'pendiente' as const, monto: 1000, ventas: [] as VentaDelTraslado[] }
    expect(puedeIrACaja(base)).toBe(true)
    expect(puedeIrACaja({ ...base, ventas: [venta('en_caja')] })).toBe(false)
    expect(puedeIrACaja({ ...base, ventas: [venta('anulada')] })).toBe(true)
    expect(puedeIrACaja({ ...base, monto: 0 })).toBe(false)
    expect(puedeIrACaja({ ...base, estado: 'cancelada' })).toBe(false)
    expect(puedeIrACaja({ ...base, estado: 'finalizada' })).toBe(true)
  })
  it('la venta que cuenta es la última sin anular', () => {
    expect(ventaVigente({ ventas: [venta('anulada'), venta('cobrada')] })?.estado).toBe('cobrada')
    expect(ventaVigente({ ventas: [venta('anulada')] })).toBeNull()
  })
})

describe('lo que se anota al volver', () => {
  it('el tiempo se escribe como venga', () => {
    expect(leerMinutos('45')).toBe(45)
    expect(leerMinutos('1:15')).toBe(75)
    expect(leerMinutos('1 h 15')).toBe(75)
    expect(leerMinutos('2hs')).toBe(120)
    expect(leerMinutos('90 min')).toBe(90)
    expect(leerMinutos('un rato')).toBeNull()
  })
  it('los kilómetros, con coma o con punto', () => {
    expect(leerKm('18,4')).toBe(18.4)
    expect(leerKm('18.45')).toBe(18.5)
    expect(leerKm('-3')).toBeNull()
  })
  it('la duración se lee en horas y minutos', () => {
    expect(duracion(45)).toBe('45 min')
    expect(duracion(60)).toBe('1 h')
    expect(duracion(130)).toBe('2 h 10 min')
  })
})

describe('el mapa y el teléfono', () => {
  it('sin localidad, Oberá', () => {
    expect(decodeURIComponent(enlaceMapaTraslado({ direccion: 'Sarmiento 120', localidad: null }))).toContain(
      'Sarmiento 120, Oberá, Misiones',
    )
    expect(decodeURIComponent(enlaceMapaTraslado({ direccion: 'Ruta 14 km 5', localidad: 'Campo Viera' }))).toContain(
      'Campo Viera',
    )
  })
  it('el enlace del mapa es uno que el programa deja abrir', () => {
    expect(enlaceMapaTraslado({ direccion: 'x', localidad: null }).startsWith('https://www.google.com/maps/')).toBe(true)
  })
  it('el teléfono, sólo con dígitos', () => {
    expect(enlaceTelefono('3755 15-000000')).toBe('tel:375515000000')
    expect(enlaceTelefono('+54 9 3755 000000')).toBe('tel:+5493755000000')
    expect(enlaceTelefono('no tiene')).toBeNull()
  })
})
