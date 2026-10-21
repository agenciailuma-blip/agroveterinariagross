import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { type ImagenDeSerper, direccionPermitida, elegirCandidatas, tipoDeFotoAceptado } from "./reglas.ts";

// ═══════════════════════════════════════════════════════════════
// Buscar fotos de los productos en internet
//
// Pedido de Lucas del 20/10: que el sistema busque las fotos, y él
// acepte o descarte cada una. Dos pedidos:
//
//   · «buscar»: le pregunta a Google Imágenes (por Serper) y devuelve
//     hasta diez candidatas, con la vista previa ya bajada, y la
//     pantalla le muestra a Lucas las cuatro de fondo más blanco. La vista
//     previa viaja adentro de la respuesta porque el programa instalado
//     sólo deja mostrar imágenes del servidor de Gross.
//   · «traer»: baja la foto que Lucas eligió y se la pasa a la app, que
//     la achica, la convierte a WebP y la sube como cualquier otra. El
//     navegador no puede bajarla directo: los otros sitios no lo dejan.
//
// No guarda nada. La clave de Serper está en los secretos del proyecto
// (SERPER_API_KEY) y nunca sale de acá.
//
// Contesta siempre antes de los doce segundos que la app le espera al
// servidor: Serper tiene seis, cada vista previa cuatro (todas a la
// vez) y bajar una foto, ocho.
// ═══════════════════════════════════════════════════════════════

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const SERPER = "https://google.serper.dev/images";
const ESPERA_SERPER_MS = 6000;
const ESPERA_MINIATURA_MS = 4000;
const ESPERA_FOTO_MS = 8000;
const FOTO_MAXIMA = 10 * 1024 * 1024;
const MINIATURA_MAXIMA = 300 * 1024;
const SALTOS = 3;

/*
  Baja una dirección siguiendo a mano las redirecciones, para controlar
  cada salto: una dirección permitida podría mandar a una interna.
*/
async function bajar(url: string, espera: number, maximo: number): Promise<{ bytes: Uint8Array; tipo: string }> {
  const limite = AbortSignal.timeout(espera);
  let actual = url;
  for (let salto = 0; salto <= SALTOS; salto++) {
    if (!direccionPermitida(actual)) throw new Error("Esa dirección no se puede usar.");
    const r = await fetch(actual, {
      redirect: "manual",
      signal: limite,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Gross/1.0)", Accept: "image/*" },
    });
    if (r.status >= 300 && r.status < 400) {
      const destino = r.headers.get("location");
      await r.body?.cancel();
      if (!destino) throw new Error("El sitio de la foto redirige a ningún lado.");
      actual = new URL(destino, actual).href;
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error(`El sitio de la foto contestó ${r.status}.`);
    }
    const tipo = r.headers.get("content-type");
    if (!tipoDeFotoAceptado(tipo)) {
      await r.body?.cancel();
      throw new Error("Lo que hay en esa dirección no es una foto que se pueda usar.");
    }
    const largo = Number(r.headers.get("content-length") ?? 0);
    if (largo > maximo) {
      await r.body?.cancel();
      throw new Error("La foto es demasiado grande.");
    }
    // Se lee de a partes, con tope: el largo anunciado puede mentir.
    const partes: Uint8Array[] = [];
    let total = 0;
    const lector = r.body!.getReader();
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.length;
      if (total > maximo) {
        await lector.cancel();
        throw new Error("La foto es demasiado grande.");
      }
      partes.push(value);
    }
    const bytes = new Uint8Array(total);
    let i = 0;
    for (const p of partes) {
      bytes.set(p, i);
      i += p.length;
    }
    return { bytes, tipo: (tipo ?? "image/jpeg").split(";")[0].trim() };
  }
  throw new Error("El sitio de la foto redirige demasiadas veces.");
}

function esEspera(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ ok: false, error: "Sólo POST." }, 405);

  try {
    // Busca y elige quien puede editar productos: es quien carga las fotos.
    const comoUsuario = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const permiso = await comoUsuario.rpc("tiene_permiso", { p_clave: "productos.editar" });
    if (!permiso.data) {
      return responder({ ok: false, motivo: "sin_permiso", error: "No tenés permiso para cargar fotos." }, 403);
    }

    const body = await req.json().catch(() => ({}));

    if (body.accion === "buscar") {
      const consulta = String(body.consulta ?? "").trim().slice(0, 200);
      if (consulta.length < 2) {
        return responder({ ok: false, motivo: "consulta_vacia", error: "Escribí qué buscar." }, 400);
      }
      const clave = Deno.env.get("SERPER_API_KEY");
      if (!clave) {
        return responder({ ok: false, motivo: "sin_clave", error: "Falta la clave de Serper en el servidor." }, 503);
      }

      const r = await fetch(SERPER, {
        method: "POST",
        headers: { "X-API-KEY": clave, "Content-Type": "application/json" },
        // Con «blanco», el filtro de color de Google Imágenes: pide las que
        // son mayormente blancas, que en fotos de producto es el fondo.
        body: JSON.stringify({
          q: consulta, gl: "ar", hl: "es-419", num: 30,
          ...(body.blanco ? { tbs: "ic:specific,isc:white" } : {}),
        }),
        signal: AbortSignal.timeout(ESPERA_SERPER_MS),
      });
      if (r.status === 401 || r.status === 403) {
        return responder({ ok: false, motivo: "clave_rechazada", error: "Serper no aceptó la clave: revisá la que está cargada." }, 503);
      }
      if (r.status === 429 || r.status === 402) {
        return responder({ ok: false, motivo: "sin_creditos", error: "Se terminaron las búsquedas de Serper: hay que cargar más." }, 503);
      }
      if (!r.ok) {
        return responder({ ok: false, motivo: "serper_fallo", error: `El buscador contestó ${r.status}. Probá de nuevo.` }, 502);
      }
      const datos = await r.json();
      const candidatas = elegirCandidatas((datos.images ?? []) as ImagenDeSerper[]);

      // Las vistas previas, todas a la vez. La que no baja, no se muestra.
      const conMiniatura = await Promise.all(
        candidatas.map(async (c) => {
          try {
            const { bytes, tipo } = await bajar(c.miniatura_url, ESPERA_MINIATURA_MS, MINIATURA_MAXIMA);
            return { ...c, miniatura: `data:${tipo};base64,${encodeBase64(bytes)}` };
          } catch {
            return null;
          }
        }),
      );
      const resultados = conMiniatura
        .filter((c) => c !== null)
        .map(({ miniatura_url: _, ...c }) => c);
      return responder({ ok: true, resultados });
    }

    if (body.accion === "traer") {
      const url = String(body.url ?? "");
      if (!direccionPermitida(url)) {
        return responder({ ok: false, motivo: "direccion", error: "Esa dirección no se puede usar." }, 400);
      }
      try {
        const { bytes, tipo } = await bajar(url, ESPERA_FOTO_MS, FOTO_MAXIMA);
        return new Response(bytes, {
          headers: { ...CORS, "Content-Type": "application/octet-stream", "X-Tipo": tipo },
        });
      } catch (err) {
        const error = esEspera(err)
          ? "El sitio de la foto no contesta. Elegí otra."
          : `${err instanceof Error ? err.message : String(err)} Elegí otra.`;
        return responder({ ok: false, motivo: "no_se_pudo_bajar", error }, 502);
      }
    }

    return responder({ ok: false, motivo: "accion", error: "Acción desconocida." }, 400);
  } catch (err) {
    if (esEspera(err)) {
      return responder({ ok: false, motivo: "serper_no_responde", error: "El buscador no contesta. Probá en un rato." }, 503);
    }
    console.error("buscar-fotos:", err);
    return responder({ ok: false, motivo: "error", error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
