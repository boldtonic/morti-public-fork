<script setup lang="ts">
import type * as Y from 'yjs'
import { buildManufacturingCutlist } from '~~/shared/domain/manufacturing-cutlist'
import {
  createManufacturingPackage,
  type ManufacturingOperationV1,
  type ManufacturingPartV1,
} from '~~/shared/domain/manufacturing-package'
import type { CompiledPanel, FurnitureDoc, PanelOperation, PublicStyle } from '~~/shared/domain/types'
import { panelRoleText, uiText as t } from '~~/shared/i18n/ui-copy'
import { readFurnitureDoc } from '~~/shared/yjs/doc'

const PanelSvgPreview = defineAsyncComponent(() => import('~~/components/project/PanelSvgPreview.vue'))
const PanelCanvas = defineAsyncComponent(() => import('~~/components/three/PanelCanvas.vue'))

interface Props {
  ydoc?: Y.Doc | null
  doc?: Y.Doc | null
  publicStyle?: PublicStyle | null
  selectedDrawingKey?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  ydoc: null,
  doc: null,
  publicStyle: null,
  selectedDrawingKey: null,
})

const emit = defineEmits<{
  (e: 'update:selectedDrawingKey', value: string | null): void
}>()

const activeDoc = computed(() => props.ydoc ?? props.doc ?? null)
const snapshot = shallowRef<FurnitureDoc | null>(activeDoc.value ? readFurnitureDoc(activeDoc.value) : null)

function refreshSnapshot() {
  snapshot.value = activeDoc.value ? readFurnitureDoc(activeDoc.value) : null
}

function onDocUpdate() {
  refreshSnapshot()
}

watch(
  activeDoc,
  (next, prev) => {
    prev?.off('update', onDocUpdate)
    next?.on('update', onDocUpdate)
    refreshSnapshot()
  },
  { immediate: true },
)

if (getCurrentScope()) {
  onScopeDispose(() => {
    activeDoc.value?.off('update', onDocUpdate)
  })
}

const manufacturingPackage = computed(() => snapshot.value
  ? createManufacturingPackage({ furniture: snapshot.value, publicStyle: props.publicStyle })
  : null)
const cutlist = computed(() => manufacturingPackage.value ? buildManufacturingCutlist(manufacturingPackage.value) : null)

interface PanelGroup {
  key: string
  groupId: string
  representative: CompiledPanel
  operations: PanelOperation[]
  quantity: number
  widthMm: number
  heightMm: number
  nominalThicknessMm: number
}

function operationForDrawing(operation: ManufacturingOperationV1): PanelOperation {
  const center = operation.centerMm
    ? { x: operation.centerMm.x / 1000, y: operation.centerMm.y / 1000 }
    : undefined
  const common = {
    id: operation.id,
    operationType: operation.type,
    targetPanelKey: operation.targetInstanceId,
    face: operation.face ?? undefined,
    center,
    depth: operation.depthMm == null ? undefined : operation.depthMm / 1000,
    sourceModuleId: operation.sourceModuleId ?? undefined,
  }
  if (operation.type === 'through-hole') {
    return {
      ...common,
      cx: center?.x,
      cy: center?.y,
      diameter: operation.diameterMm == null ? undefined : operation.diameterMm / 1000,
      through: operation.through ?? undefined,
    }
  }
  return {
    ...common,
    x: center?.x,
    y: center?.y,
    width: operation.widthMm == null ? undefined : operation.widthMm / 1000,
    height: operation.heightMm == null ? undefined : operation.heightMm / 1000,
    length: operation.lengthMm == null ? undefined : operation.lengthMm / 1000,
    rotation: operation.rotationDeg == null ? undefined : operation.rotationDeg * Math.PI / 180,
  }
}

function panelForDrawing(part: ManufacturingPartV1): CompiledPanel {
  const operations = part.operations.map(operationForDrawing)
  return {
    key: part.instanceId,
    role: part.role,
    width: part.dimensions.widthMm / 1000,
    height: part.dimensions.heightMm / 1000,
    thickness: part.dimensions.nominalThicknessMm / 1000,
    position: [
      part.assemblyPlacement.positionMm.x / 1000,
      part.assemblyPlacement.positionMm.y / 1000,
      part.assemblyPlacement.positionMm.z / 1000,
    ],
    rotation: [
      part.assemblyPlacement.rotationDeg.x * Math.PI / 180,
      part.assemblyPlacement.rotationDeg.y * Math.PI / 180,
      part.assemblyPlacement.rotationDeg.z * Math.PI / 180,
    ],
    operations,
    ...(part.orientation ? { orientation: part.orientation } : {}),
    ...(part.sourceModuleIds[0] ? { sourceModuleId: part.sourceModuleIds[0] } : {}),
    ...(part.doorHinge ? { doorHinge: part.doorHinge } : {}),
    touchedModuleIds: [...part.sourceModuleIds],
  }
}

const panelGroups = computed<PanelGroup[]>(() => {
  if (!cutlist.value || !manufacturingPackage.value) return []
  const partsByInstanceId = new Map(manufacturingPackage.value.parts.map(part => [part.instanceId, part]))

  return cutlist.value.panelGroups.flatMap((group) => {
    const representativePart = partsByInstanceId.get(group.representativeInstanceId)
    if (!representativePart) return []
    const representative = panelForDrawing(representativePart)
    return [{
      key: group.key,
      groupId: group.groupId,
      representative,
      operations: representative.operations,
      quantity: group.quantity,
      widthMm: group.widthMm,
      heightMm: group.heightMm,
      nominalThicknessMm: group.nominalThicknessMm,
    }]
  })
})

function isSelectedGroup(group: PanelGroup) {
  return props.selectedDrawingKey === group.key || props.selectedDrawingKey === group.groupId
}

const selectedPanelGroup = computed(() => {
  const selected = props.selectedDrawingKey
  if (!selected) return null
  return panelGroups.value.find(group => group.key === selected || group.groupId === selected) ?? null
})

const isShowingSelectedPanel = computed(() => Boolean(selectedPanelGroup.value))

const visiblePanelGroups = computed(() => {
  const selected = props.selectedDrawingKey
  if (!selected) return panelGroups.value
  return selectedPanelGroup.value ? [selectedPanelGroup.value] : panelGroups.value
})

watch([panelGroups, () => props.selectedDrawingKey], ([groups]) => {
  const selected = props.selectedDrawingKey
  if (selected && !groups.some(group => group.key === selected || group.groupId === selected)) {
    emit('update:selectedDrawingKey', null)
  }
})

function selectPanel(group: PanelGroup) {
  emit('update:selectedDrawingKey', isSelectedGroup(group) ? null : group.key)
}

function clearSelection() {
  emit('update:selectedDrawingKey', null)
}

function onPanelCardClick(group: PanelGroup) {
  if (isShowingSelectedPanel.value) return
  selectPanel(group)
}

function onPanelCardKeydown(group: PanelGroup) {
  if (isShowingSelectedPanel.value) return
  selectPanel(group)
}

function stopSelectedCanvasClick(group: PanelGroup, event: MouseEvent) {
  if (isSelectedGroup(group)) event.stopPropagation()
}

function formatMillimetres(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}
</script>

<template>
  <div
    class="h-full min-h-0 w-full px-3 pb-3 pt-32 md:pt-26"
    :class="isShowingSelectedPanel ? 'flex min-h-0 flex-col' : 'overflow-auto'"
  >
    <div
      v-if="panelGroups.length === 0"
      class="flex h-full items-center justify-center text-sm text-muted"
    >
      {{ t('noPanelsYet') }}
    </div>
    <button
      v-else-if="isShowingSelectedPanel"
      type="button"
      class="mb-2 inline-flex w-fit shrink-0 items-center gap-1.5 text-xs font-medium text-muted hover:text-highlighted"
      @click="clearSelection"
    >
      <UIcon
        name="i-lucide-grid-2x2"
        class="size-4"
      />
      {{ t('showAllPanels') }}
    </button>
    <div
      v-if="panelGroups.length > 0"
      class="gap-3"
      :class="isShowingSelectedPanel ? 'mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'"
    >
      <article
        v-for="group in visiblePanelGroups"
        :key="group.key"
        class="flex flex-col overflow-hidden rounded-lg bg-default shadow-sm transition-[box-shadow,transform]"
        :class="[
          isSelectedGroup(group) ? 'ring-2 ring-primary' : '',
          isShowingSelectedPanel ? 'min-h-0 flex-1 cursor-default' : 'cursor-pointer active:scale-[0.99]',
        ]"
        :role="isShowingSelectedPanel ? undefined : 'button'"
        :tabindex="isShowingSelectedPanel ? undefined : 0"
        @click="onPanelCardClick(group)"
        @keydown.enter.prevent="onPanelCardKeydown(group)"
        @keydown.space.prevent="onPanelCardKeydown(group)"
      >
        <div
          class="w-full"
          :class="isShowingSelectedPanel ? 'min-h-0 flex-1' : 'aspect-square'"
          @click="stopSelectedCanvasClick(group, $event)"
        >
          <PanelCanvas
            v-if="isShowingSelectedPanel"
            :part="group.representative"
            :operations="group.operations"
            class="h-full min-h-0 w-full"
          />
          <PanelSvgPreview
            v-else
            :part="group.representative"
            :operations="group.operations"
            class="h-full min-h-0 w-full"
          />
        </div>

        <div class="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
          <div class="flex min-w-0 flex-1 items-start gap-2">
            <span class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-elevated text-[10px] font-bold leading-none tracking-tight tabular-nums text-highlighted">
              {{ group.groupId }}
            </span>
            <div
              v-if="isShowingSelectedPanel"
              class="min-w-0 flex-1"
            >
              <div class="truncate text-balance text-xs font-semibold text-highlighted">
                {{ panelRoleText(group.representative.role) }}
              </div>
              <div class="truncate text-xs tabular-nums text-muted">
                {{ formatMillimetres(group.widthMm) }} × {{ formatMillimetres(group.heightMm) }} × {{ formatMillimetres(group.nominalThicknessMm) }} mm
              </div>
            </div>
          </div>
          <div class="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-xs font-semibold tabular-nums text-highlighted">
            ×{{ group.quantity }}
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
