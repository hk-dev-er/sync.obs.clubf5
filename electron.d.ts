// Type definitions for Electron API exposed via preload
export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedTime: number
  createdTime: number
}

export interface ElectronAPI {
  // File system operations
  readDirectory: (path: string) => Promise<FileInfo[]>
  getFileStats: (path: string) => Promise<FileInfo>
  readFileAsBuffer: (path: string) => Promise<ArrayBuffer>
  writeFile: (path: string, data: ArrayBuffer) => Promise<void>
  deleteFile: (path: string) => Promise<void>
  deleteFolder: (path: string) => Promise<void>
  createFolder: (path: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  getHomePath: () => Promise<string>
  joinPath: (...segments: string[]) => Promise<string>
  getParentPath: (path: string) => Promise<string>
  getPathForFile: (file: File) => string
  
  // Dialog operations
  selectFolder: () => Promise<string | null>
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  selectFiles: () => Promise<string[]>
  
  // Watch operations
  startWatch: (path: string, patterns: string[]) => Promise<void>
  stopWatch: () => Promise<void>
  onWatchEvent: (callback: (event: WatchEvent) => void) => void
  
  // Config operations
  getConfig: <T>(key: string) => Promise<T | undefined>
  setConfig: <T>(key: string, value: T) => Promise<void>
  deleteConfig: (key: string) => Promise<void>
  
  // OBS operations
  obsInitialize: (config: { accessKeyId: string; secretAccessKey: string; endpoint: string; bucket: string }) => Promise<boolean>
  obsTestConnection: () => Promise<boolean>
  obsIsInitialized: () => Promise<boolean>
  obsListObjects: (prefix: string) => Promise<unknown[]>
  obsUploadObject: (key: string, data: ArrayBuffer) => Promise<boolean>
  obsDownloadObject: (key: string) => Promise<ArrayBuffer>
  obsDeleteObject: (key: string) => Promise<boolean>
  obsDeleteObjects: (keys: string[]) => Promise<boolean>
  obsCreateFolder: (prefix: string) => Promise<boolean>
  obsGetObjectMetadata: (key: string) => Promise<{ size: number; lastModified: string; etag: string } | null>
  obsDeleteFolderRecursive: (prefix: string) => Promise<number>
  
  // App operations
  getAppVersion: () => Promise<string>
  openExternal: (url: string) => Promise<void>
  minimize: () => void
  maximize: () => void
  close: () => void
}

export interface WatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
