/*
  Abrir WhatsApp desde el programa.

  Adentro del programa no hay pestañas: Tauri bloquea `target="_blank"`
  y un enlace a WhatsApp no haría nada. Esto lo abre en el navegador de
  la PC, que ofrece seguir en WhatsApp de escritorio o en la web.

  Sólo enlaces de wa.me: abrir cualquier dirección que mande la ventana
  sería darle a la página una puerta para lanzar lo que quiera.
*/

#[tauri::command]
pub fn abrir_whatsapp(url: String) -> Result<(), String> {
    let valido = url.starts_with("https://wa.me/")
        && url.len() <= 4000
        && url.chars().all(|c| c.is_ascii_graphic());
    if !valido {
        return Err("Sólo se abren enlaces de WhatsApp.".into());
    }

    #[cfg(windows)]
    {
        // El Explorador abre una dirección web con el navegador elegido
        // en Windows. Se le pasa como un solo argumento, sin consola de
        // por medio: los «&» del mensaje no se interpretan.
        std::process::Command::new("explorer")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("No se pudo abrir el navegador: {e}"))?;
        Ok(())
    }

    #[cfg(not(windows))]
    {
        Err("Abrir WhatsApp sólo está hecho para Windows.".into())
    }
}
