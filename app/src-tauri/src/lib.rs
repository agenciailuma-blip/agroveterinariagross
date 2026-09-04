mod impresora;

/*
  El arranque de la ventana.

  Casi todo el sistema vive en la aplicacion web que Tauri muestra. Lo
  que se suma aca es lo que el navegador no puede hacer: por ahora,
  hablarle a la impresora del mostrador; mas adelante, la
  sincronizacion por la red del local.
*/

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Sin el actualizador, corregir algo despues del corte
        // significaria ir maquina por maquina con un pendrive.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![impresora::imprimir_en_red])
        .run(tauri::generate_context!())
        .expect("No se pudo abrir la ventana del sistema");
}
