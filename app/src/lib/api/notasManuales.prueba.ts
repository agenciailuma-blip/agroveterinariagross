import { describe, expect, it } from 'vitest'
import { faltaEnNota, totalesDeNota } from '@/lib/api/notasManuales'

describe('totalesDeNota', () => {
  it('saca neto e IVA del importe con IVA, como la base', () => {
    expect(totalesDeNota([{ descripcion: 'Bonificación', importe: 121, alicuota_iva_id: 5 }])).toEqual({
      neto: 100,
      iva: 21,
      exento: 0,
      total: 121,
    })
  })

  it('separa lo exento y suma alícuotas distintas', () => {
    const t = totalesDeNota([
      { descripcion: 'a', importe: 110.5, alicuota_iva_id: 4 },
      { descripcion: 'b', importe: 10, alicuota_iva_id: null },
      { descripcion: 'c', importe: 50, alicuota_iva_id: 3 },
    ])
    expect(t).toEqual({ neto: 150, iva: 10.5, exento: 10, total: 170.5 })
  })

  it('redondea al centavo por renglón', () => {
    const t = totalesDeNota([{ descripcion: 'a', importe: 100, alicuota_iva_id: 5 }])
    expect(t.neto).toBe(82.64)
    expect(t.iva).toBe(17.36)
    expect(t.total).toBe(100)
  })

  it('no cuenta los renglones sin importe', () => {
    expect(totalesDeNota([{ descripcion: 'a', importe: 0, alicuota_iva_id: 5 }]).total).toBe(0)
  })
})

describe('faltaEnNota', () => {
  const renglon = { descripcion: 'Intereses', importe: 50, alicuota_iva_id: 5 }
  const base = { asociada: false, clienteId: 'c', facturaId: null, renglones: [renglon], motivo: 'Mora' }

  it('está completa', () => {
    expect(faltaEnNota(base)).toBeNull()
  })
  it('libre pide cliente; asociada pide factura', () => {
    expect(faltaEnNota({ ...base, clienteId: null })).toMatch(/cliente/)
    expect(faltaEnNota({ ...base, asociada: true })).toMatch(/factura/)
    expect(faltaEnNota({ ...base, asociada: true, clienteId: null, facturaId: 'f' })).toBeNull()
  })
  it('pide descripción, importe y motivo', () => {
    expect(faltaEnNota({ ...base, renglones: [{ ...renglon, descripcion: ' ' }] })).toMatch(/descripción/)
    expect(faltaEnNota({ ...base, renglones: [{ ...renglon, importe: 0 }] })).toMatch(/importe/)
    expect(faltaEnNota({ ...base, motivo: 'x' })).toMatch(/motivo/)
  })
})
