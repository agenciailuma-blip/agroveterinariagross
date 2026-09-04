// Sin esto, cada vez que alguien abre el sistema en el mostrador se
// abre tambien una consola negra detras de la ventana. En una PC de
// caja eso no es un detalle: alguien la cierra sin querer y se cae el
// programa.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sistema_gross_lib::run()
}
