/*
  ─────────────────────────────────────────────────────────────
  El menú: secciones, y las pantallas de cada una como pestañas

  Hasta el 30/09 el menú tenía dieciocho entradas, una por pantalla.
  Francisco lo marcó: demasiadas. La referencia fue OBTech —pocas
  secciones arriba y, adentro, varias opciones—, como ejemplo de orden y
  no para copiarlo.

  Ahora son diez secciones —la décima, Tesorería, llegó el 30/09 con los
  cheques—. Las pantallas que se usan juntas quedan en
  la misma, como pestañas: se mira el stock y se cuenta; se carga la
  factura del proveedor y se le paga. Las direcciones de cada pantalla no
  cambiaron, así que todo lo que ya enlazaba a una sigue andando.

  Vive acá, y no adentro del Layout, para poder probar sin pantalla qué
  sección corresponde a cada dirección y adónde lleva cada sección.
  ─────────────────────────────────────────────────────────────
*/

export interface Pestana {
  a: string
  etiqueta: string
  permiso?: string
  /* Un número al lado: cuánto espera que alguien haga algo. */
  contador?: 'pedidos'
  /* Sólo tiene sentido con más de un depósito activo. */
  conVariosDepositos?: boolean
}

export interface Seccion {
  id: string
  etiqueta: string
  icono: string
  pestanas: Pestana[]
}

/* Trazos de íconos, en línea para no sumar una dependencia por diez dibujos. */
export const SECCIONES: Seccion[] = [
  {
    id: 'inicio',
    etiqueta: 'Inicio',
    icono: 'M3 12l9-9 9 9M5 10v10h14V10',
    pestanas: [{ a: '/', etiqueta: 'Inicio' }],
  },
  {
    /*
      Mostrador, caja y pedidos web son la misma cosa desde tres lugares:
      ventas que hay que cerrar. Cada PC usa casi siempre una sola, y la
      sección vuelve a la última que se usó en esa máquina.
    */
    id: 'ventas',
    etiqueta: 'Ventas',
    icono: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3M17 17a2 2 0 100 4 2 2 0 000-4zM9 19a2 2 0 11-4 0 2 2 0 014 0z',
    pestanas: [
      { a: '/ventas', etiqueta: 'Mostrador', permiso: 'ventas.crear' },
      { a: '/caja', etiqueta: 'Caja', permiso: 'ventas.cobrar' },
      /*
        Lleva un número porque los pedidos entran solos, sin que nadie en
        el local haga nada: si no se ve desde cualquier pantalla, un pedido
        pagado puede pasar el día sin factura. El número también se ve en
        la sección, así no hace falta estar en Ventas para enterarse.
      */
      { a: '/pedidos', etiqueta: 'Pedidos web', permiso: 'tienda.pedidos', contador: 'pedidos' },
    ],
  },
  {
    id: 'clientes',
    etiqueta: 'Clientes',
    icono:
      'M17 20h5v-2a3 3 0 00-5.4-1.8M17 20H7m10 0v-2c0-.7-.1-1.3-.4-1.8M7 20H2v-2a3 3 0 015.4-1.8M7 20v-2c0-.7.1-1.3.4-1.8m0 0a5 5 0 019.2 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    pestanas: [{ a: '/clientes', etiqueta: 'Clientes', permiso: 'clientes.ver' }],
  },
  {
    id: 'productos',
    etiqueta: 'Productos',
    icono: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    pestanas: [
      { a: '/productos', etiqueta: 'Productos', permiso: 'productos.ver' },
      { a: '/precios', etiqueta: 'Precios', permiso: 'productos.ver' },
    ],
  },
  {
    /*
      Se mira qué falta, y si el número no cierra se cuenta; si sobra en
      un local y falta en el otro, se transfiere. Transferencias aparece
      recién con dos depósitos: con uno solo no hay adónde mover nada.
    */
    id: 'stock',
    etiqueta: 'Stock',
    icono: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-4l-1.5 3h-5L8 13H4',
    pestanas: [
      { a: '/stock', etiqueta: 'Stock', permiso: 'stock.ver' },
      { a: '/inventario', etiqueta: 'Inventario', permiso: 'stock.inventariar' },
      { a: '/transferencias', etiqueta: 'Transferencias', permiso: 'stock.ver', conVariosDepositos: true },
    ],
  },
  {
    /*
      Llega la factura del proveedor, se carga y se recibe la mercadería;
      después se le paga. Compras va primero porque es lo de todos los
      días; la ficha del proveedor se toca poco.
    */
    id: 'compras',
    etiqueta: 'Compras',
    icono: 'M9 12h6m-6 4h6M9 8h6M5 21h14a1 1 0 001-1V6.4L16.6 3H6a1 1 0 00-1 1v16a1 1 0 001 1z',
    pestanas: [
      { a: '/compras', etiqueta: 'Compras', permiso: 'compras.ver' },
      { a: '/proveedores/cuentas', etiqueta: 'Cuentas proveedores', permiso: 'compras.ver' },
      { a: '/proveedores', etiqueta: 'Proveedores', permiso: 'proveedores.ver' },
      // Cuánto costó cada cosa a cada proveedor, y si otro la tiene a menos.
      { a: '/compras/costos', etiqueta: 'Costos', permiso: 'compras.ver' },
    ],
  },
  {
    /*
      La plata que todavía no es plata: los cheques que se recibieron y
      los que se libraron, y el calendario de lo que se cobra y se paga.
      No es Compras ni Clientes: junta los dos lados del mostrador.
    */
    id: 'tesoreria',
    etiqueta: 'Tesorería',
    icono: 'M3 7h18v10H3zM7 12h.01M17 12h.01M12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
    pestanas: [
      { a: '/cheques', etiqueta: 'Cheques', permiso: 'cheques.ver' },
      { a: '/calendario', etiqueta: 'Calendario', permiso: 'cheques.ver' },
    ],
  },
  {
    id: 'comprobantes',
    etiqueta: 'Comprobantes',
    icono: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.6L19 9.4V19a2 2 0 01-2 2z',
    pestanas: [
      { a: '/facturacion', etiqueta: 'Facturación', permiso: 'facturacion.ver' },
      { a: '/remitos', etiqueta: 'Remitos', permiso: 'facturacion.no_fiscal_ver' },
      { a: '/no-fiscales', etiqueta: 'Presupuestos', permiso: 'facturacion.no_fiscal_ver' },
    ],
  },
  {
    id: 'reportes',
    etiqueta: 'Reportes',
    icono: 'M3 3v18h18M7 17v-5m5 5V8m5 9v-3',
    pestanas: [{ a: '/reportes', etiqueta: 'Reportes', permiso: 'reportes.ver' }],
  },
  {
    id: 'administracion',
    etiqueta: 'Administración',
    icono:
      'M10.3 4.3a2 2 0 013.4 0l.4.7a2 2 0 002 1l.8-.1a2 2 0 011.7 3l-.4.7a2 2 0 000 2.2l.4.7a2 2 0 01-1.7 3l-.8-.1a2 2 0 00-2 1l-.4.7a2 2 0 01-3.4 0l-.4-.7a2 2 0 00-2-1l-.8.1a2 2 0 01-1.7-3l.4-.7a2 2 0 000-2.2l-.4-.7a2 2 0 011.7-3l.8.1a2 2 0 002-1l.4-.7zM14 12a2 2 0 11-4 0 2 2 0 014 0z',
    pestanas: [
      { a: '/usuarios', etiqueta: 'Usuarios', permiso: 'usuarios.gestionar' },
      { a: '/configuracion', etiqueta: 'Configuración', permiso: 'configuracion.gestionar' },
    ],
  },
]

export interface Contexto {
  tienePermiso: (permiso: string) => boolean
  variosDepositos: boolean
}

/** Las pestañas de una sección que esta persona puede ver, hoy. */
export function pestanasVisibles(s: Seccion, c: Contexto): Pestana[] {
  return s.pestanas.filter(
    (p) => (!p.permiso || c.tienePermiso(p.permiso)) && (!p.conVariosDepositos || c.variosDepositos),
  )
}

/*
  A qué sección pertenece una dirección.

  Gana la pestaña de dirección más larga que la contiene: /proveedores/cuentas
  es Cuentas proveedores y no Proveedores, y /productos/importar sigue
  siendo Productos. El Inicio sólo con la dirección exacta: si no, todas
  las direcciones empezarían con él.
*/
export function seccionDe(pathname: string): { seccion: Seccion; pestana: Pestana } | null {
  let mejor: { seccion: Seccion; pestana: Pestana } | null = null
  for (const seccion of SECCIONES) {
    for (const pestana of seccion.pestanas) {
      const coincide =
        pestana.a === '/'
          ? pathname === '/'
          : pathname === pestana.a || pathname.startsWith(`${pestana.a}/`)
      if (coincide && (!mejor || pestana.a.length > mejor.pestana.a.length)) mejor = { seccion, pestana }
    }
  }
  return mejor
}

/*
  Adónde lleva tocar una sección: a la última pestaña que se usó en esta
  computadora, si todavía se puede ver; si no, a la primera. En la PC de
  la caja, «Ventas» abre la Caja; en la del mostrador, el Mostrador.
*/
export function destinoDe(s: Seccion, c: Contexto, ultima: string | null): string | null {
  const visibles = pestanasVisibles(s, c)
  return (visibles.find((p) => p.a === ultima) ?? visibles[0])?.a ?? null
}

// ───────────────────────────────────────────────────────────────
// La última pestaña de cada sección, en esta computadora
// ───────────────────────────────────────────────────────────────

const CLAVE_ULTIMA = 'gross.ultima_pestana'

function leerUltimas(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_ULTIMA) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function ultimaPestana(seccionId: string): string | null {
  return leerUltimas()[seccionId] ?? null
}

/*
  Se recuerda sólo la dirección exacta de una pestaña: /productos/importar
  no es una pestaña, y volver ahí al tocar Productos sería raro. Si el
  almacenamiento está bloqueado, no se recuerda y la sección abre la
  primera: no es un error que valga un aviso.
*/
export function recordarPestana(pathname: string): void {
  const donde = seccionDe(pathname)
  if (!donde || donde.pestana.a !== pathname) return
  try {
    localStorage.setItem(CLAVE_ULTIMA, JSON.stringify({ ...leerUltimas(), [donde.seccion.id]: pathname }))
  } catch {
    // Sin almacenamiento, la sección abre su primera pestaña.
  }
}
