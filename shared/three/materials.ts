import * as THREE from 'three'
import { getGrainShaderProfile, getGrainTexture } from './grain-textures'
import type { MaterialGrain } from '~~/shared/domain/materials'

/**
 * Material registry — mirrors the verbatim Morti `Dt_x5Iy5.js` materials at
 * lines 5476–5568 (panel mesh classes `di` / `fr` / `$r`).
 *
 * Three modes:
 *   - `shaded`    → MeshStandardMaterial (lit / render-debug)
 *   - `unlit`     → MeshBasicMaterial
 *   - `outline`   → MeshBasicMaterial with polygon-offset (basic mode)
 */

export type PanelMaterialMode = 'shaded' | 'unlit' | 'outline'

export interface PanelMaterialSpec {
  color: number
  /** 0-1; defaults to 0.62 (verbatim Morti baseline). */
  roughness?: number
  /** 0-1; defaults to 0.08 (verbatim Morti baseline). */
  metalness?: number
  /** Wood-grain pattern for triplanar texture sampling. Lacquers/custom
   *  pass `'lacquer-white' | 'lacquer-charcoal' | 'custom'` (or omit) to
   *  render flat, no grain. */
  grain?: MaterialGrain
  /** Local-space grain density in tiles-per-meter. Higher = tighter pattern.
   *  Defaults to 5 (one stripe roughly every 20cm of panel face). */
  grainScale?: number
  /** Local panel dimensions [width, height, thickness], in meters. */
  boardSize?: readonly [number, number, number]
  /** Stable per-panel texture offset, in texture repeats. */
  grainOffset?: readonly [number, number]
}

export type BoardAxis = 'x' | 'y' | 'z'

/** The longest local panel dimension establishes the grain direction. */
export function dominantBoardAxis(size: readonly [number, number, number]): BoardAxis {
  const [x, y, z] = size
  if (x >= y && x >= z) return 'x'
  if (y >= z) return 'y'
  return 'z'
}

/** Prevent identical panels from starting at the same point in the pattern. */
export function grainOffsetForKey(key: string): readonly [number, number] {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const unsigned = hash >>> 0
  return [
    (unsigned & 0xffff) / 0x10000,
    ((unsigned >>> 16) & 0xffff) / 0x10000,
  ]
}

function boardAxisVector(size: readonly [number, number, number]): THREE.Vector3 {
  const axis = dominantBoardAxis(size)
  if (axis === 'x') return new THREE.Vector3(1, 0, 0)
  if (axis === 'y') return new THREE.Vector3(0, 1, 0)
  return new THREE.Vector3(0, 0, 1)
}

export function makePanelMaterial(
  mode: PanelMaterialMode,
  colorOrSpec: number | PanelMaterialSpec,
): THREE.Material {
  const spec: PanelMaterialSpec = typeof colorOrSpec === 'number'
    ? { color: colorOrSpec }
    : colorOrSpec
  const color = new THREE.Color(spec.color)

  if (mode === 'shaded') {
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: spec.metalness ?? 0.08,
      roughness: spec.roughness ?? 0.62,
    })
    const grain = spec.grain
    const grainTex = grain ? getGrainTexture(grain) : null
    if (grain && grainTex) {
      const profile = getGrainShaderProfile(grain)
      attachBoardGrain(
        material,
        grainTex,
        spec.grainScale ?? 5,
        spec.boardSize ?? [1, 1, 0.018],
        spec.grainOffset ?? [0, 0],
        profile?.detail ?? 0.16,
        profile?.endContrast ?? 0.16,
      )
    }
    return material
  }
  if (mode === 'unlit') {
    return new THREE.MeshBasicMaterial({
      color,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
    })
  }
  // outline (basic)
  return new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    toneMapped: false,
  })
}

/** Rail-cut overlay material — flat, with negative polygon offset so it floats
 *  ABOVE the panel face. Mirrors `hl` (Dt_x5Iy5.js L580–656) fill mode. */
export function makeRailCutMaterial(color: number, opacity = 0.6): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    toneMapped: false,
  })
}

export function makeRailCutOutlineMaterial(color: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    depthTest: true,
    depthWrite: true,
  })
}

// ---------------------------------------------------------------------------
// Per-spec factory helpers (15_outline_shader spec, materials section).
//
// These four factories keep the original panel material model but now use the
// current restrained warm accent for stand-alone technical outlines.
// ---------------------------------------------------------------------------

/**
 * Lit panel surface (`di extends Group`, L5476–5500). Slightly metallic so
 * the wood-look fills pick up a subtle highlight under the directional key.
 */
export function makeShadedPanelMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: 0.08,
    roughness: 0.62,
  })
}

/**
 * Unlit panel material — used in the default 'rendered' UI mode where the
 * lighting rig is intentionally low and the panels read as flat plates.
 */
export function makeUnlitPanelMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
}

/**
 * Outline material that matches the technical render mode's warm outline
 * colour.
 *
 * NOTE: the actual scene outline pass is post-processing-driven via the TSL
 * pipeline in `outline.ts`. This factory is for stand-alone outline meshes
 * (e.g. ViewHelper axes, hover highlights) that need to colour-match.
 */
export function makeOutlineMaterial(color: number = 0x9a7a50): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
}

/**
 * Background fill for hardware preview cards (the small still images on the
 * dashboard). Unlit + tone-mapping-agnostic so the swatch reads as the exact
 * pixel value the design system specifies.
 */
export function makeBackgroundMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
}

/**
 * Inject board-aware sampling of a grayscale grain DataTexture into a
 * MeshStandardMaterial. Grain follows the panel's longest local axis, while
 * end caps receive a restrained ring pattern. The existing PBR lighting and
 * material finish remain in charge of the final surface response.
 *
 * Local projection (rather than UV) because:
 *   - BoxGeometry UVs are per-face 0..1, ignoring world units; tiling
 *     produces inconsistent grain density across panel sizes.
 *   - CSG boolean cuts (door pulls) can scramble UVs entirely.
 */
function attachBoardGrain(
  material: THREE.MeshStandardMaterial,
  grainTex: THREE.DataTexture,
  tilesPerMeter: number,
  boardSize: readonly [number, number, number],
  grainOffset: readonly [number, number],
  detailStrength: number,
  endContrast: number,
): void {
  // `map` enables MeshStandard's diffuse-map shader chunks; the shared texture
  // itself remains owned by the module-level grain cache.
  material.map = grainTex
  material.userData.grainScale = tilesPerMeter
  material.userData.boardSize = [...boardSize]

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrainScale = { value: tilesPerMeter }
    shader.uniforms.uGrainAxis = { value: boardAxisVector(boardSize) }
    shader.uniforms.uGrainOffset = { value: new THREE.Vector2(...grainOffset) }
    shader.uniforms.uGrainDetail = { value: detailStrength }
    shader.uniforms.uEndGrainContrast = { value: endContrast }

    // Board-space coordinates survive panel rotation and CSG operations.
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vBoardPos_grain;
varying vec3 vBoardNormal_grain;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
vBoardPos_grain = transformed;
vBoardNormal_grain = normalize(objectNormal);`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vBoardPos_grain;
varying vec3 vBoardNormal_grain;
uniform float uGrainScale;
uniform vec3 uGrainAxis;
uniform vec2 uGrainOffset;
uniform float uGrainDetail;
uniform float uEndGrainContrast;

float grainHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float grainNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(grainHash(i), grainHash(i + vec2(1.0, 0.0)), f.x),
    mix(grainHash(i + vec2(0.0, 1.0)), grainHash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}`,
      )
      .replace(
        '#include <map_fragment>',
        `// Project broad face grain along the board's dominant local axis.
vec3 boardNormal = normalize(vBoardNormal_grain);
vec3 acrossAxis = cross(uGrainAxis, boardNormal);
if (dot(acrossAxis, acrossAxis) < 1e-5) {
  acrossAxis = abs(uGrainAxis.x) < 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
}
acrossAxis = normalize(acrossAxis);
vec2 faceUv = vec2(
  dot(vBoardPos_grain, uGrainAxis),
  dot(vBoardPos_grain, acrossAxis)
) * uGrainScale + uGrainOffset;

// CPU textures encode neutral brightness as 200/255. Decode it back to 1.0.
float broadGrain = texture2D(map, faceUv).r * 1.275;
float fineGrain = texture2D(map, faceUv * vec2(2.73, 3.17) + vec2(0.37, 0.61)).r * 1.275;
float faceGrain = 1.0
  + (broadGrain - 1.0) * 0.58
  + (fineGrain - 1.0) * uGrainDetail * 0.55;

float endWeight = pow(abs(dot(boardNormal, uGrainAxis)), 8.0);
float grainValue = faceGrain;
if (endWeight > 0.01) {
  // End caps expose growth rings instead of longitudinal face grain.
  vec3 helperAxis = abs(uGrainAxis.x) < 0.5
    ? vec3(1.0, 0.0, 0.0)
    : vec3(0.0, 1.0, 0.0);
  vec3 endU = normalize(cross(uGrainAxis, helperAxis));
  vec3 endV = normalize(cross(uGrainAxis, endU));
  vec2 endUv = vec2(dot(vBoardPos_grain, endU), dot(vBoardPos_grain, endV))
    * uGrainScale + uGrainOffset;
  float ringWarp = (grainNoise(endUv * 1.7 + 4.2) - 0.5) * 0.32;
  float ringSignal = sin((length(endUv * vec2(1.0, 1.45)) + ringWarp) * 18.0);
  float endDetail = grainNoise(endUv * 9.0 + 11.3) - 0.5;
  float endGrain = 1.0
    - ringSignal * uEndGrainContrast * 0.5
    - endDetail * uEndGrainContrast * 0.3;
  grainValue = mix(faceGrain, endGrain, endWeight);
}
grainValue = clamp(grainValue, 0.72, 1.16);
diffuseColor.rgb *= grainValue;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
// Polished bands (high grainValue) look slightly smoother; open pores rougher.
roughnessFactor *= clamp(1.0 - (grainValue - 1.0) * 0.35, 0.92, 1.08);`,
      )
  }

  // Force a recompile so the injection takes effect immediately.
  material.needsUpdate = true
}
