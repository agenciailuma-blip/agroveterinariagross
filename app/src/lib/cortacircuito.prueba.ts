import { describe, expect, it } from 'vitest'
import { Cortacircuito } from '@/lib/cortacircuito'

/*
  Lo que se prueba acá es el tiempo, así que el reloj es de mentira: con
  el de verdad, estas pruebas tardarían un minuto y nadie las correría.
*/
function conReloj() {
  let t = 0
  const corta = new Cortacircuito(15_000, () => t)
  return { corta, avanzar: (ms: number) => (t += ms) }
}

describe('el cortacircuito del servidor', () => {
  it('con el servidor sano, deja pasar todo', () => {
    const { corta } = conReloj()
    expect(corta.dejarPasar()).toBe(true)
    expect(corta.dejarPasar()).toBe(true)
    expect(corta.abierto).toBe(false)
  })

  /*
    El caso del 17/09: sin internet, la pantalla de Caja hacía cinco
    consultas y esperaba doce segundos por cada una.
  */
  it('después de una falla, las siguientes no salen a la red', () => {
    const { corta } = conReloj()
    corta.anotarFalla()
    expect(corta.dejarPasar()).toBe(false)
    expect(corta.dejarPasar()).toBe(false)
    expect(corta.abierto).toBe(true)
  })

  it('cumplida la ventana deja pasar una, y sólo una', () => {
    const { corta, avanzar } = conReloj()
    corta.anotarFalla()
    avanzar(15_000)
    expect(corta.dejarPasar()).toBe(true) // la de prueba
    expect(corta.dejarPasar()).toBe(false) // las demás siguen esperando
  })

  it('si la de prueba anda, vuelve todo a la normalidad', () => {
    const { corta, avanzar } = conReloj()
    corta.anotarFalla()
    avanzar(15_000)
    corta.dejarPasar()
    corta.anotarExito()
    expect(corta.abierto).toBe(false)
    expect(corta.dejarPasar()).toBe(true)
  })

  it('si la de prueba falla, se sigue esperando otra ventana', () => {
    const { corta, avanzar } = conReloj()
    corta.anotarFalla()
    avanzar(15_000)
    corta.dejarPasar()
    corta.anotarFalla()
    avanzar(14_999)
    expect(corta.dejarPasar()).toBe(false)
    avanzar(1)
    expect(corta.dejarPasar()).toBe(true)
  })

  /*
    Una falla mientras ya estaba caído no corre el reloj hacia adelante.
    Si lo corriera, cinco consultas fallando en fila irían pateando la
    prueba de recuperación y el sistema no se enteraría nunca de que
    volvió internet.
  */
  it('fallar de nuevo no patea la próxima prueba', () => {
    const { corta, avanzar } = conReloj()
    corta.anotarFalla()
    avanzar(14_000)
    corta.anotarFalla()
    avanzar(1_000)
    expect(corta.dejarPasar()).toBe(true)
  })
})
