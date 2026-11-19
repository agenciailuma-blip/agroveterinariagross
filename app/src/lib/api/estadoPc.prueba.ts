import { describe, expect, it } from 'vitest'
import { armarEstadoPc, compararVersiones, leerPc, sistemaOperativo } from '@/lib/api/estadoPc'
import type { EstadoPc, PcDelLocal } from '@/lib/api/estadoPc'

/*
  El estado de las PC. Que la base guarde lo informado lo prueba
  supabase/pruebas/estado-de-las-pc.sql; acá, qué informa cada PC y
  cómo lo lee la pantalla.
*/

const base = {
  enEscritorio: true,
  impresora: 'POS80 Printer(2)',
  impresorasInstaladas: ['POS80 Printer(2)', 'Microsoft Print to PDF'],
  sinSubir: 0,
  error: null,
  ultimaSync: null,
  esPuntoDeEncuentro: false,
  escuchando: false,
  entrega: null,
  usuario: 'Local',
  agente: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
}

describe('lo que informa cada PC', () => {
  it('la impresora elegida, y si Windows la encuentra', () => {
    expect(armarEstadoPc(base).impresora_encontrada).toBe(true)
    expect(armarEstadoPc({ ...base, impresorasInstaladas: ['Otra'] }).impresora_encontrada).toBe(false)
  })

  it('desde el navegador, o sin la lista de Windows, no se sabe', () => {
    expect(armarEstadoPc({ ...base, enEscritorio: false }).impresora_encontrada).toBeNull()
    expect(armarEstadoPc({ ...base, impresorasInstaladas: null }).impresora_encontrada).toBeNull()
    expect(armarEstadoPc({ ...base, enEscritorio: false }).programa).toBe('navegador')
  })

  it('si escucha, sólo la PC que escucha a las demás', () => {
    expect(armarEstadoPc(base).escucha).toBeNull()
    expect(armarEstadoPc({ ...base, esPuntoDeEncuentro: true, escuchando: false }).escucha).toBe(false)
  })

  it('el error, cortado', () => {
    expect(armarEstadoPc({ ...base, error: 'x'.repeat(1000) }).error_sync).toHaveLength(300)
  })

  it('la entrega a la caja, en palabras', () => {
    expect(
      armarEstadoPc({ ...base, entrega: { estado: 'no_contesta', esperando: 2, motivo: 'tiempo agotado' } }).entrega,
    ).toBe('la caja no contesta (2 esperando): tiempo agotado')
    expect(armarEstadoPc({ ...base, entrega: { estado: 'no_corresponde' } }).entrega).toBeNull()
  })

  it('el sistema operativo', () => {
    expect(sistemaOperativo('Mozilla/5.0 (Windows NT 6.1; Win64; x64)')).toBe('Windows 7')
    expect(sistemaOperativo('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows 10 u 11')
  })
})

describe('las versiones', () => {
  it('se comparan como números, no como texto', () => {
    expect(compararVersiones('0.25.10', '0.25.9')).toBe(1)
    expect(compararVersiones('0.22.0', '0.25.4')).toBe(-1)
    expect(compararVersiones('0.25.4', '0.25.4')).toBe(0)
  })
})

const ahora = new Date('2026-11-19T15:00:00')
const recien = new Date('2026-11-19T14:58:00').toISOString()

function pc(estado: Partial<EstadoPc> | null, extra: Partial<PcDelLocal> = {}): PcDelLocal {
  return {
    id: '1',
    nombre: 'Caja 1',
    tipo: 'caja',
    es_punto_de_encuentro: false,
    version_app: '0.25.4',
    estado_pc: estado,
    estado_informado_en: estado ? recien : null,
    equipo_visto_en: recien,
    ...extra,
  }
}

const sano: Partial<EstadoPc> = {
  programa: 'escritorio',
  impresora: 'POS80',
  impresora_encontrada: true,
  sin_enviar: 0,
  error_sync: null,
}

describe('cómo se lee cada PC', () => {
  it('todo bien', () => {
    expect(leerPc(pc(sano), '0.25.4', ahora)).toEqual({ nivel: 'ok', resumen: 'Todo en orden.', detalles: [] })
  })

  it('la que no informa tiene una versión vieja', () => {
    const l = leerPc(pc(null, { version_app: null }), '0.25.4', ahora)
    expect(l.nivel).toBe('aviso')
    expect(l.resumen).toMatch(/versión anterior/)
  })

  it('versión atrasada', () => {
    const l = leerPc(pc(sano, { version_app: '0.25.3' }), '0.25.4', ahora)
    expect(l.nivel).toBe('aviso')
    expect(l.resumen).toBe('Tiene la 0.25.3; hay una más nueva, la 0.25.4.')
  })

  it('la impresora que Windows no encuentra es una falla, y va primero', () => {
    const l = leerPc(pc({ ...sano, impresora_encontrada: false, sin_enviar: 2 }), '0.25.4', ahora)
    expect(l.nivel).toBe('falla')
    expect(l.resumen).toMatch(/no encuentra la impresora/)
    expect(l.detalles).toEqual(['2 sin enviar al servidor.'])
  })

  it('la que escucha y no escucha', () => {
    expect(leerPc(pc({ ...sano, escucha: false }), '0.25.4', ahora).nivel).toBe('falla')
  })

  it('sin impresora elegida en el programa, aviso; en el navegador, nada', () => {
    expect(leerPc(pc({ ...sano, impresora: null }), '0.25.4', ahora).nivel).toBe('aviso')
    expect(leerPc(pc({ ...sano, programa: 'navegador', impresora: null }), '0.25.4', ahora).nivel).toBe('ok')
  })

  it('sin noticias hace rato: apagada, sin perder lo que dijo', () => {
    const vieja = pc({ ...sano, sin_enviar: 3 }, { estado_informado_en: new Date('2026-11-18T21:10:00').toISOString() })
    const l = leerPc(vieja, '0.25.4', ahora)
    expect(l.resumen).toMatch(/^Apagada o sin internet desde ayer a las/)
    expect(l.nivel).toBe('aviso')
    expect(l.detalles).toEqual(['3 sin enviar al servidor.'])
    expect(leerPc(pc(sano, { estado_informado_en: vieja.estado_informado_en }), '0.25.4', ahora).nivel).toBe('apagada')
  })
})
