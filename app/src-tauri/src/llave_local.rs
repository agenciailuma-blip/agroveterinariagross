/*
  La llave de la base local.

  La base local guarda datos de clientes —nombre, documento, domicilio de
  entrega— para que el mostrador pueda vender sin internet. Esos datos se
  guardan cifrados, y esta es la llave.

  ─── POR QUÉ LA LLAVE VIVE ACÁ Y NO EN LA APLICACIÓN ───

  La aplicación guarda sus datos en una carpeta de Windows. Si la llave
  estuviera en esa misma carpeta, copiar la carpeta a otra computadora
  sería copiar los datos y la llave juntos, y el cifrado no protegería
  nada.

  El Administrador de credenciales de Windows guarda la llave cifrada con
  la cuenta de usuario de esta PC. Copiada a otra máquina, o leída desde
  otra cuenta, no se puede abrir. Y queda aparte de los datos del
  programa: si se desinstala y se vuelve a instalar, la llave sigue ahí.

  ─── LO QUE ESTO NO HACE ───

  No inventa la llave: la genera la aplicación, con el generador de
  números al azar del navegador, y acá sólo se guarda y se devuelve. Así
  hay un único lugar donde se decide cómo es una llave, y este código no
  toca criptografía.
*/

/// El nombre con el que aparece en el Administrador de credenciales.
const DESTINO: &str = "Sistema Gross - base local";

#[tauri::command]
pub async fn leer_llave_base_local() -> Result<Option<Vec<u8>>, String> {
    tauri::async_runtime::spawn_blocking(|| credencial::leer(DESTINO))
        .await
        .map_err(|e| format!("No se pudo leer la llave de la base local: {e}"))?
}

#[tauri::command]
pub async fn guardar_llave_base_local(llave: Vec<u8>) -> Result<(), String> {
    /*
      Una llave de otro largo es un error de la aplicación, no algo que
      convenga guardar: después no serviría para abrir nada y el problema
      aparecería recién la próxima vez que se abra el programa.
    */
    if llave.len() != 32 {
        return Err(format!(
            "La llave de la base local tiene que tener 32 bytes y llegaron {}.",
            llave.len()
        ));
    }
    tauri::async_runtime::spawn_blocking(move || credencial::guardar(DESTINO, &llave))
        .await
        .map_err(|e| format!("No se pudo guardar la llave de la base local: {e}"))?
}

#[cfg(windows)]
mod credencial {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Foundation::ERROR_NOT_FOUND;
    use windows::Win32::Security::Credentials::{
        CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    // Windows espera el texto en UTF-16 y con el cero al final.
    fn en_ancho(texto: &str) -> Vec<u16> {
        texto.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /*
      `None` sólo cuando la credencial no existe, que es el caso normal la
      primera vez. Cualquier otro error se devuelve como error: tratarlo
      como «no hay llave» haría que la aplicación genere una nueva y deje
      ilegible lo que ya estaba cifrado con la anterior.
    */
    pub fn leer(destino: &str) -> Result<Option<Vec<u8>>, String> {
        let nombre = en_ancho(destino);
        let mut credencial: *mut CREDENTIALW = std::ptr::null_mut();

        let leido = unsafe {
            CredReadW(PCWSTR(nombre.as_ptr()), CRED_TYPE_GENERIC, None, &mut credencial)
        };

        if let Err(e) = leido {
            if e.code() == ERROR_NOT_FOUND.to_hresult() {
                return Ok(None);
            }
            return Err(format!("Windows no dejó leer la credencial ({})", e.message()));
        }

        // Se copia antes de liberar: la memoria es de Windows.
        let bytes = unsafe {
            let c = &*credencial;
            let copia =
                std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize).to_vec();
            CredFree(credencial as *const _);
            copia
        };

        Ok(Some(bytes))
    }

    pub fn guardar(destino: &str, llave: &[u8]) -> Result<(), String> {
        let mut nombre = en_ancho(destino);
        let mut blob = llave.to_vec();

        let credencial = CREDENTIALW {
            Type: CRED_TYPE_GENERIC,
            TargetName: PWSTR(nombre.as_mut_ptr()),
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            /*
              En esta computadora y para esta cuenta, en todas las sesiones.
              No se usa la persistencia «de empresa», que copia la
              credencial a otras máquinas de un dominio: justamente se
              quiere que no salga de acá.
            */
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            ..Default::default()
        };

        unsafe { CredWriteW(&credencial, 0) }
            .map_err(|e| format!("Windows no dejó guardar la credencial ({})", e.message()))
    }

    #[cfg(test)]
    pub fn borrar(destino: &str) {
        use windows::Win32::Security::Credentials::CredDeleteW;
        let nombre = en_ancho(destino);
        unsafe {
            let _ = CredDeleteW(PCWSTR(nombre.as_ptr()), CRED_TYPE_GENERIC, None);
        }
    }
}

#[cfg(not(windows))]
mod credencial {
    const SOLO_WINDOWS: &str =
        "La llave de la base local se guarda en Windows. Las PC del local son Windows.";

    pub fn leer(_destino: &str) -> Result<Option<Vec<u8>>, String> {
        Err(SOLO_WINDOWS.into())
    }

    pub fn guardar(_destino: &str, _llave: &[u8]) -> Result<(), String> {
        Err(SOLO_WINDOWS.into())
    }
}

#[cfg(all(test, windows))]
mod pruebas_de_windows {
    use super::credencial;

    /*
      Las pruebas usan nombres propios y los borran al terminar: correr
      las pruebas en la PC del local no puede pisar la llave de verdad.
      Y uno por prueba, porque corren al mismo tiempo: si compartieran el
      nombre, una borraría la credencial mientras la otra la está leyendo.
    */
    const DE_PRUEBA: &str = "Sistema Gross - prueba de llave";
    const INEXISTENTE: &str = "Sistema Gross - prueba de llave que no existe";

    #[test]
    fn lo_que_se_guarda_es_lo_que_se_lee() {
        credencial::borrar(DE_PRUEBA);
        let llave: Vec<u8> = (0u8..32).collect();

        credencial::guardar(DE_PRUEBA, &llave).expect("tendría que poder guardar");
        let leida = credencial::leer(DE_PRUEBA).expect("tendría que poder leer");
        credencial::borrar(DE_PRUEBA);

        assert_eq!(leida, Some(llave));
    }

    /*
      La primera vez que se abre el programa la llave no existe, y eso
      tiene que llegar como «no hay» y no como error: es la señal para
      crearla.
    */
    #[test]
    fn la_que_no_existe_vuelve_vacia() {
        credencial::borrar(INEXISTENTE);

        assert_eq!(credencial::leer(INEXISTENTE).expect("no existir no es un error"), None);
    }
}
