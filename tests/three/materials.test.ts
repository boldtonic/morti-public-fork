import { describe, expect, it } from 'vitest'

import { getGrainShaderProfile, getGrainTexture } from '~~/shared/three/grain-textures'
import { dominantBoardAxis } from '~~/shared/three/materials'

describe('board-aware material grain', () => {
  it('follows the longest local panel dimension', () => {
    expect(dominantBoardAxis([0.9, 0.018, 0.45])).toBe('x')
    expect(dominantBoardAxis([0.45, 1.8, 0.018])).toBe('y')
    expect(dominantBoardAxis([0.018, 0.2, 0.45])).toBe('z')
  })

  it('uses a stable x-axis tie break for square fronts', () => {
    expect(dominantBoardAxis([0.45, 0.45, 0.018])).toBe('x')
  })

  it('keeps grain profiles on wood and leaves lacquer flat', () => {
    expect(getGrainTexture('oak')).not.toBeNull()
    expect(getGrainShaderProfile('oak')).toMatchObject({ detail: 0.24, endContrast: 0.18 })
    expect(getGrainTexture('lacquer-white')).toBeNull()
    expect(getGrainShaderProfile('lacquer-white')).toBeNull()
  })
})
