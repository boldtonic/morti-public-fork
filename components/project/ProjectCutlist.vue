<script setup lang="ts">
import type * as Y from 'yjs'
import { buildManufacturingCutlist } from '~~/shared/domain/manufacturing-cutlist'
import { createManufacturingPackage, type ManufacturingIssueV1 } from '~~/shared/domain/manufacturing-package'
import type { PanelRole, PublicStyle } from '~~/shared/domain/types'
import { faceText, manufacturingIssueText, materialPresetText, operationText, orientationText, panelRoleText, uiText as t } from '~~/shared/i18n/ui-copy'
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
const materialLabelById = computed(() => new Map(manufacturingPackage.value.materials.map(material => [
  material.id,
  materialPresetText({ id: material.presetId, label: material.label, sheenLabel: material.sheen }).label,
])))
const groupByInstanceId = computed(() => new Map(
  panelRows.value.flatMap(row => row.instanceIds.map(instanceId => [instanceId, row] as const)),
))

function isSelectedRow(row: (typeof panelRows.value)[number]) {
  return props.selectedDrawingKey === row.key || props.selectedDrawingKey === row.groupId
}

watch([panelRows, () => props.selectedDrawingKey], ([rows]) => {
  const selected = props.selectedDrawingKey
  if (selected && !rows.some(row => row.key === selected || row.groupId === selected)) {
    emit('update:selectedDrawingKey', null)
  }
})

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
  if (orientation == null) return '—'
  if (orientation === 'horizontal-xz') return orientationText('horizontal')
  if (orientation === 'vertical-yz') return orientationText('vertical')
  if (orientation === 'vertical-xy') return orientationText('front')
  return orientationText(orientation)
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

function materialLabel(materialId: string): string {
  return materialLabelById.value.get(materialId) ?? materialId
}

function selectPanel(row: (typeof panelRows.value)[number]) {
  emit('update:selectedDrawingKey', isSelectedRow(row) ? null : row.key)
}

function issueTargetGroup(issue: ManufacturingIssueV1) {
  return issue.instanceId ? groupByInstanceId.value.get(issue.instanceId) ?? null : null
}

function selectIssueTarget(issue: ManufacturingIssueV1) {
  const group = issueTargetGroup(issue)
  if (group) emit('update:selectedDrawingKey', group.key)
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
      <details
        class="basis-full border-t border-default/70 pt-1.5"
        :open="cutlist.status === 'blocked'"
      >
        <summary class="w-fit cursor-pointer select-none font-medium text-default">
          {{ t('manufacturingChecks') }} · {{ cutlist.issues.length }}
        </summary>
        <ul class="mt-1.5 space-y-1">
          <li
            v-for="issue in cutlist.issues"
            :key="issue.id"
            class="flex items-start gap-2 text-muted"
          >
            <button
              v-if="issueTargetGroup(issue)"
              type="button"
              class="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated text-[9px] font-bold text-highlighted hover:bg-muted"
              :aria-label="t('manufacturingIssueTargetAria', { group: issueTargetGroup(issue)!.groupId })"
              @click="selectIssueTarget(issue)"
            >
              {{ issueTargetGroup(issue)!.groupId }}
            </button>
            <span
              v-else
              class="mt-1 size-1.5 shrink-0 rounded-full"
              :class="issue.severity === 'error' ? 'bg-error' : 'bg-warning'"
              aria-hidden="true"
            />
            <span>
              <code class="mr-1 text-[10px] text-dimmed">{{ issue.code }}</code>
              {{ manufacturingIssueText(issue.code, issue.message) }}
            </span>
          </li>
        </ul>
      </details>
    </section>

    <section @click.stop="stop">
      <h2 class="mb-2 text-balance text-sm font-semibold text-highlighted">
        {{ t('panelCutlist') }}
      </h2>
      <div class="-mx-1 max-w-full overflow-x-auto px-1">
      <table class="w-full min-w-[48rem] border-collapse text-xs">
        <thead>
          <tr class="bg-muted/60 text-left text-muted">
            <th class="sticky left-0 z-10 min-w-36 border border-default bg-muted px-2 py-1.5 font-medium">{{ t('role') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium"> {{ t('orientation') }} </th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('widthMm') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('heightMm') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('nominalThicknessMm') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('actualThicknessMm') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('visualMaterial') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('quantity') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in panelRows"
            :key="row.key"
            :class="['cursor-pointer transition-colors', isSelectedRow(row) ? 'bg-primary/15' : 'odd:bg-default even:bg-muted/20 hover:bg-muted/50']"
            :aria-selected="isSelectedRow(row)"
            @click="selectPanel(row)"
          >
            <td :class="['sticky left-0 z-10 min-w-36 border px-2 py-1.5 align-middle', isSelectedRow(row) ? 'border-primary/30 bg-primary/15' : 'border-default bg-default']">
              <div class="flex items-center gap-2">
              <button
                type="button"
                class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-elevated text-[10px] font-bold leading-none tracking-tight tabular-nums text-highlighted hover:bg-muted"
                :aria-label="t('selectPanelGroupAria', { group: row.groupId })"
                @click.stop="selectPanel(row)"
              >
                {{ row.groupId }}
              </button>
                <span class="font-medium text-highlighted">{{ panelRoleText(row.role) }}</span>
              </div>
            </td>
            <td :class="['border px-2 py-1.5', isSelectedRow(row) ? 'border-primary/30 text-default' : 'border-default text-muted']">
              {{ formatOrientation(row.orientation) }}
            </td>
            <td :class="['border px-2 py-1.5 tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ formatMillimetres(row.widthMm) }}
            </td>
            <td :class="['border px-2 py-1.5 tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ formatMillimetres(row.heightMm) }}
            </td>
            <td :class="['border px-2 py-1.5 tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ formatMillimetres(row.nominalThicknessMm) }}
            </td>
            <td :class="['border px-2 py-1.5 text-muted', isSelectedRow(row) ? 'border-primary/30' : 'border-default']">
              {{ row.actualThicknessMm == null ? t('productionUnvalidated') : formatMillimetres(row.actualThicknessMm) }}
            </td>
            <td :class="['border px-2 py-1.5 text-muted', isSelectedRow(row) ? 'border-primary/30' : 'border-default']">
              {{ materialLabel(row.materialId) }} · {{ t('visualOnly') }}
            </td>
            <td :class="['border px-2 py-1.5 font-semibold tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ row.quantity }}
            </td>
          </tr>
          <tr v-if="panelRows.length === 0">
            <td
              colspan="8"
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
            <th class="sticky left-0 z-10 min-w-40 border border-default bg-muted px-2 py-1.5 font-medium">{{ t('targetPanel') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium"> {{ t('operation') }} </th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('operationPurpose') }}</th>
            <th class="border border-default px-2 py-1.5 font-medium">{{ t('productionState') }}</th>
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
            <td class="sticky left-0 z-10 border border-default bg-default px-2 py-1.5 font-medium text-highlighted">{{ operationTargetLabel(row.targetPartId, row.targetRole) }}</td>
            <td class="border border-default px-2 py-1.5 text-highlighted">{{ operationText(row.operationType) }}</td>
            <td class="border border-default px-2 py-1.5 text-muted">{{ operationPurposeLabel(row.purpose) }}</td>
            <td class="border border-default px-2 py-1.5 text-muted">{{ productionStatusLabel(row.productionStatus) }}</td>
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
