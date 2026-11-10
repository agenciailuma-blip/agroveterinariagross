/*
  Abrir WhatsApp o el mapa desde el programa.

  Adentro del programa no hay pestañas: Tauri bloquea `target="_blank"`
  y un enlace a WhatsApp no haría nada. Esto lo abre en el navegador de
  la PC, que ofrece seguir en WhatsApp de escritorio o en la web.

  Sólo enlaces de wa.me y del mapa de Google: abrir cualquier dirección
  que mande la ventana sería darle a la página una puerta para lanzar lo
  que quiera.
*/

const PERMITIDOS: [&str; 2] = ["https://wa.me/", "https://www.google.com/maps/"];

#[tauri::command]
pub fn abrir_enlace(url: String) -> Result<(), String> {
    let valido = PERMITIDOS.iter().any(|p| url.starts_with(p))
        && url.len() <= 4000
        && url.chars().all(|c| c.is_ascii_graphic());
    if !valido {
        return Err("Sólo se abren enlaces de WhatsApp o del mapa.".into());
    }

    #[cfg(windows)]
    {
        // Windows abre la dirección con el navegador elegido, igual que
        // si se la pegara en «Ejecutar». No se usa `explorer <url>`: el
        // Explorador la toma como una ruta de archivo y, pasados los 260
        // caracteres (un aviso de fiado los pasa), abre la carpeta
        // Documentos en vez del navegador. Tampoco hay consola de por
        // medio: los «&» del mensaje no se interpretan.
        use windows::core::{w, HSTRING};
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let destino = HSTRING::from(url.as_str());
        let resultado =
            unsafe { ShellExecuteW(None, w!("open"), &destino, None, None, SW_SHOWNORMAL) };
        // Por contrato de Windows, 32 o menos es un error.
        if resultado.0 as isize <= 32 {
            return Err(format!(
                "No se pudo abrir el navegador (código {}).",
                resultado.0 as isize
            ));
        }
        Ok(())
    }

    #[cfg(not(windows))]
    {
        Err("Abrir enlaces sólo está hecho para Windows.".into())
    }
}
