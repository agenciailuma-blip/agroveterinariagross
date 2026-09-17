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
  pasa a la copia local sin esperar. Cada tanto deja pasar una sola para
  ver si volvió; si vuelve, se cierra y todo sigue como antes.

  Lo que NO hace es decidir qué se muestra: eso ya está resuelto en cada
  consulta, que ante un fallo de red lee lo local. Acá sólo se decide
  cuánto se espera antes de dar por perdida la conexión.
  ─────────────────────────────────────────────────────────────
*/

export class Cortacircuito {
  private caidoDesde: number | null = null
  private readonly ventanaMs: number
  private readonly ahora: () => number

  /**
   * @param ventanaMs cuánto se da por caído el servidor antes de volver a probar
   * @param ahora     el reloj, para poder probarlo sin esperar de verdad
   */
  constructor(ventanaMs = 15_000, ahora: () => number = () => Date.now()) {
    this.ventanaMs = ventanaMs
    this.ahora = ahora
  }

  /** Si el servidor está dado por caído en este momento. */
  get abierto(): boolean {
    return this.caidoDesde !== null
  }

  /*
    Si esta consulta sale a la red o se descarta en el acto.

    Cuando se cumple la ventana deja pasar UNA —la de prueba— y vuelve a
    arrancar el reloj. Si no, al volver la conexión saldrían todas las
    consultas juntas a esperar doce segundos cada una, que es
    exactamente lo que se quiere evitar.
  */
  dejarPasar(): boolean {
    if (this.caidoDesde === null) return true
    if (this.ahora() - this.caidoDesde >= this.ventanaMs) {
      this.caidoDesde = this.ahora()
      return true
    }
    return false
  }

  anotarFalla(): void {
    if (this.caidoDesde === null) this.caidoDesde = this.ahora()
  }

  anotarExito(): void {
    this.caidoDesde = null
  }
}
