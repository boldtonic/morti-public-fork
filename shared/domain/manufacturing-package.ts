import { compileAssembly } from './assembly'
import { canonicalIdentity, canonicalJsonStringify } from './canonical-json'
import { normalizePublicStyle } from './defaults'
import { moduleShowsPhysicalHandle, resolveHandleType } from './handles'
import { findPreset, resolveMaterial, type CabinetPart, type MaterialGrain } from './materials'
import { PROJECT_BUNDLE_VERSION } from './project-bundle'
import {
  ASSEMBLY_COMPILER_VERSION,
  DESIGN_SCHEMA_VERSION,
  PANEL_ROLE_SHORT_CODE,
  type CompiledAssemblyIssue,
  type CompiledPanel,
  type FurnitureDoc,
  type FurnitureModule,
  type HandleFinish,
  type HandleType,
  type PanelOperation,
  type PanelRole,
  type PublicStyle,
} from './types'

export const MANUFACTURING_PACKAGE_VERSION = 1 as const
export const MANUFACTURING_PACKAGE_UNIT_SYSTEM = 'mm' as const

export type ManufacturabilityStatus = 'preliminary' | 'blocked'
export type ManufacturingIssueSeverity = 'warning' | 'error'
export type VisualGrainDirection = 'x' | 'y' | 'none'
export type ManufacturingEdgeName = 'left' | 'right' | 'top' | 'bottom'
export type ManufacturingOperationPurpose = 'handle-mounting' | 'back-panel-groove' | 'drawer-bottom-groove' | 'unspecified'

export interface ManufacturingIssueV1 {
  id: string
  severity: ManufacturingIssueSeverity
  code: string
  message: string
  instanceId: string | null
  sourceModuleId: string | null
  columnIndex: number | null
  moduleIndex: number | null
}

export interface ManufacturingMaterialV1 {
  id: string
  presetId: string
  label: string
  category: string
  colorHex: string
  sheen: string
  grainProfile: MaterialGrain
  manufacturer: null
  sku: null
  validated: false
}

export interface ManufacturingFaceV1 {
  name: 'front' | 'back'
  materialId: string
}

export interface ManufacturingEdgeV1 {
  name: ManufacturingEdgeName
  treatment: 'unspecified'
  materialId: null
  thicknessMm: null
}

export interface ManufacturingOperationV1 {
  id: string
  type: PanelOperation['operationType']
  targetInstanceId: string
  face: 'front' | 'back' | null
  centerMm: { x: number, y: number } | null
  diameterMm: number | null
  widthMm: number | null
  heightMm: number | null
  lengthMm: number | null
  depthMm: number | null
  rotationDeg: number | null
  through: boolean | null
  sourceModuleId: string | null
  purpose: ManufacturingOperationPurpose
  productionStatus: 'unvalidated'
}

export interface ManufacturingPartV1 {
  partId: string
  instanceId: string
  identityScope: 'snapshot-local'
  role: PanelRole
  roleCode: string
  sourceModuleIds: string[]
  orientation: NonNullable<CompiledPanel['orientation']> | null
  dimensions: {
    widthMm: number
    heightMm: number
    nominalThicknessMm: number
    actualThicknessMm: number | null
  }
  assemblyPlacement: {
    positionMm: { x: number, y: number, z: number }
    rotationDeg: { x: number, y: number, z: number }
  }
  materialId: string
  visualGrainDirection: VisualGrainDirection
  manufacturingGrainDirection: 'unspecified'
  referenceFace: 'front'
  doorHinge: 'left' | 'right' | null
  faces: ManufacturingFaceV1[]
  edges: ManufacturingEdgeV1[]
  operations: ManufacturingOperationV1[]
}

export interface ManufacturingHardwareV1 {
  id: string
  category: 'handle'
  type: Exclude<HandleType, 'auto'>
  finish: HandleFinish
  quantity: number
  unit: 'piece'
  sourceModuleIds: string[]
  manufacturer: null
  sku: null
  drillingPatternId: null
  selectionSource: 'visual-style'
  validated: false
}

export interface ManufacturingPackageV1 {
  packageVersion: typeof MANUFACTURING_PACKAGE_VERSION
  unitSystem: typeof MANUFACTURING_PACKAGE_UNIT_SYSTEM
  status: ManufacturabilityStatus
  source: {
    application: 'tenon'
    projectName: string | null
    projectFingerprint: string
    projectBundleVersion: typeof PROJECT_BUNDLE_VERSION
    sourceDesignSchemaVersion: number
    currentDesignSchemaVersion: typeof DESIGN_SCHEMA_VERSION
    assemblyCompilerVersion: typeof ASSEMBLY_COMPILER_VERSION
  }
  coordinateSystem: {
    handedness: 'right'
    partOrigin: 'center'
    operationCoordinates: 'face-local-centered-xy'
    xAxis: 'part-width-positive-right'
    yAxis: 'part-height-positive-up'
    operationDepth: 'positive-inward-from-named-face'
    faceCoordinateRule: 'front-and-back-share-the-same-unmirrored-part-local-xy-frame'
  }
  materials: ManufacturingMaterialV1[]
  parts: ManufacturingPartV1[]
  hardware: ManufacturingHardwareV1[]
  issues: ManufacturingIssueV1[]
}

export interface CreateManufacturingPackageOptions {
  furniture: FurnitureDoc
  publicStyle?: PublicStyle | null
  projectName?: string | null
}

const EDGE_NAMES: ManufacturingEdgeName[] = ['left', 'right', 'top', 'bottom']
const FACE_CONTAINMENT_TOLERANCE_MM = 0.5

function round(value: number, decimals = 3): number {
  const multiplier = 10 ** decimals
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier
}

function metresToMillimetres(value: number): number {
  return round(value * 1000)
}

function radiansToDegrees(value: number): number {
  return round(value * 180 / Math.PI, 6)
}

function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function partForRole(role: PanelRole): CabinetPart {
  if (role === 'vertical-side') return 'sides'
  if (role === 'horizontal-deck') return 'deck'
  if (role === 'door-front' || role === 'drawer-front') return 'fronts'
  return 'carcass'
}

function fallbackHexForPart(style: PublicStyle, part: CabinetPart): string {
  if (part === 'sides') return style.rendered.colors.verticalSide
  if (part === 'deck') return style.rendered.colors.horizontalDeck
  if (part === 'fronts') return style.rendered.colors.moduleFront
  return style.rendered.colors.defaultPanel
}

function materialId(presetId: string, colorHex: string): string {
  return presetId === 'custom'
    ? `material-custom-${colorHex.slice(1).toLowerCase()}`
    : `material-${presetId}`
}

function buildMaterials(style: PublicStyle): { materials: ManufacturingMaterialV1[], byPart: Record<CabinetPart, ManufacturingMaterialV1> } {
  const byId = new Map<string, ManufacturingMaterialV1>()
  const byPart = {} as Record<CabinetPart, ManufacturingMaterialV1>
  const parts: CabinetPart[] = ['carcass', 'sides', 'deck', 'fronts']

  for (const part of parts) {
    const assignment = style.rendered.materials[part]
    const resolved = resolveMaterial(assignment.presetId, assignment.customColor, fallbackHexForPart(style, part))
    const preset = findPreset(resolved.presetId)
    const id = materialId(resolved.presetId, resolved.hex)
    const material: ManufacturingMaterialV1 = {
      id,
      presetId: resolved.presetId,
      label: resolved.label,
      category: preset?.category ?? 'Unspecified',
      colorHex: resolved.hex.toLowerCase(),
      sheen: resolved.sheenLabel,
      grainProfile: resolved.grain,
      manufacturer: null,
      sku: null,
      validated: false,
    }
    byId.set(id, material)
    byPart[part] = material
  }

  return {
    materials: [...byId.values()].sort((a, b) => compareOrdinal(a.id, b.id)),
    byPart,
  }
}

function hasVisibleGrain(grain: MaterialGrain): boolean {
  return grain !== 'lacquer-white' && grain !== 'lacquer-charcoal' && grain !== 'custom'
}

function finitePoint(x: unknown, y: unknown): { x: number, y: number } | null {
  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
    ? { x, y }
    : null
}

function operationCenter(operation: PanelOperation): { x: number, y: number } | null {
  if (operation.center) return finitePoint(operation.center.x, operation.center.y)
  if (operation.operationType === 'through-hole') return finitePoint(operation.cx, operation.cy)
  return finitePoint(operation.x, operation.y)
}

function operationPurpose(operation: PanelOperation): ManufacturingOperationPurpose {
  if (operation.id.startsWith('op:pull-hole:')) return 'handle-mounting'
  if (!operation.id.startsWith('op:rail-cut:')) return 'unspecified'
  return operation.id.includes('drawer-bottom:') ? 'drawer-bottom-groove' : 'back-panel-groove'
}

function manufacturingOperation(operation: PanelOperation): ManufacturingOperationV1 {
  const center = operationCenter(operation)
  return {
    id: operation.id,
    type: operation.operationType,
    targetInstanceId: operation.targetPanelKey,
    face: operation.face ?? null,
    centerMm: center
      ? { x: metresToMillimetres(center.x), y: metresToMillimetres(center.y) }
      : null,
    diameterMm: operation.diameter == null ? null : metresToMillimetres(operation.diameter),
    widthMm: operation.width == null ? null : metresToMillimetres(operation.width),
    heightMm: operation.height == null ? null : metresToMillimetres(operation.height),
    lengthMm: operation.length == null ? null : metresToMillimetres(operation.length),
    depthMm: operation.depth == null ? null : metresToMillimetres(operation.depth),
    rotationDeg: operation.rotation == null ? null : radiansToDegrees(operation.rotation),
    through: operation.through ?? null,
    sourceModuleId: operation.sourceModuleId ?? null,
    purpose: operationPurpose(operation),
    productionStatus: 'unvalidated',
  }
}

function fabricationSignature(part: Omit<ManufacturingPartV1, 'partId' | 'instanceId' | 'identityScope' | 'sourceModuleIds' | 'assemblyPlacement'>) {
  const operations = part.operations
    .map(operation => ({
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
    }))
    .sort((a, b) => compareOrdinal(canonicalJsonStringify(a), canonicalJsonStringify(b)))
  return {
    role: part.role,
    dimensions: part.dimensions,
    materialId: part.materialId,
    manufacturingGrainDirection: part.manufacturingGrainDirection,
    referenceFace: part.referenceFace,
    doorHinge: part.doorHinge,
    faces: part.faces,
    edges: part.edges,
    operations,
  }
}

function manufacturingPart(
  panel: CompiledPanel,
  material: ManufacturingMaterialV1,
): ManufacturingPartV1 {
  const operations = panel.operations
    .map(manufacturingOperation)
    .sort((a, b) => compareOrdinal(a.id, b.id))
  const sourceModuleIds = [...new Set([
    ...(panel.touchedModuleIds ?? []),
    ...(panel.sourceModuleId ? [panel.sourceModuleId] : []),
  ])].sort(compareOrdinal)
  const common = {
    role: panel.role,
    roleCode: PANEL_ROLE_SHORT_CODE[panel.role],
    orientation: panel.orientation ?? null,
    dimensions: {
      widthMm: metresToMillimetres(panel.width),
      heightMm: metresToMillimetres(panel.height),
      nominalThicknessMm: metresToMillimetres(panel.thickness),
      actualThicknessMm: null,
    },
    materialId: material.id,
    visualGrainDirection: hasVisibleGrain(material.grainProfile)
      ? panel.width >= panel.height ? 'x' as const : 'y' as const
      : 'none' as const,
    manufacturingGrainDirection: 'unspecified' as const,
    referenceFace: 'front' as const,
    doorHinge: panel.doorHinge ?? null,
    faces: [
      { name: 'front' as const, materialId: material.id },
      { name: 'back' as const, materialId: material.id },
    ],
    edges: EDGE_NAMES.map(name => ({
      name,
      treatment: 'unspecified' as const,
      materialId: null,
      thicknessMm: null,
    })),
    operations,
  }
  return {
    partId: canonicalIdentity(`part-${common.roleCode.toLowerCase()}`, fabricationSignature(common)),
    instanceId: panel.key,
    identityScope: 'snapshot-local',
    sourceModuleIds,
    ...common,
    assemblyPlacement: {
      positionMm: {
        x: metresToMillimetres(panel.position[0]),
        y: metresToMillimetres(panel.position[1]),
        z: metresToMillimetres(panel.position[2]),
      },
      rotationDeg: {
        x: radiansToDegrees(panel.rotation[0]),
        y: radiansToDegrees(panel.rotation[1]),
        z: radiansToDegrees(panel.rotation[2]),
      },
    },
  }
}

function physicalHandleQuantity(module: FurnitureModule): number {
  if (module.type === 'drawer') return Math.max(1, Math.floor(module.drawerCount ?? 1))
  if (module.type === 'doors') return 2
  if (module.type === 'left-door' || module.type === 'right-door') return 1
  return 0
}

function buildHardware(furniture: FurnitureDoc, style: PublicStyle): ManufacturingHardwareV1[] {
  const groups = new Map<string, { type: Exclude<HandleType, 'auto'>, finish: HandleFinish, quantity: number, sourceModuleIds: string[] }>()
  for (const column of furniture.columns) {
    for (const module of column.modules) {
      if (!moduleShowsPhysicalHandle(module)) continue
      const quantity = physicalHandleQuantity(module)
      if (quantity === 0) continue
      const type = resolveHandleType(module, style.rendered.handles)
      const finish = style.rendered.handles.finish
      const key = `${type}:${finish}`
      const current = groups.get(key) ?? { type, finish, quantity: 0, sourceModuleIds: [] }
      current.quantity += quantity
      current.sourceModuleIds.push(module.id)
      groups.set(key, current)
    }
  }

  return [...groups.values()]
    .map(group => ({
      id: `handle-${group.type}-${group.finish}`,
      category: 'handle' as const,
      type: group.type,
      finish: group.finish,
      quantity: group.quantity,
      unit: 'piece' as const,
      sourceModuleIds: [...new Set(group.sourceModuleIds)].sort(compareOrdinal),
      manufacturer: null,
      sku: null,
      drillingPatternId: null,
      selectionSource: 'visual-style' as const,
      validated: false as const,
    }))
    .sort((a, b) => compareOrdinal(a.id, b.id))
}

function issueId(issue: Omit<ManufacturingIssueV1, 'id'>): string {
  return canonicalIdentity('issue', issue)
}

function packageIssue(
  code: string,
  message: string,
  severity: ManufacturingIssueSeverity = 'warning',
  sourceModuleId: string | null = null,
  instanceId: string | null = null,
  columnIndex: number | null = null,
  moduleIndex: number | null = null,
): ManufacturingIssueV1 {
  const issue = { severity, code, message, instanceId, sourceModuleId, columnIndex, moduleIndex }
  return { id: issueId(issue), ...issue }
}

function compiledIssue(issue: CompiledAssemblyIssue): ManufacturingIssueV1 {
  return packageIssue(
    issue.code,
    issue.message,
    issue.severity,
    issue.moduleId ?? null,
    null,
    issue.columnIndex ?? null,
    issue.moduleIndex ?? null,
  )
}

function isPositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0
}

function operationFitsPart(operation: ManufacturingOperationV1, part: ManufacturingPartV1): boolean {
  if (!operation.centerMm) return false
  const halfPartWidth = part.dimensions.widthMm / 2
  const halfPartHeight = part.dimensions.heightMm / 2
  if (operation.type === 'through-hole') {
    if (!isPositive(operation.diameterMm)) return false
    const radius = operation.diameterMm / 2
    return Math.abs(operation.centerMm.x) + radius <= halfPartWidth + FACE_CONTAINMENT_TOLERANCE_MM
      && Math.abs(operation.centerMm.y) + radius <= halfPartHeight + FACE_CONTAINMENT_TOLERANCE_MM
  }
  if (!isPositive(operation.lengthMm) || !isPositive(operation.widthMm) || operation.rotationDeg === null) return false
  const radians = operation.rotationDeg * Math.PI / 180
  const halfLength = operation.lengthMm / 2
  const halfWidth = operation.widthMm / 2
  const extentX = Math.abs(Math.cos(radians)) * halfLength + Math.abs(Math.sin(radians)) * halfWidth
  const extentY = Math.abs(Math.sin(radians)) * halfLength + Math.abs(Math.cos(radians)) * halfWidth
  return Math.abs(operation.centerMm.x) + extentX <= halfPartWidth + FACE_CONTAINMENT_TOLERANCE_MM
    && Math.abs(operation.centerMm.y) + extentY <= halfPartHeight + FACE_CONTAINMENT_TOLERANCE_MM
}

function validateOperation(operation: ManufacturingOperationV1, part: ManufacturingPartV1): ManufacturingIssueV1[] {
  const issues: ManufacturingIssueV1[] = []
  const addError = (code: string, message: string) => {
    issues.push(packageIssue(code, message, 'error', operation.sourceModuleId, part.instanceId))
  }
  if (!operation.centerMm) addError('operation-center-missing', `Operation ${operation.id} has no valid face-local center.`)
  if (!operation.face) addError('operation-face-missing', `Operation ${operation.id} does not identify its machining face.`)
  if (!isPositive(operation.depthMm)) {
    addError('operation-depth-invalid', `Operation ${operation.id} requires a positive machining depth.`)
  }
  else if (operation.depthMm > part.dimensions.nominalThicknessMm + 0.001 && operation.through !== true) {
    addError('operation-depth-exceeds-part', `Operation ${operation.id} is deeper than the nominal panel thickness.`)
  }

  if (operation.type === 'through-hole') {
    if (!isPositive(operation.diameterMm) || operation.through !== true) {
      addError('through-hole-invalid', `Operation ${operation.id} requires a positive diameter and an explicit through flag.`)
    }
    else if (isPositive(operation.depthMm) && operation.depthMm + 0.001 < part.dimensions.nominalThicknessMm) {
      addError('through-hole-depth-insufficient', `Operation ${operation.id} does not span the nominal panel thickness.`)
    }
  }
  else if (!isPositive(operation.widthMm)
    || !isPositive(operation.heightMm)
    || !isPositive(operation.lengthMm)
    || operation.rotationDeg === null
    || !Number.isFinite(operation.rotationDeg)) {
    addError('rail-cut-profile-invalid', `Operation ${operation.id} requires positive width, height, length, and a finite rotation.`)
  }

  if (operation.centerMm && !operationFitsPart(operation, part)) {
    addError('operation-outside-part-face', `Operation ${operation.id} extends beyond the target panel face.`)
  }
  return issues
}

function buildIssues(
  furniture: FurnitureDoc,
  parts: ManufacturingPartV1[],
  assemblyIssues: CompiledAssemblyIssue[],
  hardware: ManufacturingHardwareV1[],
): ManufacturingIssueV1[] {
  const issues = assemblyIssues.map(compiledIssue)
  if (parts.length === 0) {
    issues.push(packageIssue('no-manufacturable-parts', 'The project does not contain any compiled panels.', 'error'))
  }
  else {
    issues.push(packageIssue('industrial-material-spec-unverified', 'Visual materials do not yet identify a validated manufacturer, SKU, actual board thickness, or nominal-versus-actual board specification.'))
    if (parts.some(part => part.visualGrainDirection !== 'none')) {
      issues.push(packageIssue('manufacturing-grain-direction-unspecified', 'Visible grain orientation is a rendering choice; manufacturing grain direction has not been approved.'))
    }
    issues.push(packageIssue('edge-treatment-unspecified', 'Panel edge treatments and edge-banding specifications have not been selected.'))
    issues.push(packageIssue('joinery-system-unspecified', 'Structural joints, tolerances, and their hardware patterns require a manufacturer-approved construction profile.'))
  }
  for (const part of parts) {
    for (const operation of part.operations) {
      issues.push(...validateOperation(operation, part))
    }
  }
  if (hardware.length > 0) {
    issues.push(packageIssue('handle-spec-unverified', 'Visible handles are counted as visual selections only. No purchasable SKU or drilling pattern is linked to the preliminary pull-hole operations.'))
  }
  if (furniture.columns.some(column => column.modules.some(module => module.type === 'drawer'))) {
    issues.push(packageIssue('drawer-runner-system-unspecified', 'Drawer runner family, length, clearances, and mounting pattern are not specified.'))
  }
  if (furniture.columns.some(column => column.modules.some(module => module.type === 'doors' || module.type === 'left-door' || module.type === 'right-door'))) {
    issues.push(packageIssue('hinge-system-unspecified', 'Door hinge family, overlay, cup drilling, and mounting pattern are not specified.'))
  }
  return issues.sort((a, b) => compareOrdinal(a.id, b.id))
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

export function createManufacturingPackage(options: CreateManufacturingPackageOptions): ManufacturingPackageV1 {
  const style = normalizePublicStyle(options.publicStyle)
  const assembly = compileAssembly(options.furniture)
  const { materials, byPart } = buildMaterials(style)
  const parts = assembly.panels
    .map(panel => manufacturingPart(panel, byPart[partForRole(panel.role)]))
    .sort((a, b) => compareOrdinal(a.instanceId, b.instanceId))
  const hardware = buildHardware(options.furniture, style)
  const issues = buildIssues(options.furniture, parts, assembly.issues, hardware)
  const sourcePayload = { furniture: options.furniture, publicStyle: style }
  const packageValue: ManufacturingPackageV1 = {
    packageVersion: MANUFACTURING_PACKAGE_VERSION,
    unitSystem: MANUFACTURING_PACKAGE_UNIT_SYSTEM,
    status: issues.some(issue => issue.severity === 'error') ? 'blocked' : 'preliminary',
    source: {
      application: 'tenon',
      projectName: options.projectName?.trim().slice(0, 160) || null,
      projectFingerprint: canonicalIdentity('project', sourcePayload),
      projectBundleVersion: PROJECT_BUNDLE_VERSION,
      sourceDesignSchemaVersion: options.furniture.schemaVersion,
      currentDesignSchemaVersion: DESIGN_SCHEMA_VERSION,
      assemblyCompilerVersion: ASSEMBLY_COMPILER_VERSION,
    },
    coordinateSystem: {
      handedness: 'right',
      partOrigin: 'center',
      operationCoordinates: 'face-local-centered-xy',
      xAxis: 'part-width-positive-right',
      yAxis: 'part-height-positive-up',
      operationDepth: 'positive-inward-from-named-face',
      faceCoordinateRule: 'front-and-back-share-the-same-unmirrored-part-local-xy-frame',
    },
    materials,
    parts,
    hardware,
    issues,
  }
  return deepFreeze(packageValue)
}

export function serializeManufacturingPackage(packageValue: ManufacturingPackageV1): string {
  return canonicalJsonStringify(packageValue)
}

export function manufacturingPackageBytes(packageValue: ManufacturingPackageV1): Uint8Array {
  return new TextEncoder().encode(serializeManufacturingPackage(packageValue))
}
