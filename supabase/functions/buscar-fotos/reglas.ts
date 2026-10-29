// ═══════════════════════════════════════════════════════════════
// Las reglas de la búsqueda de fotos, sin red: se prueban desde la app
// (app/src/lib/api/buscarFotos.prueba.ts).
// ═══════════════════════════════════════════════════════════════

/** Lo que devuelve Serper por cada imagen (sólo lo que se usa). */
export interface ImagenDeSerper {
  title?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  thumbnailUrl?: string;
  source?: string;
  domain?: string;
  link?: string;
}

export interface Candidata {
  url: string;
  miniatura_url: string;
  ancho: number | null;
  alto: number | null;
  titulo: string;
  sitio: string;
  pagina: string | null;
}

/*
  Cuántas manda el servidor por producto. La pantalla mide el fondo de
  cada una y le muestra a Lucas las cuatro mejores: con más para elegir,
  es más fácil que haya alguna con fondo blanco.
*/
export const CANDIDATAS = 10;

/*
  Sitios que no sirven, por pedido de Lucas del 21/10 —que no vengan con
  marca de agua ni publicidad de otro comercio—: los bancos de imágenes
  ponen marca de agua a todo lo que muestran, y en las redes la foto
  suele ser un posteo con texto encima.
*/
export const SITIOS_DESCARTADOS = [
  "shutterstock.com", "istockphoto.com", "gettyimages.com", "gettyimages.com.ar", "dreamstime.com",
  "alamy.com", "depositphotos.com", "123rf.com", "freepik.com", "stock.adobe.com", "canstockphoto.com",
  "pinterest.com", "pinterest.com.ar", "pinimg.com", "facebook.com", "fbsbx.com", "instagram.com",
  "cdninstagram.com", "tiktok.com", "youtube.com", "ytimg.com", "x.com", "twitter.com", "twimg.com",
];

export function sitioDescartado(url: string | undefined): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return SITIOS_DESCARTADOS.some((s) => host === s || host.endsWith(`.${s}`));
}

/** Una foto más chica que esto no sirve para la tienda. */
export const LADO_MINIMO = 300;

/*
  Las que valen la pena mostrar: con dirección https, con vista previa,
  de un sitio que sirve, no demasiado chicas y no repetidas. El orden es el de Google, que ya
  pone primero lo que más se parece.
*/
export function elegirCandidatas(imagenes: ImagenDeSerper[], cuantas = CANDIDATAS): Candidata[] {
  const vistas = new Set<string>();
  const elegidas: Candidata[] = [];
  for (const i of imagenes) {
    if (elegidas.length >= cuantas) break;
    if (!i.imageUrl || !i.thumbnailUrl) continue;
    if (!direccionPermitida(i.imageUrl)) continue;
    if (/\.svg(\?|$)/i.test(i.imageUrl)) continue;
    if (sitioDescartado(i.imageUrl) || sitioDescartado(i.link)) continue;
    const ancho = i.imageWidth ?? null;
    const alto = i.imageHeight ?? null;
    if (ancho !== null && alto !== null && Math.max(ancho, alto) < LADO_MINIMO) continue;
    if (vistas.has(i.imageUrl)) continue;
    vistas.add(i.imageUrl);
    elegidas.push({
      url: i.imageUrl,
      miniatura_url: i.thumbnailUrl,
      ancho,
      alto,
      titulo: (i.title ?? "").slice(0, 200),
      sitio: i.domain ?? i.source ?? sitioDe(i.imageUrl),
      pagina: i.link ?? null,
    });
  }
  return elegidas;
}

function sitioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/*
  Adónde puede ir a buscar una foto el servidor.

  La función baja la foto que Lucas eligió, y la dirección viene de
  afuera: sin este control, alguien con sesión podría hacerle pedir al
  servidor una dirección interna. Sólo http o https, con un nombre de
  dominio —nada de números de IP, localhost ni nombres internos— y sin
  usuario ni contraseña en la dirección.
*/
export function direccionPermitida(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".")) return false;
  if (host.startsWith("[") || /^[\d.]+$/.test(host)) return false;
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) return false;
  if (host.endsWith(".supabase.co") || host.endsWith(".supabase.com")) return false;
  return true;
}

/** Los tipos de foto que el sistema sabe convertir a WebP. */
export function tipoDeFotoAceptado(tipo: string | null): boolean {
  const t = (tipo ?? "").split(";")[0].trim().toLowerCase();
  return ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/avif", "image/bmp"].includes(t);
}

/*
  Si Serper se quedó sin búsquedas. Avisa con 402 o 429, pero cuando el
  saldo llega a cero contesta 400 con «Not enough credits» (27/10).
*/
export function sinCreditos(status: number, texto: string): boolean {
  if (status === 402 || status === 429) return true;
  return status === 400 && /credit/i.test(texto);
}
