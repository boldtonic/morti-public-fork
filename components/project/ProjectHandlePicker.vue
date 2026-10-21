<script setup lang="ts">
import type { HandleFinish, HandleType, PublicStyle } from '~~/shared/domain/types'
import { HANDLE_FINISH_SPECS } from '~~/shared/domain/handles'
import { uiText as t } from '~~/shared/i18n/ui-copy'

interface Props {
  modelValue: PublicStyle['rendered']['handles']
  variant?: 'card' | 'row'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'card',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: PublicStyle['rendered']['handles']): void
}>()

const open = ref(false)

const handleTypes = computed<{ value: HandleType, label: string }[]>(() => [
  { value: 'auto', label: t('handleAuto') },
  { value: 'knob', label: t('handleKnob') },
  { value: 'square-knob', label: t('handleSquareKnob') },
  { value: 'bar', label: t('handleBar') },
  { value: 'square-bar', label: t('handleSquareBar') },
])

const handleFinishes = computed<{ value: HandleFinish, label: string, color: string }[]>(() => [
  { value: 'graphite', label: t('handleGraphite'), color: HANDLE_FINISH_SPECS.graphite.color },
  { value: 'nickel', label: t('handleNickel'), color: HANDLE_FINISH_SPECS.nickel.color },
  { value: 'brass', label: t('handleBrass'), color: HANDLE_FINISH_SPECS.brass.color },
])

const selectedTypeLabel = computed(() =>
  handleTypes.value.find(option => option.value === props.modelValue.type)?.label ?? t('handleAuto'),
)
const selectedFinish = computed(() =>
  handleFinishes.value.find(option => option.value === props.modelValue.finish) ?? handleFinishes.value[0]!,
)
const triggerLabel = computed(() => `${selectedTypeLabel.value} · ${selectedFinish.value.label}`)
const triggerPreviewClass = computed(() => handlePreviewClass(
  props.modelValue.type === 'auto' ? 'bar' : props.modelValue.type,
  true,
))

function handlePreviewClass(type: HandleType, compact = false): string {
  const prefix = compact ? 'handle-trigger' : 'handle-preview'
  if (type === 'knob') return `${prefix}-knob`
  if (type === 'square-knob') return `${prefix}-square-knob`
  if (type === 'square-bar') return `${prefix}-square-bar`
  return `${prefix}-bar`
}

function selectType(type: HandleType) {
  emit('update:modelValue', { ...props.modelValue, type })
}

function selectFinish(finish: HandleFinish) {
  emit('update:modelValue', { ...props.modelValue, finish })
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ side: 'top', align: 'center', sideOffset: 8, collisionPadding: 12 }"
    :ui="{ content: 'bg-transparent p-0 shadow-none ring-0 rounded-none overflow-visible' }"
  >
    <button
      v-if="variant === 'row'"
      type="button"
      class="flex h-[34px] w-full items-center justify-between gap-2 rounded-lg border border-default bg-default px-2.5 text-left text-xs text-muted transition-[background-color,border-color,transform] duration-150 hover:border-accented hover:bg-accented/40 active:scale-[0.98]"
      :aria-label="`${t('handles')}: ${triggerLabel}`"
    >
      <span class="min-w-0 truncate font-medium text-highlighted">{{ t('handles') }}</span>
      <span class="flex min-w-0 shrink items-center gap-2">
        <span
          class="size-4 shrink-0 rounded-full ring-1 ring-default/70"
          :style="{ backgroundColor: selectedFinish.color }"
        />
        <span class="max-w-36 truncate font-medium text-toned">{{ triggerLabel }}</span>
        <UIcon name="i-lucide-chevron-down" class="size-3.5 shrink-0 text-muted" />
      </span>
    </button>

    <button
      v-else
      type="button"
      class="flex w-full min-h-11 items-center gap-2.5 rounded-xl bg-default px-2 py-1.5 text-left shadow-sm ring-1 ring-default/60 transition-[box-shadow,transform] hover:ring-[color:color-mix(in_oklch,var(--color-morti-400)_40%,var(--ui-border))] active:scale-[0.99]"
      :aria-label="`${t('handles')}: ${triggerLabel}`"
    >
      <span class="handle-trigger-preview h-9 w-12 shrink-0 rounded-md ring-1 ring-default/70">
        <span
          :class="triggerPreviewClass"
          :style="{ '--handle-color': selectedFinish.color }"
        />
      </span>
      <span class="min-w-0 flex-1 leading-tight">
        <span class="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{{ t('handles') }}</span>
        <span class="block truncate text-xs font-semibold text-highlighted">{{ triggerLabel }}</span>
      </span>
      <UIcon name="i-lucide-chevron-down" class="size-3.5 shrink-0 text-muted" />
    </button>

    <template #content>
      <div class="handle-picker-popover scrollbar-thin">
        <div class="handle-picker-header">
          <p class="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {{ t('handles') }}
          </p>
          <p class="min-w-0 truncate text-right text-[10px] text-muted/80">
            {{ t('handleTypeAndFinish') }}
          </p>
        </div>

        <section>
          <p class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            {{ t('handleType') }}
          </p>
          <div class="handle-picker-grid grid grid-cols-2 gap-2">
            <button
              v-for="option in handleTypes"
              :key="option.value"
              type="button"
              class="handle-preset-card relative flex min-w-0 flex-col overflow-hidden rounded-xl bg-default text-left transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.96]"
              :class="[
                props.modelValue.type === option.value ? 'is-selected' : undefined,
                option.value === 'auto' ? 'col-span-2' : undefined,
              ]"
              :aria-label="option.label"
              :aria-pressed="props.modelValue.type === option.value"
              @click="selectType(option.value)"
            >
              <span class="handle-preview relative grid h-12 w-full place-items-center">
                <span
                  v-if="option.value === 'auto'"
                  class="handle-preview-auto"
                  :style="{ '--handle-color': selectedFinish.color }"
                >
                  <span class="handle-preview-knob" />
                  <span class="handle-preview-bar" />
                </span>
                <span
                  v-else
                  :class="handlePreviewClass(option.value)"
                  :style="{ '--handle-color': selectedFinish.color }"
                />
                <span
                  v-if="props.modelValue.type === option.value"
                  class="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-primary text-inverted shadow"
                  aria-hidden="true"
                >
                  <UIcon name="i-lucide-check" class="size-3" />
                </span>
              </span>
              <span
                class="truncate px-2 py-1.5 text-[10px] font-semibold leading-tight text-highlighted"
              >
                {{ option.label }}
              </span>
            </button>
          </div>
        </section>

        <section class="mt-3">
          <p class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            {{ t('handleFinish') }}
          </p>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="finish in handleFinishes"
              :key="finish.value"
              type="button"
              class="handle-finish-button flex min-w-0 items-center gap-2 rounded-lg bg-default px-2 py-2 text-left text-[10px] font-medium text-toned transition-[box-shadow,transform] active:scale-[0.97]"
              :class="props.modelValue.finish === finish.value ? 'is-selected' : undefined"
              :aria-label="finish.label"
              :aria-pressed="props.modelValue.finish === finish.value"
              @click="selectFinish(finish.value)"
            >
              <span
                class="size-4 shrink-0 rounded-full ring-1 ring-default/70"
                :style="{ backgroundColor: finish.color }"
              />
              <span class="truncate">{{ finish.label }}</span>
            </button>
          </div>
        </section>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.handle-picker-popover {
  box-sizing: border-box;
  isolation: isolate;
  width: min(20rem, calc(100vw - 1.5rem), var(--reka-popover-content-available-width, calc(100vw - 1.5rem)));
  max-height: min(28rem, calc(100dvh - 1.5rem), var(--reka-popover-content-available-height, calc(100dvh - 1.5rem)));
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: 18px;
  background: color-mix(in oklch, var(--ui-bg-muted) 97%, transparent);
  padding: 12px;
  box-shadow:
    0 22px 56px rgb(0 0 0 / 0.36),
    0 7px 18px rgb(0 0 0 / 0.2),
    inset 0 0 0 1px color-mix(in oklch, var(--ui-border) 82%, transparent);
  backdrop-filter: blur(12px);
}

.handle-picker-header {
  position: sticky;
  top: -12px;
  z-index: 2;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: -12px -12px 8px;
  border-radius: 18px 18px 0 0;
  background: color-mix(in oklch, var(--ui-bg-muted) 97%, transparent);
  padding: 12px 13px 10px;
  backdrop-filter: blur(12px);
}

.handle-trigger-preview,
.handle-preview {
  background: color-mix(in oklch, var(--ui-bg-accented) 58%, var(--ui-bg));
}

.handle-trigger-preview {
  position: relative;
  display: grid;
  place-items: center;
}

.handle-trigger-bar,
.handle-trigger-square-bar,
.handle-preview-bar,
.handle-preview-square-bar {
  position: relative;
  display: block;
  width: 30px;
  height: 5px;
  background: var(--handle-color);
  box-shadow:
    0 2px 4px rgb(0 0 0 / 0.28),
    inset 0 1px 0 rgb(255 255 255 / 0.22);
}

.handle-trigger-bar,
.handle-preview-bar {
  border-radius: 999px;
}

.handle-trigger-square-bar,
.handle-preview-square-bar {
  border-radius: 2px;
}

.handle-trigger-bar,
.handle-trigger-square-bar {
  width: 28px;
  height: 4px;
}

.handle-trigger-knob,
.handle-trigger-square-knob,
.handle-preview-knob,
.handle-preview-square-knob {
  display: block;
  width: 13px;
  height: 13px;
  background: var(--handle-color);
  box-shadow:
    0 2px 4px rgb(0 0 0 / 0.3),
    inset 0 1px 0 rgb(255 255 255 / 0.3);
}

.handle-trigger-knob,
.handle-preview-knob {
  border-radius: 50%;
}

.handle-trigger-square-knob,
.handle-preview-square-knob {
  border-radius: 3px;
}

.handle-preview-auto {
  display: flex;
  align-items: center;
  gap: 8px;
}

.handle-preset-card {
  box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--ui-border-muted) 82%, transparent);
}

.handle-preset-card:hover {
  box-shadow:
    inset 0 0 0 1px color-mix(in oklch, var(--ui-primary) 38%, var(--ui-border-muted)),
    0 8px 20px rgb(0 0 0 / 0.18);
}

.handle-preset-card:focus-visible {
  outline: 2px solid color-mix(in oklch, var(--ui-primary) 62%, transparent);
  outline-offset: 2px;
}

.handle-preset-card.is-selected {
  box-shadow:
    inset 0 0 0 2px var(--ui-primary),
    0 10px 24px rgb(0 0 0 / 0.22);
}

.handle-finish-button {
  box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--ui-border-muted) 82%, transparent);
}

.handle-finish-button:hover {
  box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--ui-primary) 38%, var(--ui-border-muted));
}

.handle-finish-button.is-selected {
  box-shadow: inset 0 0 0 2px var(--ui-primary);
}

@media (max-width: 359.98px) {
  .handle-picker-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
