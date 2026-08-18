<script setup lang="ts">
import type * as Y from 'yjs'
import type { AiFurnitureDraft, AiFurnitureGenerateResponse } from '~~/shared/domain/ai-furniture'
import { AI_FURNITURE_PROMPT_MAX_LENGTH } from '~~/shared/domain/ai-furniture'
import { DEFAULT_COLUMN_WIDTH, DEFAULT_DRAWER_COUNT, DRAWER_COUNT_MAX, DRAWER_COUNT_MIN, DEFAULT_FURNITURE_CONFIG, FURNITURE_CONFIG_WRITABLE_KEYS, MODULE_TYPES } from '~~/shared/domain/defaults'
import { moduleHandleHorizontalPosition, moduleHandleMode } from '~~/shared/domain/handles'
import { clampInteriorShelfCountForHeight, INTERIOR_SHELF_COUNT_MAX, INTERIOR_SHELF_COUNT_MIN, maxInteriorShelfCountForHeight, normalizeInteriorShelfCount } from '~~/shared/domain/interior-shelves'
import type { FurnitureConfig, FurnitureModule, HandleHorizontalPosition, HandleMode, HandleOrientation, HandlePosition, ModuleType, PublicStyle } from '~~/shared/domain/types'
import { validateFurnitureDocIssues } from '~~/shared/domain/assembly-validation'
import { furnitureConfigText, moduleTypeText, uiText as t } from '~~/shared/i18n/ui-copy'
import {
  insertColumn,
  insertModule,
  readFurnitureDoc,
  removeColumn,
  removeModule,
  replaceFurnitureDoc,
  setColumnWidth,
  setConfigValue,
  setDrawerCount,
  setShelfCount,
  setModuleHeight,
  setModuleHandleMode,
  setModuleHandleOrientation,
  setModuleHandlePlacement,
  setModuleType,
} from '~~/shared/yjs/doc'

interface Props {
  ydoc: Y.Doc
  selectedModules?: { id: string }[]
  zoomPercent?: number
  publicStyle?: PublicStyle | null
}

const props = withDefaults(defineProps<Props>(), {
  selectedModules: () => [],
  zoomPercent: 100,
})

const emit = defineEmits<{
  (e: 'update:selectedModules', value: { id: string }[]): void
  (e: 'update:zoomPercent', value: number): void
}>()

const runtimeConfig = useRuntimeConfig()
const aiFurnitureEnabled = computed<boolean>(
  () => runtimeConfig.public.features?.promptFurniture === true,
)

// --- Reactive snapshot of the doc ---
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

const columns = computed(() => snapshot.value.columns)
const config = computed<FurnitureConfig>(() => snapshot.value.config)
const effectiveConfig = computed(() => config.value)

const internalSelectedIds = ref<string[]>([])
const clampedZoomPercent = computed<number>(() => {
  const z = props.zoomPercent
  return z === 25 || z === 50 || z === 75 || z === 100 ? z : 100
})
const selectedIds = computed<string[]>(() =>
  props.selectedModules.length > 0 ? props.selectedModules.map(s => s.id) : internalSelectedIds.value,
)
const selectedIdSet = computed(() => new Set(selectedIds.value))
const selectedModuleInfos = computed(() => {
  const infos: {
    id: string
    columnIndex: number
    moduleIndex: number
    columnWidth: number
    module: FurnitureModule
  }[] = []
  if (selectedIdSet.value.size === 0) return infos
  columns.value.forEach((col, columnIndex) => {
    col.modules.forEach((module, moduleIndex) => {
      if (selectedIdSet.value.has(module.id)) {
        infos.push({ id: module.id, columnIndex, moduleIndex, columnWidth: col.width, module })
      }
    })
  })
  return infos
})
const selectedCount = computed(() => selectedModuleInfos.value.length)
const inspectorIssues = computed<DesignerIssue[]>(() => validateFurnitureDocIssues(snapshot.value))
const visibleIssues = computed(() => {
  if (selectedCount.value === 0) return inspectorIssues.value.filter(issue => issue.moduleId == null)
  const ids = new Set(selectedModuleInfos.value.map(info => info.id))
  return inspectorIssues.value.filter(issue => issue.moduleId != null && ids.has(issue.moduleId))
})

// --- Selection helpers ---
function setSelection(ids: string[]) {
  internalSelectedIds.value = ids
  emit('update:selectedModules', ids.map(id => ({ id })))
}

function toggleModuleSelection(moduleId: string, shiftKey: boolean) {
  if (shiftKey) {
    const set = new Set(selectedIds.value)
    if (set.has(moduleId)) set.delete(moduleId)
    else set.add(moduleId)
    setSelection([...set])
  }
  else {
    setSelection([moduleId])
  }
}

function clearSelection() {
  setSelection([])
}

// --- Snapping (numeric clamp only — no snap lines) ---
function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  const upper = max >= min ? max : min
  return Math.min(upper, Math.max(min, value))
}

function clampColumnWidth(w: number): number {
  return clampNumber(w, config.value.minColumnWidth, config.value.maxColumnWidth)
}

function clampDrawerCount(drawerCount: number): number {
  return Math.max(DRAWER_COUNT_MIN, Math.min(DRAWER_COUNT_MAX, Math.round(drawerCount)))
}

function drawerCountForHeight(module: FurnitureModule, height: number): number {
  const current = clampDrawerCount(module.drawerCount ?? DEFAULT_DRAWER_COUNT)
  if (module.type !== 'drawer' || !Number.isFinite(height) || height <= 0) return current
  const maxDrawerBandHeight = Math.max(config.value.minDrawerHeight, config.value.maxDrawerHeight)
  if (!Number.isFinite(maxDrawerBandHeight) || maxDrawerBandHeight <= 0) return current
  return clampDrawerCount(Math.max(current, Math.ceil(height / maxDrawerBandHeight - 1e-9)))
}

function clampModuleHeight(module: FurnitureModule, h: number): number {
  let min = config.value.minModuleHeight
  let max = config.value.maxModuleHeight
  if (max < min) max = min
  if (module.type === 'drawer') {
    const drawerCount = clampDrawerCount(module.drawerCount ?? DEFAULT_DRAWER_COUNT)
    const minDrawerHeight = drawerCount * config.value.minDrawerHeight
    const maxDrawerHeight = drawerCount * config.value.maxDrawerHeight
    min = Math.max(min, minDrawerHeight)
    max = Math.min(max, Math.max(minDrawerHeight, maxDrawerHeight))
  }
  return clampNumber(h, min, max)
}

function setModuleHeightWithContentClamp(columnIndex: number, moduleIndex: number, module: FurnitureModule, height: number) {
  let nextModule = module
  if (module.type === 'drawer') {
    const drawerCount = drawerCountForHeight(module, height)
    if (drawerCount !== (module.drawerCount ?? DEFAULT_DRAWER_COUNT)) {
      setDrawerCount(props.ydoc, columnIndex, moduleIndex, drawerCount)
      nextModule = { ...module, drawerCount }
    }
  }
  else if (module.type === 'shelf') {
    const shelfCount = clampInteriorShelfCountForHeight(module.shelfCount, height, config.value)
    if (shelfCount !== normalizeInteriorShelfCount(module.shelfCount)) {
      setShelfCount(props.ydoc, columnIndex, moduleIndex, shelfCount)
      nextModule = { ...module, shelfCount }
    }
  }
  setModuleHeight(props.ydoc, columnIndex, moduleIndex, clampModuleHeight(nextModule, height))
}

// --- Module / column mutations ---
function defaultColumnWidth(): number {
  return DEFAULT_COLUMN_WIDTH
}

function keepInsertedColumnToDefaultShelf(index: number) {
  let moduleCount = readFurnitureDoc(props.ydoc).columns[index]?.modules.length ?? 0
  while (moduleCount > 1) {
    removeModule(props.ydoc, index, moduleCount - 1)
    moduleCount--
  }
}

function addColumnLeft() {
  insertColumn(props.ydoc, 0, defaultColumnWidth())
  keepInsertedColumnToDefaultShelf(0)
}

function addColumnRight() {
  const index = columns.value.length
  insertColumn(props.ydoc, index, defaultColumnWidth())
  keepInsertedColumnToDefaultShelf(index)
}

function removeColumnAt(index: number) {
  const removed = columns.value[index]
  removeColumn(props.ydoc, index)
  if (!removed) return
  const removedIds = new Set(removed.modules.map(m => m.id))
  setSelection(selectedIds.value.filter(id => !removedIds.has(id)))
}

function addModuleTop(columnIndex: number) {
  const col = columns.value[columnIndex]
  if (!col) return
  insertModule(props.ydoc, columnIndex, col.modules.length, 'shelf')
}

function setColumnWidthAt(columnIndex: number, w: number) {
  setColumnWidth(props.ydoc, columnIndex, clampColumnWidth(w))
}

function setModuleHeightAt(columnIndex: number, moduleIndex: number, h: number) {
  const module = columns.value[columnIndex]?.modules[moduleIndex]
  if (!module) return
  setModuleHeightWithContentClamp(columnIndex, moduleIndex, module, h)
}

function removeSelectedModule(columnIndex: number, moduleIndex: number) {
  const col = columns.value[columnIndex]
  const removed = col?.modules[moduleIndex]
  if (!col || !removed) return
  if (col.modules.length === 1) removeColumnAt(columnIndex)
  else {
    removeModule(props.ydoc, columnIndex, moduleIndex)
    setSelection(selectedIds.value.filter(id => id !== removed.id))
  }
}

function updateSelectedModulesType(type: ModuleType) {
  for (const info of selectedModuleInfos.value) {
    setModuleType(props.ydoc, info.columnIndex, info.moduleIndex, type)
    const module = readFurnitureDoc(props.ydoc).columns[info.columnIndex]?.modules[info.moduleIndex]
    if (module) setModuleHeightWithContentClamp(info.columnIndex, info.moduleIndex, module, module.height)
  }
}

function updateSelectedModulesColumnWidth(width: number) {
  const next = clampColumnWidth(width)
  const seen = new Set<number>()
  for (const info of selectedModuleInfos.value) {
    if (seen.has(info.columnIndex)) continue
    seen.add(info.columnIndex)
    setColumnWidth(props.ydoc, info.columnIndex, next)
  }
}

function updateSelectedModulesHeight(height: number) {
  for (const info of selectedModuleInfos.value) {
    setModuleHeightWithContentClamp(info.columnIndex, info.moduleIndex, info.module, height)
  }
}

function updateSelectedModulesDrawerCount(drawerCount: number) {
  const next = clampDrawerCount(drawerCount)
  for (const info of selectedModuleInfos.value) {
    if (info.module.type === 'drawer') {
      setDrawerCount(props.ydoc, info.columnIndex, info.moduleIndex, next)
      setModuleHeightWithContentClamp(info.columnIndex, info.moduleIndex, { ...info.module, drawerCount: next }, info.module.height)
    }
  }
}

function updateSelectedModulesShelfCount(shelfCount: number) {
  for (const info of selectedModuleInfos.value) {
    if (info.module.type !== 'shelf') continue
    const next = clampInteriorShelfCountForHeight(shelfCount, info.module.height, config.value)
    setShelfCount(props.ydoc, info.columnIndex, info.moduleIndex, next)
  }
}

// --- Column-resize drag (multi-target aware) ---
const Al = 220
const pxPerMeter = computed<number>(() => Al * (clampedZoomPercent.value / 100))

interface ColumnResizeState {
  startX: number
  direction: 1 | -1
  targets: { columnIndex: number, startWidth: number }[]
}
const columnResize = ref<ColumnResizeState | null>(null)

function onColumnResizeStart(columnIndex: number, direction: 1 | -1, ev: PointerEvent) {
  if (!columns.value[columnIndex]) return
  ev.preventDefault()
  cancelColumnResize()

  // Multi-target: if more than one column has at least one selected module,
  // drag all those columns at once.
  const selectedColumnIndices = new Set<number>()
  for (const id of selectedIds.value) {
    columns.value.forEach((col, ci) => {
      if (col.modules.some(m => m.id === id)) selectedColumnIndices.add(ci)
    })
  }

  let targets: { columnIndex: number, startWidth: number }[]
  if (selectedColumnIndices.size > 1) {
    targets = [...selectedColumnIndices].map(ci => ({
      columnIndex: ci,
      startWidth: columns.value[ci]?.width ?? 0,
    }))
  }
  else {
    targets = [{ columnIndex, startWidth: columns.value[columnIndex]?.width ?? 0 }]
  }

  columnResize.value = { startX: ev.clientX, direction, targets }
  if (import.meta.client) {
    window.addEventListener('pointermove', onColumnResizeMove)
    window.addEventListener('pointerup', cancelColumnResize)
    window.addEventListener('pointercancel', cancelColumnResize)
  }
}

function onColumnResizeMove(ev: PointerEvent) {
  const state = columnResize.value
  if (!state) return
  const dx = ev.clientX - state.startX
  const deltaMeters = (state.direction * dx) / pxPerMeter.value
  for (const t of state.targets) {
    setColumnWidth(props.ydoc, t.columnIndex, clampColumnWidth(t.startWidth + deltaMeters))
  }
}

function cancelColumnResize() {
  columnResize.value = null
  if (import.meta.client) {
    window.removeEventListener('pointermove', onColumnResizeMove)
    window.removeEventListener('pointerup', cancelColumnResize)
    window.removeEventListener('pointercancel', cancelColumnResize)
  }
}

if (getCurrentScope()) onScopeDispose(cancelColumnResize)

// --- Inspector / settings ---
interface DesignerIssue {
  code: string
  message: string
  severity: 'warning' | 'error'
  moduleId?: string | null
}

interface ConfigField {
  key: string
  label: string
  unit: 'cm'
  help: string
}

const projectDesignerConfigFields: ConfigField[] = FURNITURE_CONFIG_WRITABLE_KEYS.map((key) => {
  const meta = furnitureConfigText(key)
  return {
    key,
    label: meta.label,
    unit: 'cm',
    help: meta.help,
  }
})

const settingsOpen = ref(false)
const copiedConfig = ref(false)
let copiedConfigTimer: ReturnType<typeof setTimeout> | undefined

const aiBuildOpen = ref(false)
const aiPrompt = ref('')
const aiLoading = ref(false)
const aiError = ref('')
const aiDraft = ref<AiFurnitureDraft | null>(null)
const aiPromptInputRef = ref<HTMLTextAreaElement | null>(null)
let aiRequestSeq = 0
let aiAbortController: AbortController | null = null

const aiPromptLength = computed(() => aiPrompt.value.trim().length)
const aiDraftColumnCount = computed(() => aiDraft.value?.doc.columns.length ?? 0)
const aiDraftModuleCount = computed(() =>
  aiDraft.value?.doc.columns.reduce((sum, column) => sum + column.modules.length, 0) ?? 0,
)
const aiPromptOverLimit = computed(() => aiPromptLength.value > AI_FURNITURE_PROMPT_MAX_LENGTH)
const aiCanGenerate = computed(() =>
  aiPromptLength.value > 0
  && !aiPromptOverLimit.value
  && !aiLoading.value,
)
const aiPromptExamples = [
  {
    label: t('mediaConsole'),
    prompt: t('mediaConsolePrompt'),
  },
  {
    label: t('bookshelf'),
    prompt: t('bookshelfPrompt'),
  },
  {
    label: t('wardrobe'),
    prompt: t('wardrobePrompt'),
  },
]

watch(selectedCount, (count) => {
  if (count === 0) return
  settingsOpen.value = false
  copiedConfig.value = false
  if (copiedConfigTimer !== undefined) {
    clearTimeout(copiedConfigTimer)
    copiedConfigTimer = undefined
  }
})

const selectedTypeValue = computed(() => {
  if (selectedModuleInfos.value.length === 0) return ''
  const first = selectedModuleInfos.value[0]?.module.type
  return first && selectedModuleInfos.value.every(info => info.module.type === first) ? first : '__multiple__'
})

const selectedColumnWidthValue = computed(() => {
  if (selectedModuleInfos.value.length === 0) return ''
  const first = selectedModuleInfos.value[0]?.columnWidth
  return typeof first === 'number' && selectedModuleInfos.value.every(info => info.columnWidth === first) ? formatCentimeters(first) : ''
})

const selectedHeightValue = computed(() => {
  if (selectedModuleInfos.value.length === 0) return ''
  const first = selectedModuleInfos.value[0]?.module.height
  return typeof first === 'number' && selectedModuleInfos.value.every(info => info.module.height === first) ? formatCentimeters(first) : ''
})

const selectedDrawerCountValue = computed(() => {
  if (selectedTypeValue.value !== 'drawer') return ''
  const first = selectedModuleInfos.value[0]?.module.drawerCount
  return typeof first === 'number' && selectedModuleInfos.value.every(info => info.module.type === 'drawer' && info.module.drawerCount === first) ? String(first) : ''
})

const selectedShelfCountValue = computed(() => {
  if (selectedTypeValue.value !== 'shelf') return ''
  const first = normalizeInteriorShelfCount(selectedModuleInfos.value[0]?.module.shelfCount)
  return selectedModuleInfos.value.every(info =>
    info.module.type === 'shelf' && normalizeInteriorShelfCount(info.module.shelfCount) === first,
  ) ? String(first) : ''
})

const selectedShelfCountMax = computed(() => {
  const shelfModules = selectedModuleInfos.value.filter(info => info.module.type === 'shelf')
  if (shelfModules.length === 0) return INTERIOR_SHELF_COUNT_MIN
  return Math.min(...shelfModules.map(info => maxInteriorShelfCountForHeight(info.module.height, config.value)))
})

const selectedHandleModuleInfos = computed(() => selectedModuleInfos.value.filter(info => info.module.type !== 'shelf'))

const selectedHandleModeValue = computed<HandleMode | '__multiple__'>(() => {
  const infos = selectedHandleModuleInfos.value
  if (infos.length === 0) return '__multiple__'
  const first = moduleHandleMode(infos[0]!.module)
  return infos.every(info => moduleHandleMode(info.module) === first) ? first : '__multiple__'
})

type HandlePlacementKey = `${HandlePosition}-${HandleHorizontalPosition}`

const selectedHandlePlacementValue = computed<HandlePlacementKey | '__multiple__'>(() => {
  const infos = selectedHandleModuleInfos.value
  if (infos.length === 0) return '__multiple__'
  const placement = (module: FurnitureModule): HandlePlacementKey =>
    `${module.handlePosition ?? 'top'}-${moduleHandleHorizontalPosition(module)}`
  const first = placement(infos[0]!.module)
  return infos.every(info => placement(info.module) === first) ? first : '__multiple__'
})

const selectedHandleOrientationValue = computed<HandleOrientation | '__multiple__'>(() => {
  const infos = selectedHandleModuleInfos.value
  if (infos.length === 0) return '__multiple__'
  const orientation = (module: FurnitureModule): HandleOrientation => module.handleOrientation ?? (module.type === 'drawer' ? 'horizontal' : 'vertical')
  const first = orientation(infos[0]!.module)
  return infos.every(info => orientation(info.module) === first) ? first : '__multiple__'
})

const handlePlacementOptions = computed<{ key: HandlePlacementKey, vertical: HandlePosition, horizontal: HandleHorizontalPosition, icon: string, label: string }[]>(() => [
  { key: 'top-left', vertical: 'top', horizontal: 'left', icon: 'i-lucide-arrow-up-left', label: t('handlePositionTopLeft') },
  { key: 'top-center', vertical: 'top', horizontal: 'center', icon: 'i-lucide-arrow-up', label: t('handlePositionTopCenter') },
  { key: 'top-right', vertical: 'top', horizontal: 'right', icon: 'i-lucide-arrow-up-right', label: t('handlePositionTopRight') },
  { key: 'center-left', vertical: 'center', horizontal: 'left', icon: 'i-lucide-arrow-left', label: t('handlePositionCenterLeft') },
  { key: 'center-center', vertical: 'center', horizontal: 'center', icon: 'i-lucide-circle-dot', label: t('handlePositionCenter') },
  { key: 'center-right', vertical: 'center', horizontal: 'right', icon: 'i-lucide-arrow-right', label: t('handlePositionCenterRight') },
  { key: 'bottom-left', vertical: 'bottom', horizontal: 'left', icon: 'i-lucide-arrow-down-left', label: t('handlePositionBottomLeft') },
  { key: 'bottom-center', vertical: 'bottom', horizontal: 'center', icon: 'i-lucide-arrow-down', label: t('handlePositionBottomCenter') },
  { key: 'bottom-right', vertical: 'bottom', horizontal: 'right', icon: 'i-lucide-arrow-down-right', label: t('handlePositionBottomRight') },
])

const selectedTypeItems = computed(() => [
  { value: '__multiple__', label: t('multiple') },
  ...MODULE_TYPES.map(type => ({ value: type, label: moduleTypeText(type) })),
])

function parsePositiveMetric(value: string): number | null {
  const next = Number(value.trim().replace(',', '.'))
  return Number.isFinite(next) && next > 0 ? next : null
}

function parseNonNegativeMetric(value: string): number | null {
  if (value.trim() === '') return null
  const next = Number(value.trim().replace(',', '.'))
  return Number.isFinite(next) && next >= 0 ? next : null
}

function centimetersToMeters(centimeters: number): number {
  return centimeters / 100
}

function formatCentimeters(meters: number): string {
  if (!Number.isFinite(meters)) return ''
  const centimeters = Math.round(meters * 1000) / 10
  return String(centimeters)
}

function formatConfigValue(field: ConfigField) {
  const key = field.key as keyof FurnitureConfig
  const value = effectiveConfig.value[key] ?? DEFAULT_FURNITURE_CONFIG[key]
  if (!Number.isFinite(value)) return ''
  return formatCentimeters(value)
}

function updateConfigValue(key: string, value: number) {
  setConfigValue(props.ydoc, key as keyof FurnitureConfig, value as FurnitureConfig[keyof FurnitureConfig])
}

function commitConfigField(field: ConfigField, event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const parsed = parseNonNegativeMetric(input.value)
  if (parsed == null) {
    input.value = formatConfigValue(field)
    return
  }
  updateConfigValue(field.key, centimetersToMeters(parsed))
  input.value = formatConfigValue(field)
}

function resetConfig() {
  for (const k of FURNITURE_CONFIG_WRITABLE_KEYS) {
    setConfigValue(props.ydoc, k, DEFAULT_FURNITURE_CONFIG[k])
  }
}

function configJson() {
  const values = projectDesignerConfigFields.reduce<Record<string, number>>((acc, field) => {
    const key = field.key as keyof FurnitureConfig
    acc[field.key] = effectiveConfig.value[key] ?? DEFAULT_FURNITURE_CONFIG[key]
    return acc
  }, {})
  return JSON.stringify(values, null, 2)
}

async function openAiBuilder() {
  aiError.value = ''
  aiDraft.value = null
  aiBuildOpen.value = true
  await nextTick()
  aiPromptInputRef.value?.focus()
}

async function useAiPromptExample(prompt: string) {
  if (aiLoading.value) return
  aiPrompt.value = prompt
  aiError.value = ''
  aiDraft.value = null
  await nextTick()
  aiPromptInputRef.value?.focus()
}

function abortAiGeneration() {
  aiRequestSeq++
  aiAbortController?.abort()
  aiAbortController = null
  aiLoading.value = false
}

watch(aiBuildOpen, (open) => {
  if (!open) abortAiGeneration()
})

function aiFetchErrorMessage(err: unknown): string {
  const error = err as {
    statusMessage?: string
    message?: string
    data?: { statusMessage?: string, message?: string }
  } | null
  return error?.data?.statusMessage
    || error?.statusMessage
    || error?.data?.message
    || error?.message
    || t('aiGenerateError')
}

async function generateAiFurniture() {
  const prompt = aiPrompt.value.trim()
  aiError.value = ''
  if (!prompt) {
    aiError.value = t('promptEmptyError')
    return
  }
  if (prompt.length > AI_FURNITURE_PROMPT_MAX_LENGTH) {
    aiError.value = t('promptTooLong', { max: AI_FURNITURE_PROMPT_MAX_LENGTH })
    return
  }
  aiAbortController?.abort()
  const requestSeq = ++aiRequestSeq
  const controller = new AbortController()
  aiAbortController = controller
  aiDraft.value = null
  aiLoading.value = true
  try {
    const response = await $fetch<AiFurnitureGenerateResponse>('/api/ai/furniture/generate', {
      method: 'POST',
      signal: controller.signal,
      body: {
        prompt,
        current: readFurnitureDoc(props.ydoc),
        mode: 'replace',
      },
    })
    if (requestSeq !== aiRequestSeq) return
    aiDraft.value = response.draft
  }
  catch (err: unknown) {
    if (requestSeq !== aiRequestSeq || controller.signal.aborted) return
    aiDraft.value = null
    aiError.value = aiFetchErrorMessage(err)
  }
  finally {
    if (requestSeq === aiRequestSeq) {
      aiLoading.value = false
      aiAbortController = null
    }
  }
}

function applyAiFurnitureDraft() {
  if (!aiDraft.value) return
  replaceFurnitureDoc(props.ydoc, aiDraft.value.doc)
  setSelection([])
  aiBuildOpen.value = false
  aiDraft.value = null
  aiError.value = ''
}

async function copyConfigJson() {
  const json = configJson()
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(json)
  }
  else {
    const textarea = document.createElement('textarea')
    textarea.value = json
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
  copiedConfig.value = true
  if (copiedConfigTimer) clearTimeout(copiedConfigTimer)
  copiedConfigTimer = setTimeout(() => {
    copiedConfig.value = false
    copiedConfigTimer = undefined
  }, 1200)
}

function onSelectedTypeChange(value: string) {
  if (value && value !== '__multiple__' && MODULE_TYPES.includes(value as ModuleType)) {
    updateSelectedModulesType(value as ModuleType)
  }
}

function onSelectedColumnWidthCommit(event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const value = parsePositiveMetric(input.value)
  if (value == null) input.value = selectedColumnWidthValue.value
  else updateSelectedModulesColumnWidth(centimetersToMeters(value))
}

function onSelectedHeightCommit(event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const value = parsePositiveMetric(input.value)
  if (value == null) input.value = selectedHeightValue.value
  else updateSelectedModulesHeight(centimetersToMeters(value))
}

function onSelectedDrawerCountCommit(event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const value = Number(input.value.trim())
  const next = Math.round(value)
  if (!Number.isFinite(value) || next < DRAWER_COUNT_MIN || next > DRAWER_COUNT_MAX) {
    input.value = selectedDrawerCountValue.value
    return
  }
  updateSelectedModulesDrawerCount(next)
  input.value = String(next)
}

function onSelectedShelfCountCommit(event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const value = Number(input.value.trim())
  const rounded = Math.round(value)
  if (!Number.isFinite(value) || rounded < INTERIOR_SHELF_COUNT_MIN || rounded > INTERIOR_SHELF_COUNT_MAX) {
    input.value = selectedShelfCountValue.value
    return
  }
  const next = Math.min(rounded, selectedShelfCountMax.value)
  updateSelectedModulesShelfCount(next)
  input.value = String(next)
}

function updateSelectedHandleMode(mode: HandleMode) {
  for (const info of selectedHandleModuleInfos.value) {
    setModuleHandleMode(props.ydoc, info.columnIndex, info.moduleIndex, mode)
  }
}

function updateSelectedHandlePlacement(vertical: HandlePosition, horizontal: HandleHorizontalPosition) {
  for (const info of selectedHandleModuleInfos.value) {
    setModuleHandlePlacement(props.ydoc, info.columnIndex, info.moduleIndex, vertical, horizontal)
  }
}

function updateSelectedHandleOrientation(orientation: HandleOrientation) {
  for (const info of selectedHandleModuleInfos.value) {
    setModuleHandleOrientation(props.ydoc, info.columnIndex, info.moduleIndex, orientation)
  }
}

if (getCurrentScope()) {
  onScopeDispose(() => {
    abortAiGeneration()
    if (copiedConfigTimer) clearTimeout(copiedConfigTimer)
  })
}
</script>

<template>
  <div class="designer-root relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg shadow-sm ring-1 ring-default/60">
    <ProjectDesignerFrontView
      :columns="columns"
      :config="config"
      :public-style="publicStyle"
      :selected-module-ids="selectedIds"
      :zoom-percent="clampedZoomPercent"
      class="relative z-0 min-h-0 w-full flex-1"
      @add-column-left="addColumnLeft"
      @add-column-right="addColumnRight"
      @clear-module-selection="clearSelection"
      @remove-column="removeColumnAt"
      @add-module-top="addModuleTop"
      @toggle-module-selection="toggleModuleSelection"
      @column-resize-start="onColumnResizeStart"
      @set-column-width="setColumnWidthAt"
      @set-module-height="setModuleHeightAt"
      @open-project-details="settingsOpen = true"
      @set-config-value="updateConfigValue"
      @update:zoom-percent="(v: number) => emit('update:zoomPercent', v)"
    />

    <div
      v-if="selectedCount > 0 || visibleIssues.length > 0"
      class="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-4 sm:px-3 sm:pb-3 sm:pt-10"
    >
      <div
        class="pointer-events-auto max-h-[min(70dvh,32rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-xl bg-elevated shadow-lg ring-1 ring-default/60 sm:max-h-none sm:overflow-visible"
      >
        <div class="inspector-root min-w-0 bg-elevated">
          <div
            v-if="visibleIssues.length > 0"
            class="px-3 py-3 sm:px-4"
          >
            <div class="grid auto-rows-auto gap-2">
              <div
                v-for="issue in visibleIssues"
                :key="issue.moduleId != null ? `${issue.moduleId}:${issue.code}` : issue.code"
                class="text-pretty rounded-lg px-3 py-2 text-xs shadow-sm ring-1"
                :class="issue.severity === 'error' ? 'bg-error/10 text-error ring-error/20' : 'bg-elevated text-default ring-default/60'"
              >
                {{ issue.message }}
              </div>
            </div>
          </div>

          <div
            v-if="selectedCount > 0"
            class="p-3 sm:p-4"
          >
            <div
              class="grid gap-3"
            >
              <article class="grid gap-3 text-sm">
                <div class="flex min-w-0 items-center justify-between gap-2">
                  <h2 class="min-w-0 text-balance font-medium text-highlighted tabular-nums">
                    {{ selectedCount }} {{ selectedCount === 1 ? t('selectedOne') : t('selectedMany') }}
                  </h2>
                  <UButton
                    v-if="aiFurnitureEnabled"
                    color="primary"
                    icon="i-lucide-sparkles"
                    :label="t('aiBuild')"
                    size="xs"
                    variant="solid"
                    class="min-h-8 shrink-0 rounded-full px-3 shadow-sm transition-transform duration-150 active:scale-[0.97]"
                    @click="openAiBuilder"
                  />
                </div>

                <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
                  <dt class="self-center text-muted">
                    {{ t('type') }}
                  </dt>
                  <dd class="min-w-0">
                    <USelect
                      :model-value="selectedTypeValue || '__multiple__'"
                      :items="selectedTypeItems"
                      value-key="value"
                      class="w-full"
                      size="xs"
                      @update:model-value="onSelectedTypeChange"
                    />
                  </dd>

                  <dt class="self-center text-muted">
                    {{ t('width') }}
                  </dt>
                  <dd class="min-w-0">
                    <div class="flex items-center gap-1">
                      <input
                        :value="selectedColumnWidthValue"
                        type="text"
                        inputmode="decimal"
                        class="w-full min-w-0 rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                        :placeholder="t('mixed')"
                        :aria-label="t('columnWidthAria')"
                        @keydown.enter.prevent="onSelectedColumnWidthCommit"
                        @blur="onSelectedColumnWidthCommit"
                      >
                      <span class="shrink-0 text-muted">cm</span>
                    </div>
                  </dd>

                  <dt class="self-center text-muted">
                    {{ t('height') }}
                  </dt>
                  <dd class="min-w-0">
                    <div class="flex items-center gap-1">
                      <input
                        :value="selectedHeightValue"
                        type="text"
                        inputmode="decimal"
                        class="w-full min-w-0 rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                        :placeholder="t('mixed')"
                        :aria-label="t('selectedHeightAria')"
                        @keydown.enter.prevent="onSelectedHeightCommit"
                        @blur="onSelectedHeightCommit"
                      >
                      <span class="shrink-0 text-muted">cm</span>
                    </div>
                  </dd>

                  <template v-if="selectedTypeValue === 'drawer'">
                    <dt class="self-center text-muted">
                      {{ t('drawers') }}
                    </dt>
                    <dd class="min-w-0">
                      <input
                        :value="selectedDrawerCountValue"
                        type="text"
                        inputmode="numeric"
                        class="w-full min-w-0 rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                        :placeholder="t('mixed')"
                        :aria-label="t('selectedDrawerCountAria')"
                        @keydown.enter.prevent="onSelectedDrawerCountCommit"
                        @blur="onSelectedDrawerCountCommit"
                      >
                    </dd>
                  </template>

                  <template v-if="selectedTypeValue === 'shelf'">
                    <dt class="self-center text-muted">
                      {{ t('interiorShelves') }}
                    </dt>
                    <dd class="min-w-0">
                      <input
                        :value="selectedShelfCountValue"
                        type="text"
                        inputmode="numeric"
                        class="w-full min-w-0 rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
                        :placeholder="t('mixed')"
                        :aria-label="t('selectedInteriorShelfCountAria')"
                        :disabled="selectedShelfCountMax === 0"
                        @keydown.enter.prevent="onSelectedShelfCountCommit"
                        @blur="onSelectedShelfCountCommit"
                      >
                    </dd>
                  </template>

                  <template v-if="selectedHandleModuleInfos.length > 0">
                    <dt class="self-center text-muted">
                      {{ t('handle') }}
                    </dt>
                    <dd class="min-w-0">
                      <div
                        class="grid grid-cols-3 rounded-md bg-muted p-0.5"
                        role="group"
                        :aria-label="t('handle')"
                      >
                        <button
                          type="button"
                          class="min-h-7 rounded px-2 text-xs font-medium transition-colors"
                          :class="selectedHandleModeValue === 'none' ? 'bg-elevated text-highlighted shadow-sm' : 'text-muted hover:text-highlighted'"
                          :aria-pressed="selectedHandleModeValue === 'none'"
                          @click="updateSelectedHandleMode('none')"
                        >
                          {{ t('no') }}
                        </button>
                        <button
                          type="button"
                          class="min-h-7 rounded px-2 text-xs font-medium transition-colors"
                          :class="selectedHandleModeValue === 'hole' ? 'bg-elevated text-highlighted shadow-sm' : 'text-muted hover:text-highlighted'"
                          :aria-pressed="selectedHandleModeValue === 'hole'"
                          @click="updateSelectedHandleMode('hole')"
                        >
                          {{ t('handleHole') }}
                        </button>
                        <button
                          type="button"
                          class="min-h-7 rounded px-2 text-xs font-medium transition-colors"
                          :class="selectedHandleModeValue === 'handle' ? 'bg-elevated text-highlighted shadow-sm' : 'text-muted hover:text-highlighted'"
                          :aria-pressed="selectedHandleModeValue === 'handle'"
                          @click="updateSelectedHandleMode('handle')"
                        >
                          {{ t('yes') }}
                        </button>
                      </div>
                    </dd>

                    <template v-if="selectedHandleModeValue !== 'none'">
                      <dt class="self-center text-muted">
                        {{ t('handlePosition') }}
                      </dt>
                      <dd class="min-w-0">
                        <div
                          class="grid w-full grid-cols-9 gap-0.5 rounded-md bg-muted p-0.5"
                          role="group"
                          :aria-label="t('handlePosition')"
                        >
                          <button
                            v-for="option in handlePlacementOptions"
                            :key="option.key"
                            type="button"
                            class="grid min-h-7 min-w-0 place-items-center rounded transition-colors"
                            :class="selectedHandlePlacementValue === option.key ? 'bg-elevated text-highlighted shadow-sm' : 'text-muted hover:text-highlighted'"
                            :aria-label="option.label"
                            :title="option.label"
                            :aria-pressed="selectedHandlePlacementValue === option.key"
                            @click="updateSelectedHandlePlacement(option.vertical, option.horizontal)"
                          >
                            <UIcon :name="option.icon" class="size-3.5" />
                          </button>
                        </div>
                      </dd>

                      <dt class="self-center text-muted">
                        {{ t('orientation') }}
                      </dt>
                      <dd class="min-w-0">
                        <div
                          class="grid grid-cols-2 rounded-md bg-muted p-0.5"
                          role="group"
                          :aria-label="t('orientation')"
                        >
                          <button
                            type="button"
                            class="flex min-h-7 items-center justify-center gap-1 rounded px-1.5 text-[11px] font-medium transition-colors"
                            :class="selectedHandleOrientationValue === 'horizontal' ? 'bg-elevated text-highlighted shadow-sm' : 'text-muted hover:text-highlighted'"
                            :aria-pressed="selectedHandleOrientationValue === 'horizontal'"
                            @click="updateSelectedHandleOrientation('horizontal')"
                          >
                            <UIcon name="i-lucide-arrow-left-right" class="size-3.5" />
                            {{ t('handleHorizontal') }}
                          </button>
                          <button
                            type="button"
                            class="flex min-h-7 items-center justify-center gap-1 rounded px-1.5 text-[11px] font-medium transition-colors"
                            :class="selectedHandleOrientationValue === 'vertical' ? 'bg-elevated text-highlighted shadow-sm' : 'text-muted hover:text-highlighted'"
                            :aria-pressed="selectedHandleOrientationValue === 'vertical'"
                            @click="updateSelectedHandleOrientation('vertical')"
                          >
                            <UIcon name="i-lucide-arrow-up-down" class="size-3.5" />
                            {{ t('handleVertical') }}
                          </button>
                        </div>
                      </dd>
                    </template>
                  </template>
                </dl>

                <UButton
                  v-if="selectedModuleInfos[0]"
                  block
                  color="error"
                  icon="i-lucide-trash-2"
                  :label="t('deleteModule')"
                  size="xs"
                  variant="soft"
                  class="justify-self-stretch active:scale-[0.97] transition-transform duration-150"
                  @click="removeSelectedModule(selectedModuleInfos[0].columnIndex, selectedModuleInfos[0].moduleIndex)"
                />
              </article>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AppDialog
      v-model:open="settingsOpen"
      :title="t('projectSettings')"
      :description="t('projectSettingsDescription')"
    >
      <div class="flex flex-wrap items-center justify-end gap-1 border-b border-default pb-3">
        <UButton
          icon="i-lucide-rotate-ccw"
          :label="t('reset')"
          size="xs"
          color="neutral"
          variant="ghost"
          :aria-label="t('resetProjectSettings')"
          class="active:scale-[0.97] transition-transform duration-150"
          @click="resetConfig"
        />
        <UButton
          :icon="copiedConfig ? 'i-lucide-check' : 'i-lucide-copy'"
          :label="copiedConfig ? t('copied') : t('copyJson')"
          size="xs"
          color="neutral"
          variant="soft"
          :aria-label="t('copyProjectSettingsJson')"
          class="active:scale-[0.97] transition-transform duration-150"
          @click="copyConfigJson"
        />
      </div>

      <dl class="grid max-h-[min(24rem,55vh)] grid-cols-[1fr_auto] gap-x-3 gap-y-2 overflow-y-auto pr-1 text-xs">
        <template
          v-for="field in projectDesignerConfigFields"
          :key="field.key"
        >
          <dt class="flex min-w-0 items-center gap-1 self-center text-muted">
            <span class="truncate">{{ field.label }}</span>
            <UTooltip
              :text="field.help"
              :delay-duration="100"
              :content="{ side: 'left', sideOffset: 6 }"
            >
              <button
                type="button"
                class="config-help-icon active:scale-[0.97] transition-transform duration-150"
                :aria-label="`${field.label}`"
              >
                <UIcon
                  name="i-lucide-circle-help"
                  class="size-3.5"
                />
              </button>
            </UTooltip>
          </dt>
          <dd>
            <div class="flex items-center gap-1">
              <input
                :value="formatConfigValue(field)"
                type="text"
                inputmode="decimal"
                class="w-20 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                :aria-label="`${field.label} (${field.unit})`"
                @keydown.enter.prevent="commitConfigField(field, $event)"
                @blur="commitConfigField(field, $event)"
              >
              <span class="text-muted lowercase">{{ field.unit }}</span>
            </div>
          </dd>
        </template>
      </dl>

      <template #footer="{ close }">
        <UButton
          :label="t('done')"
          color="neutral"
          variant="outline"
          class="w-full min-w-0 justify-center active:scale-[0.97] transition-transform duration-150"
          @click="close()"
        />
      </template>
    </AppDialog>

    <AppDialog
      v-model:open="aiBuildOpen"
      :title="t('buildWithAi')"
      :description="t('buildWithAiDescription')"
      size="lg"
    >
      <div class="grid gap-4">
        <div class="grid gap-3 rounded-xl bg-muted p-3 shadow-sm ring-1 ring-default/60">
          <div class="flex min-w-0 items-center justify-between gap-3">
            <label
              for="ai-build-prompt"
              class="text-sm font-medium text-highlighted"
            >
              {{ t('prompt') }}
            </label>
            <span
              class="text-[11px] tabular-nums"
              :class="aiPromptOverLimit ? 'text-error' : 'text-muted'"
            >
              {{ aiPromptLength }} / {{ AI_FURNITURE_PROMPT_MAX_LENGTH }}
            </span>
          </div>
          <textarea
            id="ai-build-prompt"
            ref="aiPromptInputRef"
            v-model="aiPrompt"
            rows="5"
            :maxlength="AI_FURNITURE_PROMPT_MAX_LENGTH"
            :placeholder="t('promptPlaceholder')"
            :disabled="aiLoading"
            class="block min-h-36 w-full resize-y rounded-lg bg-default px-3 py-3 text-sm leading-6 text-highlighted shadow-sm outline-none ring-1 ring-default/70 transition-[background-color,box-shadow] duration-150 placeholder:text-muted focus:bg-elevated focus:ring-2 focus:ring-primary/70 disabled:cursor-not-allowed disabled:opacity-60"
            @keydown.meta.enter.prevent="generateAiFurniture"
            @keydown.ctrl.enter.prevent="generateAiFurniture"
          />

          <div class="flex min-w-0 flex-wrap gap-1.5">
            <button
              v-for="example in aiPromptExamples"
              :key="example.label"
              type="button"
              class="min-h-8 rounded-full bg-elevated px-3 text-xs font-medium text-toned shadow-sm ring-1 ring-default/60 transition-[transform,background-color,color] duration-150 hover:bg-accented hover:text-highlighted active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="aiLoading"
              @click="useAiPromptExample(example.prompt)"
            >
              {{ example.label }}
            </button>
          </div>
        </div>
      </div>

      <UAlert
        v-if="aiError"
        color="error"
        variant="soft"
        :title="aiError"
      />

      <div
        v-if="aiLoading"
        class="flex min-h-28 items-center gap-3 rounded-xl bg-muted p-4 shadow-sm ring-1 ring-default/60"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-5 shrink-0 animate-spin text-primary"
        />
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">
            {{ t('generatingLayout') }}
          </p>
          <p class="text-pretty text-xs text-muted">
            {{ t('generatingLayoutDescription') }}
          </p>
        </div>
      </div>

      <div
        v-if="aiDraft"
        class="grid gap-3 rounded-xl bg-default p-3 shadow-sm ring-1 ring-default/60 sm:grid-cols-[minmax(0,1.1fr)_minmax(12rem,0.9fr)]"
      >
        <div class="min-w-0 overflow-hidden rounded-lg bg-muted p-2 ring-1 ring-default/50">
          <ProjectPreview
            :columns="aiDraft.doc.columns"
            :config="aiDraft.doc.config"
            :public-style="publicStyle"
          />
        </div>
        <div class="grid gap-2 text-xs">
          <p class="text-[11px] font-semibold uppercase tracking-normal text-muted">
            {{ t('previewSummary') }}
          </p>
          <p class="text-pretty text-highlighted">
            {{ aiDraft.summary }}
          </p>
          <div class="flex flex-wrap gap-1.5">
            <UBadge
              color="neutral"
              variant="soft"
              size="sm"
            >
              {{ aiDraftColumnCount }} {{ t('columns') }}
            </UBadge>
            <UBadge
              color="neutral"
              variant="soft"
              size="sm"
            >
              {{ aiDraftModuleCount }} {{ t('modules') }}
            </UBadge>
          </div>
          <ul
            v-if="aiDraft.warnings.length > 0"
            class="grid gap-1 rounded-lg bg-muted p-2 text-muted"
          >
            <li
              v-for="warning in aiDraft.warnings"
              :key="warning"
              class="text-pretty"
            >
              {{ warning }}
            </li>
          </ul>
        </div>
      </div>

      <template #footer="{ close }">
        <div class="grid w-full grid-cols-2 gap-2">
          <UButton
            :label="aiDraft ? t('close') : t('cancel')"
            color="neutral"
            variant="outline"
            class="w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
            :disabled="aiLoading"
            @click="close()"
          />
          <UButton
            v-if="!aiDraft"
            :label="t('generateLayout')"
            icon="i-lucide-sparkles"
            class="w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
            :loading="aiLoading"
            :disabled="!aiCanGenerate"
            @click="generateAiFurniture"
          />
          <UButton
            v-else
            :label="t('apply')"
            icon="i-lucide-check"
            class="w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
            :disabled="aiLoading"
            @click="applyAiFurnitureDraft"
          />
        </div>
        <UButton
          v-if="aiDraft"
          block
          :label="t('regenerate')"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="soft"
          class="mt-2 min-h-10 justify-center transition-transform active:scale-[0.97]"
          :loading="aiLoading"
          @click="generateAiFurniture"
        />
      </template>
    </AppDialog>
  </div>
</template>

<style scoped>
.designer-root {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
}
.config-help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted);
  border-radius: 9999px;
  outline: none;
  cursor: help;
  transition: color 0.15s;
}
.config-help-icon:hover,
.config-help-icon:focus-visible {
  color: var(--ui-text-highlighted);
}
</style>
