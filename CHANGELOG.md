# Registro de cambios

## 0.1.7 — Nombre del proceso en Windows

- Windows ejecuta `SintaxTrama.exe`. El instalador actualiza los accesos directos y las asociaciones anteriores sin cambiar la elección de aplicación predeterminada.
- Incluye la corrección de rutas de carpetas borradas que pasó GitHub Actions después de la primera entrega 0.1.6.

## 0.1.6 — 2026-11-12 — SintaxTrama

- Corregida reapertura de archivos renombrados/alias: una sola sesión conserva texto pendiente y recuperación con ruta actual. El guardado del cuerpo no rebaja revisiones de nota.
- Instalador con identidad estable, actualización en la ubicación de Pliegra y retirada de asociaciones condicionada a su propietario.
- Copyright Windows G9C_Studios; licencia MIT, avisos de terceros y documentación de contribución.
- Comparación de memoria emparejada repetida sin compilaciones simultáneas; resultados históricos y limitaciones conservados.

- Presentación renombrada a SintaxTrama. Se mantienen identificador local.esteban.linde, ejecutable interno, preferencias y asociaciones compatibles.
- Eliminada generación de .bak. Se conserva autoguardado, validación de huellas, codificación, saltos y escritura temporal sincronizada; los .bak anteriores permanecen intactos.
- Recuperación pendiente con tres generaciones y fallback validado; archivos propios de recarga acotados. Datos anteriores legibles sin borrado de registros antiguos.
- Identidades estables para notas y migración compatible, renombrados/traslados y separación de notas al Guardar como.
- Contrato neutral de motores, adaptador CodeMirror y host React separados de Workspace y persistencia. Suspensión de recursos de pestañas inactivas conservando texto, selección, historial y contadores.
- Eliminadas notificaciones de estado sin cambios y retención innecesaria de texto de autoguardados fallidos.
- Corrector con debounce, cola acotada, invalidación por revisión exacta y corte Unicode seguro.
- Exportación Markdown a TXT mediante analizador estructurado. MD y TXT originales se mantienen intactos; se añaden pruebas de conversión y persistencia.
- Nuevas regresiones para recuperación, migración, fallos de metadatos, concurrencia, selección/historial y preferencias antiguas.

Las mediciones, resultados reales y límites están en docs/RESULTADOS.md, docs/RENDIMIENTO.md y docs/PENDIENTES.md. No se añadieron mini-IDE, Milkdown ni funciones narrativas.

## 0.1.5 — antecedente

Reparación de notas recientes durante recuperación, estado/hash tras guardado con metadatos fallidos, cierre de carpetas canonicalizadas y mitigación de construcción esbuild. Auditoría y proyecto originales preservados en Entregables del proyecto.

### Revisión de entrega r1

- Corregida retirada del explorador de una carpeta ya borrada cuando su ruta original usa un alias del ancestro (por ejemplo nombres cortos Windows). Regresión reproducida antes y 58 pruebas del núcleo aprobadas después.
- La primera CI remota encontró este caso; los artefactos r1 se reconstruyen con la corrección. Versión visible 0.1.6, etiqueta v0.1.6-r1.

