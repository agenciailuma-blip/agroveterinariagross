import { describe, expect, it } from 'vitest'
import { coincideNumero, cuantosFiltros, diaDe, filtrarFilas, FILTROS_VACIOS, hayFiltros, normalizar } from './filtros'
import { aplicarFiltros, leerNumeroBuscado, textoParaIlike } from './api/filtrosConsulta'

describe('coincideNumero', () => {
  it('por número, no por cómo está escrito', () => {
    expect(coincideNumero('REM CAJA1-00000026', '26')).toBe(true)
    expect(coincideNumero('REM CAJA1-00000026', '0026')).toBe(true)
    expect(coincideNumero('REM CAJA1-00000126', '26')).toBe(false)
    expect(coincideNumero('REM CAJA1-00000026', 'CAJA1-26')).toBe(true)
    expect(coincideNumero('REM CAJA2-00000026', 'CAJA1-26')).toBe(false)
    expect(coincideNumero('0001-00000123', '1-123')).toBe(true)
    expect(coincideNumero('MAY-000009', 'may-9')).toBe(true)
  })
  it('un código con letras, adentro', () => {
    expect(coincideNumero('ROYAL CAT 1,5', 'royal')).toBe(true)
    expect(coincideNumero('ABC-XL', 'xl')).toBe(true)
    expect(coincideNumero(null, '1')).toBe(false)
    expect(coincideNumero('lo que sea', '  ')).toBe(true)
  })
  it('un código de barras escrito en parte', () => {
    expect(coincideNumero('7791234567890', '1234567')).toBe(true)
  })
})

describe('filtrarFilas', () => {
  const filas = [
    { n: 'REM CAJA1-00000026', fecha: '2026-11-19', cliente: 'DON ENRIQUE SECPA', estado: 'emitido', venta: 'MAY-000009' },
    { n: 'REM CAJA1-00000024', fecha: '2026-11-15', cliente: 'Volkmer Diego', estado: 'anulado', venta: null },
    { n: 'REM CAJA1-00000012', fecha: '2026-11-03', cliente: 'Cerámica Oberá', estado: 'emitido', venta: 'CAJA1-000042' },
  ]
  const campos = {
    fecha: (f: (typeof filas)[number]) => f.fecha,
    persona: (f: (typeof filas)[number]) => f.cliente,
    numero: (f: (typeof filas)[number]) => [f.n, f.venta],
    estado: (f: (typeof filas)[number]) => f.estado,
  }
  it('sin filtros, todas', () => {
    expect(filtrarFilas(filas, FILTROS_VACIOS, campos)).toHaveLength(3)
  })
  it('rango de fechas inclusive', () => {
    const r = filtrarFilas(filas, { ...FILTROS_VACIOS, desde: '2026-11-03', hasta: '2026-11-15' }, campos)
    expect(r.map((f) => f.n)).toEqual(['REM CAJA1-00000024', 'REM CAJA1-00000012'])
  })
  it('cliente sin importar mayúsculas ni acentos', () => {
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, persona: 'enrique' }, campos)).toHaveLength(1)
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, persona: 'ceramica obera' }, campos)).toHaveLength(1)
  })
  it('número del papel o código de la venta', () => {
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, numero: '24' }, campos).map((f) => f.n)).toEqual(['REM CAJA1-00000024'])
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, numero: 'CAJA1-42' }, campos).map((f) => f.n)).toEqual(['REM CAJA1-00000012'])
  })
  it('estado', () => {
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, estado: 'anulado' }, campos)).toHaveLength(1)
  })
  it('un filtro que la pantalla no usa no filtra', () => {
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, estado: 'anulado' }, { persona: campos.persona })).toHaveLength(3)
  })
})

describe('ayudas', () => {
  it('normalizar', () => {
    expect(normalizar('  PÉREZ Ñandú ')).toBe('perez nandu')
  })
  it('hayFiltros y cuantosFiltros', () => {
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false)
    expect(hayFiltros({ ...FILTROS_VACIOS, persona: '   ' })).toBe(false)
    expect(cuantosFiltros({ ...FILTROS_VACIOS, desde: '2026-01-01', hasta: '2026-02-01', numero: '3' })).toBe(2)
  })
  it('diaDe', () => {
    expect(diaDe('2026-11-19')).toBe('2026-11-19')
    expect(diaDe(new Date(2026, 10, 3, 23, 30))).toBe('2026-11-03')
    expect(diaDe('cualquier cosa')).toBeNull()
    expect(diaDe(null)).toBeNull()
  })
})

describe('filtros en la consulta', () => {
  // Una consulta de mentira que anota lo que se le pide.
  function consulta() {
    const pedidos: string[] = []
    const q = {
      pedidos,
      gte: (c: string, v: string) => (pedidos.push(`${c}>=${v}`), q),
      lte: (c: string, v: string) => (pedidos.push(`${c}<=${v}`), q),
      lt: (c: string, v: string) => (pedidos.push(`${c}<${v}`), q),
      ilike: (c: string, v: string) => (pedidos.push(`${c}~${v}`), q),
      eq: (c: string, v: string | number) => (pedidos.push(`${c}=${v}`), q),
    }
    return q
  }
  it('fechas, nombre, estado y número con serie', () => {
    const q = aplicarFiltros(
      consulta(),
      { desde: '2026-11-01', hasta: '2026-11-19', persona: 'Enrique', numero: 'REM CAJA1-26', estado: 'emitido' },
      { fecha: 'fecha', persona: 'receptor_nombre', numero: 'numero', serie: 'serie', estado: 'estado' },
    )
    expect(q.pedidos).toEqual([
      'fecha>=2026-11-01',
      'fecha<=2026-11-19',
      'receptor_nombre~%Enrique%',
      'estado=emitido',
      'numero=26',
      'serie~CAJA1',
    ])
  })
  it('fecha con hora: todo el día de «hasta» cuenta', () => {
    const q = aplicarFiltros(consulta(), { ...FILTROS_VACIOS, desde: '2026-11-30', hasta: '2026-11-30' }, { fecha: 'creado_en', fechaConHora: true })
    expect(q.pedidos).toEqual(['creado_en>=2026-11-30T00:00:00-03:00', 'creado_en<2026-12-01T00:00:00-03:00'])
  })
  it('punto de venta numérico y código con letras', () => {
    expect(aplicarFiltros(consulta(), { ...FILTROS_VACIOS, numero: '0001-00000016' }, { numero: 'numero', puntoVenta: 'punto_venta' }).pedidos).toEqual([
      'numero=16',
      'punto_venta=1',
    ])
    expect(aplicarFiltros(consulta(), { ...FILTROS_VACIOS, numero: 'royal' }, { numero: 'numero', codigo: 'codigo' }).pedidos).toEqual([
      'codigo~%royal%',
    ])
  })
  it('lo que la tabla no tiene, no se pide', () => {
    expect(aplicarFiltros(consulta(), { ...FILTROS_VACIOS, persona: 'x', estado: 'y' }, {}).pedidos).toEqual([])
  })
  it('escapa los comodines', () => {
    expect(textoParaIlike(' 50%_off ')).toBe('%50\\%\\_off%')
  })
  it('leerNumeroBuscado', () => {
    expect(leerNumeroBuscado('REM CAJA1-00000026')).toEqual({ numero: 26, serie: '1', letras: 'CAJA1' })
    expect(leerNumeroBuscado('1-26')).toEqual({ numero: 26, serie: '1', letras: null })
    expect(leerNumeroBuscado('abc')).toEqual({ numero: null, serie: null, letras: null })
  })
})
