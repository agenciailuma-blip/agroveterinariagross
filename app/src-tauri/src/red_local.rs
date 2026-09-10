/*
  Hablarse entre las computadoras del local, sin internet.

  El problema, descubierto el 21/08: las cuatro PC sólo se hablan a
  través de Supabase. Cuando se corta internet cada una queda aislada, y
  la venta que arma un vendedor **no tiene cómo llegar a la caja** hasta
  que vuelva la conexión. Justo cuando el modo sin conexión tendría que
  salvar el día.

  ─── UN PUNTO DE ENCUENTRO, NO TODOS CONTRA TODOS ───

  Una de las terminales escucha —la de la caja— y las demás le hablan.
  No es una red de pares: con cuatro terminales, cada una tendría que
  encontrar a las otras tres y ponerse de acuerdo sobre quién tiene la
  verdad. Y no hace falta, porque el negocio ya tiene un lugar donde
  todo converge: la caja es donde la venta se cobra.

  Consecuencia práctica que conviene saber de antemano: **la PC de la
  caja tiene que estar prendida**. Ya lo estaba —es donde se cobra— pero
  ahora, además, es de quien dependen las otras cuando no hay internet.

  ─── QUÉ VIAJA ───

  Las mismas operaciones que van a Supabase, sin traducir. Cada una trae
  el id que generó la terminal, así que si termina llegando dos veces
  —una por la red del local y otra por internet— la segunda choca contra
  la clave primaria y se descarta sola. Es la misma propiedad que hace
  que reenviar sea seguro en el motor de sincronización, usada de nuevo.

  ─── POR QUÉ NO ES HTTP ───

  Los dos extremos son nuestros y el mensaje es uno solo por conexión:
  una línea de JSON va, una línea de JSON vuelve. HTTP traería
  encabezados, keep-alive y codificación por trozos para no usar nada de
  eso, y cada una de esas cosas es una forma de equivocarse.

  ─── LA CLAVE ───

  El local puede tener wifi para los clientes. Cualquiera parado en la
  vereda no tiene por qué poder mandarle ventas a la caja. Por eso todo
  mensaje trae una clave compartida que viaja sola, con el resto de la
  configuración, cuando la terminal se sincroniza. No es criptografía:
  es la diferencia entre una puerta cerrada y una abierta.
*/

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/*
  El puerto es fijo y no se configura.

  Un puerto configurable es un campo más que puede quedar distinto en
  una de las cuatro máquinas, y el síntoma sería "a veces no llega la
  venta". El 8737 no lo usa nada conocido.
*/
pub const PUERTO: u16 = 8737;

/*
  Cuánto se espera al punto de encuentro.

  Más corto que el de la impresora a propósito: acá no hay nadie mirando
  el resultado. Si la caja no contesta, la operación se queda en la cola
  y se reintenta sola; lo que no puede pasar es que el mostrador se
  trabe esperando.
*/
const ESPERA: Duration = Duration::from_secs(3);

// Clone porque Tauri lo pide para mandarlo a la ventana: el evento
// puede tener más de un oyente y cada uno recibe el suyo.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Mensaje {
    /// La clave compartida del local.
    pub clave: String,
    /// Qué se está pidiendo: "salud" u "operaciones".
    pub tipo: String,
    /// Quién habla, para que del otro lado se sepa y quede en el registro.
    #[serde(default)]
    pub terminal: String,
    /// Las operaciones, tal como viajan a Supabase. Opaco para el Rust:
    /// acá sólo se transportan.
    #[serde(default)]
    pub operaciones: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Respuesta {
    pub ok: bool,
    #[serde(default)]
    pub detalle: String,
}

// ═══════════════════════════════════════════════════════════════
// ESCUCHAR — la terminal que hace de punto de encuentro
// ═══════════════════════════════════════════════════════════════

struct Escucha {
    seguir: Arc<AtomicBool>,
}

static ESCUCHA: Mutex<Option<Escucha>> = Mutex::new(None);

/*
  Atender las conexiones hasta que alguien diga basta.

  Recibe qué hacer con cada mensaje en vez de hacerlo acá adentro: eso
  es lo que permite probar el transporte de punta a punta sin una
  ventana de Tauri de por medio.
*/
fn atender<F>(oyente: TcpListener, seguir: Arc<AtomicBool>, clave: String, al_recibir: F)
where
    F: Fn(Mensaje) + Send + 'static,
{
    // Sin bloquear, para poder mirar la bandera de corte. Un accept que
    // bloquea deja el hilo colgado para siempre cuando se cierra el
    // programa.
    let _ = oyente.set_nonblocking(true);

    while seguir.load(Ordering::Relaxed) {
        match oyente.accept() {
            Ok((conexion, _)) => {
                let _ = conexion.set_nonblocking(false);
                responder(conexion, &clave, &al_recibir);
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(_) => break,
        }
    }
}

fn responder<F>(mut conexion: TcpStream, clave: &str, al_recibir: &F)
where
    F: Fn(Mensaje),
{
    let _ = conexion.set_read_timeout(Some(ESPERA));
    let _ = conexion.set_write_timeout(Some(ESPERA));

    let mut linea = String::new();
    if BufReader::new(&conexion).read_line(&mut linea).is_err() {
        return;
    }

    let respuesta = match serde_json::from_str::<Mensaje>(&linea) {
        Err(_) => Respuesta {
            ok: false,
            detalle: "No se entendió el mensaje.".into(),
        },

        // Una clave que no es la del local no se atiende y no se
        // explica por qué: del otro lado puede no ser un error nuestro.
        Ok(m) if m.clave != clave => Respuesta {
            ok: false,
            detalle: "Clave del local incorrecta.".into(),
        },

        Ok(m) if m.tipo == "salud" => Respuesta {
            ok: true,
            detalle: "Acá está la caja.".into(),
        },

        Ok(m) if m.tipo == "operaciones" => {
            al_recibir(m);
            Respuesta {
                ok: true,
                detalle: "Recibido.".into(),
            }
        }

        Ok(m) => Respuesta {
            ok: false,
            detalle: format!("No sé qué es «{}».", m.tipo),
        },
    };

    let texto = serde_json::to_string(&respuesta).unwrap_or_else(|_| "{\"ok\":false}".into());
    let _ = writeln!(conexion, "{texto}");
    let _ = conexion.flush();
}

#[tauri::command]
pub fn abrir_punto_de_encuentro(app: AppHandle, clave: String, puerto: Option<u16>) -> Result<u16, String> {
    let puerto = puerto.unwrap_or(PUERTO);

    let mut guardia = ESCUCHA.lock().map_err(|_| "La escucha quedó en mal estado.")?;
    if guardia.is_some() {
        return Ok(puerto);
    }

    /*
      Se escucha en todas las direcciones de la máquina y no sólo en
      127.0.0.1: la gracia es justamente que la vean las otras PC.

      La primera vez, Windows va a preguntar si se le permite a este
      programa comunicarse en redes privadas. Hay que decirle que sí, y
      es una sola vez en la máquina de la caja.
    */
    let oyente = TcpListener::bind(("0.0.0.0", puerto)).map_err(|e| {
        format!(
            "No se pudo escuchar en el puerto {puerto}. \
             Puede haber otro programa usándolo, o Windows puede haber bloqueado el acceso. ({e})"
        )
    })?;

    let seguir = Arc::new(AtomicBool::new(true));
    let bandera = seguir.clone();

    std::thread::spawn(move || {
        atender(oyente, bandera, clave, move |m| {
            // La ventana es la que sabe qué hacer con esto: guardarlo en
            // su base local y mostrarle la venta al cajero.
            let _ = app.emit("operaciones-de-la-red", m);
        });
    });

    *guardia = Some(Escucha { seguir });
    Ok(puerto)
}

#[tauri::command]
pub fn cerrar_punto_de_encuentro() -> Result<(), String> {
    let mut guardia = ESCUCHA.lock().map_err(|_| "La escucha quedó en mal estado.")?;
    if let Some(e) = guardia.take() {
        e.seguir.store(false, Ordering::Relaxed);
    }
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// HABLAR — las terminales que le mandan a la caja
// ═══════════════════════════════════════════════════════════════

/*
  Mandar un mensaje y esperar la respuesta.

  El mensaje ya viene armado de la ventana: acá no se interpreta nada,
  igual que con la impresora. Lo que sí se hace es traducir el error de
  red a algo que se pueda leer en el mostrador.
*/
fn hablar(host: &str, puerto: u16, mensaje: &str) -> Result<Respuesta, String> {
    let destino = (host, puerto)
        .to_socket_addrs()
        .map_err(|_| format!("No se encontró «{host}» en la red del local."))?
        .next()
        .ok_or_else(|| format!("La dirección «{host}» no resolvió a ninguna computadora."))?;

    let mut conexion = TcpStream::connect_timeout(&destino, ESPERA).map_err(|e| {
        format!(
            "La computadora de la caja no contestó en {host}:{puerto}. \
             Fijate que esté prendida y con el sistema abierto. ({e})"
        )
    })?;

    conexion
        .set_read_timeout(Some(ESPERA))
        .and_then(|_| conexion.set_write_timeout(Some(ESPERA)))
        .map_err(|e| format!("No se pudo preparar la conexión con la caja: {e}"))?;

    writeln!(conexion, "{mensaje}")
        .and_then(|_| conexion.flush())
        .map_err(|e| format!("Se cortó la conexión con la caja al mandar: {e}"))?;

    let mut linea = String::new();
    BufReader::new(&conexion)
        .read_line(&mut linea)
        .map_err(|e| format!("La caja no terminó de contestar: {e}"))?;

    serde_json::from_str::<Respuesta>(&linea)
        .map_err(|_| "La caja contestó algo que no se entiende.".to_string())
}

#[tauri::command]
pub async fn hablar_con_la_caja(
    host: String,
    puerto: Option<u16>,
    mensaje: String,
) -> Result<Respuesta, String> {
    let puerto = puerto.unwrap_or(PUERTO);

    // La conexión bloquea. En el hilo de la ventana, el mostrador se
    // congelaría hasta tres segundos cada vez que manda una venta.
    tauri::async_runtime::spawn_blocking(move || hablar(&host, puerto, &mensaje))
        .await
        .map_err(|e| format!("No se pudo hablar con la caja: {e}"))?
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::sync::mpsc;

    /*
      Se levanta un punto de encuentro de verdad en un puerto libre y se
      le habla con el mismo cliente que usa el mostrador. Es lo más
      cerca que se puede estar del local sin las cuatro PC delante.
    */
    fn levantar(clave: &str) -> (u16, Arc<AtomicBool>, mpsc::Receiver<Mensaje>) {
        let oyente = TcpListener::bind("127.0.0.1:0").expect("no se pudo abrir el puerto");
        let puerto = oyente.local_addr().unwrap().port();
        let seguir = Arc::new(AtomicBool::new(true));
        let bandera = seguir.clone();
        let (envia, recibe) = mpsc::channel();
        let clave = clave.to_string();

        std::thread::spawn(move || {
            atender(oyente, bandera, clave, move |m| {
                let _ = envia.send(m);
            });
        });

        (puerto, seguir, recibe)
    }

    #[test]
    fn la_caja_contesta_que_esta() {
        let (puerto, seguir, _r) = levantar("la-clave-del-local");

        let r = hablar(
            "127.0.0.1",
            puerto,
            r#"{"clave":"la-clave-del-local","tipo":"salud"}"#,
        )
        .expect("tendría que haber contestado");

        assert!(r.ok, "contestó que no: {}", r.detalle);
        seguir.store(false, Ordering::Relaxed);
    }

    /*
      Lo que importa de verdad: que las operaciones lleguen enteras y sin
      que nadie las toque por el camino. Si el transporte las
      reinterpretara, la venta llegaría a la caja distinta de como salió
      del mostrador.
    */
    #[test]
    fn las_operaciones_llegan_enteras() {
        let (puerto, seguir, recibe) = levantar("la-clave-del-local");

        let mensaje = r#"{"clave":"la-clave-del-local","tipo":"operaciones","terminal":"MOS1","operaciones":[{"id":"abc","tabla":"venta","datos":{"total":1234.56,"codigo":"MOS1-000042"}}]}"#;

        let r = hablar("127.0.0.1", puerto, mensaje).expect("tendría que haber recibido");
        assert!(r.ok, "no aceptó las operaciones: {}", r.detalle);

        let recibido = recibe
            .recv_timeout(Duration::from_secs(2))
            .expect("la caja no avisó que le llegaron");

        assert_eq!(recibido.terminal, "MOS1");
        assert_eq!(recibido.operaciones[0]["id"], "abc");
        assert_eq!(recibido.operaciones[0]["datos"]["codigo"], "MOS1-000042");
        // El total llega como número y no como texto: un centavo que se
        // convierte en cadena es una venta que después no suma.
        assert_eq!(recibido.operaciones[0]["datos"]["total"], 1234.56);

        seguir.store(false, Ordering::Relaxed);
    }

    /*
      El wifi del local puede tener clientes conectados. Uno de ellos no
      tiene por qué poder mandarle ventas a la caja.
    */
    #[test]
    fn no_atiende_a_quien_no_sabe_la_clave() {
        let (puerto, seguir, recibe) = levantar("la-clave-del-local");

        let r = hablar(
            "127.0.0.1",
            puerto,
            r#"{"clave":"otra-cosa","tipo":"operaciones","operaciones":[]}"#,
        )
        .expect("tendría que haber contestado igual");

        assert!(!r.ok, "aceptó una clave que no era");
        assert!(
            recibe.recv_timeout(Duration::from_millis(300)).is_err(),
            "las operaciones llegaron igual, que es lo que no puede pasar"
        );

        seguir.store(false, Ordering::Relaxed);
    }

    /*
      Y cuando la caja está apagada, que lo diga en castellano y diciendo
      qué mirar. Es el caso que más va a pasar.
    */
    #[test]
    fn avisa_cuando_la_caja_no_esta() {
        let error = hablar("127.0.0.1", 1, r#"{"clave":"x","tipo":"salud"}"#)
            .expect_err("no tendría que haber conectado");

        assert!(error.contains("no contestó"), "mensaje inesperado: {error}");
        assert!(
            error.contains("prendida"),
            "el mensaje no dice qué mirar: {error}"
        );
    }
}
