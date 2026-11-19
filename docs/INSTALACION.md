# Instalar o actualizar SintaxTrama en Windows

Necesitas Windows 10 u 11 de 64 bits y Microsoft Edge WebView2 Runtime. Si falta este último, instálalo desde [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/). El editor se instala para tu usuario y no requiere Node, Rust ni una cuenta.

1. Guarda tu trabajo y cierra SintaxTrama o Pliegra. Si ya tienes una versión instalada, déjala instalada para que el actualizador reutilice su ubicación.
2. Abre [Releases](https://github.com/Masaky24/SintaxTrama/releases) y baja `SintaxTrama_0.1.7_x64-setup.exe`. El instalador se distribuye sin firma digital. Descárgalo desde ese repositorio y, si deseas verificarlo, compara su SHA-256 con el archivo publicado usando `Get-FileHash .\SintaxTrama_0.1.7_x64-setup.exe -Algorithm SHA256`.
3. Ejecuta el instalador. Si te ofrece desinstalar la versión anterior, elige la opción de instalar sobre la existente y conserva su carpeta.
4. Abre SintaxTrama desde Inicio. En Administrador de tareas → Detalles, el proceso figura como `SintaxTrama.exe`. La carpeta de una instalación anterior puede seguir llamándose `Pliegra`.

La actualización reutiliza las preferencias, notas y recuperaciones locales. Si Windows abre los archivos Markdown o TXT con otro programa y quieres cambiarlo, usa **Abrir con → Elegir otra aplicación → SintaxTrama** y elige la opción de usarla siempre. Si un acceso anclado antiguo quedó apuntando al ejecutable anterior, vuelve a anclarlo desde Inicio.
