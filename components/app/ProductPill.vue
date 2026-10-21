<script setup lang="ts">
import { UI_LOCALE_STORAGE_KEY } from '~~/shared/i18n/locale'
import type { UiLocale } from '~~/shared/i18n/ui-copy'
import { ACTIVE_UI_LOCALE, uiText as t } from '~~/shared/i18n/ui-copy'

const emit = defineEmits<{ (e: 'restart'): void }>()

const colorMode = useColorMode()
const confirmOpen = ref(false)

let devtoolsObserver: MutationObserver | null = null
let retryTimer: number | null = null

const TENON_ACTIONS_ID = 'tenon-product-pill-actions'
const TENON_STYLE_ID = 'tenon-product-pill-style'

const sunIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
`
const moonIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20.99 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.78 9.79Z" />
  </svg>
`
const languageIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m5 8 6 6" />
    <path d="m4 14 6-6 2-3" />
    <path d="M2 5h12" />
    <path d="M7 2h1" />
    <path d="m22 22-5-10-5 10" />
    <path d="M14 18h6" />
  </svg>
`
const resetIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 2v6h6" />
    <path d="M3 13a9 9 0 1 0 3-6.7L3 8" />
  </svg>
`

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
  updateInjectedActions()
}

function setLocale(locale: UiLocale) {
  if (locale === ACTIVE_UI_LOCALE) return
  localStorage.setItem(UI_LOCALE_STORAGE_KEY, locale)
  window.location.reload()
}

function onRestartConfirm() {
  confirmOpen.value = false
  emit('restart')
}

function createIconButton(icon: string, ariaLabel: string, onClick: () => void, modifier?: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = modifier ? `tenon-product-pill-action ${modifier}` : 'tenon-product-pill-action'
  button.innerHTML = icon
  button.setAttribute('aria-label', ariaLabel)
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onClick()
  })
  return button
}

function ensureInjectedStyles(root: ShadowRoot) {
  const existingStyle = root.getElementById(TENON_STYLE_ID)
  const style = existingStyle ?? document.createElement('style')
  if (!existingStyle) {
    style.id = TENON_STYLE_ID
    root.append(style)
  }
  style.textContent = `
    .tenon-product-pill-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      padding-right: 2px;
    }

    .nuxt-devtools-panel:has(#tenon-product-pill-actions) .nuxt-devtools-label,
    .nuxt-devtools-panel:has(#tenon-product-pill-actions) > button.nuxt-devtools-icon-button.nuxt-devtools-panel-content {
      display: none !important;
    }

    .tenon-product-pill-action {
      height: 26px;
      width: 30px;
      border: 0;
      border-radius: 100px;
      background: transparent;
      color: var(--ui-text-dimmed, #86868b);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      opacity: 0.78;
      transition:
        opacity 0.2s ease-in-out,
        background-color 0.2s ease-in-out;
    }

    .tenon-product-pill-action:hover {
      background: rgba(0, 0, 0, 0.06);
      color: var(--ui-text-muted, #6e6e73);
      opacity: 1;
    }

    .tenon-product-pill-action svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .tenon-product-pill-action:focus-visible {
      outline: 2px solid rgba(17, 17, 17, 0.3);
      outline-offset: 1px;
    }

    .tenon-product-pill-action--danger {
      color: var(--ui-text-dimmed, #86868b);
    }

    .tenon-product-pill-action--danger:hover {
      color: var(--ui-text-toned, #424245);
    }
  `
}

function updateInjectedActions() {
  const frame = document.querySelector('nuxt-devtools-frame')
  const root = frame?.shadowRoot
  const panel = root?.querySelector('.nuxt-devtools-panel')
  if (!root || !panel) return false

  ensureInjectedStyles(root)
  root.getElementById(TENON_ACTIONS_ID)?.remove()

  const actions = document.createElement('div')
  actions.id = TENON_ACTIONS_ID
  actions.className = 'nuxt-devtools-panel-content tenon-product-pill-actions'

  const nextLocale: UiLocale = ACTIVE_UI_LOCALE === 'es' ? 'en' : 'es'

  actions.append(
    createIconButton(colorMode.value === 'dark' ? sunIcon : moonIcon, colorMode.value === 'dark' ? t('pillThemeLight') : t('pillThemeDark'), toggleTheme),
    createIconButton(languageIcon, `${t('pillLanguageAria')}: ${nextLocale.toUpperCase()}`, () => setLocale(nextLocale)),
    createIconButton(resetIcon, t('pillRestart'), () => {
      confirmOpen.value = true
    }, 'tenon-product-pill-action--danger'),
  )

  panel.append(actions)
  return true
}

function scheduleInject() {
  if (updateInjectedActions()) return
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = window.setTimeout(scheduleInject, 300)
}

onMounted(() => {
  scheduleInject()
  devtoolsObserver = new MutationObserver(scheduleInject)
  devtoolsObserver.observe(document.documentElement, { childList: true, subtree: true })
})

onBeforeUnmount(() => {
  if (retryTimer) clearTimeout(retryTimer)
  devtoolsObserver?.disconnect()
  document
    .querySelector('nuxt-devtools-frame')
    ?.shadowRoot
    ?.getElementById(TENON_ACTIONS_ID)
    ?.remove()
  document
    .querySelector('nuxt-devtools-frame')
    ?.shadowRoot
    ?.getElementById(TENON_STYLE_ID)
    ?.remove()
})
</script>

<template>
  <AppConfirmDialog
    v-model:open="confirmOpen"
    :title="t('pillRestartTitle')"
    :message="t('pillRestartMessage')"
    :confirm-label="t('pillRestart')"
    confirm-color="error"
    @confirm="onRestartConfirm"
  />
</template>
