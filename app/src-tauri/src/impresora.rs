/*
  Hablarle a la impresora del mostrador.

  Es lo que el navegador no puede hacer, y la razón principal por la que
  el sistema se empaqueta como programa: una página web no puede
  mandarle bytes crudos a una impresora del local.

  Hay dos caminos, y no son intercambiables:

  · Por la cola de impresión de Windows, eligiendo la impresora por
    nombre. Es el camino del local. El relevamiento del 07/09 mostró que
    la POS80 de la caja está por USB —no hay ninguna dirección de red a
    la que apuntar— y que las otras PC la ven compartida desde ahí.

  · Por red, contra una dirección y un puerto. Venía del alcance
    original, que hablaba de una Hasar de red. No sirve en ninguna de las
    dos cajas de Gross, pero se conserva por si alguna vez ponen una
    impresora de red: sacarlo no gana nada y perdería el único camino
    posible para ese caso.

  En los dos, el formato del ticket se decide del lado de la aplicación;
  acá sólo se transporta.
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

// ═══════════════════════════════════════════════════════════════
// POR LA COLA DE WINDOWS — el camino del local
// ═══════════════════════════════════════════════════════════════

/*
  Las impresoras instaladas en ESTA computadora.

  La pantalla de Configuración las muestra en una lista para elegir. No
  se le pide el nombre escrito a mano porque los nombres reales no se
  adivinan: en la caja es «POS80 Printer» y en los mostradores
  «POS80 Printer(2)», colgada de otro equipo. Un nombre mal tipeado no
  avisa nada: falla el día que hay que entregar un ticket.
*/
#[tauri::command]
pub async fn listar_impresoras() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(cola::instaladas)
        .await
        .map_err(|e| format!("No se pudo leer la lista de impresoras: {e}"))?
}

#[tauri::command]
pub async fn imprimir_por_windows(impresora: String, datos: Vec<u8>) -> Result<(), String> {
    // La cola bloquea el hilo mientras acepta el trabajo. Si esto se
    // hiciera en el hilo de la ventana, la aplicación se congelaría cada
    // vez que sale un ticket.
    tauri::async_runtime::spawn_blocking(move || cola::encolar(&impresora, &datos))
        .await
        .map_err(|e| format!("No se pudo lanzar la impresión: {e}"))?
}

/*
  El servicio de cola de Windows, que es lo único que hay del otro lado.

  Todo lo de este módulo son llamadas a winspool, así que existe sólo en
  Windows. Las 4 PC de Gross son Windows; el módulo igual compila en
  otros sistemas —devolviendo un error claro— para que un build en otra
  plataforma no se caiga con algo indescifrable.
*/
#[cfg(windows)]
mod cola {
    use windows::core::{Error, PCWSTR, PWSTR};
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL,
        PRINTER_HANDLE, PRINTER_INFO_4W,
    };

    /*
      Windows habla en UTF-16 y espera el cero al final del texto. Sin
      ese cero sigue leyendo memoria más allá del nombre: a veces no
      encuentra la impresora y a veces devuelve un error que no tiene
      nada que ver con lo que pasó.
    */
    fn en_ancho(texto: &str) -> Vec<u16> {
        texto.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /*
      La impresora abierta, que se cierra sola al salir del alcance.

      Importa que se cierre incluso cuando el ticket falla a mitad de
      camino: un handle que queda abierto deja el trabajo colgado en la
      cola, y el ticket siguiente no sale hasta que alguien reinicia.
    */
    struct Abierta(PRINTER_HANDLE);

    impl Drop for Abierta {
        fn drop(&mut self) {
            unsafe {
                let _ = ClosePrinter(self.0);
            }
        }
    }

    fn abrir(impresora: &str) -> Result<Abierta, String> {
        let nombre = en_ancho(impresora);
        let mut mango = PRINTER_HANDLE::default();

        unsafe { OpenPrinterW(PCWSTR(nombre.as_ptr()), &mut mango, None) }.map_err(|e| {
            format!(
                "Windows no encontró la impresora «{impresora}». \
                 Elegila de nuevo en Configuración. ({})",
                e.message()
            )
        })?;

        Ok(Abierta(mango))
    }

    pub fn instaladas() -> Result<Vec<String>, String> {
        /*
          Nivel 4: nombre y equipo, nada más. Es el que Windows documenta
          como rápido, porque no abre cada impresora para preguntarle cómo
          está — y acá sólo hacen falta los nombres.

          Las dos banderas son las dos formas en que una impresora
          aparece en una PC de Gross: LOCAL la de la caja, que está por
          USB, y CONNECTIONS la compartida que ven los mostradores.
        */
        const NIVEL: u32 = 4;
        let banderas = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;

        // Primera pasada sin lugar donde escribir: es la forma que tiene
        // Windows de decir cuánto espacio hace falta. Contesta con error,
        // y es lo esperado; lo que interesa es el tamaño.
        let mut necesarios = 0u32;
        let mut cuantas = 0u32;
        unsafe {
            let _ = EnumPrintersW(
                banderas,
                PCWSTR::null(),
                NIVEL,
                None,
                &mut necesarios,
                &mut cuantas,
            );
        }
        if necesarios == 0 {
            return Ok(Vec::new());
        }

        /*
          El lugar se pide como números de 8 bytes y no como bytes
          sueltos a propósito: Windows escribe punteros ahí adentro, y un
          arreglo de bytes no garantiza que la dirección quede alineada
          para poder leerlos.
        */
        let mut alineado = vec![0u64; (necesarios as usize + 7) / 8];
        let crudo = unsafe {
            std::slice::from_raw_parts_mut(alineado.as_mut_ptr().cast::<u8>(), alineado.len() * 8)
        };

        unsafe {
            EnumPrintersW(
                banderas,
                PCWSTR::null(),
                NIVEL,
                Some(crudo),
                &mut necesarios,
                &mut cuantas,
            )
        }
        .map_err(|e| format!("Windows no pudo listar las impresoras: {}", e.message()))?;

        let fichas = unsafe {
            std::slice::from_raw_parts(crudo.as_ptr().cast::<PRINTER_INFO_4W>(), cuantas as usize)
        };

        let mut nombres: Vec<String> = fichas
            .iter()
            .filter_map(|f| unsafe { f.pPrinterName.to_string() }.ok())
            .filter(|n| !n.trim().is_empty())
            .collect();

        // Ordenadas y sin repetidas: del otro lado hay una persona
        // buscando «POS80» en un desplegable, no un programa.
        nombres.sort_by_key(|n| n.to_lowercase());
        nombres.dedup();
        Ok(nombres)
    }

    pub fn encolar(impresora: &str, datos: &[u8]) -> Result<(), String> {
        let abierta = abrir(impresora)?;

        /*
          RAW es la pieza clave de todo esto: le dice a Windows que le
          pase a la impresora los bytes tal como vienen, sin traducirlos.
          Es lo que permite mandarle ESC/POS por la cola en vez de por
          red. El controlador POS80 del local ya está en RAW.

          El nombre del trabajo es lo que se lee en la cola de Windows
          cuando algo queda trabado, así que dice de dónde salió.
        */
        let mut titulo = en_ancho("Ticket — Sistema Gross");
        let mut tipo = en_ancho("RAW");
        let documento = DOC_INFO_1W {
            pDocName: PWSTR(titulo.as_mut_ptr()),
            pOutputFile: PWSTR::null(),
            pDatatype: PWSTR(tipo.as_mut_ptr()),
        };

        let numero = unsafe { StartDocPrinterW(abierta.0, 1, &documento) };
        if numero == 0 {
            return Err(format!(
                "Windows no aceptó el trabajo de impresión en «{impresora}»: {}",
                Error::from_win32().message()
            ));
        }

        let ticket = mandar_bytes(&abierta, datos);

        // El trabajo se cierra pase lo que pase. Uno que queda abierto se
        // sienta en la cola a esperar y tapa al que viene atrás.
        let cierre = unsafe { EndDocPrinter(abierta.0) }.ok();

        ticket?;
        cierre.map_err(|e| {
            format!(
                "El ticket quedó a medias en la cola de Windows: {}",
                e.message()
            )
        })
    }

    fn mandar_bytes(abierta: &Abierta, datos: &[u8]) -> Result<(), String> {
        unsafe { StartPagePrinter(abierta.0) }
            .ok()
            .map_err(|e| format!("Windows no pudo empezar la página: {}", e.message()))?;

        /*
          La cola puede tomar menos bytes de los que se le dan, así que se
          insiste hasta que no queda nada. Dar por hecho que tomó todo
          saldría como un ticket cortado justo en el total, que es la
          parte que el cliente mira.
        */
        let mut enviados = 0usize;
        while enviados < datos.len() {
            let resto = &datos[enviados..];
            let mut escritos = 0u32;

            unsafe {
                WritePrinter(
                    abierta.0,
                    resto.as_ptr().cast(),
                    resto.len() as u32,
                    &mut escritos,
                )
            }
            .ok()
            .map_err(|e| {
                format!(
                    "La impresora cortó la comunicación a mitad del ticket: {}",
                    e.message()
                )
            })?;

            if escritos == 0 {
                return Err("La impresora dejó de aceptar el ticket a mitad de camino.".into());
            }
            enviados += escritos as usize;
        }

        unsafe { EndPagePrinter(abierta.0) }
            .ok()
            .map_err(|e| format!("Windows no pudo cerrar la página: {}", e.message()))
    }

    /*
      Sólo para las pruebas: comprobar que un nombre existe sin gastar
      papel. Es lo que hace falta para verificar que los nombres que
      devuelve la lista son los mismos que Windows acepta después.
    */
    #[cfg(test)]
    pub fn se_puede_abrir(impresora: &str) -> Result<(), String> {
        abrir(impresora).map(|_| ())
    }
}

#[cfg(not(windows))]
mod cola {
    const SOLO_WINDOWS: &str =
        "La cola de impresión de Windows sólo existe en Windows. Las PC del local son Windows.";

    pub fn instaladas() -> Result<Vec<String>, String> {
        Err(SOLO_WINDOWS.into())
    }

    pub fn encolar(_impresora: &str, _datos: &[u8]) -> Result<(), String> {
        Err(SOLO_WINDOWS.into())
    }
}

// ═══════════════════════════════════════════════════════════════
// POR RED — para una impresora que escuche en una dirección
// ═══════════════════════════════════════════════════════════════

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

      Es la única forma de probar esto sin tener la impresora delante, y
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

/*
  Las de la cola de Windows.

  La POS80 del local no está en la máquina donde se programa, así que lo
  que sale por papel se prueba en Oberá. Lo que sí se puede verificar acá
  —y es justo lo que fallaba en silencio antes— es que la lista de
  impresoras se lea bien y que los nombres que devuelve sean exactamente
  los que Windows acepta después.
*/
#[cfg(all(test, windows))]
mod pruebas_de_windows {
    use super::cola;

    #[test]
    fn lee_la_lista_de_impresoras_de_esta_pc() {
        let nombres = cola::instaladas().expect("Windows tendría que poder listar sus impresoras");

        for n in &nombres {
            assert!(!n.trim().is_empty(), "hay un nombre vacío en la lista");
            // Un nombre con un cero adentro es la señal de que el texto
            // se leyó mal desde el buffer crudo.
            assert!(!n.contains('\0'), "el nombre «{n}» quedó mal leído");
        }
    }

    /*
      La prueba que justifica el desplegable: cada nombre de la lista es
      un nombre que Windows encuentra. Uno escrito a mano puede tener un
      espacio de más o un «(2)» que falta, y falla recién el día que hay
      que entregar un ticket.
    */
    #[test]
    fn los_nombres_que_devuelve_los_acepta_windows() {
        let nombres = cola::instaladas().expect("Windows tendría que poder listar sus impresoras");
        if nombres.is_empty() {
            return; // Una PC sin ninguna impresora instalada no prueba nada.
        }

        for n in &nombres {
            cola::se_puede_abrir(n)
                .unwrap_or_else(|e| panic!("Windows listó «{n}» pero no la puede abrir: {e}"));
        }
    }

    #[test]
    fn avisa_cuando_la_impresora_no_existe() {
        let error =
            cola::encolar("Impresora que no existe", &[0x0a]).expect_err("no deberia haber impreso");
        assert!(
            error.contains("Impresora que no existe"),
            "el mensaje no dice qué impresora buscó: {error}"
        );
        assert!(
            error.contains("Configuración"),
            "el mensaje no dice dónde arreglarlo: {error}"
        );
    }
}
