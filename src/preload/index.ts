import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  LocalScanResult,
  OBSConfigInput,
  OBSConfigStatus,
  ScanProgress,
  UploadProgress,
  UploadReport,
  UploadRequest,
  UploadResult,
  RemoteObjectMetadata
} from '../shared/contracts'
import type { RemoteAudioFile } from '../shared/syncPlan'
import type { DestinationPrefix } from '../shared/uploadPolicy'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectFolder'),
  scanLocalAudio: (path: string): Promise<LocalScanResult> => ipcRenderer.invoke('fs:scanLocalAudio', path),
  getFileUrl: (path: string): Promise<string> => ipcRenderer.invoke('fs:getFileUrl', path),
  onScanProgress: (callback: (progress: ScanProgress) => void): (() => void) =>
    subscribe('scan:progress', callback),

  getPreference: <T>(key: 'localPath' | 'destination' | 'theme'): Promise<T | undefined> =>
    ipcRenderer.invoke('config:getPreference', key),
  setPreference: (key: 'localPath' | 'destination' | 'theme', value: string): Promise<void> =>
    ipcRenderer.invoke('config:setPreference', key, value),
  getOBSStatus: (): Promise<OBSConfigStatus> => ipcRenderer.invoke('config:getOBSStatus'),

  obsConfigure: (config: OBSConfigInput): Promise<boolean> => ipcRenderer.invoke('obs:configure', config),
  obsConnectStored: (): Promise<boolean> => ipcRenderer.invoke('obs:connectStored'),
  obsTestConnection: (): Promise<boolean> => ipcRenderer.invoke('obs:testConnection'),
  obsListMusicFolders: (): Promise<DestinationPrefix[]> => ipcRenderer.invoke('obs:listMusicFolders'),
  obsListAllObjects: (prefix: DestinationPrefix): Promise<RemoteAudioFile[]> =>
    ipcRenderer.invoke('obs:listAllObjects', prefix),
  obsGetObjectMetadata: (key: string): Promise<RemoteObjectMetadata | null> =>
    ipcRenderer.invoke('obs:getObjectMetadata', key),
  obsUploadFile: (request: UploadRequest): Promise<UploadResult> =>
    ipcRenderer.invoke('obs:uploadFile', request),
  onUploadProgress: (callback: (progress: UploadProgress) => void): (() => void) =>
    subscribe('obs:uploadProgress', callback),

  saveReport: (report: UploadReport): Promise<string | null> => ipcRenderer.invoke('report:save', report),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  close: (): void => ipcRenderer.send('window:close')
})
