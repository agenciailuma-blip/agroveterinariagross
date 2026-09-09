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
        // Las tres cosas que la ventana puede pedir: que impresoras hay
        // instaladas en esta PC, mandarle un ticket a una de ellas por la
        // cola de Windows, y mandarlo por red. Lo que no se registra
        // aca, la ventana lo llama y no pasa absolutamente nada.
        .invoke_handler(tauri::generate_handler![
            impresora::listar_impresoras,
            impresora::imprimir_por_windows,
            impresora::imprimir_en_red
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo abrir la ventana del sistema");
}
