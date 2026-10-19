import { describe, expect, it } from 'vitest'
import { Cortacircuito } from '@/lib/cortacircuito'

/*
  Lo que se prueba acá es el tiempo, así que el reloj es de mentira: con
  el de verdad, estas pruebas tardarían un minuto y nadie las correría.
*/
function conReloj() {
  let t = 0
  const corta = new Cortacircuito(10_000, () => t)
  return { corta, avanzar: (ms: number) => (t += ms) }
}

describe('el cortacircuito del servidor', () => {
  it('con el servidor sano, deja pasar todo y no hay nada que probar', () => {
    const { corta, avanzar } = conReloj()
    expect(corta.dejarPasar()).toBe(true)
    expect(corta.dejarPasar()).toBe(true)
    avanzar(60_000)
    expect(corta.tocaProbar()).toBe(false)
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

  /*
    El caso del 16/10: cumplida la ventana, la consulta que pasaba a
    probar era la de alguien —abrir la Caja, cobrar, mandar la venta— y
    esa persona esperaba doce segundos. Ahora prueba la consulta de fondo.
  */
  it('caído, ninguna consulta de la gente sale a la red, pase el tiempo que pase', () => {
    const { corta, avanzar } = conReloj()
    corta.anotarFalla()
    for (let i = 0; i < 10; i++) {
      avanzar(10_000)
      expect(corta.dejarPasar()).toBe(false)
    }
  })

  it('cumplida la ventana toca probar, una sola vez', () => {
    const { corta, avanzar } = conReloj()
    corta.anotarFalla()
    avanzar(9_999)
    expect(corta.tocaProbar()).toBe(false)
    avanzar(1)
    expect(corta.tocaProbar()).toBe(true)
    expect(corta.tocaProbar()).toBe(false) // aunque se pregunte de nuevo enseguida
  })

  it('si la prueba no anda, vuelve a tocar a la ventana siguiente', () => {
    const { corta, avanzar } = conReloj()
    corta.anotarFalla()
    avanzar(10_000)
    expect(corta.tocaProbar()).toBe(true)
    avanzar(9_999)
    expect(corta.tocaProbar()).toBe(false)
    avanzar(1)
    expect(corta.tocaProbar()).toBe(true)
  })

  it('si la prueba anda, vuelve todo a la normalidad', () => {
    const { corta, avanzar } = conReloj()
    corta.anotarFalla()
    avanzar(10_000)
    corta.tocaProbar()
    corta.anotarExito()
    expect(corta.abierto).toBe(false)
    expect(corta.dejarPasar()).toBe(true)
    expect(corta.tocaProbar()).toBe(false)
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
    avanzar(9_000)
    corta.anotarFalla()
    avanzar(1_000)
    expect(corta.tocaProbar()).toBe(true)
  })

  it('avisa una vez al caerse y una vez al volver', () => {
    const { corta } = conReloj()
    const avisos: boolean[] = []
    const dejar = corta.alCambiar((abierto) => avisos.push(abierto))
    corta.anotarFalla()
    corta.anotarFalla()
    corta.anotarExito()
    corta.anotarExito()
    expect(avisos).toEqual([true, false])
    dejar()
    corta.anotarFalla()
    expect(avisos).toEqual([true, false])
  })
})
