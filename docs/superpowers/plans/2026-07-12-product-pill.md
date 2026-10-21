# Pill de Producto v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menú flotante de producto abajo al centro del lienzo 3D del editor: tema (claro/oscuro), idioma (ES/EN), reiniciar proyecto y volver al inicio, con modelo híbrido de expansión en línea.

**Architecture:** Componente autocontenido `ProductPill.vue` montado en el pane de preview de `pages/project/[id].vue`. El idioma se resuelve al arrancar desde `localStorage` (la app es SPA, `ssr: false`) y cambiar idioma recarga la página; el tema usa el `useColorMode` ya configurado; reiniciar delega en la página, que reemplaza el documento Yjs con `replaceFurnitureDoc`.

**Tech Stack:** Nuxt 4 / Vue 3 (auto-imports con `pathPrefix: false`), Nuxt UI (`UButton`, `UIcon`), Yjs vía helpers existentes, vitest (nuevo, mínimo).

**Spec:** `docs/superpowers/specs/2026-07-12-product-pill-design.md`

> **AVISO CRÍTICO — working tree compartido:** la rama lleva trabajo de paleta sin commitear que NO es de este plan. En cada commit, `git add` SOLO los ficheros listados en la tarea. Jamás `git add -A`, `git add .` ni `git commit -a`.
>
> **PREREQUISITO BLOQUEANTE:** `shared/i18n/ui-copy.ts` y `pages/project/[id].vue` tienen cambios de paleta sin commitear. Aunque el `git add` sea por fichero, arrastraría esos cambios al commit del pill. Antes de ejecutar las Tareas 2-5, el trabajo de paleta pendiente debe estar commiteado (acordado con fer: dos commits — paleta/UI y fix de geometría de assembly). Verificar con `git status` que esos dos ficheros están limpios antes de empezar.

---

## Tarea 1: vitest mínimo + resolutor de locale (TDD)

**Files:**
- Modify: `package.json` (script `test` + devDependency `vitest`)
- Create: `vitest.config.ts`
- Create: `tests/i18n/locale.test.ts`
- Create: `shared/i18n/locale.ts`

- [ ] **Paso 1: Instalar vitest**

Run: `npm install -D vitest`

- [ ] **Paso 2: Añadir script de test a package.json**

En `package.json`, dentro de `"scripts"`, tras `"typecheck": "nuxt typecheck"`:

```json
    "typecheck": "nuxt typecheck",
    "test": "vitest run"
```

- [ ] **Paso 3: Crear vitest.config.ts en la raíz**

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Paso 4: Escribir el test que falla — `tests/i18n/locale.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { resolveInitialLocale } from '~~/shared/i18n/locale'

describe('resolveInitialLocale', () => {
  it('devuelve el locale guardado cuando es válido', () => {
    expect(resolveInitialLocale('en')).toBe('en')
    expect(resolveInitialLocale('es')).toBe('es')
  })

  it('cae a "es" con valores inválidos o ausentes', () => {
    expect(resolveInitialLocale(null)).toBe('es')
    expect(resolveInitialLocale(undefined)).toBe('es')
    expect(resolveInitialLocale('fr')).toBe('es')
    expect(resolveInitialLocale('')).toBe('es')
  })
})
```

- [ ] **Paso 5: Verificar que falla**

Run: `npm run test`
Expected: FAIL — `Cannot find module '~~/shared/i18n/locale'` (o equivalente).

- [ ] **Paso 6: Implementar `shared/i18n/locale.ts`**

```ts
/** Locale de UI persistido. Vive en fichero propio (sin dependencias de ui-copy)
 *  para que ui-copy pueda importarlo sin ciclos. */
export const UI_LOCALE_STORAGE_KEY = 'tenon-locale'

export const UI_LOCALES = ['en', 'es'] as const
export type SupportedUiLocale = typeof UI_LOCALES[number]

export function resolveInitialLocale(stored: string | null | undefined): SupportedUiLocale {
  return UI_LOCALES.includes(stored as SupportedUiLocale)
    ? stored as SupportedUiLocale
    : 'es'
}
```

- [ ] **Paso 7: Verificar que pasa**

Run: `npm run test`
Expected: PASS (2 tests).

- [ ] **Paso 8: Commit (solo estos ficheros)**

```bash
git add package.json package-lock.json vitest.config.ts tests/i18n/locale.test.ts shared/i18n/locale.ts
git commit -m "test: vitest mínimo + resolutor de locale persistido"
```

---

## Tarea 2: ACTIVE_UI_LOCALE se inicializa desde localStorage

**Files:**
- Modify: `shared/i18n/ui-copy.ts:4`

- [ ] **Paso 1: Sustituir la constante fija**

En `shared/i18n/ui-copy.ts`, la línea 4 actual:

```ts
export const ACTIVE_UI_LOCALE = 'es' as const
```

pasa a (el import se añade junto a los imports de tipos de las líneas 1-2):

```ts
import { resolveInitialLocale, UI_LOCALE_STORAGE_KEY } from '~~/shared/i18n/locale'

export const ACTIVE_UI_LOCALE: UiLocale = resolveInitialLocale(
  typeof localStorage === 'undefined' ? null : localStorage.getItem(UI_LOCALE_STORAGE_KEY),
)
```

Notas:
- `UiLocale` se declara más abajo en el mismo fichero (`export type UiLocale = keyof typeof uiCopy`, ~línea 612); usar un tipo antes de su declaración es válido en TS a nivel de módulo.
- La guarda `typeof localStorage === 'undefined'` protege el código compartido si algún día se importa desde el server.

- [ ] **Paso 2: Typecheck y tests**

Run: `npm run typecheck && npm run test`
Expected: ambos limpios. `ACTIVE_UI_LOCALE` era `'es' as const` y ahora es `'en' | 'es'`; si el typecheck se queja en algún uso que asumía el literal `'es'`, ese uso se corrige tipándolo como `UiLocale` (no se esperan casos: los usos existentes son parámetros por defecto tipados `UiLocale`).

- [ ] **Paso 3: Commit**

```bash
git add shared/i18n/ui-copy.ts
git commit -m "feat(i18n): locale activo persistido en localStorage"
```

---

## Tarea 3: copys del pill (EN + ES)

**Files:**
- Modify: `shared/i18n/ui-copy.ts` (objetos `en` y `es` de `uiCopy`)

- [ ] **Paso 1: Añadir claves al bloque `en`**

Dentro de `uiCopy.en`, junto a las claves genéricas del principio (tras `confirm: 'Confirm',`):

```ts
    pillMenuAria: 'Product menu',
    pillMoreAria: 'More actions',
    pillThemeAria: 'Switch to {mode} theme',
    pillThemeLight: 'Light',
    pillThemeDark: 'Dark',
    pillLanguageAria: 'Language',
    pillRestart: 'Restart project',
    pillRestartTitle: 'Restart project?',
    pillRestartMessage: 'This clears the current design: columns, modules and settings go back to factory defaults. The project name is kept.',
```

- [ ] **Paso 2: Añadir las mismas claves al bloque `es`**

En la posición equivalente de `uiCopy.es`:

```ts
    pillMenuAria: 'Menú de producto',
    pillMoreAria: 'Más acciones',
    pillThemeAria: 'Cambiar a tema {mode}',
    pillThemeLight: 'claro',
    pillThemeDark: 'oscuro',
    pillLanguageAria: 'Idioma',
    pillRestart: 'Reiniciar proyecto',
    pillRestartTitle: '¿Reiniciar el proyecto?',
    pillRestartMessage: 'Se vacía el diseño actual: columnas, módulos y ajustes vuelven a los valores de fábrica. El nombre del proyecto se mantiene.',
```

Notas:
- Para "Inicio/Home" se reutiliza la clave existente `home` (DRY).
- `pillThemeAria` usa el reemplazo `{mode}` que `uiText` ya soporta (`uiText(key, { mode: ... })`).
- No afirmar en el mensaje de confirmación si se puede deshacer o no: no está verificado el comportamiento del UndoManager con `replaceFurnitureDoc`.

- [ ] **Paso 3: Typecheck**

Run: `npm run typecheck`
Expected: limpio (las claves nuevas existen en ambos locales, el tipo `UiCopyKey` las recoge).

- [ ] **Paso 4: Commit**

```bash
git add shared/i18n/ui-copy.ts
git commit -m "feat(i18n): copys del pill de producto en EN y ES"
```

---

## Tarea 4: componente ProductPill.vue

**Files:**
- Create: `components/app/ProductPill.vue`

Con `pathPrefix: false` en `nuxt.config.ts`, el componente se usa como `<ProductPill>`. `AppConfirmDialog` (existente) se auto-importa igual.

- [ ] **Paso 1: Crear el componente completo**

```vue
<script setup lang="ts">
import { UI_LOCALE_STORAGE_KEY } from '~~/shared/i18n/locale'
import type { UiLocale } from '~~/shared/i18n/ui-copy'
import { ACTIVE_UI_LOCALE, uiText as t } from '~~/shared/i18n/ui-copy'

const emit = defineEmits<{ (e: 'restart'): void }>()

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const themeAriaLabel = computed(() =>
  t('pillThemeAria', { mode: isDark.value ? t('pillThemeLight') : t('pillThemeDark') }),
)

/** 0 = colapsado, 1 = tema+idioma+"···", 2 = todo en línea */
const level = ref<0 | 1 | 2>(0)
const pinned = ref(false)
const confirmOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)

let hoverTimer: ReturnType<typeof setTimeout> | null = null

function onPointerEnter(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => {
    if (level.value === 0) level.value = 1
  }, 150)
}

function onPointerLeave(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  if (!pinned.value && !confirmOpen.value) level.value = 0
}

function onMarkClick() {
  pinned.value = true
  if (level.value === 0) level.value = 1
}

function collapse() {
  pinned.value = false
  level.value = 0
}

function onDocumentPointerDown(event: PointerEvent) {
  if (confirmOpen.value) return
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) collapse()
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !confirmOpen.value && level.value > 0) collapse()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  if (hoverTimer) clearTimeout(hoverTimer)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

function setLocale(locale: UiLocale) {
  if (locale === ACTIVE_UI_LOCALE) return
  localStorage.setItem(UI_LOCALE_STORAGE_KEY, locale)
  window.location.reload()
}

function onRestartConfirm() {
  confirmOpen.value = false
  collapse()
  emit('restart')
}
</script>

<template>
  <div
    ref="rootRef"
    class="product-pill pointer-events-auto flex items-center rounded-full bg-elevated shadow-md ring-1 ring-default/50"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
  >
    <button
      type="button"
      class="flex size-8 shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.95]"
      :aria-label="t('pillMenuAria')"
      :aria-expanded="level > 0"
      @click="onMarkClick"
    >
      <span class="flex size-6 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-inverted">T</span>
    </button>

    <div
      class="product-pill-items flex items-center gap-1 overflow-hidden"
      :class="level > 0 ? 'product-pill-items--open' : ''"
    >
      <template v-if="level > 0">
        <UButton
          :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
          size="xs"
          color="neutral"
          variant="ghost"
          class="rounded-full transition-transform active:scale-[0.95]"
          :aria-label="themeAriaLabel"
          @click="toggleTheme"
        />

        <span
          class="flex rounded-full bg-muted p-0.5"
          role="group"
          :aria-label="t('pillLanguageAria')"
        >
          <button
            type="button"
            class="min-h-6 rounded-full px-2 text-[11px] font-semibold transition-colors"
            :class="ACTIVE_UI_LOCALE === 'es' ? 'bg-elevated text-highlighted shadow-sm' : 'text-muted hover:text-highlighted'"
            :aria-pressed="ACTIVE_UI_LOCALE === 'es'"
            @click="setLocale('es')"
          >
            ES
          </button>
          <button
            type="button"
            class="min-h-6 rounded-full px-2 text-[11px] font-semibold transition-colors"
            :class="ACTIVE_UI_LOCALE === 'en' ? 'bg-elevated text-highlighted shadow-sm' : 'text-muted hover:text-highlighted'"
            :aria-pressed="ACTIVE_UI_LOCALE === 'en'"
            @click="setLocale('en')"
          >
            EN
          </button>
        </span>

        <UButton
          v-if="level === 1"
          icon="i-lucide-ellipsis"
          size="xs"
          color="neutral"
          variant="ghost"
          class="rounded-full transition-transform active:scale-[0.95]"
          :aria-label="t('pillMoreAria')"
          @click="level = 2"
        />

        <template v-else>
          <UButton
            icon="i-lucide-rotate-ccw"
            size="xs"
            color="error"
            variant="ghost"
            class="rounded-full transition-transform active:scale-[0.95]"
            :aria-label="t('pillRestart')"
            @click="confirmOpen = true"
          >
            <span class="hidden md:inline">{{ t('pillRestart') }}</span>
          </UButton>
          <UButton
            icon="i-lucide-house"
            size="xs"
            color="neutral"
            variant="ghost"
            to="/"
            class="rounded-full transition-transform active:scale-[0.95]"
            :aria-label="t('home')"
          >
            <span class="hidden md:inline">{{ t('home') }}</span>
          </UButton>
        </template>
      </template>
    </div>

    <AppConfirmDialog
      v-model:open="confirmOpen"
      :title="t('pillRestartTitle')"
      :message="t('pillRestartMessage')"
      :confirm-label="t('pillRestart')"
      confirm-color="error"
      @confirm="onRestartConfirm"
    />
  </div>
</template>

<style scoped>
.product-pill {
  padding: 4px;
}

.product-pill-items {
  max-width: 0;
  opacity: 0;
  transition: max-width 0.22s ease, opacity 0.18s ease, margin-left 0.22s ease;
}

.product-pill-items--open {
  max-width: 26rem;
  opacity: 1;
  margin-left: 4px;
}
</style>
```

Notas de diseño ya decididas en el spec (no re-decidir aquí):
- Hover solo con ratón (`pointerType === 'mouse'`); en táctil todo es por tap.
- Nivel 2 no se memoriza: cerrar siempre vuelve a colapsado.
- En móvil las acciones de nivel 2 son solo-icono (`hidden md:inline` en la etiqueta).
- El diálogo de confirmación bloquea el cierre por puntero/Escape mientras está abierto (`confirmOpen` en las guardas).

- [ ] **Paso 2: Typecheck**

Run: `npm run typecheck`
Expected: limpio.

- [ ] **Paso 3: Commit**

```bash
git add components/app/ProductPill.vue
git commit -m "feat(ui): componente ProductPill con expansión en línea"
```

---

## Tarea 5: montaje en el editor + acción de reinicio

**Files:**
- Modify: `pages/project/[id].vue`

- [ ] **Paso 1: Ampliar imports**

En `pages/project/[id].vue`, la línea 3 actual:

```ts
import { DEFAULT_CAMERA_STATE, normalizePublicStyle } from '~~/shared/domain/defaults'
```

pasa a:

```ts
import { DEFAULT_CAMERA_STATE, DEFAULT_FURNITURE_CONFIG, normalizePublicStyle } from '~~/shared/domain/defaults'
```

y se añade junto al import de `exportDoc` (línea 5):

```ts
import { replaceFurnitureDoc } from '~~/shared/yjs/doc'
```

- [ ] **Paso 2: Handler de reinicio**

En el `<script setup>`, junto a los handlers de proyecto existentes (después de `function onSplitRatioUpdate` está bien):

```ts
function onPillRestart() {
  if (!docRef.value) return
  replaceFurnitureDoc(docRef.value as any, {
    config: { ...DEFAULT_FURNITURE_CONFIG },
    columns: [],
  })
}
```

(El cast `as any` sigue el patrón ya usado en este fichero para `docRef` — ver `:ydoc="(docRef as any)"`.)

- [ ] **Paso 3: Montar el pill en el pane de preview**

En el template, dentro de `<div class="relative h-full min-h-0 w-full">` (línea ~774, el contenedor del canvas), justo después de `<LazyProjectCutlistPanelGrid ... />`:

```html
                <ProductPill
                  v-if="docRef"
                  class="absolute bottom-3 left-1/2 z-20 -translate-x-1/2"
                  @restart="onPillRestart"
                />
```

- [ ] **Paso 4: Typecheck y tests**

Run: `npm run typecheck && npm run test`
Expected: limpios.

- [ ] **Paso 5: Commit**

```bash
git add pages/project/\[id\].vue
git commit -m "feat(editor): pill de producto en el lienzo con reinicio de proyecto"
```

---

## Tarea 6: verificación en navegador

**Files:** ninguno (solo verificación).

Servidor: usar el dev server existente en `127.0.0.1:3003` (config `tenon-dev` de `.claude/launch.json`).

- [ ] **Paso 1: Escritorio — estados y cierre**

Abrir un proyecto. Verificar: pill colapsado abajo-centro del lienzo; hover ~150 ms abre nivel 1 (tema + ES|EN + "···"); "···" pasa a nivel 2 (reiniciar + inicio, con etiquetas); mover el ratón fuera sin haber hecho clic → colapsa; clic en la T lo fija y entonces solo cierra con clic fuera o Escape.

- [ ] **Paso 2: Tema**

Toggle de tema: cambio inmediato claro↔oscuro, persiste tras recargar (storage `tenon-color-mode`).

- [ ] **Paso 3: Idioma**

Cambiar a EN: la página recarga y la UI sale en inglés; `localStorage['tenon-locale'] === 'en'`. Volver a ES.

- [ ] **Paso 4: Reiniciar**

Con un diseño con columnas: Reiniciar → diálogo de confirmación → Cancelar no toca nada; Confirmar vacía columnas (estado "Sin columnas todavía") manteniendo el nombre del proyecto, y el 3D queda vacío.

- [ ] **Paso 5: Inicio**

"Inicio" navega al tablero `/`.

- [ ] **Paso 6: Móvil (viewport 375px)**

Tap abre nivel 1; nivel 2 muestra solo iconos; el pill no colisiona con el asa del divisor; tap fuera cierra.

- [ ] **Paso 7: Ambos fondos de lienzo**

Verificar legibilidad del pill sobre lienzo claro (proyecto nuevo) y oscuro (proyecto con fondo oscuro persistido o tema oscuro).

- [ ] **Paso 8: Typecheck final**

Run: `npm run typecheck && npm run test`
Expected: limpios. No hay commit en esta tarea (no cambia código); si la verificación destapa fixes, cada fix se commitea con los ficheros exactos tocados.
