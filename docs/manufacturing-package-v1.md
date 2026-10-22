# ManufacturingPackageV1

Fecha: 22 de octubre de 2026

`ManufacturingPackageV1` es la frontera de dominio entre el constructor paramétrico de Tenon y los futuros adaptadores CSV, XLSX, DXF o específicos de un fabricante. No es todavía una orden de producción ni un programa CNC.

## Garantías del contrato

- El paquete es inmutable, versionado y serializable como JSON canónico.
- La misma entrada produce exactamente los mismos bytes y los arrays se ordenan con comparación ordinal, independiente del idioma del sistema.
- Cada panel compilado se conserva como una instancia individual; no se agrupan ni eliminan piezas equivalentes.
- Cada operación compilada debe conservarse exactamente una vez y sin alteraciones en la pieza objetivo. Se compara la instantánea canónica completa, no solo su identificador: una operación perdida, duplicada, huérfana o con cara, coordenadas, profundidad, dimensiones, rotación, estado pasante, finalidad o validación distintos bloquea el paquete.
- Las dimensiones y operaciones salen en milímetros.
- Cada operación conserva tipo, pieza objetivo, cara, centro, profundidad, rotación y dimensiones disponibles.
- Los errores de ensamblaje y las carencias industriales se transportan como incidencias estructuradas.
- El modelo no depende de Vue ni de Three.js. La generación CSG visual vive separada en `shared/three/assembly-geometry.ts`.

## Identidad y trazabilidad

`instanceId` identifica una pieza dentro de una instantánea compilada. Su alcance se declara como `snapshot-local`: insertar o reordenar columnas puede cambiar IDs basados en índices, por lo que aún no debe usarse como etiqueta persistente entre revisiones.

`partId` identifica una definición de fabricación equivalente dentro del paquete. Se deriva de forma determinista de rol, dimensiones nominales, material, veta industrial, mano de puerta, caras, cantos y operaciones. Dos instancias pueden compartir `partId` sin dejar de aparecer por separado.

Cada pieza conserva `sourceModuleIds`. Las puertas también conservan `doorHinge` como intención de diseño preliminar.

## Sistema de coordenadas

- Sistema diestro.
- Origen de pieza en el centro del panel.
- `+x` recorre el ancho local hacia la derecha.
- `+y` recorre el alto local hacia arriba.
- Las operaciones se expresan en el plano local XY de la cara nombrada.
- Cara frontal y trasera comparten el mismo marco local sin invertir X. Al mirar la cara trasera desde fuera, la representación visual puede parecer reflejada.
- La profundidad positiva entra desde la cara nombrada hacia el panel.

Esta convención preserva el compilador actual. Antes de un postprocesador CNC habrá que mapearla a la esquina, cara apoyada, orientación y reglas de espejo acordadas con el taller.

## Precisión

La configuración y las dimensiones compiladas parten de la rejilla métrica actual de Tenon. La frontera convierte metros a milímetros y conserva hasta tres decimales de milímetro cuando los centros o posiciones resultan de mitades geométricas. Las rotaciones se expresan en grados con hasta seis decimales.

La validación de contención admite 0,5 mm, medio paso de la rejilla de 1 mm del compilador, para que el redondeo de una ranura que termina exactamente en un canto no produzca un falso error. Este margen es técnico y no sustituye las tolerancias de fabricación que acuerde el taller.

## Datos preliminares

El paquete separa explícitamente apariencia y fabricación:

- Los materiales actuales son selecciones visuales. Conservan preset, color, brillo y perfil de veta, pero `manufacturer`, `sku` y validación permanecen vacíos.
- `nominalThicknessMm` procede del diseño. `actualThicknessMm` queda en `null` hasta disponer de ficha o medición real del tablero.
- `visualGrainDirection` reproduce la orientación del render. `manufacturingGrainDirection` permanece `unspecified` hasta que el usuario o un perfil de taller la defina.
- Las cuatro aristas se conservan, pero su tratamiento y canteado permanecen `unspecified`.
- Los tiradores físicos se cuentan como selecciones visuales. No tienen SKU ni `drillingPatternId`.
- Todas las operaciones actuales se marcan `unvalidated`. Los taladros de tirador no se consideran compatibles con el tipo visual hasta que ambos deriven de un `HardwarePattern` real.

## Estado de fabricabilidad

`preliminary` significa que la geometría compiló pero todavía existen decisiones de taller pendientes. No autoriza fabricación.

`blocked` significa que el paquete no debe llegar a un exportador productivo. Actualmente se bloquea, como mínimo, cuando no hay piezas, el compilador informa un error, una operación compilada no se conserva exactamente y sin alteraciones, una operación carece de centro o cara válidos, sus dimensiones/profundidad no son coherentes con el tipo, o el mecanizado sale de la cara del panel.

Los avisos actuales dejan visibles las carencias de material industrial, veta, cantos, uniones, tiradores, bisagras y correderas. Un exportador futuro deberá rechazar paquetes `blocked` y declarar expresamente si admite paquetes `preliminary` solo para revisión.

## Próxima validación

1. Los seis proyectos golden ya cubren mueble abierto, baldas interiores, cajones, puertas simples/dobles y geometría escalonada mixta. Fijan bytes JSON, piezas, operaciones, herrajes e incidencias en la suite de Node/CI. Una prueba de inventario independiente contrasta panel por panel y campo por campo la salida cruda del compilador, el paquete y la agrupación de Corte.
2. Pendiente: ejecutar las mismas fixtures en navegador y contrastar sus bytes con Node/CI para cerrar la portabilidad entre runtimes.
3. Definir con un fabricante real material/SKU, canteado, sistema constructivo, tiradores, bisagras, correderas, tolerancias y convención CNC.
4. Fabricar y medir una probeta y un módulo piloto antes de habilitar exportación productiva.
