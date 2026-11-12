# Contribuir a SintaxTrama

Los cambios y reportes se reciben en este repositorio. Describe el comportamiento observado y el esperado, la versión de Windows y pasos con un documento de prueba. No adjuntes manuscritos privados, recuperaciones, credenciales o perfiles de WebView2.

Antes de abrir un cambio, ejecuta desde la raíz:

```powershell
npm ci
npm test
npm run test:rust
cargo test --locked --manifest-path tools/native-tests/Cargo.toml
npm run build
npm run test:ui
```

Las pruebas nativas requieren Windows. Para compilar la aplicación completa se necesitan MSVC, Windows SDK, Rust y WebView2, descritos en README.md. Las pruebas visuales usan Microsoft Edge.

Los cambios de persistencia deben conservar compatibilidad y demostrar recuperación ante fallos. Las optimizaciones deben conservar funciones y comparar cargas equivalentes. Para fallos de guardado, añade una regresión con archivos temporales y sin documentos reales.

Las contribuciones se distribuyen bajo la licencia MIT del proyecto. Conserva los avisos de autoría y las licencias de dependencias.
