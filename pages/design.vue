<script setup lang="ts">
import { getThemeColorTokens } from '~~/composables/useThemeColors'
import { uiText as t } from '~~/shared/i18n/ui-copy'

// --- Modal / slideover open state ---
const modalOpen = ref(false)
const slideoverOpen = ref(false)

// --- Input demo state ---
const projectName = ref(t('designSampleProjectName'))
const notes = ref(t('designSampleNotes'))
const snapToGrid = ref(true)
const showDimensions = ref(false)
const units = ref('mm')
const autosave = ref(true)
const search = ref('')
const disabledValue = ref(t('readOnlyValue'))

const unitItems = [
  { label: t('millimeters'), value: 'mm' },
  { label: t('inches'), value: 'in' },
]

// --- Showcase data ---
const buttonVariants = ['solid', 'outline', 'soft', 'ghost', 'link'] as const
const buttonColors = ['primary', 'neutral', 'error', 'success'] as const
const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const
const badgeVariants = ['solid', 'outline', 'soft', 'subtle'] as const
const badgeColors = ['primary', 'neutral', 'secondary', 'success', 'info', 'warning', 'error'] as const

// --- Theme groups computed ---
const themeGroups = computed(() => {
  const tokens = getThemeColorTokens()
  const map = new Map<string, typeof tokens>()
  for (const t of tokens) {
    const arr = map.get(t.group) ?? []
    arr.push(t)
    map.set(t.group, arr)
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }))
})

function toHex(num: number): string {
  return `#${num.toString(16).padStart(6, '0')}`
}
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <div class="mb-8 sm:mb-10">
      <h1 class="text-3xl font-bold tracking-tight text-balance text-highlighted sm:text-4xl">
        {{ t('designSystem') }}
      </h1>
      <p class="mt-2 max-w-2xl text-pretty text-muted">
        {{ t('designSystemDescription') }}
      </p>
    </div>

    <div class="flex flex-col gap-6 sm:gap-10">
      <!-- 1. Typography -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            {{ t('typography') }}
          </h2>
        </template>
        <div class="space-y-3">
          <h1 class="text-4xl font-bold text-balance text-highlighted">
            {{ t('headingOne') }}
          </h1>
          <h2 class="text-3xl font-bold text-balance text-highlighted">
            {{ t('headingTwo') }}
          </h2>
          <h3 class="text-2xl font-semibold text-highlighted">
            {{ t('headingThree') }}
          </h3>
          <h4 class="text-xl font-semibold text-highlighted">
            {{ t('headingFour') }}
          </h4>
          <h5 class="text-lg font-semibold text-highlighted">
            {{ t('headingFive') }}
          </h5>
          <h6 class="text-base font-semibold text-highlighted">
            {{ t('headingSix') }}
          </h6>
          <p class="text-pretty text-default">
            {{ t('bodyParagraphSample') }}
          </p>
          <p class="text-pretty text-muted">
            {{ t('mutedTextSample') }}
          </p>
          <p class="text-sm text-dimmed">
            {{ t('dimmedTextSample') }}
          </p>
          <div class="prose dark:prose-invert max-w-none">
            <p>
              {{ t('proseSample') }}
            </p>
          </div>
        </div>
      </UCard>

      <!-- 2. Theme colors -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            {{ t('themeColors') }}
          </h2>
        </template>
        <div class="max-h-[70vh] space-y-10 overflow-y-auto pr-1">
          <section
            v-for="grp in themeGroups"
            :key="grp.group"
          >
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              {{ grp.group }}
            </h3>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div
                v-for="tok in grp.items"
                :key="tok.name"
                class="rounded-xl bg-elevated p-3 shadow-sm"
              >
                <div
                  class="mb-2 h-11 w-full rounded-lg ring-1 ring-inset ring-default"
                  :style="{ backgroundColor: `var(${tok.cssVar})` }"
                />
                <p class="font-medium text-highlighted">
                  {{ tok.name }}
                </p>
                <p class="mt-1 break-all font-mono text-[11px] leading-snug text-muted">
                  var({{ tok.cssVar }})
                </p>
                <p class="mt-1 font-mono text-[11px] tabular-nums text-dimmed">
                  {{ toHex(tok.current.hex) }} · {{ tok.current.rgbCss }}
                </p>
              </div>
            </div>
          </section>
        </div>
      </UCard>

      <!-- 3. Buttons -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            {{ t('buttons') }}
          </h2>
        </template>
        <div class="space-y-8">
          <div
            v-for="variant in buttonVariants"
            :key="variant"
            class="space-y-3"
          >
            <p class="text-sm font-medium capitalize text-muted">
              {{ variant }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="color in buttonColors"
                :key="`${variant}-${color}`"
                :variant="variant"
                :color="color"
                :label="t('action')"
              />
            </div>
          </div>
          <div class="space-y-3">
            <p class="text-sm font-medium text-muted">
              {{ t('sizes') }}
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                v-for="size in sizes"
                :key="size"
                :size="size"
                :label="t('size')"
              />
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              icon="i-lucide-plus"
              :label="t('withIcon')"
            />
            <UButton
              loading
              :label="t('loading')"
            />
            <UButton
              disabled
              :label="t('disabled')"
            />
          </div>
        </div>
      </UCard>

      <!-- 4. Inputs & controls -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            {{ t('inputsControls') }}
          </h2>
        </template>
        <div class="grid max-w-xl gap-6">
          <UFormField
            :label="t('projectName')"
            :description="t('projectListDescription')"
          >
            <UInput
              v-model="projectName"
              :placeholder="t('exampleProjectPlaceholder')"
            />
          </UFormField>
          <UFormField :label="t('search')">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              :placeholder="t('filterProjectsPlaceholder')"
            />
          </UFormField>
          <UFormField :label="t('disabled')">
            <UInput
              v-model="disabledValue"
              disabled
            />
          </UFormField>
          <UFormField :label="t('notesField')">
            <UTextarea
              v-model="notes"
              :rows="4"
              autoresize
            />
          </UFormField>
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <UCheckbox
              v-model="snapToGrid"
              :label="t('snapToGrid')"
            />
            <UCheckbox
              v-model="showDimensions"
              :label="t('showDimensions')"
            />
          </div>
          <UFormField :label="t('units')">
            <URadioGroup
              v-model="units"
              :items="unitItems"
              orientation="horizontal"
            />
          </UFormField>
          <div class="flex items-center gap-3">
            <USwitch
              v-model="autosave"
              :label="t('enableAutosave')"
            />
          </div>
        </div>
      </UCard>

      <!-- 5. Modal & slideover -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            {{ t('modalSlideover') }}
          </h2>
        </template>
        <div class="flex flex-wrap gap-2">
          <UButton
            :label="t('openDialog')"
            @click="modalOpen = true"
          />
          <UButton
            :label="t('openSlideover')"
            color="neutral"
            variant="outline"
            @click="slideoverOpen = true"
          />
        </div>

        <AppDialog
          v-model:open="modalOpen"
          :title="t('deleteProjectTitle')"
          :description="t('deleteProjectDemoDescription')"
        >
          <p class="text-pretty text-sm text-muted">
            {{ t('optionalBodyCopy') }}
          </p>
          <template #footer="{ close }">
            <div class="flex justify-end gap-2">
              <UButton
                :label="t('cancel')"
                color="neutral"
                variant="ghost"
                @click="close()"
              />
              <UButton
                :label="t('delete')"
                color="error"
                @click="close()"
              />
            </div>
          </template>
        </AppDialog>

        <USlideover
          v-model:open="slideoverOpen"
          :title="t('inspector')"
          :description="t('inspectorDescription')"
          side="right"
        >
          <template #body>
            <p class="text-pretty text-sm text-muted">
              {{ t('slideoverDemoContent') }}
            </p>
          </template>
          <template #footer="{ close }">
            <UButton
              class="w-full justify-center"
              :label="t('done')"
              @click="close()"
            />
          </template>
        </USlideover>
      </UCard>

      <!-- 6. Badges -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            {{ t('badges') }}
          </h2>
        </template>
        <div class="space-y-6">
          <div
            v-for="variant in badgeVariants"
            :key="variant"
            class="space-y-2"
          >
            <p class="text-sm font-medium capitalize text-muted">
              {{ variant }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="color in badgeColors"
                :key="`${variant}-${color}`"
                :variant="variant"
                :color="color"
                :label="color"
              />
            </div>
          </div>
        </div>
      </UCard>

      <!-- 7. Alerts -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            {{ t('alerts') }}
          </h2>
        </template>
        <div class="space-y-4">
          <UAlert
            icon="i-lucide-info"
            color="info"
            :title="t('autosave')"
            :description="t('autosaveDescription')"
          />
          <UAlert
            icon="i-lucide-triangle-alert"
            color="warning"
            :title="t('unsavedChanges')"
            :description="t('unsavedChangesDescription')"
          />
          <UAlert
            icon="i-lucide-circle-check"
            color="success"
            :title="t('exportComplete')"
            :description="t('exportCompleteDescription')"
          />
          <UAlert
            icon="i-lucide-circle-x"
            color="error"
            :title="t('couldNotSave')"
            :description="t('couldNotSaveDescription')"
          />
        </div>
      </UCard>

      <!-- 8. Card layout -->
      <UCard>
        <template #header>
          <h2 class="text-balance text-lg font-semibold text-highlighted">
            {{ t('cardLayout') }}
          </h2>
        </template>
        <UCard class="ring ring-default">
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-highlighted">{{ t('nestedCard') }}</span>
              <UBadge
                :label="t('wip')"
                color="warning"
                variant="subtle"
              />
            </div>
          </template>
          <p class="text-pretty text-sm text-muted">
            {{ t('typicalCardDescription') }}
          </p>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                :label="t('secondary')"
                color="neutral"
                variant="ghost"
                size="sm"
              />
              <UButton
                :label="t('primary')"
                size="sm"
              />
            </div>
          </template>
        </UCard>
      </UCard>
    </div>
  </UContainer>
</template>
