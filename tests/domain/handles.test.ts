import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

vi.mock('three-bvh-csg', () => ({
  Brush: class {},
  Evaluator: class {},
  SUBTRACTION: 1,
}))

import { compileAssembly } from '~~/shared/domain/assembly'
import { DEFAULT_FURNITURE_CONFIG, DEFAULT_PUBLIC_STYLE, normalizePublicStyle } from '~~/shared/domain/defaults'
import { isKnobHandleType, isSquareHandleType, moduleHandleHorizontalPosition, moduleHasHandleHoles, moduleShowsPhysicalHandle, resolveHandleType } from '~~/shared/domain/handles'
import { DESIGN_SCHEMA_VERSION, type FurnitureDoc, type FurnitureModule } from '~~/shared/domain/types'
import {
  ensureInitialized,
  getFurnitureMap,
  insertColumn,
  readFurnitureDoc,
  setModuleHandleOrientation,
  setModuleHandlePlacement,
  setModuleHandleMode,
  setModuleType,
} from '~~/shared/yjs/doc'

function furnitureDoc(module: FurnitureModule): FurnitureDoc {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    lastAppliedMigrationId: null,
    config: { ...DEFAULT_FURNITURE_CONFIG },
    columns: [{ width: 0.45, modules: [module] }],
  }
}

function pullOperations(module: FurnitureModule) {
  return compileAssembly(furnitureDoc(module)).operations.filter(operation => operation.id.startsWith('op:pull-hole:'))
}

describe('handle configuration', () => {
  it('preserves the current automatic graphite look as the style default', () => {
    const style = normalizePublicStyle()
    expect(style.rendered.handles).toEqual({ type: 'auto', finish: 'graphite' })
    expect(resolveHandleType({ id: 'drawer', type: 'drawer', height: 0.3 }, style.rendered.handles)).toBe('bar')
    expect(resolveHandleType({ id: 'door', type: 'left-door', height: 0.3 }, style.rendered.handles)).toBe('knob')
  })

  it('normalizes and classifies the square handle variants', () => {
    const squareKnobStyle = normalizePublicStyle({
      rendered: {
        ...DEFAULT_PUBLIC_STYLE.rendered,
        handles: { type: 'square-knob', finish: 'nickel' },
      },
    })
    const squareBarStyle = normalizePublicStyle({
      rendered: {
        ...DEFAULT_PUBLIC_STYLE.rendered,
        handles: { type: 'square-bar', finish: 'brass' },
      },
    })

    expect(squareKnobStyle.rendered.handles).toEqual({ type: 'square-knob', finish: 'nickel' })
    expect(squareBarStyle.rendered.handles).toEqual({ type: 'square-bar', finish: 'brass' })
    expect(isKnobHandleType('square-knob')).toBe(true)
    expect(isKnobHandleType('square-bar')).toBe(false)
    expect(isSquareHandleType('square-knob')).toBe(true)
    expect(isSquareHandleType('square-bar')).toBe(true)
  })

  it('normalizes old Yjs modules to physical handles and contextual orientation', () => {
    const doc = new Y.Doc()
    ensureInitialized(doc)
    insertColumn(doc, 0)
    setModuleType(doc, 0, 0, 'drawer')

    const module = readFurnitureDoc(doc).columns[0]!.modules[0]!
    expect(module.handleMode).toBe('handle')
    expect(module.handlePosition).toBe('top')
    expect(module.handleHorizontalPosition).toBe('center')
    expect(module.handleOrientation).toBe('horizontal')
  })

  it('preserves legacy horizontal defaults by module type', () => {
    expect(moduleHandleHorizontalPosition({ id: 'drawer', type: 'drawer', height: 0.3 })).toBe('center')
    expect(moduleHandleHorizontalPosition({ id: 'doors', type: 'doors', height: 0.3 })).toBe('center')
    expect(moduleHandleHorizontalPosition({ id: 'left', type: 'left-door', height: 0.3 })).toBe('right')
    expect(moduleHandleHorizontalPosition({ id: 'right', type: 'right-door', height: 0.3 })).toBe('left')
  })

  it('migrates the legacy disabled boolean to no handle treatment', () => {
    const doc = new Y.Doc()
    ensureInitialized(doc)
    insertColumn(doc, 0)
    setModuleType(doc, 0, 0, 'left-door')

    const columns = getFurnitureMap(doc).get('columns') as Y.Array<Y.Map<unknown>>
    const modules = columns.get(0)!.get('modules') as Y.Array<Y.Map<unknown>>
    const moduleMap = modules.get(0)!
    moduleMap.delete('handleMode')
    moduleMap.set('handlesEnabled', false)

    ensureInitialized(doc)

    expect(readFurnitureDoc(doc).columns[0]!.modules[0]!.handleMode).toBe('none')
    expect(moduleMap.has('handlesEnabled')).toBe(false)
  })

  it('persists module handle controls through the Yjs document', () => {
    const doc = new Y.Doc()
    ensureInitialized(doc)
    insertColumn(doc, 0)
    setModuleType(doc, 0, 0, 'right-door')
    setModuleHandleMode(doc, 0, 0, 'hole')
    setModuleHandlePlacement(doc, 0, 0, 'bottom', 'left')
    setModuleHandleOrientation(doc, 0, 0, 'horizontal')

    const module = readFurnitureDoc(doc).columns[0]!.modules[0]!
    expect(module).toMatchObject({
      type: 'right-door',
      handleMode: 'hole',
      handlePosition: 'bottom',
      handleHorizontalPosition: 'left',
      handleOrientation: 'horizontal',
    })
  })

  it('removes pull holes when the module has no handle treatment', () => {
    expect(pullOperations({
      id: 'drawer',
      type: 'drawer',
      height: 0.3,
      drawerCount: 1,
      handleMode: 'none',
      handlePosition: 'top',
      handleOrientation: 'horizontal',
    })).toHaveLength(0)
  })

  it('keeps manufacturing holes without rendering physical hardware in hole mode', () => {
    const module: FurnitureModule = {
      id: 'door',
      type: 'left-door',
      height: 0.3,
      handleMode: 'hole',
      handlePosition: 'top',
      handleOrientation: 'vertical',
    }

    expect(pullOperations(module)).toHaveLength(1)
    expect(moduleHasHandleHoles(module)).toBe(true)
    expect(moduleShowsPhysicalHandle(module)).toBe(false)
  })

  it('keeps legacy single-door holes opposite their hinges', () => {
    const leftHinge = pullOperations({
      id: 'left',
      type: 'left-door',
      height: 0.3,
      handleMode: 'handle',
      handlePosition: 'top',
      handleOrientation: 'vertical',
    })
    const rightHinge = pullOperations({
      id: 'right',
      type: 'right-door',
      height: 0.3,
      handleMode: 'handle',
      handlePosition: 'top',
      handleOrientation: 'vertical',
    })

    expect(leftHinge[0]!.center!.x).toBeGreaterThan(0)
    expect(rightHinge[0]!.center!.x).toBeLessThan(0)
  })

  it('places a vertical drawer pair on the selected edge', () => {
    const operations = pullOperations({
      id: 'drawer',
      type: 'drawer',
      height: 0.3,
      drawerCount: 1,
      handleMode: 'handle',
      handlePosition: 'bottom',
      handleOrientation: 'vertical',
    })

    expect(operations).toHaveLength(2)
    expect(operations[0]!.center!.x).toBeCloseTo(operations[1]!.center!.x)
    expect(Math.abs(operations[0]!.center!.y - operations[1]!.center!.y)).toBeCloseTo(DEFAULT_FURNITURE_CONFIG.pullHolePairGap)
    expect((operations[0]!.center!.y + operations[1]!.center!.y) / 2).toBeLessThan(0)
  })

  it('places a horizontal drawer pair on the selected center-left anchor', () => {
    const operations = pullOperations({
      id: 'drawer',
      type: 'drawer',
      height: 0.3,
      drawerCount: 1,
      handleMode: 'handle',
      handlePosition: 'center',
      handleHorizontalPosition: 'left',
      handleOrientation: 'horizontal',
    })

    expect(operations).toHaveLength(2)
    expect(Math.abs(operations[0]!.center!.x - operations[1]!.center!.x)).toBeCloseTo(DEFAULT_FURNITURE_CONFIG.pullHolePairGap)
    expect((operations[0]!.center!.x + operations[1]!.center!.x) / 2).toBeLessThan(0)
    expect(operations[0]!.center!.y).toBeCloseTo(0)
    expect(operations[1]!.center!.y).toBeCloseTo(0)
  })

  it('maps every 3x3 anchor to the expected machining quadrant', () => {
    const verticalPositions = ['top', 'center', 'bottom'] as const
    const horizontalPositions = ['left', 'center', 'right'] as const

    for (const vertical of verticalPositions) {
      for (const horizontal of horizontalPositions) {
        const operations = pullOperations({
          id: `${vertical}-${horizontal}`,
          type: 'drawer',
          height: 0.3,
          drawerCount: 1,
          handleMode: 'handle',
          handlePosition: vertical,
          handleHorizontalPosition: horizontal,
          handleOrientation: 'horizontal',
        })
        const centerX = (operations[0]!.center!.x + operations[1]!.center!.x) / 2
        const centerY = (operations[0]!.center!.y + operations[1]!.center!.y) / 2

        if (horizontal === 'left') expect(centerX).toBeLessThan(0)
        else if (horizontal === 'right') expect(centerX).toBeGreaterThan(0)
        else expect(centerX).toBeCloseTo(0)

        if (vertical === 'top') expect(centerY).toBeGreaterThan(0)
        else if (vertical === 'bottom') expect(centerY).toBeLessThan(0)
        else expect(centerY).toBeCloseTo(0)
      }
    }
  })
})
