import type { CameraState, ProjectEditorStateRow } from './types'
import { DEFAULT_CAMERA_STATE, normalizePublicStyle } from './defaults'

export function createDefaultCameraState(): CameraState {
  return {
    position: [...DEFAULT_CAMERA_STATE.position] as [number, number, number],
    quaternion: [...DEFAULT_CAMERA_STATE.quaternion] as [number, number, number, number],
    target: [...DEFAULT_CAMERA_STATE.target] as [number, number, number],
  }
}

export function createDefaultProjectEditorState(projectId: string): ProjectEditorStateRow {
  return {
    id: projectId,
    projectId,
    viewMode: 'assembly',
    splitRatio: 0.55,
    projectDesignerSplitRatio: 0.58,
    projectDesignerZoomPercent: 100,
    selectedModuleIds: [],
    camera: createDefaultCameraState(),
    assemblyOpenDoorsDrawers: false,
    assemblySpaceModulesView: false,
    moduleVolumeHelpersVisible: false,
    renderMode: 'render-debug',
    publicStyle: normalizePublicStyle(),
    cutlistSelectedDrawingKey: null,
  }
}
