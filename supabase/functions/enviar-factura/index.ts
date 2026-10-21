import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { armarMail, correoValido, errorDelCorreo, nombreDelPdf, pdfValido } from "./reglas.ts";

// ═══════════════════════════════════════════════════════════════
// Mandar la factura por mail
//
// Pedido 17 de Lucas, decidido el 21/10: el botón «Mandar por mail» de
// la factura, y el envío solo al facturar un pedido de la tienda.
//
// La app arma el PDF —el mismo que la hoja A4 que se imprime, con los
// mismos datos— y esta función lo manda por Resend y anota el envío en
// comprobante_envio. Lo que se manda lo decide el servidor, no la app:
// la factura tiene que existir y estar autorizada, el asunto y el nombre
// del archivo salen de ella, y el remitente, de la configuración.
//
// La clave de Resend está en los secretos del proyecto (RESEND_API_KEY)
// y nunca sale de acá. Contesta antes de los 35 segundos que la app le
// espera: Resend tiene veinte.
// ═══════════════════════════════════════════════════════════════

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const RESEND = "https://api.resend.com/emails";
const ESPERA_MS = 20000;

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ ok: false, error: "Sólo POST." }, 405);

  const servidor = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Manda quien puede ver la facturación: el que tiene la factura abierta.
    const comoUsuario = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const permiso = await comoUsuario.rpc("tiene_permiso", { p_clave: "facturacion.ver" });
    if (!permiso.data) {
      return responder({ ok: false, motivo: "sin_permiso", error: "No tenés permiso para mandar facturas." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const comprobanteId = String(body.comprobante_id ?? "");
    const destinatario = String(body.destinatario ?? "").trim();
    const automatico = body.automatico === true;

    if (!correoValido(destinatario)) {
      return responder({ ok: false, motivo: "correo", error: "Esa dirección de correo no es válida." }, 400);
    }
    let pdf: Uint8Array;
    try {
      pdf = decodeBase64(String(body.pdf ?? ""));
    } catch {
      pdf = new Uint8Array();
    }
    if (!pdfValido(pdf)) {
      return responder({ ok: false, motivo: "pdf", error: "No llegó bien el PDF de la factura. Probá de nuevo." }, 400);
    }

    const { data: c } = await servidor
      .from("comprobante")
      .select(`id, numero, total, cae, receptor_nombre,
               tipo:tipo_comprobante_id(descripcion), pv:punto_venta_id(numero)`)
      .eq("id", comprobanteId)
      .maybeSingle();
    if (!c) return responder({ ok: false, motivo: "comprobante", error: "No se encontró la factura." }, 404);
    if (!c.cae) {
      return responder({ ok: false, motivo: "sin_cae", error: "La factura todavía no tiene CAE: sin autorización de ARCA no se manda." }, 409);
    }

    const clave = Deno.env.get("RESEND_API_KEY");
    if (!clave) return responder({ ok: false, motivo: "sin_clave", error: "Falta la clave de Resend en el servidor." }, 503);

    const { data: config } = await servidor
      .from("configuracion")
      .select("clave, valor")
      .in("clave", ["correo.remitente", "correo.responder_a", "comercio.nombre_fantasia", "comercio.razon_social",
        "comercio.domicilio", "comercio.localidad", "comercio.telefono"]);
    const valor = (k: string) => String(config?.find((x) => x.clave === k)?.valor ?? "").trim();

    const tipo = (uno(c.tipo as never) as { descripcion: string } | null)?.descripcion ?? "Factura";
    const numero = `${String((uno(c.pv as never) as { numero: number } | null)?.numero ?? 0).padStart(4, "0")}-${String(c.numero).padStart(8, "0")}`;
    const mail = armarMail({
      tipo,
      numero,
      total: Number(c.total),
      receptor: String(c.receptor_nombre ?? ""),
      comercio: valor("comercio.nombre_fantasia") || valor("comercio.razon_social") || "Agroveterinaria Gross",
      domicilio: [valor("comercio.domicilio"), valor("comercio.localidad")].filter(Boolean).join(", "),
      telefono: valor("comercio.telefono"),
    });
    const responderA = valor("correo.responder_a");

    const r = await fetch(RESEND, {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: valor("correo.remitente") || "Agroveterinaria Gross <onboarding@resend.dev>",
        to: [destinatario],
        ...(responderA ? { reply_to: responderA } : {}),
        subject: mail.asunto,
        html: mail.html,
        text: mail.texto,
        attachments: [{ filename: nombreDelPdf({ tipo, numero }), content: String(body.pdf) }],
      }),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    const respuesta = await r.json().catch(() => ({}));

    const { data: auth } = await comoUsuario.auth.getUser();
    const usuario = auth?.user
      ? (await servidor.from("usuario").select("id").eq("auth_user_id", auth.user.id).maybeSingle()).data?.id ?? null
      : null;

    const error = r.ok ? null : errorDelCorreo(r.status, String(respuesta?.message ?? respuesta?.error ?? ""));
    await servidor.from("comprobante_envio").insert({
      comprobante_id: comprobanteId,
      destinatario,
      estado: r.ok ? "enviado" : "error",
      referencia: r.ok ? String(respuesta?.id ?? "") : null,
      error,
      automatico,
      enviado_por: usuario,
    });

    if (!r.ok) return responder({ ok: false, motivo: "correo_rechazo", error }, 502);
    return responder({ ok: true, referencia: respuesta?.id ?? null });
  } catch (err) {
    if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return responder({ ok: false, motivo: "correo_no_responde", error: "El servicio de correo no contesta. Probá en un rato." }, 503);
    }
    console.error("enviar-factura:", err);
    return responder({ ok: false, motivo: "error", error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
