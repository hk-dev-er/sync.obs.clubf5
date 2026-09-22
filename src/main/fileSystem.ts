import type { IpcMainInvokeEvent } from 'electron'
import { createReadStream } from 'fs'
import * as fs from 'fs/promises'
import * as path from 'path'
import { createHash } from 'crypto'
import { pathToFileURL } from 'url'
import type { LocalAudioFile } from '../shared/syncPlan'
import type { LocalScanResult, ScanProgress } from '../shared/contracts'
import { getLocalPathPreference } from './configService'

function comparablePath(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value
}

export async function validateLocalAudioPath(filePath: string, relativePath?: string): Promise<string> {
  const configuredRoot = getLocalPathPreference()
  if (!configuredRoot) throw new Error('No hay una carpeta local seleccionada')
  if (!filePath.toLowerCase().endsWith('.ogg')) throw new Error('Solo se permiten archivos OGG')

  const [realRoot, realFile] = await Promise.all([fs.realpath(configuredRoot), fs.realpath(filePath)])
  const root = comparablePath(realRoot)
  const file = comparablePath(realFile)
  if (!file.startsWith(`${root}${path.sep}`)) {
    throw new Error('El archivo no pertenece a la carpeta local seleccionada')
  }

  if (relativePath) {
    const expected = path.resolve(realRoot, ...relativePath.replace(/\\/g, '/').split('/'))
    if (file !== comparablePath(expected)) {
      throw new Error('La ruta relativa no coincide con el archivo seleccionado')
    }
  }

  return realFile
}

async function hashAndValidateOgg(filePath: string): Promise<Pick<LocalAudioFile, 'md5' | 'sha256'>> {
  const header = Buffer.alloc(4)
  const handle = await fs.open(filePath, 'r')
  try {
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    if (bytesRead !== 4 || header.toString('ascii') !== 'OggS') {
      throw new Error('El archivo no tiene una cabecera OGG válida')
    }
  } finally {
    await handle.close()
  }

  return new Promise((resolve, reject) => {
    const md5 = createHash('md5')
    const sha256 = createHash('sha256')
    const stream = createReadStream(filePath)

    stream.on('data', (chunk: string | Buffer) => {
      md5.update(chunk)
      sha256.update(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => resolve({ md5: md5.digest('hex'), sha256: sha256.digest('hex') }))
  })
}

async function collectFiles(rootPath: string): Promise<Array<{ path: string; relativePath: string; size: number }>> {
  const rootStats = await fs.stat(rootPath)
  if (!rootStats.isDirectory()) throw new Error('La ruta seleccionada no es una carpeta')

  const files: Array<{ path: string; relativePath: string; size: number }> = []

  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name)
      const stats = await fs.lstat(fullPath)
      if (stats.isSymbolicLink()) continue
      if (stats.isDirectory()) {
        await walk(fullPath)
      } else if (stats.isFile()) {
        files.push({
          path: fullPath,
          relativePath: path.relative(rootPath, fullPath).split(path.sep).join('/').normalize('NFC'),
          size: stats.size
        })
      }
    }
  }

  await walk(rootPath)
  return files
}

async function scanLocalAudio(event: IpcMainInvokeEvent, rootPath: string): Promise<LocalScanResult> {
  const configuredRoot = getLocalPathPreference()
  if (!configuredRoot || comparablePath(await fs.realpath(configuredRoot)) !== comparablePath(await fs.realpath(rootPath))) {
    throw new Error('La carpeta no coincide con la selección guardada')
  }
  const discovered = await collectFiles(rootPath)
  const oggFiles = discovered.filter(file => file.relativePath.toLowerCase().endsWith('.ogg'))
  const ignored = discovered
    .filter(file => !file.relativePath.toLowerCase().endsWith('.ogg'))
    .map(file => file.relativePath)
  const files: LocalAudioFile[] = []
  const invalid: Array<{ path: string; reason: string }> = []

  for (let index = 0; index < oggFiles.length; index += 1) {
    const file = oggFiles[index]
    const progress: ScanProgress = {
      processed: index,
      total: oggFiles.length,
      currentFile: file.relativePath
    }
    event.sender.send('scan:progress', progress)

    try {
      const digests = await hashAndValidateOgg(file.path)
      files.push({
        name: path.basename(file.path),
        path: file.path,
        relativePath: file.relativePath,
        size: file.size,
        ...digests
      })
    } catch (error) {
      invalid.push({ path: file.relativePath, reason: (error as Error).message })
    }
  }

  event.sender.send('scan:progress', {
    processed: oggFiles.length,
    total: oggFiles.length,
    currentFile: ''
  } satisfies ScanProgress)

  return { files, ignored, invalid }
}

async function getFileUrl(_event: IpcMainInvokeEvent, filePath: string): Promise<string> {
  return pathToFileURL(await validateLocalAudioPath(filePath)).toString()
}

export const fileSystemHandlers = {
  'fs:scanLocalAudio': scanLocalAudio,
  'fs:getFileUrl': getFileUrl
}

export { hashAndValidateOgg }
