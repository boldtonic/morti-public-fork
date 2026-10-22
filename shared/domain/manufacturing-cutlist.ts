import { canonicalIdentity, canonicalJsonStringify } from './canonical-json'
import type {
  ManufacturingIssueV1,
  ManufacturingOperationV1,
  ManufacturingPackageV1,
} from './manufacturing-package'
import type { PanelRole } from './types'

export interface ManufacturingPanelGroupV1 {
  key: string
  groupId: string
  partId: string
  role: PanelRole
  roleCode: string
  orientation: string | null
  widthMm: number
  heightMm: number
  nominalThicknessMm: number
  actualThicknessMm: number | null
  materialId: string
  sourceModuleIds: string[]
  representativeInstanceId: string
  instanceIds: string[]
  quantity: number
}

export interface ManufacturingOperationGroupV1 {
  key: string
  targetPartId: string
  targetRole: PanelRole
  targetRoleCode: string
  operationType: ManufacturingOperationV1['type']
  face: ManufacturingOperationV1['face']
  centerMm: ManufacturingOperationV1['centerMm']
  diameterMm: number | null
  widthMm: number | null
  heightMm: number | null
  lengthMm: number | null
  depthMm: number | null
  rotationDeg: number | null
  through: boolean | null
  purpose: ManufacturingOperationV1['purpose']
  productionStatus: ManufacturingOperationV1['productionStatus']
  operationIds: string[]
  targetInstanceIds: string[]
  quantity: number
}

export interface ManufacturingCutlistV1 {
  packageVersion: ManufacturingPackageV1['packageVersion']
  sourceFingerprint: string
  status: ManufacturingPackageV1['status']
  coordinateSystem: ManufacturingPackageV1['coordinateSystem']
  issues: ManufacturingIssueV1[]
  panelGroups: ManufacturingPanelGroupV1[]
  operationGroups: ManufacturingOperationGroupV1[]
}

function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function operationSignature(partId: string, operation: ManufacturingOperationV1): Record<string, unknown> {
  return {
    targetPartId: partId,
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
    purpose: operation.purpose,
    productionStatus: operation.productionStatus,
  }
}

/**
 * Read-only presentation projection of the manufacturing contract.
 * Exact machining coordinates are part of the grouping identity, so the UI
 * cannot silently merge operations that a workshop must distinguish.
 */
export function buildManufacturingCutlist(packageValue: ManufacturingPackageV1): ManufacturingCutlistV1 {
  const panelGroupsByPartId = new Map<string, Omit<ManufacturingPanelGroupV1, 'groupId'>>()

  for (const part of packageValue.parts) {
    const existing = panelGroupsByPartId.get(part.partId)
    if (existing) {
      existing.instanceIds.push(part.instanceId)
      existing.sourceModuleIds.push(...part.sourceModuleIds)
      existing.quantity += 1
      continue
    }

    panelGroupsByPartId.set(part.partId, {
      key: part.partId,
      partId: part.partId,
      role: part.role,
      roleCode: part.roleCode,
      orientation: part.orientation,
      widthMm: part.dimensions.widthMm,
      heightMm: part.dimensions.heightMm,
      nominalThicknessMm: part.dimensions.nominalThicknessMm,
      actualThicknessMm: part.dimensions.actualThicknessMm,
      materialId: part.materialId,
      sourceModuleIds: [...part.sourceModuleIds],
      representativeInstanceId: part.instanceId,
      instanceIds: [part.instanceId],
      quantity: 1,
    })
  }

  const sortedPanelGroups = [...panelGroupsByPartId.values()]
    .map(group => ({
      ...group,
      instanceIds: [...group.instanceIds].sort(compareOrdinal),
      sourceModuleIds: [...new Set(group.sourceModuleIds)].sort(compareOrdinal),
    }))
    .sort((a, b) =>
      compareOrdinal(a.roleCode, b.roleCode)
      || b.widthMm - a.widthMm
      || b.heightMm - a.heightMm
      || b.nominalThicknessMm - a.nominalThicknessMm
      || compareOrdinal(a.partId, b.partId),
    )

  const roleCounts = new Map<string, number>()
  const panelGroups: ManufacturingPanelGroupV1[] = sortedPanelGroups.map((group) => {
    const next = (roleCounts.get(group.roleCode) ?? 0) + 1
    roleCounts.set(group.roleCode, next)
    return { ...group, groupId: `${group.roleCode}${next}` }
  })

  const operationGroupsBySignature = new Map<string, ManufacturingOperationGroupV1>()
  for (const part of packageValue.parts) {
    for (const operation of part.operations) {
      const signature = operationSignature(part.partId, operation)
      const serializedSignature = canonicalJsonStringify(signature)
      const existing = operationGroupsBySignature.get(serializedSignature)
      if (existing) {
        existing.operationIds.push(operation.id)
        existing.targetInstanceIds.push(part.instanceId)
        existing.quantity += 1
        continue
      }

      operationGroupsBySignature.set(serializedSignature, {
        key: canonicalIdentity('operation-group', signature),
        targetPartId: part.partId,
        targetRole: part.role,
        targetRoleCode: part.roleCode,
        operationType: operation.type,
        face: operation.face,
        centerMm: operation.centerMm,
        diameterMm: operation.diameterMm,
        widthMm: operation.widthMm,
        heightMm: operation.heightMm,
        lengthMm: operation.lengthMm,
        depthMm: operation.depthMm,
        rotationDeg: operation.rotationDeg,
        through: operation.through,
        purpose: operation.purpose,
        productionStatus: operation.productionStatus,
        operationIds: [operation.id],
        targetInstanceIds: [part.instanceId],
        quantity: 1,
      })
    }
  }

  const operationGroups = [...operationGroupsBySignature.values()]
    .map(group => ({
      ...group,
      operationIds: [...group.operationIds].sort(compareOrdinal),
      targetInstanceIds: [...group.targetInstanceIds].sort(compareOrdinal),
    }))
    .sort((a, b) =>
      compareOrdinal(a.operationType, b.operationType)
      || compareOrdinal(a.targetRoleCode, b.targetRoleCode)
      || compareOrdinal(a.key, b.key),
    )

  return {
    packageVersion: packageValue.packageVersion,
    sourceFingerprint: packageValue.source.projectFingerprint,
    status: packageValue.status,
    coordinateSystem: packageValue.coordinateSystem,
    issues: packageValue.issues,
    panelGroups,
    operationGroups,
  }
}
