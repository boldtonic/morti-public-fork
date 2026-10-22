import { describe, expect, it } from 'vitest'

import { DEFAULT_FURNITURE_CONFIG, normalizePublicStyle } from '~~/shared/domain/defaults'
import { compileAssembly } from '~~/shared/domain/assembly'
import {
  createManufacturingPackage,
  manufacturingPackageBytes,
  serializeManufacturingPackage,
} from '~~/shared/domain/manufacturing-package'
import { DESIGN_SCHEMA_VERSION, type FurnitureDoc } from '~~/shared/domain/types'

function furnitureDoc(): FurnitureDoc {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    lastAppliedMigrationId: null,
    config: { ...DEFAULT_FURNITURE_CONFIG },
    columns: [
      {
        width: 0.45,
        modules: [
          {
            id: 'drawer-module',
            type: 'drawer',
            height: 0.4,
            drawerCount: 2,
            handleMode: 'handle',
            handlePosition: 'top',
            handleHorizontalPosition: 'center',
            handleOrientation: 'horizontal',
          },
          {
            id: 'open-module',
            type: 'shelf',
            height: 0.35,
            shelfCount: 1,
          },
        ],
      },
      {
        width: 0.5,
        modules: [
          {
            id: 'door-module',
            type: 'left-door',
            height: 0.75,
            handleMode: 'hole',
            handlePosition: 'center',
            handleHorizontalPosition: 'right',
            handleOrientation: 'vertical',
          },
        ],
      },
    ],
  }
}

describe('ManufacturingPackageV1', () => {
  it('serializes the same project to byte-identical canonical JSON', () => {
    const options = {
      furniture: furnitureDoc(),
      publicStyle: normalizePublicStyle(),
      projectName: '  Golden cabinet  ',
    }
    const first = createManufacturingPackage(options)
    const second = createManufacturingPackage(options)

    expect(serializeManufacturingPackage(first)).toBe(serializeManufacturingPackage(second))
    expect(manufacturingPackageBytes(first)).toEqual(manufacturingPackageBytes(second))
    expect(first.source.projectName).toBe('Golden cabinet')
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.parts)).toBe(true)
  })

  it('keeps every compiled panel as a traceable manufacturing instance in millimetres', () => {
    const packageValue = createManufacturingPackage({ furniture: furnitureDoc() })
    const instanceIds = packageValue.parts.map(part => part.instanceId)

    expect(new Set(instanceIds).size).toBe(packageValue.parts.length)
    expect(instanceIds).toEqual([...instanceIds].sort())
    expect(packageValue.parts.every(part => part.partId.startsWith(`part-${part.roleCode.toLowerCase()}-`))).toBe(true)
    expect(packageValue.parts.every(part => part.dimensions.widthMm > 0 && part.dimensions.heightMm > 0)).toBe(true)
    expect(packageValue.parts.some(part => part.sourceModuleIds.includes('open-module'))).toBe(true)

    const leftSide = packageValue.parts.find(part => part.instanceId === 'vertical:boundary:0')
    expect(leftSide).toMatchObject({
      role: 'vertical-side',
      roleCode: 'S',
      dimensions: {
        widthMm: 450,
        heightMm: 808,
        nominalThicknessMm: 18,
        actualThicknessMm: null,
      },
    })
  })

  it('preserves face-local operation coordinates, dimensions, depth, rotation, and source', () => {
    const furniture = furnitureDoc()
    const packageValue = createManufacturingPackage({ furniture })
    const operations = packageValue.parts.flatMap(part => part.operations)
    const compiledOperations = compileAssembly(furniture).operations
    const pullHole = operations.find(operation => operation.id.startsWith('op:pull-hole:drawer-front:drawer-module:0'))
    const frontGroove = operations.find(operation => operation.id === 'op:rail-cut:back:column:0:module:0:left-side')
    const backGroove = operations.find(operation => operation.id === 'op:rail-cut:back:column:0:module:0:right-side')

    expect(pullHole).toMatchObject({
      type: 'through-hole',
      face: 'front',
      diameterMm: 25,
      depthMm: 18,
      through: true,
      sourceModuleId: 'drawer-module',
      purpose: 'handle-mounting',
      productionStatus: 'unvalidated',
    })
    expect(frontGroove).toMatchObject({
      type: 'rail-cut',
      face: 'front',
      centerMm: { x: 205, y: -16.75 },
      widthMm: 21,
      heightMm: 21,
      depthMm: 5,
      rotationDeg: 90,
    })
    expect(backGroove).toMatchObject({
      face: 'back',
      centerMm: { x: 205, y: -16.75 },
    })
    expect(operations.every(operation => operation.targetInstanceId.length > 0)).toBe(true)
    expect(operations.map(operation => operation.id).sort()).toEqual(compiledOperations.map(operation => operation.id).sort())
  })

  it('maps visual material assignments explicitly without claiming industrial validation', () => {
    const style = normalizePublicStyle({
      rendered: {
        ...normalizePublicStyle().rendered,
        materials: {
          ...normalizePublicStyle().rendered.materials,
          sides: { presetId: 'white-oak', customColor: '#c8a877' },
        },
      },
    })
    const packageValue = createManufacturingPackage({ furniture: furnitureDoc(), publicStyle: style })
    const side = packageValue.parts.find(part => part.role === 'vertical-side')!
    const material = packageValue.materials.find(item => item.id === side.materialId)!

    expect(material).toMatchObject({
      id: 'material-white-oak',
      presetId: 'white-oak',
      grainProfile: 'oak',
      manufacturer: null,
      sku: null,
      validated: false,
    })
    expect(side.visualGrainDirection).toBe('y')
    expect(side.manufacturingGrainDirection).toBe('unspecified')
    expect(side.faces).toHaveLength(2)
    expect(side.edges).toEqual([
      { name: 'left', treatment: 'unspecified', materialId: null, thicknessMm: null },
      { name: 'right', treatment: 'unspecified', materialId: null, thicknessMm: null },
      { name: 'top', treatment: 'unspecified', materialId: null, thicknessMm: null },
      { name: 'bottom', treatment: 'unspecified', materialId: null, thicknessMm: null },
    ])
    expect(packageValue.issues.some(issue => issue.code === 'manufacturing-grain-direction-unspecified')).toBe(true)
  })

  it('counts only physical handles and reports missing production specifications', () => {
    const packageValue = createManufacturingPackage({ furniture: furnitureDoc() })

    expect(packageValue.hardware).toEqual([
      expect.objectContaining({
        id: 'handle-bar-graphite',
        type: 'bar',
        finish: 'graphite',
        quantity: 2,
        sourceModuleIds: ['drawer-module'],
        sku: null,
        drillingPatternId: null,
        selectionSource: 'visual-style',
        validated: false,
      }),
    ])
    expect(packageValue.status).toBe('preliminary')
    expect(packageValue.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'industrial-material-spec-unverified',
      'edge-treatment-unspecified',
      'joinery-system-unspecified',
      'handle-spec-unverified',
      'drawer-runner-system-unspecified',
      'hinge-system-unspecified',
    ]))
  })

  it('labels visual handle choices and their generic holes as unresolved instead of implying compatibility', () => {
    const baseStyle = normalizePublicStyle()
    const knobStyle = normalizePublicStyle({
      rendered: {
        ...baseStyle.rendered,
        handles: { type: 'knob', finish: 'brass' },
      },
    })
    const drawerPackage = createManufacturingPackage({ furniture: furnitureDoc(), publicStyle: knobStyle })
    const drawerHoles = drawerPackage.parts
      .flatMap(part => part.operations)
      .filter(operation => operation.sourceModuleId === 'drawer-module' && operation.purpose === 'handle-mounting')

    expect(drawerPackage.hardware).toEqual([
      expect.objectContaining({ type: 'knob', finish: 'brass', quantity: 2, drillingPatternId: null, validated: false }),
    ])
    expect(drawerHoles).toHaveLength(4)
    expect(drawerHoles.every(operation => operation.productionStatus === 'unvalidated')).toBe(true)

    const doorFurniture = furnitureDoc()
    doorFurniture.columns[1]!.modules[0]!.handleMode = 'handle'
    const barStyle = normalizePublicStyle({
      rendered: {
        ...baseStyle.rendered,
        handles: { type: 'bar', finish: 'nickel' },
      },
    })
    const doorPackage = createManufacturingPackage({ furniture: doorFurniture, publicStyle: barStyle })
    const doorPart = doorPackage.parts.find(part => part.sourceModuleIds.includes('door-module') && part.role === 'door-front')!
    const doorHoles = doorPart.operations.filter(operation => operation.purpose === 'handle-mounting')

    expect(doorPackage.hardware).toEqual([
      expect.objectContaining({ type: 'bar', finish: 'nickel', quantity: 3, drillingPatternId: null, validated: false }),
    ])
    expect(doorPart.doorHinge).toBe('left')
    expect(doorHoles).toHaveLength(1)
    expect(doorHoles[0]!.productionStatus).toBe('unvalidated')
    expect(doorPackage.issues.some(issue => issue.code === 'handle-spec-unverified')).toBe(true)
  })

  it('keeps opposite door hands as distinct fabrication identities', () => {
    const leftFurniture = furnitureDoc()
    const rightFurniture = furnitureDoc()
    leftFurniture.columns[1]!.modules[0]!.handleMode = 'none'
    rightFurniture.columns[1]!.modules[0] = {
      ...rightFurniture.columns[1]!.modules[0]!,
      type: 'right-door',
      handleMode: 'none',
      handleHorizontalPosition: 'left',
    }
    const leftDoor = createManufacturingPackage({ furniture: leftFurniture }).parts.find(part => part.role === 'door-front')!
    const rightDoor = createManufacturingPackage({ furniture: rightFurniture }).parts.find(part => part.role === 'door-front')!

    expect(leftDoor.doorHinge).toBe('left')
    expect(rightDoor.doorHinge).toBe('right')
    expect(leftDoor.partId).not.toBe(rightDoor.partId)
  })

  it('blocks invalid operation dimensions instead of exporting plausible-looking machining', () => {
    const invalid = furnitureDoc()
    invalid.config.pullHoleDiameter = 0
    const packageValue = createManufacturingPackage({ furniture: invalid })

    expect(packageValue.status).toBe('blocked')
    expect(packageValue.issues.some(issue => issue.code === 'through-hole-invalid' && issue.severity === 'error')).toBe(true)
  })

  it('blocks an empty project instead of presenting it as manufacturable', () => {
    const empty = furnitureDoc()
    empty.columns = []
    const packageValue = createManufacturingPackage({ furniture: empty })

    expect(packageValue.status).toBe('blocked')
    expect(packageValue.parts).toEqual([])
    expect(packageValue.issues.some(issue => issue.code === 'no-manufacturable-parts' && issue.severity === 'error')).toBe(true)
  })
})
