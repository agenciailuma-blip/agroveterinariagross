import { supabase } from '@/lib/supabase'
import { db } from '@/lib/local/db'
import { enEscritorio } from '@/lib/escritorio'

/*
  El diagnóstico de la terminal.

  Existe para una situación concreta: la instalación en las 4 PC de
  Gross, con alguien del otro lado del teléfono. Sin esto, la conversación
  es "probá… ¿y ahora?… ¿te dice algo?", y cada vuelta son dos minutos.

  Con esto es "abrí Configuración, apretá Copiar y pegámelo". Una
  pantalla que se lee en voz alta y se pega en un chat vale más que
  cualquier registro técnico que haya que ir a buscar.

  Por eso cada punto tiene TRES cosas y no dos: qué se miró, cómo salió,
  y —cuando salió mal— qué hacer. Un diagnóstico que dice "falla" sin
  decir qué hacer deja a la persona igual de trabada que antes.
*/

export type Estado = 'ok' | 'aviso' | 'falla'

export interface Punto {
  nombre: string
  estado: Estado
  detalle: string
  /** Qué hacer si no está bien. */
  queHacer?: string
}

export interface Diagnostico {
  momento: string
  version: string
  puntos: Punto[]
}

/** Espera acotada: una comprobación que se cuelga no diagnostica nada. */
async function conLimite<T>(promesa: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promesa,
    new Promise<null>((resolver) => setTimeout(() => resolver(null), ms)),
  ])
}

export async function correrDiagnostico(datos: {
  terminal: { nombre: string; tipo: string; prefijo: string | null; punto_venta_id: string | null } | null
  usuario: string | null
  sinSubir: number
  ultimaSync: Date | null
  /** La impresora elegida en esta terminal, con el nombre que le da Windows. */
  impresoraElegida: string | null
  /** Las que Windows informa en esta PC. Vacía desde el navegador. */
  impresorasInstaladas: string[]
  impresoraHost: string | null
  impresoraPuerto: number
}): Promise<Diagnostico> {
  const puntos: Punto[] = []

  // ── 1. Dónde está corriendo ──
  puntos.push({
    nombre: 'Programa instalado',
    estado: enEscritorio ? 'ok' : 'aviso',
    detalle: enEscritorio
      ? 'Sí, esto es el programa de escritorio.'
      : 'No: esto es el navegador. Anda igual, pero sin impresión directa a la del mostrador.',
    queHacer: enEscritorio
      ? undefined
      : 'Para el mostrador hay que usar el programa instalado, no la página web.',
  })

  // ── 2. Sesión ──
  puntos.push({
    nombre: 'Sesión iniciada',
    estado: datos.usuario ? 'ok' : 'falla',
    detalle: datos.usuario ? `Entró ${datos.usuario}.` : 'No hay nadie con la sesión abierta.',
    queHacer: datos.usuario ? undefined : 'Iniciar sesión con el correo y la contraseña de Gross.',
  })

  // ── 3. Internet y servidor ──
  // No alcanza con navigator.onLine: el sistema operativo puede creer
  // que hay ruta y que igual no se llegue a Supabase. Se pregunta algo
  // barato de verdad.
  const t0 = performance.now()
  // El constructor de Supabase no es una promesa hasta que se lo espera:
  // se lo envuelve para que Promise.race pueda competirle.
  const respuesta = await conLimite(
    (async () => supabase.from('configuracion').select('clave').limit(1))(),
    8000,
  )
  const ms = Math.round(performance.now() - t0)

  if (!navigator.onLine) {
    puntos.push({
      nombre: 'Conexión con el servidor',
      estado: 'aviso',
      detalle: 'La máquina se declara sin internet. El mostrador puede seguir cobrando igual.',
      queHacer: 'Revisar el wifi o el cable. Lo que se cobre ahora sube solo cuando vuelva.',
    })
  } else if (!respuesta) {
    puntos.push({
      nombre: 'Conexión con el servidor',
      estado: 'falla',
      detalle: 'Hay internet pero el servidor no contestó en 8 segundos.',
      queHacer: 'Suele ser el wifi del local. Probar abrir cualquier página en el navegador.',
    })
  } else if (respuesta.error) {
    puntos.push({
      nombre: 'Conexión con el servidor',
      estado: 'falla',
      detalle: `El servidor contestó con un error: ${respuesta.error.message}`,
      queHacer: 'Avisá a ILUMA con este texto.',
    })
  } else {
    puntos.push({
      nombre: 'Conexión con el servidor',
      estado: ms > 3000 ? 'aviso' : 'ok',
      detalle: `Contestó en ${ms} ms.`,
      queHacer: ms > 3000 ? 'Anda, pero lento. Si el mostrador se siente pesado, es esto.' : undefined,
    })
  }

  // ── 4. Terminal ──
  const t = datos.terminal
  if (!t) {
    puntos.push({
      nombre: 'Terminal asignada',
      estado: 'falla',
      detalle: 'Esta máquina todavía no sabe qué terminal es.',
      queHacer: 'Entrar a Ventas y elegirla. Es lo primero que hay que hacer en una PC nueva.',
    })
  } else {
    puntos.push({
      nombre: 'Terminal asignada',
      estado: 'ok',
      detalle: `${t.nombre} · ${t.tipo}${t.prefijo ? ` · numera ${t.prefijo}-000001` : ''}`,
    })

    if (t.tipo === 'caja') {
      puntos.push({
        nombre: 'Punto de venta de ARCA',
        estado: t.punto_venta_id ? 'ok' : 'falla',
        detalle: t.punto_venta_id
          ? 'La caja tiene punto de venta, así que puede facturar.'
          : 'Esta caja no tiene punto de venta asignado: no va a poder facturar.',
        queHacer: t.punto_venta_id ? undefined : 'Asignárselo en Configuración → Puntos de venta.',
      })
    }
  }

  // ── 5. Copia local ──
  const [productos, clientes, ventas] = await Promise.all([
    db.producto.count(),
    db.cliente.count(),
    db.venta.count(),
  ])

  puntos.push({
    nombre: 'Copia local para trabajar sin internet',
    estado: productos > 0 ? 'ok' : 'falla',
    detalle:
      productos > 0
        ? `${productos} productos, ${clientes} clientes y ${ventas} ventas bajadas a esta máquina.`
        : 'No bajó nada todavía. Sin esto, la terminal no funciona con internet cortado.',
    queHacer:
      productos > 0
        ? undefined
        : 'Dejar la máquina con internet unos minutos: baja sola. Si no, avisá a ILUMA.',
  })

  puntos.push({
    nombre: 'Operaciones esperando subir',
    estado: datos.sinSubir === 0 ? 'ok' : datos.sinSubir > 20 ? 'falla' : 'aviso',
    detalle:
      datos.sinSubir === 0
        ? 'Ninguna: todo lo que se hizo acá ya llegó al servidor.'
        : `${datos.sinSubir} esperando.`,
    queHacer:
      datos.sinSubir > 20
        ? 'Son muchas. Si hay internet y no bajan, avisá a ILUMA antes de cerrar la caja.'
        : undefined,
  })

  puntos.push({
    nombre: 'Última sincronización',
    estado: datos.ultimaSync ? 'ok' : 'aviso',
    detalle: datos.ultimaSync
      ? datos.ultimaSync.toLocaleString('es-AR')
      : 'Todavía no sincronizó en esta sesión.',
  })

  /*
    ── 6. Impresora del mostrador ──

    Lo que más importa acá no es que haya un nombre guardado, sino que ese
    nombre siga existiendo en ESTA PC. Es la falla que se va a ver en el
    local: la impresora la comparte la máquina de la caja, así que si esa
    está apagada, el nombre guardado en un mostrador deja de existir y el
    ticket no sale — sin que nada lo haya anunciado antes.
  */
  const elegida = datos.impresoraElegida?.trim()

  if (!enEscritorio) {
    puntos.push({
      nombre: 'Impresora del mostrador',
      estado: 'aviso',
      detalle: 'No se puede mirar desde el navegador.',
      queHacer: 'Abrir el programa instalado y repetir el diagnóstico.',
    })
  } else if (elegida) {
    const instalada = datos.impresorasInstaladas.includes(elegida)
    puntos.push({
      nombre: 'Impresora del mostrador',
      estado: instalada ? 'ok' : 'falla',
      detalle: instalada
        ? `«${elegida}», instalada en esta PC.`
        : `«${elegida}» está guardada, pero Windows no la tiene en esta PC. ` +
          (datos.impresorasInstaladas.length
            ? `Acá ve: ${datos.impresorasInstaladas.join(', ')}.`
            : 'Acá no ve ninguna impresora.'),
      queHacer: instalada
        ? 'Para saber si sale el papel de verdad, usá "Imprimir una prueba" en Configuración.'
        : 'Fijate que la impresora esté prendida y que esté encendida la PC que la comparte. Después volvé a elegirla en Configuración → Impresora del mostrador.',
    })
  } else if (datos.impresoraHost?.trim()) {
    puntos.push({
      nombre: 'Impresora del mostrador',
      estado: 'aviso',
      detalle: `Sin impresora de Windows elegida: va a intentar por red, a ${datos.impresoraHost}:${datos.impresoraPuerto}.`,
      queHacer:
        'Las impresoras de Gross están conectadas por USB, no por red. Elegí la de Windows en Configuración → Impresora del mostrador.',
    })
  } else {
    puntos.push({
      nombre: 'Impresora del mostrador',
      estado: 'falla',
      detalle: 'Esta máquina no tiene impresora de tickets elegida.',
      queHacer:
        'Configuración → Impresora del mostrador, y elegirla de la lista. En la caja es «POS80 Printer».',
    })
  }

  return {
    momento: new Date().toLocaleString('es-AR'),
    version: typeof __VERSION__ === 'string' ? __VERSION__ : '—',
    puntos,
  }
}

/*
  El diagnóstico como texto, para pegarlo en un chat.

  Es la razón de ser de esta pantalla. Alguien en el local aprieta
  "Copiar", lo pega en WhatsApp, y del otro lado se ve exactamente lo
  mismo que ve él — sin interpretaciones, sin "me parece que dice".
*/
export function comoTexto(d: Diagnostico): string {
  const icono: Record<Estado, string> = { ok: '[OK]', aviso: '[!]', falla: '[X]' }
  const lineas = [
    `Diagnóstico de la terminal · ${d.momento}`,
    `Versión ${d.version}`,
    '',
    ...d.puntos.flatMap((p) => [
      `${icono[p.estado]} ${p.nombre}: ${p.detalle}`,
      ...(p.estado !== 'ok' && p.queHacer ? [`     → ${p.queHacer}`] : []),
    ]),
  ]
  return lineas.join('\n')
}
