# Tenon v0.1: auditoria profunda y ruta hacia fabricacion

Fecha: 21 de octubre de 2026

Version auditada: `v0.1.0` (`916041c`)

Alcance: producto, UX de visual builder, modelo parametrico, despiece, fabricacion, persistencia local/cloud y verificabilidad.

## Resumen ejecutivo

Tenon v0.1 ya es un producto funcional y coherente como configurador visual: permite construir muebles parametricos, editar modulos, aplicar materiales, visualizar herrajes, obtener un despiece preliminar y trabajar con proyectos locales, cloud, publicacion y remix.

Todavia no es una fuente de verdad suficiente para fabricar. La distancia no esta principalmente en exportar un CSV o un DXF. Esta en definir, preservar y verificar la informacion industrial que esos formatos deberian transportar: material y referencia comercial, veta, caras, cantos, sistema constructivo, herrajes exactos, operaciones completas, referencias de mecanizado y reglas de validacion.

La recomendacion central es:

1. Corregir primero dos riesgos de confianza: snapshots publicos y propiedad de proyectos locales.
2. Crear un contrato versionado de proyecto completo y otro de paquete de fabricacion.
3. Hacer que visualizacion, despiece y mecanizado deriven de la misma definicion de material, herraje y union.
4. Elegir con un fabricante un sistema constructivo y una familia concreta de herrajes.
5. Solo entonces implementar exportadores ajustados al flujo real de ese taller.

No se recomienda empezar por un DXF generico ni por taladros genericos de bisagra, espiga o excentrica. Ambos producirian una apariencia de madurez industrial sin garantizar piezas fabricables.

## Evidencia revisada

La auditoria se ha hecho sobre material primario, no sobre una descripcion ya resumida:

- Codigo y esquemas de dominio de `v0.1.0`.
- Compilador de montaje, despiece, catalogo de herrajes y operaciones.
- Persistencia local, sincronizacion cloud, publicacion, snapshots y remix.
- Interfaz real en navegador en vistas Diseno y Corte.
- Suite automatizada: 54 tests en 9 ficheros, todos superados.
- `npm run typecheck`, superado.
- Guia externa facilitada por el propietario, contrastada contra el estado actual.
- Documentacion primaria de Autodesk, HOMAG y Blum para no asumir que DXF o un patron de taladro son universales.

El arbol de trabajo no se modifico durante la investigacion. Este informe no implementa los cambios propuestos.

## Diagnostico de madurez

| Nivel | Estado | Evidencia necesaria |
| --- | --- | --- |
| Configurador visual util | Alcanzado | Flujo Diseno/Estilo/Corte funcional y probado manualmente |
| Modelo parametrico consistente | Parcial | Faltan invariantes de ensamblaje, material y herrajes en proyectos completos |
| Despiece tecnicamente consistente | Parcial | Paneles y algunas operaciones existen, pero se pierde informacion al agrupar y presentar |
| Paquete interpretable por taller | No alcanzado | No existe contrato industrial versionado ni exportacion validada |
| Validado por fabricante | No alcanzado | Falta taller objetivo, software objetivo y muestras de importacion |
| Validado fisicamente | No alcanzado | Faltan probetas, prototipo y tolerancias medidas |

La etiqueta correcta hoy es: **preview de producto v0.1 con despiece preliminar**, no configurador listo para produccion.

## Revision critica de la guia recibida

### Lo que la guia acierta

- No existe una exportacion de fabricacion en CSV/XLSX/DXF.
- No hay un modelo explicito de cantos, cara de referencia o direccion de veta.
- No hay operaciones de union entre paneles ni mecanizado real de bisagras y correderas.
- Los codigos y la agrupacion de paneles estan duplicados en varios puntos.
- Es necesario validar el flujo con un taller real antes de declarar fabricabilidad.
- Un conjunto de proyectos dorados es imprescindible para proteger el compilador.

### Lo que ha quedado obsoleto

- La guia afirma que casi no hay tests. En `v0.1.0` hay 54 tests y pasan. El problema actual no es ausencia total, sino falta de cobertura del ensamblaje completo, agrupacion del despiece, simetrias y resultados dorados.
- La guia afirma que las operaciones no tienen coordenadas. `PanelOperation` ya contiene coordenadas locales y el compilador las genera para tiradores y ranuras. Lo que falta es una convencion industrial completa y evitar que la UI y la agrupacion pierdan esos datos.
- La guia reviso una revision anterior, no la etiqueta `v0.1.0`; por eso algunas conclusiones no describen el producto actual.

### Lo que debe corregirse conceptualmente

- Usar metros internamente no es un defecto por si mismo. Es una decision valida para geometria 3D. El limite industrial debe convertir a milimetros, aplicar tolerancias y cuantizar de forma determinista.
- DXF R12 no define por si solo herramienta, profundidad, cara de referencia, sujecion ni semantica CNC. Autodesk lo define como un intercambio de entidades y capas; la interpretacion de fabricacion depende del software receptor y de una convencion acordada.
- HOMAG, por ejemplo, ofrece importacion DXF dentro de un flujo especifico de software CNC. Eso confirma que hay que probar el pipeline concreto, no asumir interoperabilidad universal.
- Un taladro de cazoleta de 35 mm tampoco basta para definir una bisagra. La familia, placa, recubrimiento, distancia al borde y patron de fijacion dependen del herraje exacto. Las tablas de Blum muestran esa dependencia.
- Pasar el repositorio a privado puede ser una decision comercial razonable, pero no demuestra correccion industrial. Debe tratarse como gobierno de IP y cumplimiento de licencia, no como un fix tecnico del producto.

Fuentes primarias:

- [Autodesk: Writing a DXF File](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-5D1DFE5C-94FC-43B7-B535-43001D1662C1.htm)
- [Autodesk: version AC1009 / R12](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm)
- [HOMAG: software CNC y flujo DXF](https://www.homag.com/fileadmin/software/brochures/cnc/Software-CNC-en.pdf)
- [Blum: referencia tecnica de bisagras](https://d2.blum.com/services/BEC003/hingequickref_td_dok_bus_%24sen-us_%24aof_%24v1.pdf)

## Los diez fixes prioritarios

### 1. P0 - Impedir contenido activo en snapshots publicos

**Hallazgo**

La API acepta el `Content-Type` enviado en un snapshot y el endpoint publico lo devuelve directamente. Un cliente malicioso puede publicar contenido HTML y hacer que se sirva desde el mismo origen. `nosniff` no protege cuando el tipo declarado ya es `text/html`.

**Evidencia**

- `server/api/projects/[id]/snapshot.put.ts`
- `server/api/projects/[id]/publish.post.ts`
- `server/api/public/projects/[id]/snapshot.get.ts`
- `server/middleware/security-headers.ts`

**Correccion minima**

- Validar que el cuerpo es un snapshot Yjs aceptable antes de almacenarlo o publicarlo.
- Ignorar el tipo suministrado por el cliente.
- Servir snapshots siempre como `application/octet-stream` y con una politica de descarga segura.
- Anadir CSP defensiva para las superficies publicas, sin usarla como sustituto de la validacion.

**Aceptacion**

- Un snapshot valido sigue pudiendo abrirse y remixarse.
- Un cuerpo HTML o un snapshot invalido recibe error y nunca se sirve como documento ejecutable.
- Una prueba de integracion demuestra el comportamiento en ambos casos.

### 2. P0 - Aislar proyectos locales y hacer fiable su procedencia

**Hallazgo**

Los proyectos locales no tienen propietario. En un navegador compartido, otra cuenta puede verlos y sincronizarlos. La restauracion cloud no hidrata claramente la home local. La sincronizacion sustituye snapshots completos sin control de version concurrente. Un cliente antiguo puede resucitar un proyecto borrado. Escrituras con debounce pueden quedar pendientes al cerrar o publicar.

**Evidencia**

- `shared/domain/types.ts`
- `composables/useCloudAutosync.ts`
- `composables/useDesignDoc.ts`
- `server/api/projects/index.post.ts`
- endpoints de snapshot y borrado de proyecto.

**Correccion minima**

- Separar proyectos anonimos, locales por usuario y cloud por propietario.
- Hidratar y reconciliar cloud de forma explicita al iniciar sesion.
- Anadir revision/ETag o protocolo de merge en servidor; no usar last-write-wins silencioso.
- Tratar borrados como tombstones versionadas.
- Forzar flush antes de publicar, navegar o cerrar cuando sea posible.
- Restringir el bypass de autenticacion de desarrollo a entorno y host local inequivocos.

**Aceptacion**

- Dos cuentas en el mismo navegador no ven ni suben proyectos de la otra.
- Dos clientes concurrentes no pierden cambios en silencio.
- Un proyecto borrado no reaparece desde un cliente desactualizado.
- Publicar inmediatamente despues de editar publica el estado visible.

El aislamiento entre cuentas y el bypass son P0. La resolucion completa de concurrencia puede entregarse despues dentro del mismo contrato de sincronizacion, pero no debe quedar indefinida.

### 3. P0 - Versionar un `ProjectBundle` completo y portable

**Hallazgo**

La geometria, el estilo publico y otros metadatos viven en rutas distintas. La exportacion `.morti`, importacion, duplicado y remix no preservan necesariamente el mismo producto que ve el usuario.

**Evidencia**

- `shared/domain/types.ts`
- `shared/yjs/morti-format.ts`
- `composables/useLocalProjects.ts`
- `pages/p/[id].vue`

**Correccion minima**

Definir `ProjectBundleV2` con:

- version de esquema;
- documento parametrico;
- estilo/materiales;
- configuracion de tiradores y herrajes;
- unidades y metadatos relevantes;
- migracion explicita desde el formato actual.

Duplicar, importar, exportar, publicar, remixar y restaurar desde cloud deben usar este mismo limite.

**Aceptacion**

- Un proyecto con materiales y tiradores personalizados pasa por cada ruta y conserva exactamente geometria y apariencia.
- Un bundle viejo migra de forma determinista.
- Un bundle de version futura falla con un mensaje claro, sin corromper el proyecto local.

### 4. P0 - Definir `ManufacturingPackageV1` antes de exportar ficheros

**Hallazgo**

El despiece actual es una vista derivada para personas, no un contrato industrial estable. Implementar CSV o DXF directamente desde la UI fijaria accidentalmente un formato incompleto.

**Correccion minima**

Crear un modelo inmutable y versionado, separado de Vue y Three.js, con al menos:

- identificador estable de pieza e instancia;
- dimensiones finales en mm;
- material/SKU y espesor nominal/real;
- direccion de veta;
- caras y cuatro cantos;
- sistema de coordenadas y cara de referencia;
- operaciones completas, no agrupadas de forma destructiva;
- herrajes y cantidades;
- incidencias y estado de fabricabilidad;
- origen y version del proyecto.

Los exportadores futuros consumiran este paquete, no componentes de interfaz.

**Aceptacion**

- El mismo proyecto produce bytes JSON identicos en ejecuciones repetidas.
- Todo panel compilado tiene identidad estable y trazabilidad hasta su modulo.
- Ninguna operacion pierde coordenadas, profundidad, rotacion o cara al pasar al paquete.

**Estado 2026-10-22**

Implementado como contrato preliminar e inmutable. El paquete conserva cada panel y operacion, usa JSON canonico y milimetros, declara coordenadas de cara, separa identidad de pieza e instancia, y transporta materiales, caras, cantos, herrajes e incidencias sin fingir referencias industriales inexistentes. Espesor real, veta industrial, canteado, SKU y patrones de herraje permanecen explicitamente sin resolver. Los taladros actuales se marcan no validados y un dato de operacion sin centro o cara bloquea el paquete. La especificacion vive en `docs/manufacturing-package-v1.md`.

Pendiente para completar la evidencia de aceptacion: proyectos golden compartidos entre Node, navegador y CI, y validacion fisica con un fabricante.

### 5. P0 - Unificar visual y mecanizado de tiradores mediante patrones de herraje

**Hallazgo**

El compilador genera dos taladros para un tirador. La visualizacion de pomo promedia ambos puntos y dibuja una sola pieza. Ademas, el diametro por defecto de taladro es 25 mm, impropio para la fijacion comun de un tirador. El mueble puede verse correcto y producir mecanizados equivocados.

**Evidencia**

- `shared/domain/defaults.ts`
- `shared/domain/assembly.ts`
- `shared/domain/hardware-catalog.ts`
- `components/three/DesignerCanvas.vue`

**Correccion minima**

Cada opcion de tirador debe referenciar un `HardwarePattern` versionado que defina:

- familia y SKU opcional;
- representacion visual;
- numero de fijaciones;
- separacion entre centros;
- diametro y profundidad;
- reglas de posicion y orientacion;
- pieza y cara objetivo.

El modelo 3D y las operaciones deben derivar del mismo patron.

**Aceptacion**

- Un pomo produce una fijacion y una barra produce su patron real de dos o mas fijaciones.
- Cambiar tipo, orientacion o posicion actualiza visual y mecanizado de forma atomica.
- Tests dorados comprueban el patron exacto en puerta y cajon.

### 6. P0 - Elegir un sistema constructivo y modelar un grafo de uniones

**Hallazgo**

Tenon conoce paneles que se tocan, pero no por que ni como se unen. Sin un sistema constructivo no se pueden deducir taladros de espiga, excentrica, tornillo, trasera, bisagra o corredera de forma responsable.

**Correccion minima**

- Seleccionar con el primer fabricante un perfil constructivo inicial.
- Definir juntas entre roles de panel, no taladros aislados.
- Asociar a cada junta un patron mecanico, tolerancias, herrajes y reglas de exclusion.
- Incorporar estabilidad, carga, pandeo, anclaje y riesgo de vuelco como validaciones del producto, no solo de exportacion.

**Aceptacion**

- Cada contacto estructural se clasifica o se marca explicitamente como no resuelto.
- El BOM y las operaciones se derivan del mismo grafo de uniones.
- Un fabricante revisa y firma el perfil inicial.
- Una probeta y un modulo piloto montan sin correcciones manuales no documentadas.

### 7. P1 - Introducir material industrial, veta, caras y cantos

**Hallazgo**

El acabado visual no define todavia la especificacion de compra o mecanizado. La agrupacion de paneles tampoco considera material, veta o cantos, por lo que piezas industrialmente distintas pueden parecer iguales.

**Correccion minima**

Separar:

- acabado visual;
- material industrial/SKU;
- espesor nominal y espesor real;
- direccion de veta por panel;
- cara A/cara B;
- canto superior, inferior, izquierdo y derecho, con material y espesor.

Incluir estos campos en identidad, agrupacion, render, BOM y paquete de fabricacion.

**Aceptacion**

- Dos paneles con geometria igual pero veta, material o canteado distinto no se agrupan.
- La orientacion visual de la veta coincide con la orientacion declarada.
- El despiece muestra y exporta la especificacion completa sin inferencias manuales.

### 8. P1 - Formalizar coordenadas locales y eliminar agrupacion destructiva

**Hallazgo**

`PanelOperation` ya contiene coordenadas, pero la tabla de Corte no las muestra y su clave de agrupacion omite campos como coordenadas, profundidad o rotacion. Operaciones diferentes pueden colapsarse como si fueran la misma.

**Evidencia**

- `shared/domain/types.ts`
- `shared/domain/cutlist.ts`
- `components/project/ProjectCutlist.vue`
- `components/project/ProjectCutlistPanelGrid.vue`

**Correccion minima**

- Definir origen, ejes, cara de referencia y transformacion por rol de panel.
- Normalizar y cuantizar en mm en el limite de fabricacion.
- Crear una unica funcion de identidad de panel y operacion.
- Mostrar coordenadas y referencia suficientes para auditar cada operacion.
- Agrupar solo despues de demostrar equivalencia industrial completa.

**Aceptacion**

- Operaciones espejo conservan el signo/orientacion correctos.
- Cambiar cualquier parametro industrial relevante cambia la identidad de agrupacion.
- La tabla permite rastrear cada operacion a una instancia de panel concreta.

### 9. P1 - Una sola canalizacion de validacion, visible y bloqueante

**Hallazgo**

Hay validaciones solapadas en el compilador y en la UI. Corte calcula incidencias pero no las presenta. Diseno oculta incidencias de modulos no seleccionados. Algunos mensajes siguen codificados en ingles. La seleccion multiple permite editar en lote, pero el boton de borrado actua de forma distinta.

**Evidencia**

- `shared/domain/assembly.ts`
- `shared/domain/assembly-validation.ts`
- `components/project/ProjectDesigner.vue`
- `components/project/ProjectCutlist.vue`

**Correccion minima**

- Unificar codigos de incidencia y severidades en dominio.
- Separar `design-valid`, `manufacturable` y `manufacturer-validated`.
- Mostrar un resumen global persistente y enlaces al modulo/panel afectado.
- Bloquear exportacion industrial ante errores, pero permitir guardar y seguir editando.
- Hacer coherentes edicion y borrado multiseleccionados.
- Traducir mensajes desde codigos, no desde strings del compilador.

**Aceptacion**

- La misma incidencia aparece con el mismo codigo en Diseno, Corte y paquete industrial.
- Ningun error desaparece por cambiar la seleccion.
- Una accion bloqueada explica que falta y como localizarlo.
- Tests de interaccion cubren multiseleccion, borrado y navegacion al error.

### 10. P1 - Construir una matriz de pruebas doradas e invariantes

**Hallazgo**

Los 54 tests actuales protegen piezas importantes, pero no fijan el resultado completo del compilador ni del despiece. No hay suficiente evidencia para detectar regresiones de simetria, agrupacion o mecanizado.

**Correccion minima**

Crear proyectos dorados en JSON independiente y expectativas en mm para:

1. carcasa minima;
2. composicion escalonada de tres columnas;
3. baldas interiores con medidas impares y limites;
4. puertas izquierda, derecha y doble con los tres modos de tirador;
5. cajonera de tres cajones;
6. casos invalidos, simetrias y piezas geometricamente iguales pero industrialmente distintas.

Anadir invariantes y pruebas de propiedad:

- dimensiones positivas y finitas;
- operaciones contenidas en la cara objetivo;
- no solapamiento invalido de operaciones;
- suma y colocacion coherentes de huecos y paneles;
- determinismo de IDs, agrupacion y salida;
- round-trip de bundle y migraciones.

**Aceptacion**

- Cada golden compara paneles, operaciones, herrajes, incidencias y paquete completo.
- Una mutacion deliberada de coordenada, material o patron hace fallar el test correcto.
- La suite se ejecuta sin navegador y los flujos criticos se complementan con tests de interaccion.

## Orden de ejecucion recomendado

### Fase 0 - Confianza inmediata

1. Corregir snapshots publicos.
2. Aislar proyectos locales por identidad y endurecer el bypass de desarrollo.
3. Anadir las pruebas de regresion de ambos riesgos.

Esta fase es pequena en superficie, pero debe ir antes de nuevas capacidades publicas o de compartir demos ampliamente.

### Fase 1 - Contratos y pruebas

1. `ProjectBundleV2` y migracion.
2. `ManufacturingPackageV1` en JSON.
3. Convencion de coordenadas, IDs y agrupacion.
4. Seis proyectos dorados.
5. Canalizacion unica de validacion.

Esta fase convierte el comportamiento actual en algo medible y evita que las siguientes decisiones industriales queden enterradas en componentes UI.

**Estado 2026-10-22:** completada para el contrato preliminar. `ProjectBundleV2` y `ManufacturingPackageV1` son versionados y deterministas; Corte consume una única proyección industrial que conserva coordenadas y parámetros completos; Diseño reutiliza la validación del compilador; seis proyectos dorados fijan paquetes, piezas, operaciones, herrajes e incidencias. La validación de fabricante sigue siendo el gate pendiente, no una propiedad que el software pueda asumir.

### Fase 2 - Producto industrial minimo

1. Taller y software objetivo.
2. Materiales/SKU, veta y cantos.
3. Una familia de tiradores validada.
4. Una familia de bisagras y una de correderas.
5. Un sistema constructivo y su grafo de uniones.
6. BOM y operaciones derivados de esas mismas definiciones.

El objetivo no es soportar todos los muebles. Es soportar una configuracion estrecha, explicita y fiable.

### Fase 3 - Exportadores del taller objetivo

1. Exportacion tabular desde `ManufacturingPackageV1`.
2. Exportacion geometrica o CNC segun el software real del fabricante.
3. Importacion de muestra en el software del taller.
4. Comparacion visual y numerica de cada pieza y operacion.

CSV, XLSX, DXF u otro formato son adaptadores de salida. La eleccion se hace aqui, no antes.

### Fase 4 - Evidencia fisica

1. Probeta de material, canto y taladros.
2. Modulo simple con una puerta y un cajon.
3. Montaje sin correcciones ocultas.
4. Registro de tolerancias, incidencias y cambios de proceso.
5. Segundo ciclo de fabricacion que confirme la correccion.

## Metodos y herramientas profesionales

### Modelo y software

- Domain-driven design para separar proyecto, ensamblaje, fabricacion y presentacion.
- JSON Schema o equivalente para contratos versionados y migraciones.
- IDs deterministas basados en semantica industrial, no en orden visual accidental.
- Golden master tests para paquetes completos.
- Property-based testing para invariantes geometricos.
- Matriz de compatibilidad entre formato exportado, software CAM/CNC y version.
- Fixtures independientes de la UI, expresadas en milimetros.

### Fabricacion

- Design for Manufacture and Assembly (DFMA).
- Revision conjunta con ebanista, ingeniero de producto u operador CNC.
- Fichas tecnicas del fabricante de cada herraje.
- Probetas de taladro, canteado y ajuste antes del mueble completo.
- First Article Inspection: comparar primera pieza producida contra el paquete esperado.
- Registro de tolerancias nominales, medidas y observadas.

### UX de visual builder

- Pruebas de tareas, no solo inspeccion visual: crear, modificar, diagnosticar y preparar un mueble.
- Estados explicitos de validez y fabricabilidad.
- Trazabilidad bidireccional: seleccionar en 2D/3D/despiece y llegar a la misma pieza.
- Prevencion de errores antes de confirmaciones o mensajes posteriores.
- Revision responsive de Corte; actualmente sus tablas y reparto fijo no forman un flujo movil robusto.

## Que demostraria que el resultado es correcto

Ni la opinion del propietario ni la del agente son criterio suficiente. La evidencia debe venir de cuatro capas:

1. **Software:** contratos versionados, tests dorados, invariantes, migraciones y ausencia de perdida en round-trip.
2. **Interoperabilidad:** el taller abre el paquete sin repararlo manualmente y confirma paneles, orientaciones, cantos y operaciones.
3. **Metrologia:** una probeta y una primera pieza coinciden con las cotas y tolerancias acordadas.
4. **Montaje:** el prototipo ensambla, funciona y permanece estable con los herrajes definidos.

Una exportacion que abre no demuestra fabricabilidad. Un render que parece correcto tampoco. El gate se supera cuando diseno, paquete, pieza fabricada y montaje cuentan la misma historia.

## Gates de producto propuestos

### Gate A - Technically consistent

- Bundle portable sin perdida.
- Compilacion determinista.
- Materiales, caras, cantos, veta y operaciones completas.
- Cero errores bloqueantes en validacion.
- Goldens e invariantes en verde.

### Gate B - Manufacturer validated

- Perfil de fabricante y software registrado.
- Formato importado y revisado por el taller.
- Herrajes y sistema constructivo firmados.
- Probeta aceptada con tolerancias documentadas.

### Gate C - Physically tested

- Primer articulo medido.
- Modulo piloto ensamblado y funcional.
- Incidencias incorporadas al modelo o al proceso.
- Segunda fabricacion repetible.

Solo despues del Gate C deberia aparecer una afirmacion comercial equivalente a "listo para fabricar".

## Recomendacion CTO para el siguiente bloque

No iniciar el siguiente sprint con "exportar DXF". El bloque correcto es:

1. hotfix de snapshots publicos;
2. `ProjectBundleV2`;
3. `ManufacturingPackageV1` en JSON;
4. goldens del compilador;
5. reunion tecnica con un fabricante local para fijar software, material, cantos, herrajes y sistema constructivo.

Con esto Tenon ganara algo mas importante que una nueva opcion visible: una linea verificable entre lo que el usuario disena y lo que un taller puede fabricar. A partir de ahi, CSV, XLSX, DXF o el formato CNC adecuado dejan de ser apuestas y pasan a ser adaptadores controlados.
