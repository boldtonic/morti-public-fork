import { DEFAULT_FURNITURE_CONFIG, normalizePublicStyle } from '~~/shared/domain/defaults'
import { findPreset } from '~~/shared/domain/materials'
import type { FurnitureColumn, FurnitureDoc, PublicStyle } from '~~/shared/domain/types'
import { DESIGN_SCHEMA_VERSION } from '~~/shared/domain/types'

export interface ManufacturingGoldenProject {
  id: string
  furniture: FurnitureDoc
  publicStyle: PublicStyle
}

function furniture(columns: FurnitureColumn[]): FurnitureDoc {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    lastAppliedMigrationId: null,
    config: { ...DEFAULT_FURNITURE_CONFIG },
    columns,
  }
}

function materialStyle(
  carcass: string,
  sides = carcass,
  deck = carcass,
  fronts = carcass,
  handleType: PublicStyle['rendered']['handles']['type'] = 'auto',
  handleFinish: PublicStyle['rendered']['handles']['finish'] = 'graphite',
): PublicStyle {
  const base = normalizePublicStyle()
  const assignment = (presetId: string) => ({ presetId, customColor: findPreset(presetId)?.hex ?? '#000000' })
  return normalizePublicStyle({
    ...base,
    rendered: {
      ...base.rendered,
      materials: {
        carcass: assignment(carcass),
        sides: assignment(sides),
        deck: assignment(deck),
        fronts: assignment(fronts),
      },
      handles: { type: handleType, finish: handleFinish },
    },
  })
}

export const MANUFACTURING_GOLDEN_PROJECTS: ManufacturingGoldenProject[] = [
  {
    id: 'open-carcass',
    furniture: furniture([{
      width: 0.45,
      modules: [{ id: 'open-1', type: 'shelf', height: 0.6 }],
    }]),
    publicStyle: materialStyle('white-oak'),
  },
  {
    id: 'interior-shelves',
    furniture: furniture([{
      width: 0.72,
      modules: [{ id: 'shelves-1', type: 'shelf', height: 1.2, shelfCount: 3 }],
    }]),
    publicStyle: materialStyle('baltic-birch'),
  },
  {
    id: 'two-drawers',
    furniture: furniture([{
      width: 0.6,
      modules: [{
        id: 'drawers-1',
        type: 'drawer',
        height: 0.5,
        drawerCount: 2,
        handleMode: 'handle',
        handlePosition: 'top',
        handleHorizontalPosition: 'center',
        handleOrientation: 'horizontal',
      }],
    }]),
    publicStyle: materialStyle('white-oak', 'white-oak', 'white-oak', 'walnut-oiled', 'bar', 'graphite'),
  },
  {
    id: 'single-door',
    furniture: furniture([{
      width: 0.5,
      modules: [{
        id: 'door-1',
        type: 'left-door',
        height: 0.8,
        handleMode: 'handle',
        handlePosition: 'center',
        handleHorizontalPosition: 'right',
        handleOrientation: 'vertical',
      }],
    }]),
    publicStyle: materialStyle('white-lacquer', 'white-lacquer', 'white-lacquer', 'soft-gray-lacquer', 'square-bar', 'nickel'),
  },
  {
    id: 'double-doors',
    furniture: furniture([{
      width: 0.9,
      modules: [{
        id: 'doors-1',
        type: 'doors',
        height: 0.9,
        handleMode: 'handle',
        handlePosition: 'center',
        handleHorizontalPosition: 'center',
        handleOrientation: 'vertical',
      }],
    }]),
    publicStyle: materialStyle('hard-maple', 'hard-maple', 'hard-maple', 'cherry-aged', 'knob', 'brass'),
  },
  {
    id: 'stepped-mixed',
    furniture: furniture([
      {
        width: 0.45,
        modules: [
          { id: 'mixed-open', type: 'shelf', height: 0.45, shelfCount: 1 },
          {
            id: 'mixed-drawer',
            type: 'drawer',
            height: 0.3,
            drawerCount: 2,
            handleMode: 'handle',
            handlePosition: 'top',
            handleHorizontalPosition: 'center',
            handleOrientation: 'horizontal',
          },
        ],
      },
      {
        width: 0.55,
        modules: [{
          id: 'mixed-door',
          type: 'right-door',
          height: 1.05,
          handleMode: 'hole',
          handlePosition: 'center',
          handleHorizontalPosition: 'left',
          handleOrientation: 'vertical',
        }],
      },
      {
        width: 0.6,
        modules: [
          { id: 'mixed-upper', type: 'shelf', height: 0.55, shelfCount: 1 },
          {
            id: 'mixed-lower-door',
            type: 'doors',
            height: 0.8,
            handleMode: 'handle',
            handlePosition: 'top',
            handleHorizontalPosition: 'center',
            handleOrientation: 'vertical',
          },
        ],
      },
    ]),
    publicStyle: materialStyle('walnut-oiled', 'ebonized-oak', 'white-oak', 'graphite-lacquer', 'square-knob', 'brass'),
  },
]
