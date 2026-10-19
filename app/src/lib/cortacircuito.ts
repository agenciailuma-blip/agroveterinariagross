/*
  ─────────────────────────────────────────────────────────────
  El cortacircuito del servidor

  Cuando no hay internet, cada consulta al servidor espera doce segundos
  antes de darse por vencida. Una pantalla que hace cinco consultas
  tarda un minuto en abrir, en blanco, sin decir nada — y todo para
  terminar leyendo la copia local, que estaba disponible desde el
  principio. Pasó en el local el 17/09 con la pantalla de Caja.

  La idea es la de un cortacircuito de verdad: cuando una consulta falla
  por red, se abre y las siguientes fallan EN EL ACTO, así el sistema
  pasa a la copia local sin esperar.

  Para saber si volvió, cada tanto se prueba —pero con una consulta
  propia, de fondo, y nunca con la de alguien—. Hasta el 16/10 la prueba
  era la primera consulta que llegaba cumplida la ventana, y esa podía
  ser la de abrir la Caja, cobrar o mandar una venta: cada quince
  segundos alguien esperaba doce, y la venta llegaba a la caja a los
  catorce. Visto en el local el 16/10.

  Lo que NO hace es decidir qué se muestra: eso ya está resuelto en cada
  consulta, que ante un fallo de red lee lo local. Acá sólo se decide
  cuánto se espera antes de dar por perdida la conexión.
  ─────────────────────────────────────────────────────────────
*/

export class Cortacircuito {
  private caidoDesde: number | null = null
  private ultimaPrueba: number | null = null
  private readonly ventanaMs: number
  private readonly ahora: () => number
  private readonly oyentes = new Set<(abierto: boolean) => void>()

  /**
   * @param ventanaMs cada cuánto se prueba si el servidor volvió
   * @param ahora     el reloj, para poder probarlo sin esperar de verdad
   */
  constructor(ventanaMs = 10_000, ahora: () => number = () => Date.now()) {
    this.ventanaMs = ventanaMs
    this.ahora = ahora
  }

  /** Si el servidor está dado por caído en este momento. */
  get abierto(): boolean {
    return this.caidoDesde !== null
  }

  /** Si esta consulta sale a la red o se descarta en el acto. */
  dejarPasar(): boolean {
    return this.caidoDesde === null
  }

  /*
    Si toca probar si el servidor volvió.

    Lo pregunta la prueba de fondo, no las consultas de la gente. Contesta
    que sí una vez por ventana: así, aunque se pregunte seguido, no salen
    varias pruebas juntas.
  */
  tocaProbar(): boolean {
    if (this.caidoDesde === null) return false
    const desde = this.ultimaPrueba ?? this.caidoDesde
    if (this.ahora() - desde < this.ventanaMs) return false
    this.ultimaPrueba = this.ahora()
    return true
  }

  anotarFalla(): void {
    if (this.caidoDesde !== null) return
    this.caidoDesde = this.ahora()
    this.ultimaPrueba = null
    this.avisar(true)
  }

  anotarExito(): void {
    if (this.caidoDesde === null) return
    this.caidoDesde = null
    this.ultimaPrueba = null
    this.avisar(false)
  }

  /** Avisa cada vez que se abre o se cierra. Devuelve cómo dejar de escuchar. */
  alCambiar(oyente: (abierto: boolean) => void): () => void {
    this.oyentes.add(oyente)
    return () => this.oyentes.delete(oyente)
  }

  private avisar(abierto: boolean) {
    for (const oyente of this.oyentes) oyente(abierto)
  }
}
