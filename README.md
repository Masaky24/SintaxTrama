# SintaxTrama

Editor local de Markdown y texto para Windows 10/11 x64. Tauri 2, Rust, React, TypeScript, Vite y CodeMirror 6. Sin Electron, cuentas, telemetría, IA ni servicios de red durante la edición.

![Símbolo de SintaxTrama](public/pliegra-symbol.png)

## Descargar y utilizar

Descarga el instalador en [Releases](https://github.com/Masaky24/SintaxTrama/releases). La versión actual es **0.1.6**. Requiere Microsoft Edge WebView2 preinstalado; Node y Rust no son necesarios para usar la aplicación instalada. El paquete es por usuario y no requiere administrador. El binario no está firmado.

La actualización desde Pliegra conserva la ubicación de instalación y los datos. El nombre visible es SintaxTrama; temporalmente se mantienen `pliegra.exe`, la carpeta de instalación `Pliegra` y el identificador `local.esteban.linde`. El instalador registra MD/TXT en Abrir con sin modificar la elección predeterminada de Windows. Puedes seleccionar SintaxTrama desde las aplicaciones predeterminadas del sistema.

## Funciones

- Abrir, editar y guardar MD/TXT; Guardar como; exportar Markdown a TXT mediante un parser estructurado. Exportar MD conserva la fuente; TXT a TXT conserva caracteres literales.
- Explorador de carpetas, pestañas y últimos abiertos. Conserva selección, desplazamiento e historial de deshacer al cambiar de pestaña.
- **Markdown:** números de línea, plegado, búsqueda/reemplazo, expresiones regulares, sangría y ajuste de líneas junto a Deshacer/Rehacer.
- **Escritura:** presentación de lectura que oculta marcas comunes de Markdown. Fuente, tamaño del cuerpo, escala de títulos y zoom de hoja independientes. No es todavía un editor visual completo como Milkdown.
- Notas por documento, ortografía de Windows en español y reglas gramaticales básicas. Seleccionar un error subrayado y pulsar Tab acepta la primera propuesta; Ctrl+Z deshace. Revisar siempre las sugerencias de nombres y contexto.
- Temas claro/oscuro, fuentes instaladas en el PC y atajos modificables en Configuración.
- Autoguardado configurable, inicialmente desactivado. Recuperación de cambios pendientes de tres generaciones y detección de modificaciones externas.

## Integridad de archivos

El programa no genera nuevos `.bak` ni elimina los existentes. Guarda mediante temporal sincronizado y sustitución de Windows con comprobación de SHA-256. Si detecta una carrera externa, conserva excepcionalmente la versión desplazada en un temporal y muestra su ubicación. No fusiona cambios automáticamente.

Admite UTF-8, UTF-8 con BOM y UTF-16 LE/BE con BOM; conserva LF, CRLF o CR uniformes. Rechaza codificaciones no reconocidas sin convertir de forma destructiva. Saltos mixtos requieren copia con otro nombre y normalización confirmada a LF. Límite de archivo y texto UTF-8: 20 MiB; notas: 64 KiB.

La recuperación permanece activa aunque desactives el autoguardado. Los documentos recuperados requieren revisión y guardado manual. Un error posterior al guardado del manuscrito se muestra como «Guardado con advertencias»; conserva recuperación y permite reintentar los metadatos.

Los datos locales están en `%LOCALAPPDATA%/local.esteban.linde`. Las notas anteriores se migran al acceder sin borrar sus originales. La compatibilidad permite que esta versión lea datos anteriores; no garantiza edición bidireccional con ejecutables antiguos sobre datos ya migrados.

## Desarrollar y compilar

Instala Node.js 24 LTS, Rust estable con destino MSVC x64, Visual Studio Build Tools 2022 con escritorio C++, Windows SDK y WebView2. Desde la raíz del repositorio:

```powershell
npm ci
npm run tauri dev
```

Pruebas y compilación:

```powershell
npm test
npm run test:rust
cargo test --locked --manifest-path tools/native-tests/Cargo.toml
npm run build
npm run test:ui
npm run tauri build -- --bundles nsis
```

El instalador queda en `src-tauri/target/release/bundle/nsis/`. Las pruebas UI usan Edge instalado y simulan solo el puente nativo; las pruebas Rust y Windows ejercitan archivos/servicios reales. `npm run test:installer` añade dos comprobaciones de asociaciones en un espacio de registro aislado; requiere NSIS de Tauri instalado o `NSIS_EXE` apuntando a makensis.exe.

Se fija un trabajador esbuild por defecto para evitar el fallo nativo observado durante la auditoría. Puedes usar `$env:CARGO_BUILD_JOBS='1'` para reducir presión de memoria durante la compilación. Permanece una advertencia de Vite por el bloque diferido CodeMirror >500 kB.

## Documentación y contribuciones

- [Arquitectura](docs/ARQUITECTURA.md)
- [Pruebas y correcciones de 0.1.6](docs/RESULTADOS.md)
- [Rendimiento medido](docs/RENDIMIENTO.md)
- [Problemas pendientes y límites](docs/PENDIENTES.md)
- [Registro de cambios](CHANGELOG.md)
- [Cómo contribuir](CONTRIBUTING.md)

Windows 10 fue la plataforma probada localmente; Windows 11 es objetivo de compatibilidad y no se presenta como una prueba ejecutada en el notebook. No están implementados Milkdown, mini-IDE ni gestión narrativa de novelas, capítulos o fichas.

## Licencia y créditos

Copyright © 2026 **G9C_Studios**. [Licencia MIT](LICENSE): puedes usar, modificar, distribuir y vender copias, conservando el aviso de copyright y la licencia en las copias o partes sustanciales. No exige publicar los cambios ni añadir créditos a la interfaz. Los componentes de terceros conservan sus avisos en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), incluidos también en la instalación.
