import { describe, expect, it } from 'vitest'

import { compileAssembly, validateFurnitureDocIssues } from '~~/shared/domain/assembly'
import { canonicalJsonStringify, fnv1a64Hex } from '~~/shared/domain/canonical-json'
import { buildManufacturingCutlist } from '~~/shared/domain/manufacturing-cutlist'
import {
  createManufacturingPackage,
  manufacturingOperationConservationIssues,
  serializeManufacturingPackage,
} from '~~/shared/domain/manufacturing-package'
import { MANUFACTURING_GOLDEN_PROJECTS } from '../fixtures/manufacturing-projects'

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
  })

  it('uses the compiler validation as the single design and manufacturing source', () => {
    for (const project of MANUFACTURING_GOLDEN_PROJECTS) {
      expect(validateFurnitureDocIssues(project.furniture)).toEqual(compileAssembly(project.furniture).issues)
    }
  })
})
