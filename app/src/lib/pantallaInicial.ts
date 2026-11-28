import type { Terminal } from '@/lib/terminal'

/*
  Con qué pantalla se abre el sistema.

  A quien vende y a quien cobra les molestaba arrancar en el Inicio
  (pedido del 28/11): van derecho al Mostrador o a la Caja. En el local
  la PC de la caja entra con un usuario Vendedor, así que para ese rol
  manda el puesto de la computadora. Los demás siguen en el Inicio.

  El permiso se mira igual: los roles se pueden editar desde Usuarios.
  null es «quedarse en el Inicio».
*/
export function pantallaInicial(
  rol: string,
  puesto: Terminal['tipo'] | undefined,
  tienePermiso: (clave: string) => boolean,
): '/ventas' | '/caja' | null {
  if (rol !== 'Vendedor' && rol !== 'Cajero') return null
  const enLaCaja = rol === 'Cajero' || puesto === 'caja'
  if (enLaCaja && tienePermiso('ventas.cobrar')) return '/caja'
  return tienePermiso('ventas.crear') ? '/ventas' : null
}
