import { describe, expect, it } from 'vitest'
import {
  CLAVE_MINIMA as MINIMA_SERVIDOR,
  correoValido,
  errorDeLaCuenta,
  esAccion,
  problemaDeLaClave,
} from '../../../../supabase/functions/administrar-usuarios/reglas.ts'
import { CLAVE_MINIMA } from '@/lib/api/usuarios'

/*
  Las cuentas de acceso desde la pantalla de Usuarios (12/11).

  Lo que se cuida: que la app y el servidor pidan lo mismo de una
  contraseña, que no se acepte una acción inventada y que lo que contesta
  Supabase se entienda.
*/

describe('las cuentas de acceso', () => {
  it('la app y el servidor piden el mismo largo de contraseña', () => {
    expect(CLAVE_MINIMA).toBe(MINIMA_SERVIDOR)
  })

  it('una contraseña corta, larga o con espacios en las puntas no sirve', () => {
    expect(problemaDeLaClave('1234567')).toMatch(/al menos 8/)
    expect(problemaDeLaClave('x'.repeat(73))).toMatch(/demasiado larga/)
    expect(problemaDeLaClave(' gross2026')).toMatch(/espacio/)
    expect(problemaDeLaClave('gross2026 ')).toMatch(/espacio/)
    expect(problemaDeLaClave('gross 2026')).toBeNull()
    expect(problemaDeLaClave('12345678')).toBeNull()
  })

  it('sólo acepta las acciones que conoce', () => {
    for (const a of ['dar_acceso', 'cambiar_clave', 'quitar_acceso', 'eliminar', 'sincronizar_correo']) {
      expect(esAccion(a)).toBe(true)
    }
    expect(esAccion('borrar_todo')).toBe(false)
    expect(esAccion(undefined)).toBe(false)
  })

  it('el correo tiene que tener forma de correo', () => {
    expect(correoValido('caja@agroveterinariagross.com.ar')).toBe(true)
    expect(correoValido('caja@gross')).toBe(false)
    expect(correoValido('caja gross@gmail.com')).toBe(false)
  })

  it('lo que contesta Supabase, en palabras', () => {
    expect(errorDeLaCuenta('A user with this email address has already been registered')).toBe(
      'Ya hay una cuenta con ese correo.',
    )
    expect(errorDeLaCuenta('Password should be at least 6 characters')).toMatch(/contraseña/)
    expect(errorDeLaCuenta('algo raro')).toBe('No se pudo: algo raro')
  })
})
