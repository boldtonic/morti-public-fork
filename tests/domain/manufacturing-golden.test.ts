import { describe, expect, it } from 'vitest'

import { compileAssembly, validateFurnitureDocIssues } from '~~/shared/domain/assembly'
import { canonicalJsonStringify, fnv1a64Hex } from '~~/shared/domain/canonical-json'
import { buildManufacturingCutlist } from '~~/shared/domain/manufacturing-cutlist'
import {
  createManufacturingPackage,
  manufacturingOperationConservationIssues,
  serializeManufacturingPackage,
  type ManufacturingOperationV1,
} from '~~/shared/domain/manufacturing-package'
import type { PanelOperation } from '~~/shared/domain/types'
import { MANUFACTURING_GOLDEN_PROJECTS } from '../fixtures/manufacturing-projects'

function round(value: number, decimals = 3): number {
  const multiplier = 10 ** decimals
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier
}

function expectedOperation(operation: PanelOperation): ManufacturingOperationV1 {
  const center = operation.center
    ?? (operation.operationType === 'through-hole'
      ? operation.cx == null || operation.cy == null ? null : { x: operation.cx, y: operation.cy }
      : operation.x == null || operation.y == null ? null : { x: operation.x, y: operation.y })
  const purpose = operation.id.startsWith('op:pull-hole:')
    ? 'handle-mounting'
    : operation.id.startsWith('op:rail-cut:')
      ? operation.id.includes('drawer-bottom:') ? 'drawer-bottom-groove' : 'back-panel-groove'
      : 'unspecified'
  const millimetres = (value: number | undefined) => value == null ? null : round(value * 1000)

  return {
    id: operation.id,
    type: operation.operationType,
    targetInstanceId: operation.targetPanelKey,
    face: operation.face ?? null,
    centerMm: center ? { x: millimetres(center.x)!, y: millimetres(center.y)! } : null,
    diameterMm: millimetres(operation.diameter),
    widthMm: millimetres(operation.width),
    heightMm: millimetres(operation.height),
    lengthMm: millimetres(operation.length),
    depthMm: millimetres(operation.depth),
    rotationDeg: operation.rotation == null ? null : round(operation.rotation * 180 / Math.PI, 6),
    through: operation.through ?? null,
    sourceModuleId: operation.sourceModuleId ?? null,
    purpose,
    productionStatus: 'unvalidated',
  }
}

function sortedCanonical<T>(values: T[]): string[] {
  return values.map(value => canonicalJsonStringify(value)).sort()
}

describe('manufacturing golden projects', () => {
  it('keeps representative projects byte-stable and production-traceable', () => {
    const observed = MANUFACTURING_GOLDEN_PROJECTS.map((project) => {
      const packageValue = createManufacturingPackage({
        furniture: project.furniture,
        publicStyle: project.publicStyle,
        projectName: project.id,
      })
      const cutlist = buildManufacturingCutlist(packageValue)
      const operationCount = packageValue.parts.reduce((sum, part) => sum + part.operations.length, 0)
      return {
        id: project.id,
        hash: fnv1a64Hex(serializeManufacturingPackage(packageValue)),
        status: packageValue.status,
        parts: packageValue.parts.length,
        panelGroups: cutlist.panelGroups.length,
        operations: operationCount,
        operationGroups: cutlist.operationGroups.length,
        hardware: packageValue.hardware.reduce((sum, item) => sum + item.quantity, 0),
        errors: packageValue.issues.filter(issue => issue.severity === 'error').map(issue => issue.code),
      }
    })

    expect(observed).toEqual([
      {
        id: 'open-carcass',
        hash: '525649130e3b22f5',
        status: 'preliminary',
        parts: 5,
        panelGroups: 5,
        operations: 4,
        operationGroups: 4,
        hardware: 0,
        errors: [],
      },
      {
        id: 'interior-shelves',
        hash: '022f21409ffd9d62',
        status: 'preliminary',
        parts: 8,
        panelGroups: 6,
        operations: 4,
        operationGroups: 4,
        hardware: 0,
        errors: [],
      },
      {
        id: 'two-drawers',
        hash: '336872b637938067',
        status: 'preliminary',
        parts: 15,
        panelGroups: 11,
        operations: 16,
        operationGroups: 13,
        hardware: 2,
        errors: [],
      },
      {
        id: 'single-door',
        hash: 'c3b623bab9f6d902',
        status: 'preliminary',
        parts: 6,
        panelGroups: 6,
        operations: 5,
        operationGroups: 5,
        hardware: 1,
        errors: [],
      },
      {
        id: 'double-doors',
        hash: '037b2848762247b4',
        status: 'preliminary',
        parts: 7,
        panelGroups: 7,
        operations: 6,
        operationGroups: 6,
        hardware: 2,
        errors: [],
      },
      {
        id: 'stepped-mixed',
        hash: 'ea407112346368cc',
        status: 'preliminary',
        parts: 32,
        panelGroups: 28,
        operations: 35,
        operationGroups: 28,
        hardware: 4,
        errors: [],
      },
    ])
  })

  it('never merges operations that differ by exact machining coordinates', () => {
    const source = MANUFACTURING_GOLDEN_PROJECTS.find(project => project.id === 'two-drawers')!
    const furniture = structuredClone(source.furniture)
    const firstDrawer = furniture.columns[0]!.modules[0]!
    furniture.columns[0]!.modules.push({
      ...firstDrawer,
      id: 'drawers-2',
      handlePosition: 'bottom',
    })

    const packageValue = createManufacturingPackage({ furniture, publicStyle: source.publicStyle })
    const cutlist = buildManufacturingCutlist(packageValue)
    const drawerFrontParts = packageValue.parts.filter(part => part.role === 'drawer-front')
    const drawerFrontGroups = cutlist.panelGroups.filter(group => group.role === 'drawer-front')
    const operationSignatures = drawerFrontParts.map(part => canonicalJsonStringify(
      part.operations.map(operation => ({
        type: operation.type,
        face: operation.face,
        centerMm: operation.centerMm,
        diameterMm: operation.diameterMm,
        widthMm: operation.widthMm,
        heightMm: operation.heightMm,
        lengthMm: operation.lengthMm,
        depthMm: operation.depthMm,
        rotationDeg: operation.rotationDeg,
        through: operation.through,
      })),
    ))
    const distinctOperationSignatures = new Set(operationSignatures)
    const distinctPartIds = new Set(drawerFrontParts.map(part => part.partId))

    expect(distinctOperationSignatures.size).toBeGreaterThan(1)
    expect(distinctPartIds.size).toBe(distinctOperationSignatures.size)
    expect(drawerFrontGroups).toHaveLength(distinctOperationSignatures.size)
    expect(drawerFrontGroups.reduce((sum, group) => sum + group.quantity, 0)).toBe(drawerFrontParts.length)
  })

  it('conserves the complete raw compiler inventory through package and cutlist grouping', () => {
    for (const project of MANUFACTURING_GOLDEN_PROJECTS) {
      const assembly = compileAssembly(project.furniture)
      const packageValue = createManufacturingPackage({
        furniture: project.furniture,
        publicStyle: project.publicStyle,
        projectName: project.id,
      })
      const cutlist = buildManufacturingCutlist(packageValue)
      const packagedOperations = packageValue.parts.flatMap(part => part.operations)

      expect(packageValue.parts.map(part => part.instanceId).sort()).toEqual(
        assembly.panels.map(panel => panel.key).sort(),
      )
      expect(sortedCanonical(packagedOperations)).toEqual(
        sortedCanonical(assembly.operations.map(expectedOperation)),
      )
      expect(cutlist.panelGroups.flatMap(group => group.instanceIds).sort()).toEqual(
        packageValue.parts.map(part => part.instanceId).sort(),
      )
      expect(cutlist.operationGroups.flatMap(group => group.operationIds).sort()).toEqual(
        packagedOperations.map(operation => operation.id).sort(),
      )
      expect(cutlist.panelGroups.reduce((sum, group) => sum + group.quantity, 0)).toBe(packageValue.parts.length)
      expect(cutlist.operationGroups.reduce((sum, group) => sum + group.quantity, 0)).toBe(packagedOperations.length)
      expect(cutlist.status).toBe(packageValue.status)
      expect(cutlist.issues).toEqual(packageValue.issues)
      expect(packageValue.parts.every(part => Object.values(part.dimensions).every(value => value === null || Number.isFinite(value) && value > 0))).toBe(true)
      expect(packageValue.parts.every(part => part.operations.every(operation => operation.targetInstanceId === part.instanceId))).toBe(true)
    }
  })

  it('blocks compiler operations that cannot be conserved in the package', () => {
    const source = MANUFACTURING_GOLDEN_PROJECTS.find(project => project.id === 'two-drawers')!
    const assembly = compileAssembly(source.furniture)
    const packageValue = createManufacturingPackage({ furniture: source.furniture, publicStyle: source.publicStyle })

    expect(manufacturingOperationConservationIssues(assembly.operations, packageValue.parts)).toEqual([])

    const orphan = {
      ...assembly.operations[0]!,
      id: 'op:orphan:test',
      targetPanelKey: 'missing-panel',
    }
    expect(manufacturingOperationConservationIssues([...assembly.operations, orphan], packageValue.parts)).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'operation-conservation-failed',
        instanceId: 'missing-panel',
      }),
    ])

    const mutations: Array<(operation: ManufacturingOperationV1) => void> = [
      operation => { operation.face = operation.face === 'front' ? 'back' : 'front' },
      operation => { operation.centerMm = operation.centerMm ? { ...operation.centerMm, x: operation.centerMm.x + 0.5 } : { x: 0.5, y: 0 } },
      operation => { operation.depthMm = (operation.depthMm ?? 0) + 0.5 },
      operation => { operation.widthMm = (operation.widthMm ?? 0) + 0.5 },
      operation => { operation.heightMm = (operation.heightMm ?? 0) + 0.5 },
      operation => { operation.lengthMm = (operation.lengthMm ?? 0) + 0.5 },
      operation => { operation.rotationDeg = (operation.rotationDeg ?? 0) + 0.5 },
      operation => { operation.through = operation.through !== true },
    ]
    for (const mutate of mutations) {
      const changedParts = structuredClone(packageValue.parts)
      mutate(changedParts.flatMap(part => part.operations)[0]!)
      expect(manufacturingOperationConservationIssues(assembly.operations, changedParts)).toEqual([
        expect.objectContaining({ severity: 'error', code: 'operation-conservation-failed' }),
      ])
    }
  })

  it('uses the compiler validation as the single design and manufacturing source', () => {
    for (const project of MANUFACTURING_GOLDEN_PROJECTS) {
      expect(validateFurnitureDocIssues(project.furniture)).toEqual(compileAssembly(project.furniture).issues)
    }
  })
})
