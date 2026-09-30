import { describe, expect, it } from 'vitest'
import { depositoPropuesto, problemaDeLaTransferencia, quedaEnOrigen } from '@/lib/api/depositos'
import type { Deposito, LineaATransferir } from '@/lib/api/depositos'

/*
  Lo que la pantalla decide sola. Las reglas que importan —el total no
  se mueve, cada máquina descuenta de su depósito, lo que vuelve vuelve
  adonde salió— las pone la base (supabase/pruebas/transferencias-entre-depositos.sql).
*/

const local: Deposito = { id: 'l1', nombre: 'Local', es_principal: true, activo: true }
const local2: Deposito = { id: 'l2', nombre: 'Local 2', es_principal: false, activo: true }

describe('el depósito que se propone en esta PC', () => {
  it('es el de su terminal', () => {
    expect(depositoPropuesto([local, local2], 'l2')).toBe('l2')
  })

  it('sin uno propio, el principal', () => {
    expect(depositoPropuesto([local2, local], null)).toBe('l1')
    expect(depositoPropuesto([local2, local], undefined)).toBe('l1')
  })

  it('si el de la terminal se dio de baja, el principal y no uno que no está', () => {
    expect(depositoPropuesto([local], 'l2')).toBe('l1')
  })

  it('sin depósitos, ninguno', () => {
    expect(depositoPropuesto([], 'l1')).toBeNull()
  })
})

const linea = (cantidad: string, en_origen = 10): LineaATransferir => ({
  producto_id: 'p1',
  codigo: 'A1',
  nombre_interno: 'ALIM PERRO 20KG',
  unidad_medida: 'u',
  en_origen,
  cantidad,
})

describe('lo que impide confirmar una transferencia', () => {
  it('sin origen o destino', () => {
    expect(problemaDeLaTransferencia(null, 'l2', [linea('1')])).toMatch(/Elegí/)
  })

  it('de un depósito a sí mismo', () => {
    expect(problemaDeLaTransferencia('l1', 'l1', [linea('1')])).toBe(
      'El origen y el destino son el mismo depósito.',
    )
  })

  it('sin productos', () => {
    expect(problemaDeLaTransferencia('l1', 'l2', [])).toMatch(/ningún producto/)
  })

  it('un renglón sin cantidad, o en cero, dice cuál', () => {
    expect(problemaDeLaTransferencia('l1', 'l2', [linea('')])).toBe('Falta la cantidad de ALIM PERRO 20KG.')
    expect(problemaDeLaTransferencia('l1', 'l2', [linea('0')])).toBe('Falta la cantidad de ALIM PERRO 20KG.')
  })

  it('llevar más de lo que figura en el origen NO lo impide', () => {
    expect(problemaDeLaTransferencia('l1', 'l2', [linea('15', 10)])).toBeNull()
  })
})

describe('lo que queda en el origen', () => {
  it('resta lo que se lleva, con decimales', () => {
    expect(quedaEnOrigen(linea('2.5', 10))).toBe(7.5)
  })

  it('puede quedar negativo, y se muestra', () => {
    expect(quedaEnOrigen(linea('12', 10))).toBe(-2)
  })

  it('sin cantidad todavía, queda lo que hay', () => {
    expect(quedaEnOrigen(linea('', 10))).toBe(10)
  })
})
