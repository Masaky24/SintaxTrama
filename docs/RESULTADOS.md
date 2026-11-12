# Informe de pruebas — SintaxTrama 0.1.6

Fecha: 12 de noviembre de 2026. Actualización del proyecto existente 0.1.5, ejecutada en Windows 10 x64. Las cifras siguientes corresponden al código final, no al informe provisional anterior.

## Comprobaciones ejecutadas

| Comprobación | Resultado |
|---|---|
| npm test | 56 pruebas, 7 archivos, salida 0 |
| cargo test --manifest-path src-tauri/core/Cargo.toml | 57 pruebas: 4 unidad, 24 integridad, 7 exportación, 3 regresiones finales, 19 estabilidad; salida 0 |
| cargo test --manifest-path tools/native-tests/Cargo.toml | 4 pruebas de servicios Windows reales; salida 0 |
| npm run test:ui | 24 pruebas React/CodeMirror en Edge; salida 0, 48,6 segundos |
| npm run test:installer | 2 comprobaciones NSIS compiladas y ejecutadas en registro aislado; salida 0 |
| Construcción Tauri de producción | Salida 0; ejecutable e instalador NSIS x64 generados |

**141 pruebas de aplicación más 2 comprobaciones de instalador: 143 aprobadas.** Las pruebas de interfaz usan un puente de archivos simulado; no prueban por sí mismas diálogos nativos ni escritura del ejecutable instalado. El núcleo usa archivos temporales reales y fallos controlados. Los servicios Windows usan COM/DirectWrite reales.

## Recorrido nativo ejecutado

- Instalación real sobre Pliegra 0.1.5: una sola entrada instalada, mismo directorio y ejecutable interno. Preferencias y archivos de datos idénticos durante la instalación con la aplicación cerrada. Asociaciones predeterminadas MD/TXT sin cambios.
- Propiedades del ejecutable: producto SintaxTrama, versión 0.1.6, copyright y compañía G9C_Studios.
- Apertura de MD UTF-8 BOM/CRLF, edición de texto y nota. Renombrado externo mientras seguía abierto y apertura de la ruta nueva: una sola pestaña, contenido pendiente y nota conservados.
- Cierre abrupto deliberado únicamente con ese documento sintético: al reiniciar apareció el aviso de recuperación, el texto pendiente, la ruta nueva y la nota reciente.
- Guardado mediante el diálogo nativo de cierre «Cambios sin guardar» → Sí. Verificación de bytes: BOM UTF-8 y CRLF conservados, texto pendiente presente, sin nuevas copias .bak. El .bak antiguo de la prueba conservó su hash SHA-256.
- Reapertura: texto y nota persistidos, estado Guardado. Apertura adicional de TXT UTF-16 LE/CRLF en una segunda pestaña, contenido y codificación reconocidos.

Estos pasos se realizaron en la aplicación instalada. No se afirma haber recorrido nativamente todos los controles: la automatización de clics y captura de esa ventana reportó geometría/captura no disponible. Guardar como, exportación, búsqueda, temas y conflictos se verificaron con las pruebas de núcleo/interfaz; no se repitieron todos con diálogos nativos en esta entrega. Las capturas del paquete de evidencia proceden del puente de pruebas de interfaz y están identificadas como tales.

## Errores encontrados y corregidos

1. Abrir una ruta renombrada podía crear dos sesiones para la misma nota. Una sesión antigua podía sobrescribir la nota más reciente al guardar el cuerpo. Se reprodujo antes de cambiar código: las tres nuevas regresiones fallaron. Ahora se unifica por UUID, se actualiza la ruta sin reemplazar ediciones pendientes y se reconcilia la revisión de notas antes del guardado. Las tres pasan, incluida la variante con hardlink; una regresión TypeScript comprueba que no se pierde texto o nota aún no enviados.
2. El nuevo nombre visible podía crear una instalación paralela. La plantilla oficial NSIS conserva la identidad de instalación Pliegra y muestra SintaxTrama. La actualización real confirmó una sola instalación.
3. La desinstalación eliminaba asociaciones sin comprobar su propietario. Los hooks ahora comprueban el comando exacto del ejecutable; las pruebas aisladas conservan claves ajenas y retiran solo las propias.
4. Los artefactos previos no correspondían al último código. Se realizó una construcción final de producción y se instalaron sus resultados.

La revisión independiente inicial y sus fallos se conservan como antecedentes locales; no representan el resultado final posterior a las correcciones. También se conservaron los logs de pruebas que fallaron antes de corregir y las verificaciones posteriores.

## Integridad y límites

Se verificaron con pruebas: sustitución temporal segura, detección de cambios externos y carreras al reemplazar, retención de versiones desplazadas, recuperación rotativa/fallback corrupto/bloqueos, errores posteriores al guardado, migración de notas, Guardar como con identidad separada, exportación estructurada sin alterar el original, historial/selección de pestañas y descarte de revisiones ortográficas obsoletas.

La compilación mantiene una advertencia Vite por el bloque CodeMirror de 566,81 kB. No se oculta ni equivale a un error de compilación. No se ejecutaron Windows 11, una máquina limpia, todos los cortes de energía/discos llenos, NAS ni sesiones prolongadas de batería. Consulte RENDIMIENTO.md y PENDIENTES.md. La CI remota debe distinguirse de estas comprobaciones locales; su estado se consulta en GitHub.
