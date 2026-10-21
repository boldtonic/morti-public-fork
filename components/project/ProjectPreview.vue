<script setup lang="ts">
import { horizontalHandleStyle, pairedDoorHorizontalStyle } from '~~/components/project/handle-2d-layout'
import { DEFAULT_FURNITURE_CONFIG, normalizePublicStyle } from '~~/shared/domain/defaults'
import { HANDLE_FINISH_SPECS, isKnobHandleType, isSquareHandleType, moduleHasHandleHoles, moduleShowsPhysicalHandle, resolveHandleCenter, resolveHandleType } from '~~/shared/domain/handles'
import { interiorShelfCenterOffsets, normalizeInteriorShelfCount } from '~~/shared/domain/interior-shelves'
import type { FurnitureColumn, FurnitureConfig, FurnitureModule, PublicStyle } from '~~/shared/domain/types'
import { moduleTypeText } from '~~/shared/i18n/ui-copy'

interface Props {
  columns: FurnitureColumn[]
  furnitureConfig?: FurnitureConfig | null
  config?: FurnitureConfig | null
  publicStyle?: PublicStyle | null
}

const props = withDefaults(defineProps<Props>(), {
  furnitureConfig: null,
  config: null,
})

const PX_PER_M = 80
const OUTER_PADDING = 3
const RAIL_SIZE = 2

const furnitureConfig = computed<FurnitureConfig>(() => props.furnitureConfig ?? props.config ?? DEFAULT_FURNITURE_CONFIG)
const handleStyle = computed(() => normalizePublicStyle(props.publicStyle).rendered.handles)

function pxValue(metres: number): number {
  if (!Number.isFinite(metres) || metres <= 0) return 0
  return Math.round(metres * PX_PER_M)
}

function px(metres: number): string {
  return `${pxValue(metres)}px`
}

function columnTotalHeight(column: FurnitureColumn): number {
  return column.modules.reduce((sum, mod) => sum + mod.height, 0)
}

function columnRenderedHeight(column: FurnitureColumn): number {
  const moduleHeight = pxValue(columnTotalHeight(column))
  const height = moduleHeight > 0 ? moduleHeight + RAIL_SIZE : 0
  return height > 0 ? height + OUTER_PADDING * 2 : 0
}

function columnStackHeight(column: FurnitureColumn): string {
  const moduleHeight = pxValue(columnTotalHeight(column))
  return `${moduleHeight > 0 ? moduleHeight + RAIL_SIZE : 0}px`
}

function moduleBoundaryHeight(column: FurnitureColumn, boundaryIndex: number): number {
  let height = 0
  const count = Math.min(Math.max(0, boundaryIndex), column.modules.length)
  for (let i = 0; i < count; i++) height += column.modules[i]?.height ?? 0
  return height
}

function moduleStackStyle(column: FurnitureColumn, moduleIndex: number, module: FurnitureModule): Record<string, string> {
  return {
    height: px(module.height),
    bottom: `${RAIL_SIZE / 2 + pxValue(moduleBoundaryHeight(column, moduleIndex))}px`,
  }
}

function railStyle(column: FurnitureColumn, boundaryIndex: number): Record<string, string> {
  return {
    height: `${RAIL_SIZE}px`,
    bottom: `${pxValue(moduleBoundaryHeight(column, boundaryIndex))}px`,
  }
}

const previewHeight = computed<string>(() => {
  const height = props.columns.reduce((maxHeight, column) => Math.max(maxHeight, columnRenderedHeight(column)), 0)
  return `${Math.max(48, height)}px`
})

function boundaryHeightPx(boundaryIndex: number): string {
  const previous = props.columns[boundaryIndex - 1]
  const next = props.columns[boundaryIndex]
  return `${Math.max(previous ? columnRenderedHeight(previous) : 0, next ? columnRenderedHeight(next) : 0)}px`
}

function pullDiameterPx(): number {
  return Math.max(2, Math.round(furnitureConfig.value.pullHoleDiameter * PX_PER_M))
}

function pullEdgeInsetPx(): number {
  return Math.round(furnitureConfig.value.pullHoleEdgeInset * PX_PER_M)
}

function pullPairHalfGapPx(): number {
  return Math.round((furnitureConfig.value.pullHolePairGap / 2) * PX_PER_M)
}

function handleOrientation(mod: FurnitureModule) {
  return mod.handleOrientation ?? (mod.type === 'drawer' ? 'horizontal' : 'vertical')
}

function handleDimensions(mod: FurnitureModule) {
  const d = pullDiameterPx()
  if (isKnobHandleType(resolveHandleType(mod, handleStyle.value))) return { width: d, height: d }
  const config = furnitureConfig.value
  const length = Math.max(
    Math.round(d * 2.6),
    Math.round((config.pullHolePairGap + config.pullHoleDiameter * 1.15) * PX_PER_M),
  )
  const thickness = Math.max(2, Math.round(d * 0.55))
  return handleOrientation(mod) === 'vertical'
    ? { width: thickness, height: length }
    : { width: length, height: thickness }
}

function handleClass(mod: FurnitureModule): string {
  const type = resolveHandleType(mod, handleStyle.value)
  const family = isKnobHandleType(type) ? 'pull-knob-2d' : 'pull-bar-2d'
  const shape = isSquareHandleType(type) ? 'pull-square-2d' : 'pull-round-2d'
  return `${family} ${shape}`
}

function handleVisualStyle(mod: FurnitureModule): Record<string, string> {
  return { backgroundColor: HANDLE_FINISH_SPECS[handleStyle.value.finish].color }
}

function doorHandleBottom(mod: FurnitureModule, handleHeight: number): string {
  const config = furnitureConfig.value
  const edge = Math.max(config.pullHoleEdgeInset, config.pullHoleDiameter / 2)
  const center = resolveHandleCenter(edge, Math.max(edge, mod.height - edge), mod.handlePosition)
  return `${center * PX_PER_M - handleHeight / 2}px`
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

function doorSeamStyle(): Record<string, string> {
  return {
    width: `${Math.max(1, Math.round(furnitureConfig.value.panelThickness * PX_PER_M))}px`,
    left: '50%',
    top: '0',
    bottom: '0',
    transform: 'translateX(-50%)',
  }
}

function drawerHandleStyle(mod: FurnitureModule, drawerIndex: number): Record<string, string> {
  const config = furnitureConfig.value
  const drawerCount = mod.drawerCount ?? 1
  const topM = (drawerIndex / drawerCount) * mod.height
  const bottomM = ((drawerIndex - 1) / drawerCount) * mod.height
  const reserve = handleOrientation(mod) === 'vertical' ? config.pullHolePairGap / 2 : 0
  const edge = Math.max(config.pullHoleEdgeInset, config.pullHoleDiameter / 2)
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
  const config = furnitureConfig.value
  const drawerCount = mod.drawerCount ?? 1
  const topM = (drawerIndex / drawerCount) * mod.height
  const bottomM = ((drawerIndex - 1) / drawerCount) * mod.height
  const orientation = handleOrientation(mod)
  const reserve = orientation === 'vertical' ? config.pullHolePairGap / 2 : 0
  const edge = Math.max(config.pullHoleEdgeInset, config.pullHoleDiameter / 2)
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

function moduleClass(mod: FurnitureModule): string {
  return mod.type === 'shelf' ? 'preview-shelf' : 'bg-primary'
}

function interiorShelfCount(mod: FurnitureModule): number {
  return normalizeInteriorShelfCount(mod.shelfCount)
}

function interiorShelfStyle(mod: FurnitureModule, shelfIndex: number): Record<string, string> {
  const center = interiorShelfCenterOffsets(mod.height, mod.shelfCount, furnitureConfig.value)[shelfIndex - 1] ?? 0
  const thickness = Math.max(1, pxValue(furnitureConfig.value.panelThickness))
  return {
    height: `${thickness}px`,
    bottom: `${pxValue(center) - thickness / 2}px`,
  }
}
</script>

<template>
  <div class="flex items-center justify-center overflow-hidden rounded-md bg-muted p-2 shadow-sm ring-1 ring-default/60 tabular-nums">
    <div
      v-if="columns.length > 0"
      class="flex w-max items-end justify-center"
      :style="{ height: previewHeight }"
    >
      <div
        class="shrink-0 bg-primary"
        :style="{ width: `${RAIL_SIZE}px`, height: boundaryHeightPx(0) }"
        aria-hidden="true"
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
            :style="{ padding: `${OUTER_PADDING}px` }"
          >
            <div
              class="relative w-full shrink-0"
              :style="{ height: columnStackHeight(col) }"
            >
              <span
                class="absolute inset-x-0 z-10 block bg-primary"
                :style="railStyle(col, 0)"
                aria-hidden="true"
              />

              <template
                v-for="(mod, mi) in col.modules"
                :key="mod.id ?? mi"
              >
                <div
                  :class="['absolute inset-x-0 z-0 block', moduleClass(mod)]"
                  :style="moduleStackStyle(col, mi, mod)"
                  :aria-label="moduleTypeText(mod.type)"
                >
                  <template v-if="mod.type === 'shelf'">
                    <div
                      v-for="i in interiorShelfCount(mod)"
                      :key="`${mod.id}-interior-shelf-${i}`"
                      class="pointer-events-none absolute inset-x-0 bg-primary"
                      :style="interiorShelfStyle(mod, i)"
                      aria-hidden="true"
                    />
                  </template>

                  <template v-else-if="mod.type === 'drawer'">
                    <div
                      v-for="i in (mod.drawerCount ?? 1) - 1"
                      :key="`${mod.id}-drawer-sep-${i}`"
                      class="absolute left-0 right-0 bg-[var(--ui-bg)]"
                      :style="{ height: '2px', bottom: `${(i / (mod.drawerCount ?? 1)) * 100}%` }"
                      aria-hidden="true"
                    />
                    <template
                      v-if="moduleShowsPhysicalHandle(mod)"
                      v-for="i in (mod.drawerCount ?? 1)"
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
                      v-for="i in (mod.drawerCount ?? 1)"
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
                      class="absolute bg-[var(--ui-bg)]"
                      :style="doorSeamStyle()"
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
                </div>

                <span
                  class="absolute inset-x-0 z-10 block bg-primary"
                  :style="railStyle(col, mi + 1)"
                  aria-hidden="true"
                />
              </template>
            </div>
          </div>
        </div>

        <div
          class="shrink-0 bg-primary"
          :style="{ width: `${RAIL_SIZE}px`, height: boundaryHeightPx(ci + 1) }"
          aria-hidden="true"
        />
      </template>
    </div>

    <div
      v-else
      class="flex h-full w-full items-center justify-center text-balance text-xs text-muted"
    >
      Empty project
    </div>
  </div>
</template>

<style scoped>
.preview-shelf {
  background-color: transparent;
  border: 1px solid var(--ui-primary);
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
</style>
