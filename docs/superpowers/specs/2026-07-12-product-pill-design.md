# Pill de producto — diseño v1

Fecha: 2026-07-12
Estado: validado con fer (brainstorm en sesión Claude)

## Objetivo

Sustituir el hueco que hoy ocupa la cápsula de Nuxt DevTools (solo visible en desarrollo) por un menú flotante de producto propio, abajo al centro del lienzo 3D del editor. Es el punto de encuentro entre el constructor visual y el resto del producto/negocio: hoy preferencias y accesos rápidos; mañana enlaces a landing, redes y otros productos (+madera).

## Alcance v1

- Visible **solo en el editor** (`/project/:id`), anclado abajo al centro del pane del lienzo 3D.
- Acciones: **Tema** (claro/oscuro), **Idioma** (ES/EN), **Reiniciar proyecto**, **Inicio**.
- Escritorio y móvil, sobre lienzo claro y oscuro.

### Fuera de alcance v1

- Switcher a +madera y enlaces de negocio (landing, redes). El diseño deja sitio, pero no se construye nada — ni fila de "próximamente".
- Presencia en home o páginas públicas `/p/:id`.
- Página/modal "sobre la empresa".

## UX — modelo híbrido con expansión en línea

Tres estados, siempre en una sola fila horizontal (sin menú vertical):

1. **Colapsado**: cápsula con la marca (monograma). Discreta, como la de DevTools.
2. **Nivel 1** (hover en escritorio con retardo ~150 ms para no saltar de pasada; clic o tap también lo abre y lo fija): la cápsula crece en línea mostrando los conmutadores rápidos — **Tema** (icono sol/luna) e **Idioma** (segmented ES|EN) — y un botón **"···"**.
3. **Nivel 2** (clic/tap en "···"): la fila sigue creciendo en línea; "···" se sustituye por **Reiniciar proyecto** (tinte de error al hover) e **Inicio**.

Cierre: al salir el cursor (si se abrió por hover) o tap/clic fuera (si se fijó). Al cerrar vuelve a colapsado (nivel 2 no queda memorizado).

### Visual

- Superficie `--ui-bg-elevated` con sombra suave y hairline ring, coherente con los botones que ya flotan sobre el canvas.
- Debe leerse bien sobre lienzo claro y oscuro (los proyectos antiguos conservan fondos oscuros persistidos).
- Transición de anchura suave (~200 ms, propiedades GPU-friendly según el patrón ya establecido en `assets/css/main.css`).

### Móvil

- Tap abre nivel 1; el resto igual.
- En móvil (breakpoint existente de 767.98px), el nivel 2 muestra las acciones solo-icono (aria-label siempre); la seguridad de "Reiniciar" la da el diálogo de confirmación, no la etiqueta.
- No colisiona con el asa del divisor (vive dentro del pane 3D; el asa, en el borde entre panes).

### Accesibilidad

- El pill colapsado es un botón focusable; Enter abre nivel 1; Escape cierra.
- `aria-label` en todas las acciones; `focus-visible` según el patrón global existente.

## Comportamiento de cada acción

| Acción | Comportamiento |
|---|---|
| Tema | Escribe la preferencia vía `useColorMode()` (ya configurado, storage `tenon-color-mode`). Efecto inmediato. |
| Idioma | Persiste `tenon-locale` en `localStorage` y **recarga la página**. Sin reactividad nueva. |
| Reiniciar proyecto | Abre confirmación con `AppDialog` (destructivo). Al confirmar, reemplaza el documento por el estado por defecto vía la ruta Yjs existente (`replaceFurnitureDoc` + doc por defecto). No toca nombre ni id del proyecto. |
| Inicio | Navega a `/`. |

## Cambios técnicos

- **Nuevo** `components/app/ProductPill.vue` — el pill completo (estados, expansión, acciones). Montado desde `pages/project/[id].vue`.
- **`shared/i18n/ui-copy.ts`**: `ACTIVE_UI_LOCALE` deja de ser literal fijo y se inicializa al cargar el módulo desde `localStorage` (`tenon-locale`), validando contra los locales disponibles, con fallback `'es'` y guarda para entornos sin `localStorage`. La app es SPA (`ssr: false`), así que no hay riesgo de hidratación.
- Copys nuevos del pill añadidos a `ui-copy.ts` en ES y EN (incluida la confirmación de reinicio).
- **Sin cambios** en Nuxt DevTools: su cápsula es arrastrable y recuerda posición; en dev se aparta una vez a mano.

## Verificación

- `npm run typecheck` limpio.
- Checklist manual en navegador (escritorio + viewport móvil): estados colapsado/nivel 1/nivel 2, hover con retardo, fijado por clic, cierre por fuera/Escape, tema inmediato, idioma con recarga y persistencia, reinicio con confirmación y cancelación, inicio navega, legibilidad sobre lienzo claro y oscuro.
- Si vitest ya está montado al implementarse: test unitario del resolutor de locale inicial (valores válidos, inválidos, ausentes).

## Futuro (documentado, no construido)

- Entradas de negocio: web, redes, +madera — nuevas acciones en nivel 2 o un nivel propio.
- Presencia en home/páginas públicas si el pill demuestra su valor en el editor.
