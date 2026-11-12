; Register as an available editor without assigning the extension's default value
; or modifying Windows' protected UserChoice. The user chooses the default.
!macro NSIS_HOOK_POSTINSTALL
  ; Remove only legacy shortcuts targeting this exact installation.
  !insertmacro IsShortcutTarget "$SMPROGRAMS\Pliegra.lnk" "$INSTDIR\pliegra.exe"
  Pop $0
  ${If} $0 = 1
    Delete "$SMPROGRAMS\Pliegra.lnk"
  ${EndIf}
  !insertmacro IsShortcutTarget "$DESKTOP\Pliegra.lnk" "$INSTDIR\pliegra.exe"
  Pop $0
  ${If} $0 = 1
    Delete "$DESKTOP\Pliegra.lnk"
  ${EndIf}
  WriteRegStr HKCU "Software\Classes\Pliegra.Markdown" "" "Documento Markdown"
  WriteRegStr HKCU "Software\Classes\Pliegra.Markdown\DefaultIcon" "" '"$INSTDIR\pliegra.exe",0'
  WriteRegStr HKCU "Software\Classes\Pliegra.Markdown\shell\open\command" "" '"$INSTDIR\pliegra.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Pliegra.Text" "" "Documento de texto"
  WriteRegStr HKCU "Software\Classes\Pliegra.Text\DefaultIcon" "" '"$INSTDIR\pliegra.exe",0'
  WriteRegStr HKCU "Software\Classes\Pliegra.Text\shell\open\command" "" '"$INSTDIR\pliegra.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.md\OpenWithProgids" "Pliegra.Markdown" ""
  WriteRegStr HKCU "Software\Classes\.txt\OpenWithProgids" "Pliegra.Text" ""
  WriteRegStr HKCU "Software\Classes\Applications\pliegra.exe" "FriendlyAppName" "SintaxTrama"
  WriteRegStr HKCU "Software\Classes\Applications\pliegra.exe\SupportedTypes" ".md" ""
  WriteRegStr HKCU "Software\Classes\Applications\pliegra.exe\SupportedTypes" ".txt" ""
  WriteRegStr HKCU "Software\Classes\Applications\pliegra.exe\shell\open\command" "" '"$INSTDIR\pliegra.exe" "%1"'
  WriteRegStr HKCU "Software\Pliegra\Capabilities" "ApplicationName" "SintaxTrama"
  WriteRegStr HKCU "Software\Pliegra\Capabilities" "ApplicationDescription" "Editor local de Markdown y texto para novelas"
  WriteRegStr HKCU "Software\Pliegra\Capabilities\FileAssociations" ".md" "Pliegra.Markdown"
  WriteRegStr HKCU "Software\Pliegra\Capabilities\FileAssociations" ".txt" "Pliegra.Text"
  WriteRegStr HKCU "Software\RegisteredApplications" "Pliegra" "Software\Pliegra\Capabilities"

  ; Legacy ProgIDs may still be selected in protected Windows UserChoice.
  ; Keep them as aliases to the renamed executable; do not change UserChoice.
  WriteRegStr HKCU "Software\Classes\Linde.Markdown" "" "Documento Markdown"
  WriteRegStr HKCU "Software\Classes\Linde.Markdown\DefaultIcon" "" '"$INSTDIR\pliegra.exe",0'
  WriteRegStr HKCU "Software\Classes\Linde.Markdown\shell\open\command" "" '"$INSTDIR\pliegra.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Linde.Text" "" "Documento de texto"
  WriteRegStr HKCU "Software\Classes\Linde.Text\DefaultIcon" "" '"$INSTDIR\pliegra.exe",0'
  WriteRegStr HKCU "Software\Classes\Linde.Text\shell\open\command" "" '"$INSTDIR\pliegra.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\linde.exe" "FriendlyAppName" "SintaxTrama"
  WriteRegStr HKCU "Software\Classes\Applications\linde.exe\shell\open\command" "" '"$INSTDIR\pliegra.exe" "%1"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro RemoveOwnedAssociation key
  ReadRegStr $0 HKCU "Software\Classes\${key}\shell\open\command" ""
  ${If} $0 == '"$INSTDIR\pliegra.exe" "%1"'
    DeleteRegKey HKCU "Software\Classes\${key}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ReadRegStr $0 HKCU "Software\Classes\Applications\pliegra.exe\shell\open\command" ""
  ${If} $0 == '"$INSTDIR\pliegra.exe" "%1"'
    DeleteRegValue HKCU "Software\RegisteredApplications" "Pliegra"
    DeleteRegKey HKCU "Software\Pliegra\Capabilities"
    DeleteRegKey /ifempty HKCU "Software\Pliegra"
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\Pliegra.Markdown\shell\open\command" ""
  ${If} $0 == '"$INSTDIR\pliegra.exe" "%1"'
    DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "Pliegra.Markdown"
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Classes\Pliegra.Text\shell\open\command" ""
  ${If} $0 == '"$INSTDIR\pliegra.exe" "%1"'
    DeleteRegValue HKCU "Software\Classes\.txt\OpenWithProgids" "Pliegra.Text"
  ${EndIf}
  !insertmacro RemoveOwnedAssociation "Pliegra.Markdown"
  !insertmacro RemoveOwnedAssociation "Pliegra.Text"
  !insertmacro RemoveOwnedAssociation "Applications\pliegra.exe"
  !insertmacro RemoveOwnedAssociation "Linde.Markdown"
  !insertmacro RemoveOwnedAssociation "Linde.Text"
  !insertmacro RemoveOwnedAssociation "Applications\linde.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
