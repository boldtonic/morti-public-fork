<script setup lang="ts">
import { horizontalHandleStyle, pairedDoorHorizontalStyle } from '~~/components/project/handle-2d-layout'
import { DEFAULT_FURNITURE_CONFIG, normalizePublicStyle } from '~~/shared/domain/defaults'
import { HANDLE_FINISH_SPECS, isKnobHandleType, isSquareHandleType, moduleHasHandleHoles, moduleShowsPhysicalHandle, resolveHandleCenter, resolveHandleType } from '~~/shared/domain/handles'
import { interiorShelfCenterOffsets, normalizeInteriorShelfCount } from '~~/shared/domain/interior-shelves'
import type { FurnitureColumn, FurnitureConfig, FurnitureModule, PublicStyle } from '~~/shared/domain/types'
import { moduleTypeText, uiText as t } from '~~/shared/i18n/ui-copy'

interface Props {
  columns: FurnitureColumn[]
  config: FurnitureConfig
  selectedModuleIds: string[]
  zoomPercent: number
  publicStyle?: PublicStyle | null
}

const props = defineProps<Props>()
const handleStyle = computed(() => normalizePublicStyle(props.publicStyle).rendered.handles)

const emit = defineEmits<{
  (e: 'add-column-left'): void
  (e: 'add-column-right'): void
  (e: 'clear-module-selection'): void
  (e: 'open-project-details'): void
  (e: 'set-config-value', key: ProjectDetailKey, value: number): void
  (e: 'remove-column', columnIndex: number): void
  (e: 'add-module-top', columnIndex: number): void
  (e: 'update:zoom-percent', value: number): void
  (e: 'toggle-module-selection', moduleId: string, shiftKey: boolean): void
  (e: 'column-resize-start', columnIndex: number, direction: 1 | -1, event: PointerEvent): void
  (e: 'set-column-width', columnIndex: number, width: number): void
  (e: 'set-module-height', columnIndex: number, moduleIndex: number, height: number): void
}>()

// --- Layout / drag-handle constants (verbatim from spec 04 §4.3) ---
const Al = 220 // base px-per-meter at 100% zoom
const Vl = 28 // column-add buttons width/height
const Kl = 28 // column meta footer offset
const Bt = 10 // gap above the top-of-column "+" button
const qt = 4 // column outer padding
const Ke = 4 // column-resize divider lateral margin
const We = 4 // column-resize divider width / module-boundary spacer height
const zt = 6 // module-boundary drag-handle height
const ALLOWED_ZOOMS = [100, 75, 50, 25] as const
const OUTER_RAIL_GAP = 12 // gap-3 between side add buttons and the rail
const VIEWPORT_INLINE_PADDING = 32 // p-4 on the scroll content
const MIN_FIT_PX_PER_METER = 64
type ProjectDetailKey = 'depth' | 'panelThickness' | 'sidePanelOverhang'
interface ProjectDetailItem {
  key: ProjectDetailKey
  label: string
  compactLabel: string
  allowZero?: boolean
}

const clampedZoom = computed<number>(() => {
  const z = props.zoomPercent
  return ALLOWED_ZOOMS.includes(z as typeof ALLOWED_ZOOMS[number]) ? z : 100
})

const viewportRef = ref<HTMLElement | null>(null)
const viewportWidth = ref(0)
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!viewportRef.value) return
  resizeObserver = new ResizeObserver(([entry]) => {
    viewportWidth.value = entry?.contentRect.width ?? 0
  })
  resizeObserver.observe(viewportRef.value)
  viewportWidth.value = viewportRef.value.getBoundingClientRect().width
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

const basePxPerMeter = computed<number>(() => Al * (clampedZoom.value / 100))
const totalColumnWidthMeters = computed<number>(() =>
  props.columns.reduce((sum, col) => sum + Math.max(0, col.width), 0),
)
const fitPxPerMeter = computed<number>(() => {
  const meters = totalColumnWidthMeters.value
  const available = viewportWidth.value - VIEWPORT_INLINE_PADDING
  if (props.columns.length === 0 || meters <= 0 || available <= 0) return basePxPerMeter.value

  const staticWidth = 2 * Vl + 2 * OUTER_RAIL_GAP + (props.columns.length + 1) * (We + Ke)
  const fitted = (available - staticWidth) / meters
  if (!Number.isFinite(fitted) || fitted <= 0) {
    return Math.min(basePxPerMeter.value, MIN_FIT_PX_PER_METER)
  }

  return Math.max(MIN_FIT_PX_PER_METER, Math.min(basePxPerMeter.value, fitted))
})

// pixels per metre at the current zoom, auto-fitted when the rail is wider than the viewport
const pxPerMeter = computed<number>(() => fitPxPerMeter.value)

const selectedSet = computed<Set<string>>(() => new Set(props.selectedModuleIds))
const anySelected = computed<boolean>(() => selectedSet.value.size > 0)
const selectedFillClass = computed<string>(() => anySelected.value ? 'bg-inverted opacity-30' : 'bg-primary')

function isSelected(moduleId: string): boolean {
  return selectedSet.value.has(moduleId)
}

function moduleClass(mod: FurnitureModule): string {
  const moduleIsSelected = isSelected(mod.id)
  if (mod.type === 'shelf') {
    if (anySelected.value && !moduleIsSelected) return 'module-shelf module-shelf-dim'
    if (moduleIsSelected) return 'module-shelf module-shelf-selected'
    return 'module-shelf'
  }
  if (!anySelected.value || moduleIsSelected) return 'bg-primary'
  return 'bg-inverted opacity-10 ring ring-default/60 hover:opacity-10'
}

function meterToPx(m: number): number {
  if (!Number.isFinite(m) || m <= 0) return 0
  return Math.round(m * pxPerMeter.value)
}

function px(m: number): string {
  return `${meterToPx(m)}px`
}

function formatCentimeters(meters: number): string {
  if (!Number.isFinite(meters)) return ''
  const centimeters = Math.round(meters * 1000) / 10
  return String(centimeters)
}

const projectDetailItems: ProjectDetailItem[] = [
  { key: 'depth', label: t('depth'), compactLabel: t('depth') },
  { key: 'panelThickness', label: t('thickness'), compactLabel: t('thicknessCompact') },
]
const overhangDetailItem: ProjectDetailItem = { key: 'sidePanelOverhang', label: t('overhang'), compactLabel: t('overhangCompact'), allowZero: true }
const lastPositiveOverhang = ref(DEFAULT_FURNITURE_CONFIG.sidePanelOverhang)
const overhangEnabled = computed<boolean>(() => props.config.sidePanelOverhang > 0)

watch(
  () => props.config.sidePanelOverhang,
  (value) => {
    if (Number.isFinite(value) && value > 0) lastPositiveOverhang.value = value
  },
  { immediate: true },
)

function projectDetailValue(item: ProjectDetailItem): string {
  return formatCentimeters(props.config[item.key])
}

function parseCentimeters(value: string): number | null {
  const next = Number(value.trim().replace(',', '.'))
  return Number.isFinite(next) && next >= 0 ? next : null
}

function commitProjectDetail(item: ProjectDetailItem, event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const centimeters = parseCentimeters(input.value)
  if (centimeters == null || (!item.allowZero && centimeters <= 0)) {
    input.value = projectDetailValue(item)
    return
  }
  const meters = centimeters / 100
  emit('set-config-value', item.key, meters)
  input.value = formatCentimeters(meters)
}

function setOverhangEnabled(enabled: boolean) {
  const next = enabled
    ? lastPositiveOverhang.value || DEFAULT_FURNITURE_CONFIG.sidePanelOverhang
    : 0
  emit('set-config-value', 'sidePanelOverhang', next)
}

function pullHoleEdgeInset(): number {
  return props.config.pullHoleEdgeInset
}

function pullDiameterPx(): number {
  return Math.max(3, Math.round(props.config.pullHoleDiameter * pxPerMeter.value))
}

function pullEdgeInsetPx(): number {
  return Math.round(pullHoleEdgeInset() * pxPerMeter.value)
}

function pullPairHalfGapPx(): number {
  return Math.round((props.config.pullHolePairGap / 2) * pxPerMeter.value)
}

function visualBgClass(): string {
  return 'bg-[var(--ui-bg-muted)]'
}

function handleOrientation(mod: FurnitureModule) {
  return mod.handleOrientation ?? (mod.type === 'drawer' ? 'horizontal' : 'vertical')
}

function handleDimensions(mod: FurnitureModule) {
  const d = pullDiameterPx()
  if (isKnobHandleType(resolveHandleType(mod, handleStyle.value))) return { width: d, height: d }
  const length = Math.max(
    Math.round(d * 2.6),
    Math.round((props.config.pullHolePairGap + props.config.pullHoleDiameter * 1.15) * pxPerMeter.value),
  )
  const thickness = Math.max(3, Math.round(d * 0.55))
  return handleOrientation(mod) === 'vertical'
    ? { width: thickness, height: length }
    : { width: length, height: thickness }
}

function handleVisualStyle(mod: FurnitureModule): Record<string, string> {
  return { backgroundColor: HANDLE_FINISH_SPECS[handleStyle.value.finish].color }
}

function handleClass(mod: FurnitureModule): string {
  const type = resolveHandleType(mod, handleStyle.value)
  const family = isKnobHandleType(type) ? 'pull-knob-2d' : 'pull-bar-2d'
  const shape = isSquareHandleType(type) ? 'pull-square-2d' : 'pull-round-2d'
  return `${family} ${shape}`
}

function doorHandleBottom(mod: FurnitureModule, handleHeight: number): string {
  const edge = Math.max(props.config.pullHoleEdgeInset, props.config.pullHoleDiameter / 2)
  const center = resolveHandleCenter(edge, Math.max(edge, mod.height - edge), mod.handlePosition)
  return `${center * pxPerMeter.value - handleHeight / 2}px`
}

function singleDoorPullStyle(mod: FurnitureModule): Record<string, string> {
  const { width, height } = handleDimensions(mod)
  return {
    width: `${width}px`,
    height: `${height}px`,
    bottom: doorHandleBottom(mod, height),
    ...horizontalHandleStyle(mod, width, pullEdgeInsetPx()),
    ...handleVisualStyle(mod),
  }
}

function doorsPullStyle(mod: FurnitureModule, side: 'left' | 'right'): Record<string, string> {
  const { width, height } = handleDimensions(mod)
  return {
    width: `${width}px`,
    height: `${height}px`,
    bottom: doorHandleBottom(mod, height),
    ...pairedDoorHorizontalStyle(mod, side, width, pullEdgeInsetPx(), pullPairHalfGapPx()),
    ...handleVisualStyle(mod),
  }
}

function doorDividerStyle(): Record<string, string> {
  return {
    width: '2px',
    left: '50%',
    top: '0',
    bottom: '0',
    transform: 'translateX(-50%)',
  }
}

function drawerHandleStyle(mod: FurnitureModule, drawerIndex: number): Record<string, string> {
  const total = drawerCount(mod)
  const topM = (drawerIndex / total) * mod.height
  const bottomM = ((drawerIndex - 1) / total) * mod.height
  const reserve = handleOrientation(mod) === 'vertical' ? props.config.pullHolePairGap / 2 : 0
  const edge = Math.max(pullHoleEdgeInset(), props.config.pullHoleDiameter / 2)
  const minCentre = bottomM + edge + reserve
  const maxCentre = topM - edge - reserve
  const centreM = resolveHandleCenter(minCentre, maxCentre, mod.handlePosition)
  const pct = (centreM / mod.height) * 100
  const { width, height } = handleDimensions(mod)
  const horizontalReserve = handleOrientation(mod) === 'horizontal' ? pullPairHalfGapPx() : 0
  return {
    width: `${width}px`,
    height: `${height}px`,
    ...horizontalHandleStyle(mod, width, pullEdgeInsetPx() + horizontalReserve),
    bottom: `calc(${pct}% - ${height / 2}px)`,
    ...handleVisualStyle(mod),
  }
}

function singleDoorHoleStyle(mod: FurnitureModule): Record<string, string> {
  const diameter = pullDiameterPx()
  return {
    width: `${diameter}px`,
    height: `${diameter}px`,
    bottom: doorHandleBottom(mod, diameter),
    ...horizontalHandleStyle(mod, diameter, pullEdgeInsetPx()),
  }
}

function doorsHoleStyle(mod: FurnitureModule, side: 'left' | 'right'): Record<string, string> {
  const diameter = pullDiameterPx()
  return {
    width: `${diameter}px`,
    height: `${diameter}px`,
    bottom: doorHandleBottom(mod, diameter),
    ...pairedDoorHorizontalStyle(mod, side, diameter, pullEdgeInsetPx(), pullPairHalfGapPx()),
  }
}

function drawerHoleStyle(mod: FurnitureModule, drawerIndex: number, holeIndex: number): Record<string, string> {
  const total = drawerCount(mod)
  const topM = (drawerIndex / total) * mod.height
  const bottomM = ((drawerIndex - 1) / total) * mod.height
  const orientation = handleOrientation(mod)
  const reserve = orientation === 'vertical' ? props.config.pullHolePairGap / 2 : 0
  const edge = Math.max(pullHoleEdgeInset(), props.config.pullHoleDiameter / 2)
  const centreM = resolveHandleCenter(bottomM + edge + reserve, topM - edge - reserve, mod.handlePosition)
  const diameter = pullDiameterPx()
  const offset = holeIndex === 1 ? -pullPairHalfGapPx() : pullPairHalfGapPx()
  const xOffset = orientation === 'horizontal' ? offset : 0
  const yOffset = orientation === 'vertical' ? offset : 0
  const horizontalReserve = orientation === 'horizontal' ? pullPairHalfGapPx() : 0
  return {
    width: `${diameter}px`,
    height: `${diameter}px`,
    ...horizontalHandleStyle(mod, diameter, pullEdgeInsetPx() + horizontalReserve, xOffset),
    bottom: `calc(${(centreM / mod.height) * 100}% + ${yOffset - diameter / 2}px)`,
  }
}

function drawerCount(mod: FurnitureModule): number {
  return mod.drawerCount as number
}

function interiorShelfCount(mod: FurnitureModule): number {
  return normalizeInteriorShelfCount(mod.shelfCount)
}

function interiorShelfStyle(mod: FurnitureModule, shelfIndex: number): Record<string, string> {
  const center = interiorShelfCenterOffsets(mod.height, mod.shelfCount, props.config)[shelfIndex - 1] ?? 0
  const thickness = Math.max(2, meterToPx(props.config.panelThickness))
  return {
    height: `${thickness}px`,
    bottom: `${meterToPx(center) - thickness / 2}px`,
  }
}

function spacerStyle(axis: 'width' | 'height'): Record<string, string> {
  return axis === 'width' ? { width: `${We}px` } : { height: `${We}px` }
}

function columnResizeMarginStyle(): Record<string, string> {
  const margin = Ke / 2
  return {
    marginLeft: `${margin}px`,
    marginRight: `${margin}px`,
  }
}

function metaGap(): string {
  return `${We + Ke}px`
}

function columnLetter(index: number): string {
  let n = index
  let s = ''
  while (true) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
    if (n < 0) break
  }
  return s
}

// --- Module-boundary drag (resize a module's height) ---
interface BoundaryDragState {
  columnIndex: number
  boundaryIndex: number
  startY: number
  targets: { columnIndex: number, moduleIndex: number, startHeight: number }[]
}

const boundaryDrag = ref<BoundaryDragState | null>(null)

function onBoundaryPointerDown(columnIndex: number, boundaryIndex: number, ev: PointerEvent) {
  const col = props.columns[columnIndex]
  if (!col || col.modules.length === 0) return
  ev.preventDefault()
  ev.stopPropagation()
  cancelBoundaryDrag()

  // Identify the module just below the boundary
  const adjacentIndex = boundaryIndex - 1
  if (boundaryIndex < 0 || boundaryIndex > col.modules.length) return
  const adjacentModule = col.modules[adjacentIndex]

  // Multi-target rule: if the adjacent module is in the selection AND multiple
  // modules are selected → drag heights for all selected modules. Otherwise
  // just the one adjacent module.
  let targets: { columnIndex: number, moduleIndex: number, startHeight: number }[]
  if (selectedSet.value.size > 1 && adjacentModule != null && selectedSet.value.has(adjacentModule.id)) {
    targets = []
    props.columns.forEach((c, ci) => {
      c.modules.forEach((m, mi) => {
        if (selectedSet.value.has(m.id)) {
          targets.push({ columnIndex: ci, moduleIndex: mi, startHeight: m.height })
        }
      })
    })
  }
  else if (adjacentModule != null) {
    targets = [{ columnIndex, moduleIndex: adjacentIndex, startHeight: adjacentModule.height }]
  }
  else {
    targets = []
  }

  boundaryDrag.value = {
    columnIndex,
    boundaryIndex,
    startY: ev.clientY,
    targets,
  }

  window.addEventListener('pointermove', onBoundaryPointerMove)
  window.addEventListener('pointerup', cancelBoundaryDrag)
  window.addEventListener('pointercancel', cancelBoundaryDrag)
}

function onBoundaryPointerMove(ev: PointerEvent) {
  const drag = boundaryDrag.value
  if (!drag) return
  const dy = ev.clientY - drag.startY
  // Negative dy → bigger module height (the boundary moved up).
  const deltaMeters = -dy / pxPerMeter.value
  for (const t of drag.targets) {
    emit('set-module-height', t.columnIndex, t.moduleIndex, t.startHeight + deltaMeters)
  }
}

function cancelBoundaryDrag() {
  boundaryDrag.value = null
  window.removeEventListener('pointermove', onBoundaryPointerMove)
  window.removeEventListener('pointerup', cancelBoundaryDrag)
  window.removeEventListener('pointercancel', cancelBoundaryDrag)
}

onBeforeUnmount(cancelBoundaryDrag)

// --- Click handlers ---
function onModuleClick(ev: MouseEvent, moduleId: string) {
  emit('toggle-module-selection', moduleId, ev.shiftKey)
}

function onColumnResizePointerDown(columnIndex: number, direction: 1 | -1, ev: PointerEvent) {
  emit('column-resize-start', columnIndex, direction, ev)
}

function columnTotalHeight(col: FurnitureColumn): number {
  return col.modules.reduce((sum, mod) => sum + mod.height, 0)
}

function columnRenderedHeight(col: FurnitureColumn): number {
  const moduleHeight = meterToPx(columnTotalHeight(col))
  const height = moduleHeight > 0 ? moduleHeight + zt : 0
  return height > 0 ? height + qt * 2 : 0
}

function columnStackHeight(col: FurnitureColumn): string {
  const moduleHeight = meterToPx(columnTotalHeight(col))
  return `${moduleHeight > 0 ? moduleHeight + zt : 0}px`
}

function moduleBoundaryHeight(col: FurnitureColumn, boundaryIndex: number): number {
  let height = 0
  const count = Math.min(Math.max(0, boundaryIndex), col.modules.length)
  for (let i = 0; i < count; i++) height += col.modules[i]?.height ?? 0
  return height
}

function moduleStackStyle(col: FurnitureColumn, moduleIndex: number, mod: FurnitureModule): Record<string, string> {
  return {
    height: px(mod.height),
    bottom: `${zt / 2 + meterToPx(moduleBoundaryHeight(col, moduleIndex))}px`,
  }
}

function moduleMeasurementClass(mod: FurnitureModule): string {
  const base = 'module-measurement pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 truncate rounded bg-default/90 px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-toned shadow-sm ring-1 ring-default/60'
  if (mod.type === 'shelf') return `${base} module-measurement-shelf`
  return base
}

function bottomDeckStyle(): Record<string, string> {
  return {
    height: `${We}px`,
    bottom: `${(zt - We) / 2}px`,
  }
}

function moduleBoundaryStyle(col: FurnitureColumn, boundaryIndex: number): Record<string, string> {
  return {
    height: `${zt}px`,
    bottom: `${meterToPx(moduleBoundaryHeight(col, boundaryIndex))}px`,
  }
}

function boundaryHeight(boundaryIndex: number): number {
  const previous = props.columns[boundaryIndex - 1]
  const next = props.columns[boundaryIndex]
  return Math.max(previous ? columnRenderedHeight(previous) : 0, next ? columnRenderedHeight(next) : 0)
}

const railBodyHeight = computed<number>(() => {
  return props.columns.reduce((maxHeight, col) => Math.max(maxHeight, columnRenderedHeight(col)), 0) + Kl + Bt
})

const railBodyHeightPx = computed<string>(() => `${railBodyHeight.value}px`)

function boundaryHeightPx(boundaryIndex: number): string {
  return `${boundaryHeight(boundaryIndex)}px`
}

function addButtonMarginTop(boundaryIndex: number): string {
  const adjacentHeight = boundaryHeight(boundaryIndex)
  const top = railBodyHeight.value - adjacentHeight / 2
  return `${Math.max(0, top - Vl / 2)}px`
}
</script>

<template>
  <div
    class="relative flex h-full min-w-0 flex-col overflow-hidden"
    data-v-b07ba140
    @click="emit('clear-module-selection')"
  >
    <div
      ref="viewportRef"
      class="h-full overflow-auto overscroll-contain"
    >
      <div class="flex min-h-full min-w-full items-center justify-center p-4 pb-32 sm:pb-44">
        <div class="designer-content-column flex flex-col items-center">
          <div class="flex w-max items-start justify-center gap-3">
            <button
              type="button"
              :aria-label="t('addColumnLeft')"
              class="editor-touch-target flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-inverted shadow-sm transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :style="columns.length > 0 ? { marginTop: addButtonMarginTop(0) } : undefined"
              @click.stop="emit('add-column-left')"
            >
              <UIcon
                name="i-lucide-plus"
                class="size-3.5"
              />
            </button>

            <div class="shrink-0 rounded-lg">
              <div
                class="mx-auto flex w-max items-end"
                :style="{ height: railBodyHeightPx }"
              >
                <div
                  v-if="columns.length > 0"
                  class="column-resize-hit shrink-0 cursor-col-resize touch-none transition-opacity hover:opacity-75"
                  :class="selectedFillClass"
                  :style="{ ...spacerStyle('width'), ...columnResizeMarginStyle(), height: boundaryHeightPx(0) }"
                  role="separator"
                  aria-orientation="vertical"
                  :aria-label="t('resizeColumn', { index: 1 })"
                  @pointerdown="onColumnResizePointerDown(0, -1, $event)"
                />

                <template
                  v-for="(col, ci) in columns"
                  :key="ci"
                >
                  <div
                    class="flex h-full shrink-0 flex-col justify-end"
                    :style="{ width: px(col.width) }"
                  >
                    <div
                      class="flex flex-col items-stretch"
                      :style="{ padding: `${qt}px` }"
                    >
                      <button
                        type="button"
                        class="editor-touch-target self-center flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-inverted shadow-sm transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        :style="{ marginBottom: `${Bt}px` }"
                        :aria-label="t('addModuleTop', { index: ci + 1 })"
                        @click.stop="emit('add-module-top', ci)"
                      >
                        <UIcon
                          name="i-lucide-plus"
                          class="size-3.5"
                        />
                      </button>

                      <div
                        class="relative w-full shrink-0"
                        :style="{ height: columnStackHeight(col) }"
                        :aria-label="t('columnDimensionsAria', { index: ci + 1, width: formatCentimeters(col.width), height: formatCentimeters(columnTotalHeight(col)) })"
                      >
                        <span
                          v-if="col.modules.length > 0"
                          class="absolute inset-x-0 z-10 block"
                          :class="selectedFillClass"
                          :style="bottomDeckStyle()"
                          aria-hidden="true"
                        />

                        <template
                          v-for="(mod, mi) in col.modules"
                          :key="mod.id"
                        >
                          <button
                            type="button"
                            class="absolute inset-x-0 z-0 block text-left outline-none transition-[opacity,transform,background-color] duration-150 hover:opacity-90 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-default"
                            :class="moduleClass(mod)"
                            :style="moduleStackStyle(col, mi, mod)"
                            :aria-label="t('moduleHeightAria', { type: moduleTypeText(mod.type), height: formatCentimeters(mod.height) })"
                            @click.stop="onModuleClick($event, mod.id)"
                          >
                            <span
                              aria-hidden="true"
                              :class="moduleMeasurementClass(mod)"
                            >
                              {{ formatCentimeters(mod.height) }} cm
                            </span>

                            <template v-if="mod.type === 'shelf'">
                              <div
                                v-for="i in interiorShelfCount(mod)"
                                :key="`${mod.id}-interior-shelf-${i}`"
                                class="pointer-events-none absolute inset-x-0 z-[5]"
                                :class="anySelected && !isSelected(mod.id) ? 'bg-[var(--ui-border-muted)]' : 'bg-primary'"
                                :style="interiorShelfStyle(mod, i)"
                                aria-hidden="true"
                              />
                            </template>

                            <template v-else-if="mod.type === 'drawer'">
                              <div
                                v-for="i in drawerCount(mod) - 1"
                                :key="`${mod.id}-drawer-sep-${i}`"
                                class="absolute left-0 right-0 bg-[var(--ui-bg-muted)]"
                                :style="{ height: '2px', bottom: `${(i / drawerCount(mod)) * 100}%` }"
                                aria-hidden="true"
                              />
                              <template
                                v-if="moduleShowsPhysicalHandle(mod)"
                                v-for="i in drawerCount(mod)"
                                :key="`${mod.id}-dr-${i}`"
                              >
                                <div
                                  class="absolute"
                                  :class="handleClass(mod)"
                                  :style="drawerHandleStyle(mod, i)"
                                />
                              </template>
                              <template
                                v-else-if="moduleHasHandleHoles(mod)"
                                v-for="i in drawerCount(mod)"
                                :key="`${mod.id}-dr-holes-${i}`"
                              >
                                <div
                                  v-for="holeIndex in 2"
                                  :key="`${mod.id}-dr-hole-${i}-${holeIndex}`"
                                  class="pull-hole-2d absolute rounded-full"
                                  :style="drawerHoleStyle(mod, i, holeIndex)"
                                />
                              </template>
                            </template>

                            <template v-else-if="mod.type === 'left-door'">
                              <div
                                v-if="moduleShowsPhysicalHandle(mod)"
                                class="absolute"
                                :class="handleClass(mod)"
                                :style="singleDoorPullStyle(mod)"
                              />
                              <div
                                v-else-if="moduleHasHandleHoles(mod)"
                                class="pull-hole-2d absolute rounded-full"
                                :style="singleDoorHoleStyle(mod)"
                              />
                            </template>

                            <template v-else-if="mod.type === 'right-door'">
                              <div
                                v-if="moduleShowsPhysicalHandle(mod)"
                                class="absolute"
                                :class="handleClass(mod)"
                                :style="singleDoorPullStyle(mod)"
                              />
                              <div
                                v-else-if="moduleHasHandleHoles(mod)"
                                class="pull-hole-2d absolute rounded-full"
                                :style="singleDoorHoleStyle(mod)"
                              />
                            </template>

                            <template v-else-if="mod.type === 'doors'">
                              <div
                                class="absolute"
                                :class="visualBgClass()"
                                :style="doorDividerStyle()"
                              />
                              <template v-if="moduleShowsPhysicalHandle(mod)">
                                <div
                                  class="absolute"
                                  :class="handleClass(mod)"
                                  :style="doorsPullStyle(mod, 'left')"
                                />
                                <div
                                  class="absolute"
                                  :class="handleClass(mod)"
                                  :style="doorsPullStyle(mod, 'right')"
                                />
                              </template>
                              <template v-else-if="moduleHasHandleHoles(mod)">
                                <div
                                  class="pull-hole-2d absolute rounded-full"
                                  :style="doorsHoleStyle(mod, 'left')"
                                />
                                <div
                                  class="pull-hole-2d absolute rounded-full"
                                  :style="doorsHoleStyle(mod, 'right')"
                                />
                              </template>
                            </template>
                          </button>

                          <button
                            type="button"
                            class="boundary-resize-hit absolute inset-x-0 z-20 block cursor-row-resize"
                            :style="moduleBoundaryStyle(col, mi + 1)"
                            :aria-label="t('resizeModuleBoundary', { boundary: mi + 1, column: ci + 1 })"
                            @pointerdown="onBoundaryPointerDown(ci, mi + 1, $event)"
                          >
                            <span
                              class="absolute inset-x-0 top-1/2 -translate-y-1/2"
                              :class="selectedFillClass"
                              :style="spacerStyle('height')"
                            />
                          </button>
                        </template>
                      </div>
                    </div>
                  </div>

                  <div
                    class="column-resize-hit shrink-0 cursor-col-resize touch-none transition-opacity hover:opacity-75"
                    :class="selectedFillClass"
                    :style="{ ...spacerStyle('width'), ...columnResizeMarginStyle(), height: boundaryHeightPx(ci + 1) }"
                    role="separator"
                    aria-orientation="vertical"
                    :aria-label="t('resizeColumn', { index: ci + 1 })"
                    @pointerdown="onColumnResizePointerDown(ci, 1, $event)"
                  />
                </template>

                <div
                  v-if="columns.length === 0"
                  class="flex h-full w-52 items-center justify-center text-sm text-muted"
                >
                  {{ t('noColumnsYet') }}
                </div>
              </div>

              <div
                v-if="columns.length > 0"
                class="mx-auto mt-2 flex w-max items-center border-t border-muted pt-2"
                :style="{ columnGap: metaGap(), paddingLeft: metaGap(), paddingRight: metaGap() }"
              >
                <div
                  v-for="(col, ci) in columns"
                  :key="`meta-${ci}`"
                  class="flex shrink-0 flex-col items-center justify-start gap-2"
                  :style="{ width: px(col.width) }"
                >
                  <button
                    type="button"
                    class="editor-touch-target group relative inline-flex items-center text-xs text-muted transition-transform active:scale-[0.97]"
                    :aria-label="t('removeColumn', { letter: columnLetter(ci) })"
                    @click.stop="emit('remove-column', ci)"
                  >
                    <span class="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accented text-xs font-bold text-inverted transition-colors group-hover:bg-elevated">
                      <span class="group-hover:hidden">{{ columnLetter(ci) }}</span>
                      <UIcon
                        name="i-lucide-trash-2"
                        class="hidden size-3.5 group-hover:block"
                      />
                    </span>
                  </button>
                  <p class="text-xs font-semibold tabular-nums text-muted">
                    {{ t('widthCompact') }} {{ formatCentimeters(col.width) }} cm
                  </p>
                  <p class="-mt-1 text-xs font-semibold tabular-nums text-muted">
                    {{ t('heightCompact') }} {{ formatCentimeters(columnTotalHeight(col)) }} cm
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              :aria-label="t('addColumnRight')"
              class="editor-touch-target flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-inverted shadow-sm transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :style="columns.length > 0 ? { marginTop: addButtonMarginTop(columns.length) } : undefined"
              @click.stop="emit('add-column-right')"
            >
              <UIcon
                name="i-lucide-plus"
                class="size-3.5"
              />
            </button>
          </div>

          <div
            v-if="columns.length > 0"
            class="designer-detail-controls mt-3 flex items-center gap-1.5 border-t border-muted pt-3 text-xs tabular-nums"
          >
            <label
              v-for="item in projectDetailItems"
              :key="item.key"
              class="inline-flex min-h-6 items-center gap-1 rounded-md bg-muted px-1.5 text-muted ring-1 ring-default/60"
              @click.stop
            >
              <span class="text-[11px] font-medium">{{ item.compactLabel }}</span>
              <input
                :value="projectDetailValue(item)"
                type="text"
                inputmode="decimal"
                class="w-9 rounded bg-transparent px-0.5 text-right font-semibold text-highlighted outline-none transition-colors focus:bg-elevated"
                :aria-label="t('detailCentimetersAria', { label: item.label })"
                @click.stop
                @keydown.enter.prevent="commitProjectDetail(item, $event)"
                @blur="commitProjectDetail(item, $event)"
              >
              <span class="text-[11px] font-semibold text-highlighted">cm</span>
            </label>

            <div
              class="inline-flex min-h-6 items-center gap-1 rounded-md bg-muted px-1.5 text-muted ring-1 ring-default/60"
              @click.stop
            >
              <span class="text-[11px] font-medium">{{ overhangDetailItem.compactLabel }}</span>
              <span
                class="inline-flex rounded bg-default/70 p-0.5 ring-1 ring-default/50"
                role="group"
                :aria-label="overhangDetailItem.label"
              >
                <button
                  type="button"
                  class="min-h-5 rounded px-1.5 text-[11px] font-semibold transition-[background-color,color,transform] active:scale-[0.97]"
                  :class="!overhangEnabled ? 'bg-primary text-inverted shadow-sm' : 'text-muted hover:text-highlighted'"
                  :aria-pressed="!overhangEnabled"
                  @click.stop="setOverhangEnabled(false)"
                >
                  {{ t('no') }}
                </button>
                <button
                  type="button"
                  class="min-h-5 rounded px-1.5 text-[11px] font-semibold transition-[background-color,color,transform] active:scale-[0.97]"
                  :class="overhangEnabled ? 'bg-primary text-inverted shadow-sm' : 'text-muted hover:text-highlighted'"
                  :aria-pressed="overhangEnabled"
                  @click.stop="setOverhangEnabled(true)"
                >
                  {{ t('yes') }}
                </button>
              </span>
              <template v-if="overhangEnabled">
                <input
                  :value="projectDetailValue(overhangDetailItem)"
                  type="text"
                  inputmode="decimal"
                  class="w-9 rounded bg-transparent px-0.5 text-right font-semibold text-highlighted outline-none transition-colors focus:bg-elevated"
                  :aria-label="t('detailCentimetersAria', { label: overhangDetailItem.label })"
                  @click.stop
                  @keydown.enter.prevent="commitProjectDetail(overhangDetailItem, $event)"
                  @blur="commitProjectDetail(overhangDetailItem, $event)"
                >
                <span class="text-[11px] font-semibold text-highlighted">cm</span>
              </template>
            </div>

            <button
              type="button"
              class="inline-flex min-h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-semibold text-inverted shadow-sm transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :aria-label="t('openProjectDetails')"
              @click.stop="emit('open-project-details')"
            >
              <UIcon
                name="i-lucide-sliders-horizontal"
                class="size-3"
              />
              <span>{{ t('details') }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.designer-content-column {
  width: 100%;
  min-width: 0;
}

.designer-detail-controls {
  position: relative;
  width: 100%;
  min-width: 0;
  flex-wrap: wrap;
  justify-content: center;
  border-top: 0;
}

.designer-detail-controls::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  width: max(0px, calc(100% - 8rem));
  max-width: 100%;
  transform: translateX(-50%);
  border-top: 1px solid var(--ui-border-muted);
}

.module-shelf {
  background-color: transparent;
  border: 1px solid var(--ui-primary);
}
.module-shelf-dim {
  background-image: none;
  border-color: var(--ui-border-muted);
}
.module-shelf-selected,
.module-shelf:hover {
  background-image: repeating-linear-gradient(
    135deg,
    var(--ui-primary) 0,
    var(--ui-primary) 6px,
    transparent 6px,
    transparent 12px
  );
}
.module-shelf-dim:hover {
  background-image: repeating-linear-gradient(
    135deg,
    var(--ui-border-muted),
    var(--ui-border-muted) 6px,
    transparent 0,
    transparent 12px
  );
}
.module-measurement {
  max-width: calc(100% - 0.5rem);
}
.module-measurement-shelf {
  color: var(--ui-primary);
}
.pull-knob-2d {
  border: 1px solid rgb(255 255 255 / 0.18);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.16),
    0 1px 2px rgb(0 0 0 / 0.28);
}
.pull-bar-2d {
  border: 1px solid rgb(255 255 255 / 0.16);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.14),
    0 1px 2px rgb(0 0 0 / 0.28);
}
.pull-round-2d {
  border-radius: 9999px;
}
.pull-square-2d {
  border-radius: 2px;
}
.pull-hole-2d {
  background: var(--ui-bg);
  border: 1px solid var(--ui-border-accented);
  box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.5);
}
.editor-touch-target,
.column-resize-hit {
  position: relative;
}
.editor-touch-target::after {
  content: "";
  position: absolute;
  inset: -6px;
  border-radius: 9999px;
}
.column-resize-hit::after {
  content: "";
  position: absolute;
  inset: 0 -10px;
}
.boundary-resize-hit::after {
  content: "";
  position: absolute;
  inset: -10px 0;
}
</style>
