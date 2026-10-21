import { describe, expect, it } from 'vitest'
import {
  direccionPermitida,
  elegirCandidatas,
  tipoDeFotoAceptado,
  type ImagenDeSerper,
} from '../../../../supabase/functions/buscar-fotos/reglas.ts'
import { blancuraDelBorde, consultaDe, filtrarPorNombre, lasQueSeMuestran, type FotoEncontrada, type ProductoSinFoto } from '@/lib/api/buscarFotos'

/*
  La búsqueda de fotos en internet.

  Lo que se cuida: qué se le propone a Lucas, que el servidor no vaya a
  buscar una foto a una dirección interna, y con qué texto se busca.
*/

const imagen = (n: number, extra: Partial<ImagenDeSerper> = {}): ImagenDeSerper => ({
  title: `Foto ${n}`,
  imageUrl: `https://tienda.com.ar/fotos/${n}.jpg`,
  imageWidth: 800,
  imageHeight: 800,
  thumbnailUrl: `https://encrypted-tbn0.gstatic.com/images?q=${n}`,
  domain: 'tienda.com.ar',
  link: `https://tienda.com.ar/producto/${n}`,
  ...extra,
})

describe('qué fotos se proponen', () => {
  it('hasta diez, en el orden de Google', () => {
    const r = elegirCandidatas(Array.from({ length: 12 }, (_, n) => imagen(n + 1)))
    expect(r).toHaveLength(10)
    expect(r[0].titulo).toBe('Foto 1')
    expect(r[0].sitio).toBe('tienda.com.ar')
  })

  // Pedido de Lucas del 21/10: sin marca de agua ni posteos de otros.
  it('nada de bancos de imágenes ni de redes', () => {
    const r = elegirCandidatas([
      imagen(1, { imageUrl: 'https://image.shutterstock.com/a.jpg' }),
      imagen(2, { imageUrl: 'https://i.pinimg.com/a.jpg' }),
      imagen(3, { link: 'https://www.facebook.com/tienda/posts/1' }),
      imagen(4, { imageUrl: 'https://media.istockphoto.com/a.jpg' }),
      imagen(5),
    ])
    expect(r.map((c) => c.titulo)).toEqual(['Foto 5'])
  })

  it('las muy chicas, las repetidas, las SVG y las sin vista previa no', () => {
    const r = elegirCandidatas([
      imagen(1, { imageWidth: 120, imageHeight: 90 }),
      imagen(2, { imageUrl: 'https://tienda.com.ar/logo.svg' }),
      imagen(3, { thumbnailUrl: undefined }),
      imagen(4),
      imagen(4),
      imagen(5, { imageUrl: 'http://192.168.0.10/foto.jpg' }),
    ])
    expect(r.map((c) => c.titulo)).toEqual(['Foto 4'])
  })

  it('una sin medidas se propone igual', () => {
    expect(elegirCandidatas([imagen(1, { imageWidth: undefined, imageHeight: undefined })])).toHaveLength(1)
  })
})

describe('adónde puede ir a buscar una foto el servidor', () => {
  it('a un sitio común, sí', () => {
    expect(direccionPermitida('https://www.royalcanin.com/ar/foto.png')).toBe(true)
    expect(direccionPermitida('http://tienda.com.ar/a.jpg')).toBe(true)
  })

  it('a una dirección interna, no', () => {
    for (const url of [
      'http://localhost/a.jpg',
      'http://127.0.0.1/a.jpg',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/a.jpg',
      'http://servidor/a.jpg',
      'http://algo.internal/a.jpg',
      'https://ywggnhoifhtoncnxrodh.supabase.co/rest/v1/cliente',
      'https://usuario:clave@tienda.com.ar/a.jpg',
      'file:///etc/passwd',
      'no es una dirección',
    ]) {
      expect(direccionPermitida(url), url).toBe(false)
    }
  })
})

describe('qué se puede convertir', () => {
  it('las fotos comunes sí; una página o un SVG no', () => {
    expect(tipoDeFotoAceptado('image/jpeg')).toBe(true)
    expect(tipoDeFotoAceptado('image/webp; charset=binary')).toBe(true)
    expect(tipoDeFotoAceptado('text/html')).toBe(false)
    expect(tipoDeFotoAceptado('image/svg+xml')).toBe(false)
    expect(tipoDeFotoAceptado(null)).toBe(false)
  })
})

describe('con qué texto se busca', () => {
  it('el nombre público, si tiene', () => {
    expect(consultaDe({ nombre: 'ALIM BAL ROYAL GATO AD 7.5KG', nombre_publico: 'Royal Canin Gato Adulto 7,5 kg', marca: null })).toBe(
      'Royal Canin Gato Adulto 7,5 kg',
    )
  })

  it('si no, el interno; y la marca, si no la nombra ya', () => {
    expect(consultaDe({ nombre: 'PIPETA 10-20 KG', nombre_publico: null, marca: 'Holliday' })).toBe('Holliday PIPETA 10-20 KG')
    expect(consultaDe({ nombre: 'HOLLIDAY PIPETA', nombre_publico: '', marca: 'Holliday' })).toBe('HOLLIDAY PIPETA')
  })
})

describe('el fondo blanco', () => {
  // Una imagen de 20×20: fondo de un color y un cuadrado oscuro al medio.
  function lienzo(fondo: [number, number, number, number]): number[] {
    const datos: number[] = []
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const medio = x >= 5 && x < 15 && y >= 5 && y < 15
        datos.push(...(medio ? [40, 30, 20, 255] : fondo))
      }
    }
    return datos
  }

  it('un producto sobre blanco da todo el borde blanco', () => {
    expect(blancuraDelBorde(lienzo([255, 255, 255, 255]), 20, 20)).toBe(1)
    expect(blancuraDelBorde(lienzo([240, 242, 238, 255]), 20, 20)).toBe(1)
  })

  it('el transparente cuenta como blanco', () => {
    expect(blancuraDelBorde(lienzo([0, 0, 0, 0]), 20, 20)).toBe(1)
  })

  it('una foto en una góndola o con color de fondo, no', () => {
    expect(blancuraDelBorde(lienzo([120, 160, 200, 255]), 20, 20)).toBe(0)
  })

  const foto = (titulo: string, blancura: number): FotoEncontrada => ({
    url: `https://a.com/${titulo}.jpg`, miniatura: 'data:', ancho: 800, alto: 800, titulo, sitio: 'a.com', pagina: null, blancura,
  })

  it('primero las de fondo blanco, y en cada grupo el orden de Google; se muestran cuatro', () => {
    const r = lasQueSeMuestran([foto('a', 0.2), foto('b', 0.95), foto('c', 0.5), foto('d', 1), foto('e', 0.1), foto('f', 0.3)])
    expect(r.map((f) => f.titulo)).toEqual(['b', 'd', 'a', 'c'])
  })
})

describe('filtrar para trabajar por marca o por tipo', () => {
  const p = (codigo: string, nombre: string, nombre_publico: string | null = null): ProductoSinFoto => ({
    id: codigo, codigo, nombre, nombre_publico, marca: null, codigos_barra: [], vende_online: false,
  })
  const lista = [p('A1', 'ALIM BAL ROYAL GATO AD 7.5KG'), p('B2', 'PIPETA 10-20', 'Pipeta antipulgas'), p('C3', 'Collar nylon')]

  it('por el nombre, sin importar mayúsculas', () => {
    expect(filtrarPorNombre(lista, 'royal').map((x) => x.codigo)).toEqual(['A1'])
  })

  it('por el nombre público, sin importar acentos, y por el código', () => {
    expect(filtrarPorNombre(lista, 'antipulgás').map((x) => x.codigo)).toEqual(['B2'])
    expect(filtrarPorNombre(lista, 'c3').map((x) => x.codigo)).toEqual(['C3'])
  })

  it('vacío, todos', () => {
    expect(filtrarPorNombre(lista, '  ')).toHaveLength(3)
  })
})
