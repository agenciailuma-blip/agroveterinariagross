// ═══════════════════════════════════════════════════════════════
// Las reglas de las cuentas de acceso, sin red: se prueban desde la app
// (app/src/lib/api/usuarios.prueba.ts).
// ═══════════════════════════════════════════════════════════════

export const ACCIONES = ["dar_acceso", "cambiar_clave", "quitar_acceso", "eliminar", "sincronizar_correo"] as const;
export type Accion = (typeof ACCIONES)[number];

export const CLAVE_MINIMA = 8;

export function esAccion(a: unknown): a is Accion {
  return typeof a === "string" && (ACCIONES as readonly string[]).includes(a);
}

/** Lo que tiene de malo una contraseña, en palabras; null si sirve. */
export function problemaDeLaClave(clave: string): string | null {
  if (clave.length < CLAVE_MINIMA) return `La contraseña tiene que tener al menos ${CLAVE_MINIMA} caracteres.`;
  if (clave.length > 72) return "La contraseña es demasiado larga: hasta 72 caracteres.";
  if (/^\s|\s$/.test(clave)) return "La contraseña no puede empezar ni terminar con un espacio.";
  return null;
}

/** Una dirección de correo que vale la pena intentar: algo@algo.algo, sin espacios. */
export function correoValido(correo: string): boolean {
  const c = correo.trim();
  return c.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(c);
}

/** Lo que contestó Supabase al crear o cambiar una cuenta, en palabras. */
export function errorDeLaCuenta(mensaje: string): string {
  if (/already (been )?registered|already exists/i.test(mensaje)) return "Ya hay una cuenta con ese correo.";
  if (/password/i.test(mensaje) && /weak|short|characters/i.test(mensaje)) {
    return "Supabase no aceptó la contraseña: probá con una más larga, con letras y números.";
  }
  if (/email/i.test(mensaje) && /invalid/i.test(mensaje)) return "Esa dirección de correo no es válida.";
  return `No se pudo: ${mensaje}`;
}
