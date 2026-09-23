# Carga de equipos y resultados

## Uso

- Con una cuenta administradora, abrí un torneo y elegí **Agregar varios equipos**. Pegá un nombre por línea, seleccioná opcionalmente un grupo y revisá la lista antes de guardar. Se omiten nombres repetidos, incluso si cambian acentos o mayúsculas. La lista se guarda en una sola operación; los logos se pueden agregar después desde la edición individual.
- Elegí **Ir a cargar resultados** y luego **Cargar resultado** en el partido. Completá ambos marcadores y revisá el ganador antes de guardar. La sección de máximos anotadores es opcional.
- Si falla el guardado, los datos permanecen en el formulario. El botón queda bloqueado mientras se guarda.

## Alcance

Se mantienen las funciones existentes de posiciones, desempates, grupos y avance de playoffs. No se cambian las reglas de dos puntos por victoria y uno por derrota. La carga por lista utiliza la misma colección y los mismos campos de los equipos existentes; no requiere migración.

La detección de equipos repetidos utiliza la lista cargada en pantalla. No garantiza exclusividad entre dos administradores que agreguen simultáneamente el mismo equipo, igual que la carga individual existente.

## Verificación

- `npm run build`: compila correctamente; Vite advierte sobre el tamaño del paquete principal.
- `node --test src/lib/carga.test.js`: validación de resultados, nombres repetidos y puntuación existente.
- `npm run lint`: la versión original presenta cinco errores de variables/funciones sin uso y una advertencia de dependencias de un hook en `Torneo.jsx`.

Para probar el flujo completo, configurar las variables `VITE_FIREBASE_*` usadas en `src/firebase.js` en un archivo `.env.local`, ejecutar `npm run dev` e iniciar sesión con una cuenta administradora. Usar un torneo de prueba: verificar carga por lista, edición de marcadores, guardado con un solo anotador y eliminación de anotadores al editar. Verificar en un teléfono que los formularios permitan completar y guardar todos los campos.

Los cambios están preparados localmente. No se publicaron ni se modificaron datos de torneos remotos.
