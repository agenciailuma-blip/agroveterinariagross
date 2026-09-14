mod impresora;
mod llave_local;
mod red_local;

/*
  El arranque de la ventana.

  Casi todo el sistema vive en la aplicacion web que Tauri muestra. Lo
  que se suma aca es lo que el navegador no puede hacer: hablarle a la
  impresora del mostrador, y hablarles a las otras computadoras del
  local cuando no hay internet.
*/

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Sin el actualizador, corregir algo despues del corte
        // significaria ir maquina por maquina con un pendrive.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Lo que la ventana puede pedir. Lo que no se registra aca, la
        // ventana lo llama y no pasa absolutamente nada.
        .invoke_handler(tauri::generate_handler![
            impresora::listar_impresoras,
            impresora::imprimir_por_windows,
            impresora::imprimir_en_red,
            // Sin internet, las cuatro PC quedan aisladas: esto es lo
            // que hace que la venta del mostrador llegue a la caja.
            red_local::abrir_punto_de_encuentro,
            red_local::cerrar_punto_de_encuentro,
            red_local::hablar_con_la_caja,
            red_local::nombre_de_esta_computadora,
            // Los datos de clientes que quedan en la PC se guardan
            // cifrados; la llave la custodia Windows, no la aplicación.
            llave_local::leer_llave_base_local,
            llave_local::guardar_llave_base_local
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo abrir la ventana del sistema");
}
