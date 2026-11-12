# Rendimiento medido — 0.1.6

Mediciones del 12 de noviembre de 2026 en HP, Intel i5-8265U, 4 núcleos/8 procesadores lógicos, Windows 10 x64, 11,89 GiB de RAM utilizable. No son garantías para otros equipos.

## Comparación controlada del editor

Edge sin interfaz: mismo arnés y documentos, editor/caché 0.1.5 frente al adaptador final. Dieciséis documentos de 172.032 unidades UTF-16, doce ediciones por documento. Una pasada de calentamiento descartada por variante, tres rondas medidas alternadas, GC explícito, sin compilación nativa concurrente. Se preservan contenido, selección e historial: no se obtiene la reducción descartando ediciones.

| Métrica | Anterior | Final |
|---|---:|---:|
| Mediana de heap JS retenido adicional | 14,075 MiB | 12,599 MiB |
| Mediana del recorrido | 737,3 ms | 714,1 ms |
| Rango de tiempo observado | 675,2–843,3 ms | 630,1–926,7 ms |

**10,48 % menos heap retenido**, aproximadamente 1,48 MiB en esta carga. El tiempo mediano baja 3,15 %, pero los rangos se superponen: no demuestra una aceleración global ni una mejora estadística. El editor activo conserva su runtime y quince pestañas inactivas conservan snapshots sin parser/DOM/callbacks activos. El heap JavaScript no representa toda la RAM de la aplicación.

## Aplicación nativa instalada

Proceso raíz más descendientes WebView2, cero documentos abiertos, aplicación ya inicializada. Treinta muestras durante aproximadamente 30 segundos, tras calentamiento de 5 segundos. CPU normalizada respecto a los ocho procesadores lógicos. USS es memoria física privada; sumar RSS duplica páginas compartidas y no debe confundirse con memoria exclusiva.

| Métrica media | 0.1.5 | 0.1.6 |
|---|---:|---:|
| CPU del equipo | 0,057 % | 0,668 % |
| USS | 102,27 MiB | 95,36 MiB |
| USS / RAM física | 0,840 % | 0,783 % |
| RSS sumada | 361,78 MiB | 347,37 MiB |
| Memoria privada comprometida | 161,36 MiB | 153,11 MiB |
| Lecturas de proceso | 1,78 KiB/s | 10,73 KiB/s |
| Escrituras de proceso | 2,67 KiB/s | 51,30 KiB/s |

La CPU y la actividad de E/S observadas aumentaron en la muestra nueva. No se afirma mejora global de CPU; WebView2, cachés y procesos de fondo afectan las muestras, y un único par no aísla causalidad. Las cifras de E/S incluyen operaciones de proceso y no equivalen exclusivamente a disco físico. Se conservan las muestras previas de arranque por separado; no se usan para fingir una comparación estable favorable.

En el primer arranque medido de 0.1.6 el proceso renderer apareció a los 449 ms. Esto no mide el primer fotograma, disponibilidad de escritura ni latencia de apertura de un archivo. La construcción completa tardó aproximadamente 8 min 26 s con Cargo y esbuild limitados a un trabajador. No se midieron temperatura, GPU, batería ni percentiles de interacción nativa prolongada.

El texto y el historial completos siguen retenidos por diseño; documentos grandes y muchos deshacer aumentan memoria. La recuperación todavía serializa texto/base completos. Estas son oportunidades futuras, no funciones eliminadas para mejorar una cifra. Los scripts de comparación usan rutas/URL configurables; los datos medidos se incluyen en el paquete de evidencias.
