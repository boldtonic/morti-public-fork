import type { PublicStyle } from './types'
import { normalizePublicStyle } from './defaults'

export const PROJECT_BUNDLE_VERSION = 2
export const PROJECT_BUNDLE_UNIT_SYSTEM = 'm' as const

export interface ProjectBundleV2 {
  bundleVersion: typeof PROJECT_BUNDLE_VERSION
  unitSystem: typeof PROJECT_BUNDLE_UNIT_SYSTEM
  projectName?: string
  publicStyle: PublicStyle
}

export interface CreateProjectBundleOptions {
  projectName?: string | null
  publicStyle?: PublicStyle | null
}

export function createProjectBundle(options: CreateProjectBundleOptions = {}): ProjectBundleV2 {
  const projectName = options.projectName?.trim().slice(0, 160) || undefined
  return {
    bundleVersion: PROJECT_BUNDLE_VERSION,
    unitSystem: PROJECT_BUNDLE_UNIT_SYSTEM,
    ...(projectName ? { projectName } : {}),
    publicStyle: normalizePublicStyle(options.publicStyle),
  }
}
