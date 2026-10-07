import type {
  LocalScanResult,
  OperatorLogin,
  OperatorStatus,
  RemoteObjectMetadata,
  ScanProgress,
  UploadProgress,
  UploadReport,
  UploadRequest,
  UploadResult
} from '../shared/contracts'
import type { RemoteAudioFile } from '../shared/syncPlan'
import type { DestinationPrefix } from '../shared/uploadPolicy'

export interface ElectronAPI {
  selectFolder: () => Promise<string | null>
  scanLocalAudio: (path: string) => Promise<LocalScanResult>
  getFileUrl: (path: string) => Promise<string>
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void

  getPreference: <T>(key: 'localPath' | 'destination' | 'theme') => Promise<T | undefined>
  setPreference: (key: 'localPath' | 'destination' | 'theme', value: string) => Promise<void>
  getOperatorStatus: () => Promise<OperatorStatus>
  operatorLogin: (credentials: OperatorLogin) => Promise<OperatorStatus>
  operatorConnectStored: () => Promise<OperatorStatus | null>
  operatorLogout: () => Promise<void>
  obsListMusicFolders: () => Promise<DestinationPrefix[]>
  obsListAllObjects: (prefix: DestinationPrefix) => Promise<RemoteAudioFile[]>
  obsGetObjectMetadata: (key: string) => Promise<RemoteObjectMetadata | null>
  obsUploadFile: (request: UploadRequest) => Promise<UploadResult>
  onUploadProgress: (callback: (progress: UploadProgress) => void) => () => void

  saveReport: (report: UploadReport) => Promise<string | null>
  getAppVersion: () => Promise<string>
  minimize: () => void
  maximize: () => void
  close: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
