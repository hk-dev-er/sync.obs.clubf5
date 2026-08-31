// Sync Service - Compare and synchronize local files with OBS
import { obsService, type OBSObject } from './obsService'
import type { FileInfo } from '../../../electron'

export type SyncMode = 'local-to-obs' | 'obs-to-local' | 'bidirectional'
export type SyncAction = 'upload' | 'download' | 'delete-local' | 'delete-remote' | 'skip'

export interface SyncItem {
  name: string
  localPath: string | null
  remotePath: string | null
  localInfo: FileInfo | null
  remoteInfo: OBSObject | null
  action: SyncAction
  reason: string
  isDirectory: boolean
}

export interface SyncResult {
  items: SyncItem[]
  stats: {
    toUpload: number
    toDownload: number
    toDeleteLocal: number
    toDeleteRemote: number
    unchanged: number
    conflicts: number
  }
}

export interface SyncProgress {
  current: number
  total: number
  currentFile: string
  percentage: number
}

class SyncService {
  /**
   * Compare local directory with OBS prefix and determine sync actions
   */
  async compare(
    localPath: string,
    remotePath: string,
    mode: SyncMode
  ): Promise<SyncResult> {
    // Get local files
    const localFiles = await window.electronAPI.readDirectory(localPath)
    
    // Get remote objects
    const remoteObjects = await obsService.listObjects(remotePath)

    const items: SyncItem[] = []
    const processedRemote = new Set<string>()

    // Process local files
    for (const localFile of localFiles) {
      const relativeName = localFile.name
      const remoteObj = remoteObjects.find(obj =>
        obj.name === relativeName || obj.name === relativeName + '/'
      )

      if (remoteObj) {
        processedRemote.add(remoteObj.key)
      }

      const item = await this.determineSyncAction(
        localFile,
        remoteObj || null,
        localPath,
        remotePath,
        mode
      )
      items.push(item)
    }

    // Process remote-only files (not in local)
    for (const remoteObj of remoteObjects) {
      if (!processedRemote.has(remoteObj.key)) {
        const item = await this.determineSyncAction(
          null,
          remoteObj,
          localPath,
          remotePath,
          mode
        )
        items.push(item)
      }
    }

    // Calculate stats
    const stats = {
      toUpload: items.filter(i => i.action === 'upload').length,
      toDownload: items.filter(i => i.action === 'download').length,
      toDeleteLocal: items.filter(i => i.action === 'delete-local').length,
      toDeleteRemote: items.filter(i => i.action === 'delete-remote').length,
      unchanged: items.filter(i => i.action === 'skip').length,
      conflicts: 0 // TODO: Implement conflict detection
    }

    return { items, stats }
  }

  /**
   * Determine sync action for a single item
   */
  private async determineSyncAction(
    localFile: FileInfo | null,
    remoteObj: OBSObject | null,
    localPath: string,
    remotePath: string,
    mode: SyncMode
  ): Promise<SyncItem> {
    const name = localFile?.name || remoteObj?.name || ''
    const isDirectory = localFile?.isDirectory || remoteObj?.isDirectory || false
    const localFullPath = localFile
      ? localFile.path
      : await window.electronAPI.joinPath(localPath, name)
    const remoteKey = remoteObj?.key || remotePath + name + (isDirectory ? '/' : '')

    // Both exist - compare timestamps
    if (localFile && remoteObj) {
      const localTime = localFile.modifiedTime
      const remoteTime = remoteObj.lastModified?.getTime() || 0

      // If same size, consider unchanged (simple comparison)
      if (!isDirectory && localFile.size === remoteObj.size) {
        return {
          name,
          localPath: localFullPath,
          remotePath: remoteKey,
          localInfo: localFile,
          remoteInfo: remoteObj,
          action: 'skip',
          reason: 'Sin cambios (mismo tamaño)',
          isDirectory
        }
      }

      // Determine which is newer
      if (localTime > remoteTime) {
        if (mode === 'obs-to-local') {
          return {
            name,
            localPath: localFullPath,
            remotePath: remoteKey,
            localInfo: localFile,
            remoteInfo: remoteObj,
            action: 'skip',
            reason: 'Local más reciente (modo OBS→Local)',
            isDirectory
          }
        }
        return {
          name,
          localPath: localFullPath,
          remotePath: remoteKey,
          localInfo: localFile,
          remoteInfo: remoteObj,
          action: 'upload',
          reason: 'Local más reciente',
          isDirectory
        }
      } else {
        if (mode === 'local-to-obs') {
          return {
            name,
            localPath: localFullPath,
            remotePath: remoteKey,
            localInfo: localFile,
            remoteInfo: remoteObj,
            action: 'skip',
            reason: 'Remoto más reciente (modo Local→OBS)',
            isDirectory
          }
        }
        return {
          name,
          localPath: localFullPath,
          remotePath: remoteKey,
          localInfo: localFile,
          remoteInfo: remoteObj,
          action: 'download',
          reason: 'Remoto más reciente',
          isDirectory
        }
      }
    }

    // Only local exists
    if (localFile && !remoteObj) {
      if (mode === 'obs-to-local') {
        return {
          name,
          localPath: localFullPath,
          remotePath: remoteKey,
          localInfo: localFile,
          remoteInfo: null,
          action: 'delete-local',
          reason: 'No existe en OBS',
          isDirectory
        }
      }
      return {
        name,
        localPath: localFullPath,
        remotePath: remoteKey,
        localInfo: localFile,
        remoteInfo: null,
        action: 'upload',
        reason: 'Nuevo archivo local',
        isDirectory
      }
    }

    // Only remote exists
    if (!localFile && remoteObj) {
      if (mode === 'local-to-obs') {
        return {
          name,
          localPath: localFullPath,
          remotePath: remoteKey,
          localInfo: null,
          remoteInfo: remoteObj,
          action: 'delete-remote',
          reason: 'No existe localmente',
          isDirectory
        }
      }
      return {
        name,
        localPath: localFullPath,
        remotePath: remoteKey,
        localInfo: null,
        remoteInfo: remoteObj,
        action: 'download',
        reason: 'Nuevo archivo remoto',
        isDirectory
      }
    }

    // Neither exists (shouldn't happen)
    return {
      name,
      localPath: null,
      remotePath: null,
      localInfo: null,
      remoteInfo: null,
      action: 'skip',
      reason: 'Error: archivo no encontrado',
      isDirectory
    }
  }

  /**
   * Execute sync based on comparison results
   */
  async execute(
    items: SyncItem[],
    onProgress?: (progress: SyncProgress) => void
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0
    let failed = 0
    const errors: string[] = []
    const actionItems = items.filter(i => i.action !== 'skip')

    for (let i = 0; i < actionItems.length; i++) {
      const item = actionItems[i]

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: actionItems.length,
          currentFile: item.name,
          percentage: Math.round(((i + 1) / actionItems.length) * 100)
        })
      }

      try {
        switch (item.action) {
          case 'upload':
            if (item.isDirectory) {
              await obsService.createFolder(item.remotePath!)
            } else {
              const buffer = await window.electronAPI.readFileAsBuffer(item.localPath!)
              await obsService.uploadObject(item.remotePath!, buffer)
            }
            break

          case 'download':
            if (item.isDirectory) {
              await window.electronAPI.createFolder(item.localPath!)
            } else {
              const data = await obsService.downloadObject(item.remotePath!)
              await window.electronAPI.writeFile(item.localPath!, data)
            }
            break

          case 'delete-local':
            if (item.isDirectory) {
              await window.electronAPI.deleteFolder(item.localPath!)
            } else {
              await window.electronAPI.deleteFile(item.localPath!)
            }
            break

          case 'delete-remote':
            if (item.isDirectory) {
              await obsService.deleteFolderRecursive(item.remotePath!)
            } else {
              await obsService.deleteObject(item.remotePath!)
            }
            break
        }
        success++
      } catch (error) {
        failed++
        errors.push(`${item.name}: ${(error as Error).message}`)
      }
    }

    return { success, failed, errors }
  }
}

export const syncService = new SyncService()
export default syncService
