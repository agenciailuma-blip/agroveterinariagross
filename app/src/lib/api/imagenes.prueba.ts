import { describe, expect, it } from 'vitest'
import { claveDelArchivo, emparejarArchivos, medidasAchicadas, type ProductoParaFotos } from '@/lib/api/imagenes'

/*
  Las fotos de los productos.

  Lo que se cuida acá es lo que decide la pantalla: a qué tamaño se
  achica una foto, y a qué producto va cada archivo de la subida de a
  muchas. Una foto en el producto equivocado sale en la tienda con el
  nombre de otro.
*/

describe('el tamaño de la foto', () => {
  it('una foto de celular se achica a 1200 del lado más largo, sin deformarse', () => {
    expect(medidasAchicadas(4000, 3000)).toEqual({ ancho: 1200, alto: 900 })
    expect(medidasAchicadas(3000, 4000)).toEqual({ ancho: 900, alto: 1200 })
  })

  it('una foto chica no se agranda', () => {
    expect(medidasAchicadas(800, 600)).toEqual({ ancho: 800, alto: 600 })
    expect(medidasAchicadas(1200, 1200)).toEqual({ ancho: 1200, alto: 1200 })
  })

  it('una muy angosta no queda en cero', () => {
    expect(medidasAchicadas(5000, 2).alto).toBe(1)
  })
})

const productos: ProductoParaFotos[] = [
  { id: 'a', codigo: 'DEMO-002', nombre: 'Royal Canin Gato', codigos_barra: ['7790000000002'] },
  { id: 'b', codigo: 'ALIM-10', nombre: 'Alimento a granel', codigos_barra: [] },
  // Un código que termina en número de verdad.
  { id: 'c', codigo: 'PIPETA-2', nombre: 'Pipeta 2', codigos_barra: [] },
]

describe('qué producto es cada archivo', () => {
  it('por el código, sin importar mayúsculas ni la extensión', () => {
    expect(emparejarArchivos(['demo-002.JPG'], productos)[0].producto?.id).toBe('a')
  })

  it('por el código de barras', () => {
    expect(emparejarArchivos(['7790000000002.png'], productos)[0].producto?.id).toBe('a')
  })

  it('varias fotos del mismo producto, numeradas de las formas de siempre', () => {
    const r = emparejarArchivos(['DEMO-002-2.jpg', 'DEMO-002_3.webp', 'DEMO-002 (4).jpeg'], productos)
    expect(r.map((e) => e.producto?.id)).toEqual(['a', 'a', 'a'])
  })

  it('un código que termina en número de verdad no se confunde con una foto numerada', () => {
    expect(emparejarArchivos(['PIPETA-2.jpg'], productos)[0].producto?.id).toBe('c')
    expect(emparejarArchivos(['PIPETA-2-2.jpg'], productos)[0].producto?.id).toBe('c')
  })

  it('lo que no coincide queda sin producto, y dice qué se buscó', () => {
    const r = emparejarArchivos(['foto de la gondola.jpg'], productos)[0]
    expect(r.producto).toBeNull()
    expect(r.clave).toBe('foto de la gondola')
  })

  it('el número de foto se saca del nombre', () => {
    expect(claveDelArchivo('ALIM-10-3.jpg')).toBe('ALIM-10')
    expect(claveDelArchivo('ALIM-10 (2).png')).toBe('ALIM-10')
  })

  /*
    Sola, la regla lee «ALIM-10» como la foto 10 de «ALIM». Por eso se
    busca primero el nombre entero: el código que termina en número gana.
  */
  it('un código que termina en número se encuentra igual', () => {
    expect(emparejarArchivos(['ALIM-10.png'], productos)[0].producto?.id).toBe('b')
    expect(emparejarArchivos(['ALIM-10-2.png'], productos)[0].producto?.id).toBe('b')
  })
})
