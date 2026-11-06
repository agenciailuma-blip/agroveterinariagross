import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { enlaceMapa, type ClienteMayorista } from '@/lib/api/mayorista'
import { moneda } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  El mapa de los clientes mayoristas

  Pedido de la fase 3 (5.1): Lucas quiere ver a todos los clientes en un
  mapa, con su pin. «Con el pin es lo mejor, no necesito tan avanzado
  ahora.»

  Las ubicaciones son las de la base —latitud y longitud, guardadas por
  el vendedor parado en el local del cliente—, no las del servicio de
  mapas: si mañana se cambia de mapa, no hay que volver a cargarlas. Por
  eso todo lo que sabe del mapa está en este archivo.

  Los planos son de OpenStreetMap: libres y sin costo por uso. Sin señal
  no se ven, pero los pines sí.

  Rojo, el que tiene algo vencido; verde, el resto.
  ─────────────────────────────────────────────────────────────
*/

const OBERA: L.LatLngTuple = [-27.4871, -55.1199]

/** Para escribir un texto del cliente adentro del cartelito sin que se interprete como HTML. */
function texto(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export default function MapaDeClientes({
  clientes,
  onElegir,
}: {
  /** Sólo los que tienen ubicación. */
  clientes: ClienteMayorista[]
  /** Tocar el nombre en el cartelito. */
  onElegir?: (c: ClienteMayorista) => void
}) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const capa = useRef<L.LayerGroup | null>(null)
  const elegir = useRef(onElegir)
  useEffect(() => {
    elegir.current = onElegir
  })

  useEffect(() => {
    if (!contenedor.current) return
    const m = L.map(contenedor.current, { center: OBERA, zoom: 10 })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(m)
    capa.current = L.layerGroup().addTo(m)
    mapa.current = m
    return () => {
      m.remove()
      mapa.current = null
      capa.current = null
    }
  }, [])

  useEffect(() => {
    const m = mapa.current
    const g = capa.current
    if (!m || !g) return
    g.clearLayers()

    const puntos: L.LatLngTuple[] = []
    for (const c of clientes) {
      if (c.latitud == null || c.longitud == null) continue
      const punto: L.LatLngTuple = [c.latitud, c.longitud]
      puntos.push(punto)
      const vencido = (c.vencido ?? 0) > 0
      const marca = L.circleMarker(punto, {
        radius: 8,
        weight: 2,
        color: '#ffffff',
        fillColor: vencido ? '#b91c1c' : '#15803d',
        fillOpacity: 0.95,
      })

      const lugar = [c.localidad, c.ruta].filter(Boolean).join(' · ')
      const llegar = enlaceMapa(c)
      const div = document.createElement('div')
      div.innerHTML = `
        <button type="button" data-elegir style="font-weight:600;text-align:left;text-decoration:underline">${texto(c.nombre)}</button>
        ${lugar ? `<div style="color:#57534e">${texto(lugar)}</div>` : ''}
        ${vencido ? `<div style="color:#b91c1c">Vencido ${texto(moneda.format(c.vencido!))}</div>` : ''}
        ${llegar ? `<a href="${texto(llegar)}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}
      `
      div.querySelector('[data-elegir]')?.addEventListener('click', () => elegir.current?.(c))
      marca.bindPopup(div)
      marca.bindTooltip(c.nombre_fantasia || c.nombre)
      marca.addTo(g)
    }

    // Que entren todos; con uno solo, cerca pero no encima.
    if (puntos.length === 1) m.setView(puntos[0], 14)
    else if (puntos.length > 1) m.fitBounds(L.latLngBounds(puntos), { padding: [30, 30], maxZoom: 14 })
  }, [clientes])

  return <div ref={contenedor} className="relative z-0 h-[60vh] min-h-80 w-full overflow-hidden rounded-xl ring-1 ring-borde" />
}
