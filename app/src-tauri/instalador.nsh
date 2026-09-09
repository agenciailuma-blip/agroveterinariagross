; ═══════════════════════════════════════════════════════════════
; ESPERAR A QUE EL PROGRAMA SUELTE SU PROPIO ARCHIVO
;
; ─── EL PROBLEMA ───
;
; Aparecido el 07/09 al publicar la 0.2.0, y reproducido el 09/09 al
; actualizar desde el programa:
;
;   Error abriendo archivo para escritura:
;   ...\Sistema Gross\sistema-gross.exe
;   [Anular] [Reintentar] [Omitir]
;
; El actualizador de Tauri lanza este instalador y despues cierra el
; programa. Pero cerrarse no es instantaneo: WebView2 deja procesos
; hijos (msedgewebview2.exe) que siguen teniendo el .exe y su carpeta
; abiertos un rato mas. El instalador llega antes de que el sistema
; operativo suelte el archivo, y se choca contra el candado.
;
; Es una CARRERA, y por eso a veces "funciona": depende de cuanto tarde
; Windows en limpiar. Eso es lo peor que puede tener un actualizador —
; que ande en la maquina donde se prueba y falle en las cuatro del
; local.
;
; ─── LA SOLUCION ───
;
; Antes de copiar un solo archivo, el instalador espera. Y si despues
; de esperar el candado sigue puesto, mata los procesos que quedaron.
;
; El orden importa: primero se espera por las buenas —un programa que
; se esta cerrando solo termina de cerrarse, y asi guarda lo que tenga
; pendiente— y recien despues se fuerza. Al reves se mataria un
; programa en el medio de guardar una venta.
;
; ─── POR QUE NO SE RESUELVE DEL LADO DEL PROGRAMA ───
;
; Porque el programa no puede garantizar que sus procesos hijos ya
; murieron: no los administra el, los administra WebView2. Lo unico que
; puede saber con certeza si el archivo esta libre es quien intenta
; escribirlo. Por eso la espera vive aca y no en el codigo de la app.
;
; ─── POR QUE SE GUARDAN LOS REGISTROS ───
;
; Este macro se expande ADENTRO de una seccion del instalador de Tauri,
; que usa $R0-$R9 para lo suyo. Pisarlos seria romper el instalador en
; algun punto posterior, con un sintoma que no apuntaria para aca.
; Se guardan al entrar y se devuelven al salir.
; ═══════════════════════════════════════════════════════════════

!macro NSIS_HOOK_PREINSTALL
  Push $R0   ; contador de intentos
  Push $R1   ; manejador del archivo de prueba

  ; No corre en la instalacion limpia de una maquina nueva: ahi no hay
  ; nada que esperar y el archivo todavia no existe.
  ${IfNot} ${FileExists} "$INSTDIR\sistema-gross.exe"
    Goto gross_listo_para_instalar
  ${EndIf}

  DetailPrint "Esperando a que Sistema Gross termine de cerrarse..."

  ; Hasta 10 segundos, mirando cada medio segundo.
  ;
  ; Se prueba ABRIENDO el archivo en modo escritura: es la unica forma
  ; honesta de saber si esta libre. Preguntar por el nombre del proceso
  ; no alcanza — el que suele tener el candado es un hijo de WebView2,
  ; que se llama distinto.
  StrCpy $R0 0

  gross_esperar:
    ClearErrors
    FileOpen $R1 "$INSTDIR\sistema-gross.exe" a
    ${IfNot} ${Errors}
      FileClose $R1
      DetailPrint "El programa ya se cerro."
      Goto gross_listo_para_instalar
    ${EndIf}

    IntOp $R0 $R0 + 1
    ${If} $R0 >= 20
      Goto gross_forzar
    ${EndIf}
    Sleep 500
    Goto gross_esperar

  gross_forzar:
    ; Diez segundos y sigue tomado: quedo algo colgado. Se lo baja.
    ;
    ; Se mata por NOMBRE DEL PROGRAMA con /T, que se lleva su arbol de
    ; procesos hijos. No se mata "msedgewebview2.exe" a secas: eso
    ; voltearia cualquier otro programa que use WebView2 en la misma
    ; maquina, y en estas PC hay varios.
    DetailPrint "Cerrando lo que quedo abierto..."
    nsExec::Exec 'taskkill /F /IM sistema-gross.exe /T'
    Pop $R1                      ; el codigo de salida no interesa:
    Sleep 1500                   ; si no habia nada que matar, mejor

    ClearErrors
    FileOpen $R1 "$INSTDIR\sistema-gross.exe" a
    ${If} ${Errors}
      ; Ultimo recurso: se le pide a la persona. El mensaje dice QUE
      ; HACER, a diferencia del error de NSIS —"error abriendo archivo
      ; para escritura"— que no le sirve a nadie en el mostrador.
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
        "Sistema Gross todavia esta abierto y no se puede actualizar.$\r$\n$\r$\nCerralo por completo, incluida cualquier ventana de comprobante, y apreta Aceptar.$\r$\n$\r$\nSi el problema sigue, reinicia la computadora y volve a intentarlo." \
        IDOK gross_forzar IDCANCEL gross_abortar
    ${Else}
      FileClose $R1
    ${EndIf}
    Goto gross_listo_para_instalar

  gross_abortar:
    Pop $R1
    Pop $R0
    Abort "Actualizacion cancelada: el programa seguia abierto."

  gross_listo_para_instalar:
    Pop $R1
    Pop $R0
!macroend
