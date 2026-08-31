import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { FileInfo, WatchEvent } from '../../electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File system operations
  readDirectory: (path: string): Promise<FileInfo[]> =>
    ipcRenderer.invoke('fs:readDirectory', path) as Promise<FileInfo[]>,

  getFileStats: (path: string): Promise<FileInfo> =>
    ipcRenderer.invoke('fs:getFileStats', path) as Promise<FileInfo>,

  readFileAsBuffer: (path: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('fs:readFileAsBuffer', path) as Promise<ArrayBuffer>,

  writeFile: (path: string, data: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke('fs:writeFile', path, data) as Promise<void>,

  deleteFile: (path: string): Promise<void> =>
    ipcRenderer.invoke('fs:deleteFile', path) as Promise<void>,

  deleteFolder: (path: string): Promise<void> =>
    ipcRenderer.invoke('fs:deleteFolder', path) as Promise<void>,

  createFolder: (path: string): Promise<void> =>
    ipcRenderer.invoke('fs:createFolder', path) as Promise<void>,

  exists: (path: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:exists', path) as Promise<boolean>,

  getHomePath: (): Promise<string> =>
    ipcRenderer.invoke('fs:getHomePath') as Promise<string>,

  joinPath: (...segments: string[]): Promise<string> =>
    ipcRenderer.invoke('fs:joinPath', ...segments) as Promise<string>,

  getParentPath: (path: string): Promise<string> =>
    ipcRenderer.invoke('fs:getParentPath', path) as Promise<string>,

  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  // Dialog operations
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectFolder') as Promise<string | null>,

  selectFile: (filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectFile', filters) as Promise<string | null>,

  selectFiles: (): Promise<string[]> =>
    ipcRenderer.invoke('dialog:selectFiles') as Promise<string[]>,

  // Watch operations
  startWatch: (path: string, patterns: string[]): Promise<void> =>
    ipcRenderer.invoke('watch:start', path, patterns) as Promise<void>,

  stopWatch: (): Promise<void> =>
    ipcRenderer.invoke('watch:stop') as Promise<void>,

  onWatchEvent: (callback: (event: WatchEvent) => void): void => {
    ipcRenderer.on('watch:event', (_event: IpcRendererEvent, ...args: unknown[]) => callback(args[0] as WatchEvent))
  },

  // Config operations
  getConfig: <T>(key: string): Promise<T | undefined> =>
    ipcRenderer.invoke('config:get', key) as Promise<T | undefined>,

  setConfig: <T>(key: string, value: T): Promise<void> =>
    ipcRenderer.invoke('config:set', key, value) as Promise<void>,

  deleteConfig: (key: string): Promise<void> =>
    ipcRenderer.invoke('config:delete', key) as Promise<void>,

  // OBS operations
  obsInitialize: (config: { accessKeyId: string; secretAccessKey: string; endpoint: string; bucket: string }): Promise<boolean> =>
    ipcRenderer.invoke('obs:initialize', config) as Promise<boolean>,

  obsTestConnection: (): Promise<boolean> =>
    ipcRenderer.invoke('obs:testConnection') as Promise<boolean>,

  obsIsInitialized: (): Promise<boolean> =>
    ipcRenderer.invoke('obs:isInitialized') as Promise<boolean>,

  obsListObjects: (prefix: string): Promise<unknown[]> =>
    ipcRenderer.invoke('obs:listObjects', prefix) as Promise<unknown[]>,

  obsUploadObject: (key: string, data: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke('obs:uploadObject', key, data) as Promise<boolean>,

  obsDownloadObject: (key: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('obs:downloadObject', key) as Promise<ArrayBuffer>,

  obsDeleteObject: (key: string): Promise<boolean> =>
    ipcRenderer.invoke('obs:deleteObject', key) as Promise<boolean>,

  obsDeleteObjects: (keys: string[]): Promise<boolean> =>
    ipcRenderer.invoke('obs:deleteObjects', keys) as Promise<boolean>,

  obsCreateFolder: (prefix: string): Promise<boolean> =>
    ipcRenderer.invoke('obs:createFolder', prefix) as Promise<boolean>,

  obsGetObjectMetadata: (key: string): Promise<{ size: number; lastModified: string; etag: string } | null> =>
    ipcRenderer.invoke('obs:getObjectMetadata', key) as Promise<{ size: number; lastModified: string; etag: string } | null>,

  obsDeleteFolderRecursive: (prefix: string): Promise<number> =>
    ipcRenderer.invoke('obs:deleteFolderRecursive', prefix) as Promise<number>,

  // App operations
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:getVersion') as Promise<string>,

  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('app:openExternal', url) as Promise<void>,

  // Window controls
  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  close: (): void => ipcRenderer.send('window:close')
})
