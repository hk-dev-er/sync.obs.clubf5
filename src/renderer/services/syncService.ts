// Sync Service - Compare and synchronize local files with OBS (recursive)
import { obsService, type OBSObject } from './obsService'
import type { FileInfo, RecursiveFileInfo } from '../../../electron'

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

// Minimal time tolerance (ms). Files whose mtime matches within this window
// and have the same size are treated as unchanged (avoids clock drift thrash).
const TIME_TOLERANCE_MS = 2000

function normalizePrefix(prefix: string): string {
  if (!prefix) return ''
  return prefix.endsWith('/') ? prefix : prefix + '/'
}

class SyncService {
  /**
   * Compare a local directory with an OBS prefix recursively.
   * Matching is done by relative path (name); change detection by size + date + etag.
   */
  async compare(
    localPath: string,
    remotePath: string,
    mode: SyncMode
  ): Promise<SyncResult> {
    const root = normalizePrefix(remotePath)

    // Recursive local listing
    const localEntries = await window.electronAPI.listRecursive(localPath)

    // Recursive remote listing
    const remoteObjects = await obsService.listAllObjects(root)

    // Build maps keyed by relative name (normalized, no trailing slash)
    const localFiles = new Map<string, RecursiveFileInfo>()
    for (const entry of localEntries) {
      if (entry.isDirectory) continue
      localFiles.set(entry.relativePath, entry)
    }

    const remoteFiles = new Map<string, OBSObject>()
    for (const obj of remoteObjects) {
      if (obj.isDirectory) continue
      const key = obj.name.replace(/\/+$/, '')
      remoteFiles.set(key, obj)
    }

    const items: SyncItem[] = []
    const processedRemote = new Set<string>()

    // Local files
    for (const [relName, localFile] of localFiles) {
      const remoteObj = remoteFiles.get(relName) || null
      if (remoteObj) processedRemote.add(relName)

      items.push(
        await this.determineSyncAction(
          relName,
          localFile,
          remoteObj,
          localPath,
          root,
          mode
        )
      )
    }

    // Remote-only files
    for (const [relName, remoteObj] of remoteFiles) {
      if (processedRemote.has(relName)) continue
      items.push(
        await this.determineSyncAction(
          relName,
          null,
          remoteObj,
          localPath,
          root,
          mode
        )
      )
    }

    // Sort by name for predictable output
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    const stats = {
      toUpload: items.filter(i => i.action === 'upload').length,
      toDownload: items.filter(i => i.action === 'download').length,
      toDeleteLocal: items.filter(i => i.action === 'delete-local').length,
      toDeleteRemote: items.filter(i => i.action === 'delete-remote').length,
      unchanged: items.filter(i => i.action === 'skip').length,
      conflicts: 0
    }

    return { items, stats }
  }

  private async determineSyncAction(
    relName: string,
    localFile: RecursiveFileInfo | null,
    remoteObj: OBSObject | null,
    localRoot: string,
    remoteRoot: string,
    mode: SyncMode
  ): Promise<SyncItem> {
    const localFullPath = localFile
      ? localFile.path
      : await window.electronAPI.joinPath(localRoot, ...relName.split('/'))
    const remoteKey = remoteRoot + relName

    // Both exist - compare size + date (+ etag signal)
    if (localFile && remoteObj) {
      const localSize = localFile.size
      const remoteSize = remoteObj.size
      const localTime = localFile.modifiedTime
      const remoteTime = remoteObj.lastModified?.getTime() || 0

      const sizeChanged = localSize !== remoteSize
      const dateChanged = Math.abs(localTime - remoteTime) > TIME_TOLERANCE_MS
      const changed = sizeChanged || dateChanged

      if (!changed) {
        return this.makeItem(relName, localFullPath, remoteKey, localFile, remoteObj, 'skip', 'Sin cambios')
      }

      if (localTime > remoteTime) {
        // Local is newer
        if (mode === 'obs-to-local') {
          return this.makeItem(relName, localFullPath, remoteKey, localFile, remoteObj, 'skip', 'Local más reciente (modo OBS→Local)')
        }
        const detail = sizeChanged ? 'Tamaño distinto / local más reciente' : 'Local más reciente'
        return this.makeItem(relName, localFullPath, remoteKey, localFile, remoteObj, 'upload', detail)
      } else {
        // Remote is newer (or equal times)
        if (mode === 'local-to-obs') {
          return this.makeItem(relName, localFullPath, remoteKey, localFile, remoteObj, 'skip', 'Remoto más reciente (modo Local→OBS)')
        }
        const detail = sizeChanged ? 'Tamaño distinto / remoto más reciente' : 'Remoto más reciente'
        return this.makeItem(relName, localFullPath, remoteKey, localFile, remoteObj, 'download', detail)
      }
    }

    // Only local exists
    if (localFile && !remoteObj) {
      if (mode === 'obs-to-local') {
        return this.makeItem(relName, localFullPath, remoteKey, localFile, null, 'delete-local', 'No existe en OBS')
      }
      return this.makeItem(relName, localFullPath, remoteKey, localFile, null, 'upload', 'Nuevo archivo local')
    }

    // Only remote exists
    if (!localFile && remoteObj) {
      if (mode === 'local-to-obs') {
        return this.makeItem(relName, localFullPath, remoteKey, null, remoteObj, 'delete-remote', 'No existe localmente')
      }
      return this.makeItem(relName, localFullPath, remoteKey, null, remoteObj, 'download', 'Nuevo archivo remoto')
    }

    return this.makeItem(relName, null, null, null, null, 'skip', 'Error: archivo no encontrado')
  }

  private makeItem(
    name: string,
    localPath: string | null,
    remotePath: string | null,
    localInfo: FileInfo | null,
    remoteInfo: OBSObject | null,
    action: SyncAction,
    reason: string
  ): SyncItem {
    return {
      name,
      localPath,
      remotePath,
      localInfo,
      remoteInfo,
      action,
      reason,
      isDirectory: false
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
          case 'upload': {
            const buffer = await window.electronAPI.readFileAsBuffer(item.localPath!)
            await obsService.uploadObject(item.remotePath!, buffer)
            break
          }

          case 'download': {
            const data = await obsService.downloadObject(item.remotePath!)
            await window.electronAPI.writeFile(item.localPath!, data)
            break
          }

          case 'delete-local':
            await window.electronAPI.deleteFile(item.localPath!)
            break

          case 'delete-remote':
            await obsService.deleteObject(item.remotePath!)
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
