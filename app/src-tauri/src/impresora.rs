/*
  Hablarle a la impresora del mostrador.

  Es lo que el navegador no puede hacer, y la razón principal por la que
  el sistema se empaqueta como programa: una página web no puede abrir
  una conexión de red cruda contra una impresora del local.

  La Hasar está en la red, escuchando en un puerto. Se le manda el
  ticket ya armado —bytes de ESC/POS— y ella lo imprime. Todo el
  formato se decide del lado de la aplicación; acá sólo se transporta.
*/

use std::io::Write;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;

/*
  Cuánto se espera antes de darse por vencido.

  Corto a propósito: si la impresora está apagada o alguien le cambió
  la IP, el cajero tiene que enterarse ahora, con el cliente todavía
  adelante, y no después de medio minuto mirando una pantalla trabada.
*/
const ESPERA: Duration = Duration::from_secs(5);

#[tauri::command]
pub async fn imprimir_en_red(host: String, puerto: u16, datos: Vec<u8>) -> Result<(), String> {
    // La conexión y la escritura bloquean el hilo. Si se hicieran en el
    // hilo de la ventana, la aplicación se congelaría mientras imprime.
    tauri::async_runtime::spawn_blocking(move || enviar(&host, puerto, &datos))
        .await
        .map_err(|e| format!("No se pudo lanzar la impresión: {e}"))?
}

fn enviar(host: &str, puerto: u16, datos: &[u8]) -> Result<(), String> {
    let destino: SocketAddr = (host, puerto)
        .to_socket_addrs()
        .map_err(|_| {
            format!("No se encontró la impresora en «{host}». Revisá la dirección en Configuración.")
        })?
        .next()
        .ok_or_else(|| format!("La dirección «{host}» no resolvió a ninguna impresora."))?;

    let mut conexion = TcpStream::connect_timeout(&destino, ESPERA).map_err(|e| {
        format!(
            "La impresora no contestó en {host}:{puerto}. \
             Fijate que esté encendida y en la misma red. ({e})"
        )
    })?;

    conexion
        .set_write_timeout(Some(ESPERA))
        .map_err(|e| format!("No se pudo preparar la conexión con la impresora: {e}"))?;

    conexion
        .write_all(datos)
        .map_err(|e| format!("La impresora cortó la comunicación a mitad del ticket: {e}"))?;

    /*
        El flush importa: sin él, los últimos bytes pueden quedar en el
        buffer del sistema operativo y el ticket sale cortado justo en
        el total, que es la parte que el cliente mira.
    */
    conexion
        .flush()
        .map_err(|e| format!("No se pudo terminar de enviar el ticket: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::io::Read;
    use std::net::TcpListener;

    /*
      Se levanta un servidor que hace de impresora y se comprueba que
      llegue exactamente lo que se mandó.

      Es la única forma de probar esto sin tener la Hasar delante, y
      cubre lo que puede fallar en silencio: que los bytes se manden
      completos y sin que nadie los reinterprete por el camino.
    */
    #[test]
    fn le_llegan_los_bytes_tal_cual() {
        let oyente = TcpListener::bind("127.0.0.1:0").expect("no se pudo abrir el puerto");
        let puerto = oyente.local_addr().unwrap().port();

        let impresora = std::thread::spawn(move || {
            let (mut conexion, _) = oyente.accept().unwrap();
            let mut recibido = Vec::new();
            conexion.read_to_end(&mut recibido).unwrap();
            recibido
        });

        // Un ticket mínimo con un acento en latin1: la ó es 0xF3
        let ticket = vec![0x1b, 0x40, b'B', b'a', b'g', 0xf3, 0x0a, 0x1d, 0x56, 0x42, 0x00];
        enviar("127.0.0.1", puerto, &ticket).expect("deberia haber impreso");

        assert_eq!(impresora.join().unwrap(), ticket);
    }

    /*
      Y que cuando no hay nadie del otro lado lo diga en castellano, con
      la dirección adentro. El cajero tiene que poder leer el mensaje y
      saber qué mirar.
    */
    #[test]
    fn avisa_cuando_la_impresora_no_contesta() {
        let error = enviar("127.0.0.1", 1, &[0x0a]).expect_err("no deberia haber impreso");
        assert!(error.contains("no contestó"), "mensaje inesperado: {error}");
        assert!(error.contains("127.0.0.1"), "el mensaje no dice dónde buscó: {error}");
    }
}
