import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

vi.mock('three-bvh-csg', () => ({
  Brush: class {},
  Evaluator: class {},
  SUBTRACTION: 1,
}))

import { compileAssembly } from '~~/shared/domain/assembly'
import { DEFAULT_FURNITURE_CONFIG } from '~~/shared/domain/defaults'
import { interiorShelfCenterOffsets, maxInteriorShelfCountForHeight } from '~~/shared/domain/interior-shelves'
import { DESIGN_SCHEMA_VERSION, type FurnitureDoc } from '~~/shared/domain/types'
import { ensureInitialized, insertColumn, readFurnitureDoc, setModuleType, setShelfCount } from '~~/shared/yjs/doc'

function furnitureDoc(height: number, shelfCount: number): FurnitureDoc {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    lastAppliedMigrationId: null,
    config: { ...DEFAULT_FURNITURE_CONFIG },
    columns: [{
      width: 0.45,
      modules: [{ id: 'open-module', type: 'shelf', height, shelfCount }],
    }],
  }
}

describe('interior shelves', () => {
  it('limits shelf count to the available clear openings', () => {
    expect(maxInteriorShelfCountForHeight(0.3, DEFAULT_FURNITURE_CONFIG)).toBe(2)
    expect(maxInteriorShelfCountForHeight(0.45, DEFAULT_FURNITURE_CONFIG)).toBe(3)
    expect(interiorShelfCenterOffsets(0.3, 12, DEFAULT_FURNITURE_CONFIG)).toHaveLength(2)
  })

  it('persists shelf count and clears it when the module stops being open', () => {
    const doc = new Y.Doc()
    ensureInitialized(doc)
    insertColumn(doc, 0)
    setShelfCount(doc, 0, 0, 2)

    expect(readFurnitureDoc(doc).columns[0]!.modules[0]!.shelfCount).toBe(2)

    setModuleType(doc, 0, 0, 'drawer')
    expect(readFurnitureDoc(doc).columns[0]!.modules[0]!.shelfCount).toBeUndefined()

    setModuleType(doc, 0, 0, 'shelf')
    expect(readFurnitureDoc(doc).columns[0]!.modules[0]!.shelfCount).toBeUndefined()
  })

  it('compiles each interior shelf as a real horizontal deck panel', () => {
    const assembly = compileAssembly(furnitureDoc(0.45, 3))
    const shelves = assembly.panels.filter(panel => panel.key.startsWith('interior-shelf:'))

    expect(shelves).toHaveLength(3)
    expect(shelves.every(panel => panel.role === 'horizontal-deck')).toBe(true)
    expect(shelves.every(panel => panel.sourceModuleId === 'open-module')).toBe(true)
    expect(shelves.map(panel => panel.position[1])).toEqual([...shelves.map(panel => panel.position[1])].sort((a, b) => a - b))
  })

  it('clamps oversized persisted counts when the document is read', () => {
    const doc = new Y.Doc()
    ensureInitialized(doc)
    insertColumn(doc, 0)
    setShelfCount(doc, 0, 0, 32)

    expect(readFurnitureDoc(doc).columns[0]!.modules[0]!.shelfCount).toBe(2)
  })
})
