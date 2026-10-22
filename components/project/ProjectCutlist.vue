<script setup lang="ts">
import type * as Y from 'yjs'
import { buildManufacturingCutlist } from '~~/shared/domain/manufacturing-cutlist'
import { createManufacturingPackage } from '~~/shared/domain/manufacturing-package'
import type { PanelRole, PublicStyle } from '~~/shared/domain/types'
import { faceText, operationText, orientationText, panelRoleText, uiText as t } from '~~/shared/i18n/ui-copy'
import { readFurnitureDoc } from '~~/shared/yjs/doc'

interface Props {
  ydoc: Y.Doc
  publicStyle?: PublicStyle | null
  selectedDrawingKey?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  publicStyle: null,
  selectedDrawingKey: null,
})

const emit = defineEmits<{
  (e: 'update:selectedDrawingKey', value: string | null): void
}>()

const snapshot = ref(readFurnitureDoc(props.ydoc))

function refreshSnapshot() {
  snapshot.value = readFurnitureDoc(props.ydoc)
}

function onDocUpdate() {
  refreshSnapshot()
}

watch(
  () => props.ydoc,
  (next, prev) => {
    prev?.off('update', onDocUpdate)
    next?.on('update', onDocUpdate)
    refreshSnapshot()
  },
  { immediate: true },
)

if (getCurrentScope()) {
  onScopeDispose(() => {
    props.ydoc?.off('update', onDocUpdate)
  })
}

const manufacturingPackage = computed(() => createManufacturingPackage({
  furniture: snapshot.value,
  publicStyle: props.publicStyle,
}))
const cutlist = computed(() => buildManufacturingCutlist(manufacturingPackage.value))
const panelRows = computed(() => cutlist.value.panelGroups)
const operationRows = computed(() => cutlist.value.operationGroups)
const errorCount = computed(() => cutlist.value.issues.filter(issue => issue.severity === 'error').length)
const warningCount = computed(() => cutlist.value.issues.filter(issue => issue.severity === 'warning').length)
const groupIdByPartId = computed(() => new Map(panelRows.value.map(row => [row.partId, row.groupId])))

function isSelectedRow(row: (typeof panelRows.value)[number]) {
  return props.selectedDrawingKey === row.key || props.selectedDrawingKey === row.groupId
}

watch([panelRows, () => props.selectedDrawingKey], ([rows]) => {
  const selected = props.selectedDrawingKey
  if (selected && !rows.some(row => row.key === selected || row.groupId === selected)) {
    emit('update:selectedDrawingKey', null)
  }
})

function formatMillimetresAsCentimetres(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return (Math.round(value) / 10).toFixed(1).replace(/\.0$/, '')
}

function formatDegrees(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '')
}

function formatMillimetres(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 1000) / 1000
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function formatOrientation(orientation: string | null): string {
  if (orientation === 'horizontal-xz') return orientationText('horizontal')
  if (orientation === 'vertical-yz') return orientationText('vertical')
  return orientationText('front')
}

function operationTargetLabel(partId: string, role: PanelRole): string {
  const groupId = groupIdByPartId.value.get(partId)
  return groupId ? `${groupId} · ${panelRoleText(role)}` : panelRoleText(role)
}

function formatThrough(value: boolean | null): string {
  if (value == null) return '—'
  return value ? t('yes') : t('no')
}

function operationPurposeLabel(purpose: (typeof operationRows.value)[number]['purpose']): string {
  if (purpose === 'handle-mounting') return t('purposeHandleMounting')
  if (purpose === 'back-panel-groove') return t('purposeBackPanelGroove')
  if (purpose === 'drawer-bottom-groove') return t('purposeDrawerBottomGroove')
  return t('purposeUnspecified')
}

function productionStatusLabel(status: (typeof operationRows.value)[number]['productionStatus']): string {
  return status === 'unvalidated' ? t('productionUnvalidated') : status
}

function selectPanel(row: (typeof panelRows.value)[number]) {
  emit('update:selectedDrawingKey', isSelectedRow(row) ? null : row.key)
}

function clearSelection() {
  emit('update:selectedDrawingKey', null)
}

function stop() {}
</script>

<template>
  <div
    class="min-h-0 overflow-auto space-y-6 pt-32 md:pt-20"
    @click="clearSelection"
  >
    <section
      class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-y border-default py-2 text-xs"
      @click.stop="stop"
    >
      <div>
        <div class="font-semibold text-highlighted">
          {{ t('manufacturingStatus') }} ·
          <span :class="cutlist.status === 'blocked' ? 'text-error' : 'text-warning'">
            {{ cutlist.status === 'blocked' ? t('manufacturingBlocked') : t('manufacturingPreliminary') }}
          </span>
        </div>
        <p class="mt-0.5 max-w-2xl text-pretty text-muted">
          {{ cutlist.status === 'blocked' ? t('manufacturingBlockedHelp') : t('manufacturingPreliminaryHelp') }}
        </p>
      </div>
      <div class="flex shrink-0 gap-3 tabular-nums text-muted">
        <span>{{ t('errors') }} <strong class="text-highlighted">{{ errorCount }}</strong></span>
        <span>{{ t('warnings') }} <strong class="text-highlighted">{{ warningCount }}</strong></span>
      </div>
    </section>

    <section @click.stop="stop">
      <h2 class="mb-2 text-balance text-sm font-semibold text-highlighted">
        {{ t('panelCutlist') }}
      </h2>
      <div class="-mx-1 max-w-full overflow-x-auto px-1">
      <table class="w-full min-w-[32rem] border-collapse text-xs">
        <thead>
          <tr class="bg-muted/60 text-left text-muted">
            <th
              scope="col"
              class="w-0 whitespace-nowrap border border-default px-1 py-1.5 font-medium"
            >
              <span class="sr-only">{{ t('groupId') }}</span>
            </th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('role') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium"> {{ t('orientation') }} </th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('widthCm') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium"> {{ t('heightCm') }} </th>
            <th class="border border-default px-2 py-1.5 font-medium"> {{ t('thicknessCm') }} </th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('quantity') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in panelRows"
            :key="row.key"
            :class="['cursor-pointer transition-colors', isSelectedRow(row) ? 'bg-primary/15' : 'odd:bg-default even:bg-muted/20 hover:bg-muted/50']"
            role="button"
            tabindex="0"
            @click="selectPanel(row)"
            @keydown.enter.prevent="selectPanel(row)"
            @keydown.space.prevent="selectPanel(row)"
          >
            <td :class="['w-0 whitespace-nowrap border px-1 py-1.5 align-middle', isSelectedRow(row) ? 'border-primary/30' : 'border-default']">
              <span class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-elevated text-[10px] font-bold leading-none tracking-tight tabular-nums text-highlighted">
                {{ row.groupId }}
              </span>
            </td>
            <td :class="['border px-2 py-1.5', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ panelRoleText(row.role) }}
            </td>
            <td :class="['border px-2 py-1.5', isSelectedRow(row) ? 'border-primary/30 text-default' : 'border-default text-muted']">
              {{ formatOrientation(row.orientation) }}
            </td>
            <td :class="['border px-2 py-1.5 tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ formatMillimetresAsCentimetres(row.widthMm) }}
            </td>
            <td :class="['border px-2 py-1.5 tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ formatMillimetresAsCentimetres(row.heightMm) }}
            </td>
            <td :class="['border px-2 py-1.5 tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ formatMillimetresAsCentimetres(row.nominalThicknessMm) }}
            </td>
            <td :class="['border px-2 py-1.5 font-semibold tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ row.quantity }}
            </td>
          </tr>
          <tr v-if="panelRows.length === 0">
            <td
              colspan="7"
              class="border border-default px-2 py-4 text-center text-muted"
            >
              {{ t('noPanelsYet') }}
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-balance text-sm font-semibold text-highlighted">
        {{ t('machiningOperations') }}
      </h2>
      <p
        v-if="cutlist.coordinateSystem.operationCoordinates === 'face-local-centered-xy'"
        class="mb-2 max-w-3xl text-pretty text-[11px] leading-relaxed text-muted"
      >
        {{ t('operationCoordinateReference') }}
      </p>
      <div class="-mx-1 max-w-full overflow-x-auto px-1">
      <table class="w-full min-w-[78rem] border-collapse text-xs">
        <thead>
          <tr class="bg-muted/60 text-left text-muted">
            <th class="border border-default px-2 py-1.5 font-medium"> {{ t('operation') }} </th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('operationPurpose') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('productionState') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium"> {{ t('targetPanel') }} </th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('face') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('xMm') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('yMm') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium"> {{ t('diameterMm') }} </th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('depthMm') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('widthMm') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('heightMm') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium"> {{ t('lengthMm') }} </th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('rotationDeg') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium"> {{ t('through') }} </th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('quantity') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in operationRows"
            :key="row.key"
            class="odd:bg-default even:bg-muted/20"
          >
            <td class="border border-default px-2 py-1.5 text-highlighted">{{ operationText(row.operationType) }}</td>
            <td class="border border-default px-2 py-1.5 text-muted">{{ operationPurposeLabel(row.purpose) }}</td>
            <td class="border border-default px-2 py-1.5 text-muted">{{ productionStatusLabel(row.productionStatus) }}</td>
            <td class="border border-default px-2 py-1.5 text-highlighted">{{ operationTargetLabel(row.targetPartId, row.targetRole) }}</td>
            <td class="border border-default px-2 py-1.5 text-muted">{{ row.face ? faceText(row.face) : '—' }}</td>
            <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatMillimetres(row.centerMm?.x ?? null) }}</td>
            <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatMillimetres(row.centerMm?.y ?? null) }}</td>
            <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatMillimetres(row.diameterMm) }}</td>
            <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatMillimetres(row.depthMm) }}</td>
            <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatMillimetres(row.widthMm) }}</td>
            <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatMillimetres(row.heightMm) }}</td>
            <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatMillimetres(row.lengthMm) }}</td>
            <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatDegrees(row.rotationDeg) }}</td>
            <td class="border border-default px-2 py-1.5 text-muted">{{ formatThrough(row.through) }}</td>
            <td class="border border-default px-2 py-1.5 font-semibold tabular-nums text-highlighted">{{ row.quantity }}</td>
          </tr>
          <tr v-if="operationRows.length === 0">
            <td
              colspan="15"
              class="border border-default px-2 py-4 text-center text-muted"
            >
              {{ t('noMachiningOperations') }}
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </section>
  </div>
</template>
