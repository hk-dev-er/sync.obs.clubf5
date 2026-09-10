import type { IpcMainInvokeEvent } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { homedir } from 'os'

export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedTime: number
  createdTime: number
}

export interface RecursiveFileInfo {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  size: number
  modifiedTime: number
  createdTime: number
}

async function readDirectory(_event: IpcMainInvokeEvent, dirPath: string): Promise<FileInfo[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const files: FileInfo[] = []

    for (const entry of entries) {
      try {
        const fullPath = path.join(dirPath, entry.name)
        const stats = await fs.stat(fullPath)
        
        files.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size: stats.size,
          modifiedTime: stats.mtimeMs,
          createdTime: stats.birthtimeMs
        })
      } catch {
        // Skip files we can't access
        continue
      }
    }

    // Sort: directories first, then alphabetically
    return files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  } catch (error) {
    throw new Error(`Cannot read directory: ${(error as Error).message}`)
  }
}

async function getFileStats(_event: IpcMainInvokeEvent, filePath: string): Promise<FileInfo> {
  try {
    const stats = await fs.stat(filePath)
    return {
      name: path.basename(filePath),
      path: filePath,
      isDirectory: stats.isDirectory(),
      size: stats.size,
      modifiedTime: stats.mtimeMs,
      createdTime: stats.birthtimeMs
    }
  } catch (error) {
    throw new Error(`Cannot get file stats: ${(error as Error).message}`)
  }
}

async function readFileAsBuffer(_event: IpcMainInvokeEvent, filePath: string): Promise<ArrayBuffer> {
  try {
    const buffer = await fs.readFile(filePath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  } catch (error) {
    throw new Error(`Cannot read file: ${(error as Error).message}`)
  }
}

async function writeFile(_event: IpcMainInvokeEvent, filePath: string, data: ArrayBuffer): Promise<void> {
  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, Buffer.from(data))
  } catch (error) {
    throw new Error(`Cannot write file: ${(error as Error).message}`)
  }
}

async function deleteFile(_event: IpcMainInvokeEvent, filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
  } catch (error) {
    throw new Error(`Cannot delete file: ${(error as Error).message}`)
  }
}

async function deleteFolder(_event: IpcMainInvokeEvent, folderPath: string): Promise<void> {
  try {
    await fs.rm(folderPath, { recursive: true, force: true })
  } catch (error) {
    throw new Error(`Cannot delete folder: ${(error as Error).message}`)
  }
}

async function createFolder(_event: IpcMainInvokeEvent, folderPath: string): Promise<void> {
  try {
    await fs.mkdir(folderPath, { recursive: true })
  } catch (error) {
    throw new Error(`Cannot create folder: ${(error as Error).message}`)
  }
}

async function exists(_event: IpcMainInvokeEvent, filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function getHomePath(): string {
  return homedir()
}

async function joinPath(_event: IpcMainInvokeEvent, ...segments: string[]): Promise<string> {
  return path.join(...segments)
}

async function getParentPath(_event: IpcMainInvokeEvent, filePath: string): Promise<string> {
  return path.dirname(filePath)
}

async function listRecursive(_event: IpcMainInvokeEvent, rootPath: string): Promise<RecursiveFileInfo[]> {
  const results: RecursiveFileInfo[] = []

  async function walk(dirPath: string) {
    let entries
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      let fullPath
      let stats
      try {
        fullPath = path.join(dirPath, entry.name)
        stats = await fs.stat(fullPath)
      } catch {
        continue
      }

      const isDirectory = entry.isDirectory()
      const relativePath = path.relative(rootPath, fullPath).split(path.sep).join('/')

      results.push({
        name: entry.name,
        path: fullPath,
        relativePath,
        isDirectory,
        size: stats.size,
        modifiedTime: stats.mtimeMs,
        createdTime: stats.birthtimeMs
      })

      if (isDirectory) {
        await walk(fullPath)
      }
    }
  }

  await walk(rootPath)
  return results
}

export const fileSystemHandlers = {
  'fs:readDirectory': readDirectory,
  'fs:getFileStats': getFileStats,
  'fs:readFileAsBuffer': readFileAsBuffer,
  'fs:writeFile': writeFile,
  'fs:deleteFile': deleteFile,
  'fs:deleteFolder': deleteFolder,
  'fs:createFolder': createFolder,
  'fs:exists': exists,
  'fs:getHomePath': getHomePath,
  'fs:joinPath': joinPath,
  'fs:getParentPath': getParentPath,
  'fs:listRecursive': listRecursive
}
