// Huawei OBS runs only in Electron's main process.
// The SDK does not ship complete TypeScript declarations.
// @ts-nocheck
import ObsClient from 'esdk-obs-nodejs'
import type { IpcMainInvokeEvent } from 'electron'
import * as fs from 'fs/promises'
import type {
  OBSConfigInput,
  RemoteObjectMetadata,
  UploadProgress,
  UploadRequest,
  UploadResult
} from '../shared/contracts'
import type { RemoteAudioFile } from '../shared/syncPlan'
import {
  buildBackupKey,
  buildObjectKey,
  destinationFromObjectKey,
  type DestinationPrefix,
  isAllowedDestination,
  musicDestinationsFromCommonPrefixes,
  MUSIC_ROOT
} from '../shared/uploadPolicy'
import { hashAndValidateOgg, validateLocalAudioPath } from './fileSystem'
import { loadOBSConfig, saveOBSConfig } from './configService'

let obsClient: InstanceType<typeof ObsClient> | null = null
let currentConfig: OBSConfigInput | null = null
let discoveredMusicFolders = new Set<DestinationPrefix>()
let connectionGeneration = 0

function createClient(config: OBSConfigInput): InstanceType<typeof ObsClient> {
  return new ObsClient({
    access_key_id: config.accessKeyId,
    secret_access_key: config.secretAccessKey,
    server: config.endpoint
  })
}

function validateConfig(config: OBSConfigInput): void {
  if (!config.accessKeyId.trim() || !config.secretAccessKey.trim() || !config.bucket.trim()) {
    throw new Error('Completá Access Key, Secret Key y bucket')
  }
  const endpoint = new URL(config.endpoint)
  if (endpoint.protocol !== 'https:') throw new Error('El endpoint OBS debe usar HTTPS')
}

async function headBucket(client: InstanceType<typeof ObsClient>, bucket: string): Promise<boolean> {
  return new Promise((resolve) => {
    client.headBucket({ Bucket: bucket }, (error, result) => {
      resolve(!error && result?.CommonMsg?.Status === 200)
    })
  })
}

async function configure(config: OBSConfigInput): Promise<boolean> {
  validateConfig(config)
  const candidate = createClient(config)
  const connected = await headBucket(candidate, config.bucket)
  if (!connected) {
    candidate.close?.()
    return false
  }

  obsClient?.close?.()
  obsClient = candidate
  currentConfig = { ...config }
  discoveredMusicFolders = new Set()
  connectionGeneration += 1
  saveOBSConfig(config)
  return true
}

async function connectStored(): Promise<boolean> {
  const config = loadOBSConfig()
  if (!config) return false
  validateConfig(config)
  const client = createClient(config)
  if (!(await headBucket(client, config.bucket))) {
    client.close?.()
    return false
  }
  obsClient?.close?.()
  obsClient = client
  currentConfig = config
  discoveredMusicFolders = new Set()
  connectionGeneration += 1
  return true
}

function requireConnection(): { client: InstanceType<typeof ObsClient>; config: OBSConfigInput } {
  if (!obsClient || !currentConfig) throw new Error('OBS no está conectado')
  return { client: obsClient, config: currentConfig }
}

function requireDiscoveredDestination(value: string): DestinationPrefix {
  if (!isAllowedDestination(value) || !discoveredMusicFolders.has(value)) {
    throw new Error('La carpeta musical ya no está disponible. Actualizá la lista de destinos.')
  }
  return value
}

function assertSafeKey(key: string): DestinationPrefix {
  const destination = destinationFromObjectKey(key)
  if (!destination || !discoveredMusicFolders.has(destination) || !key.toLowerCase().endsWith('.ogg')) {
    throw new Error('La ruta OBS no está autorizada')
  }
  return destination
}

function cleanEtag(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  return value.trim().replace(/^"|"$/g, '').toLowerCase()
}

async function listAllObjects(prefix: string): Promise<RemoteAudioFile[]> {
  const destination = requireDiscoveredDestination(prefix)
  const { client, config } = requireConnection()
  const objects: RemoteAudioFile[] = []

  const listPage = async (marker?: string): Promise<void> => {
    const result = await new Promise((resolve, reject) => {
      const params: Record<string, unknown> = { Bucket: config.bucket, Prefix: destination, MaxKeys: 1000 }
      if (marker) params.Marker = marker
      client.listObjects(params, (error, response) => error ? reject(error) : resolve(response))
    })

    if (result.CommonMsg.Status !== 200) {
      throw new Error(`OBS no pudo listar la carpeta: ${result.CommonMsg.Message ?? result.CommonMsg.Status}`)
    }

    for (const object of result.InterfaceResult.Contents ?? []) {
      if (object.Key === destination || object.Key.endsWith('/') || !object.Key.toLowerCase().endsWith('.ogg')) continue
      objects.push({
        key: object.Key,
        relativePath: object.Key.slice(destination.length).normalize('NFC'),
        size: Number(object.Size),
        etag: cleanEtag(object.ETag),
        lastModified: object.LastModified ?? null
      })
    }

    if (result.InterfaceResult.IsTruncated && result.InterfaceResult.NextMarker) {
      await listPage(result.InterfaceResult.NextMarker)
    }
  }

  await listPage()
  return objects
}

async function listMusicFolders(): Promise<DestinationPrefix[]> {
  const { client, config } = requireConnection()
  const generation = connectionGeneration
  const folders = new Set<DestinationPrefix>()

  const listPage = async (marker?: string): Promise<void> => {
    const result = await new Promise((resolve, reject) => {
      const params: Record<string, unknown> = {
        Bucket: config.bucket,
        Prefix: MUSIC_ROOT,
        Delimiter: '/',
        MaxKeys: 1000
      }
      if (marker) params.Marker = marker
      client.listObjects(params, (error, response) => error ? reject(error) : resolve(response))
    })

    if (result.CommonMsg.Status !== 200) {
      throw new Error(`OBS no pudo listar las carpetas musicales: ${result.CommonMsg.Message ?? result.CommonMsg.Status}`)
    }

    for (const prefix of musicDestinationsFromCommonPrefixes(result.InterfaceResult.CommonPrefixes ?? [])) {
      folders.add(prefix)
    }

    if (result.InterfaceResult.IsTruncated && result.InterfaceResult.NextMarker) {
      await listPage(result.InterfaceResult.NextMarker)
    }
  }

  await listPage()
  if (generation !== connectionGeneration) {
    throw new Error('La conexión OBS cambió mientras se consultaban las carpetas. Actualizá la lista.')
  }
  const ordered = [...folders].sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
  discoveredMusicFolders = new Set(ordered)
  return ordered
}

async function assertDestinationStillExists(destination: DestinationPrefix): Promise<void> {
  const { client, config } = requireConnection()
  const result = await new Promise((resolve, reject) => {
    client.listObjects({
      Bucket: config.bucket,
      Prefix: destination,
      MaxKeys: 1
    }, (error, response) => error ? reject(error) : resolve(response))
  })

  if (result.CommonMsg.Status !== 200) {
    throw new Error(`OBS no pudo verificar la carpeta musical: ${result.CommonMsg.Message ?? result.CommonMsg.Status}`)
  }
  if (!(result.InterfaceResult.Contents ?? []).some(item => item.Key?.startsWith(destination))) {
    discoveredMusicFolders.delete(destination)
    throw new Error('La carpeta musical dejó de existir en OBS. No se creó ninguna carpeta nueva.')
  }
}

async function getMetadata(key: string): Promise<RemoteObjectMetadata | null> {
  const prefix = assertSafeKey(key)
  const { client, config } = requireConnection()

  return new Promise((resolve, reject) => {
    client.getObjectMetadata({ Bucket: config.bucket, Key: key }, (error, result) => {
      const status = result?.CommonMsg?.Status
      if (status === 404) return resolve(null)
      if (error) return reject(error)
      if (status !== 200) {
        return reject(new Error(`OBS no pudo consultar el archivo: ${result?.CommonMsg?.Message ?? status}`))
      }

      const metadata = result.InterfaceResult.Metadata ?? {}
      resolve({
        key,
        relativePath: key.slice(prefix.length),
        size: Number(result.InterfaceResult.ContentLength),
        etag: cleanEtag(result.InterfaceResult.ETag),
        sha256: metadata.sha256 ?? metadata.Sha256 ?? null,
        lastModified: result.InterfaceResult.LastModified ?? null,
        metadata
      })
    })
  })
}

async function copyForBackup(sourceKey: string, backupKey: string): Promise<void> {
  const { client, config } = requireConnection()
  const result = await new Promise((resolve, reject) => {
    client.copyObject({
      Bucket: config.bucket,
      Key: backupKey,
      CopySource: `${config.bucket}/${sourceKey}`,
      MetadataDirective: client.enums?.CopyMetadata
    }, (error, response) => error ? reject(error) : resolve(response))
  })
  if (result.CommonMsg.Status >= 300) {
    throw new Error(`No se pudo respaldar el archivo anterior: ${result.CommonMsg.Message ?? result.CommonMsg.Status}`)
  }
}

async function putFile(event: IpcMainInvokeEvent, request: UploadRequest): Promise<UploadResult> {
  const { client, config } = requireConnection()
  const destination = requireDiscoveredDestination(request.destination)
  await assertDestinationStillExists(destination)
  const key = buildObjectKey(request.destination, request.relativePath)
  const localPath = await validateLocalAudioPath(request.localPath, request.relativePath)
  const stats = await fs.stat(localPath)
  const digest = await hashAndValidateOgg(localPath)

  if (stats.size !== request.digest.size || digest.md5 !== request.digest.md5 || digest.sha256 !== request.digest.sha256) {
    throw new Error('El archivo local cambió después de la comparación. Volvé a analizar la carpeta.')
  }

  const current = await getMetadata(key)
  if (current && !request.allowReplace) {
    throw new Error('El archivo apareció en OBS después de la comparación. No se reemplazó.')
  }
  if (!current && request.allowReplace) {
    throw new Error('El archivo que ibas a reemplazar ya no existe. Volvé a analizar la carpeta.')
  }
  if (current && request.allowReplace) {
    const expected = request.expectedRemote
    if (!expected || expected.size !== current.size || cleanEtag(expected.etag) !== cleanEtag(current.etag)) {
      throw new Error('El archivo de OBS cambió después de la comparación. No se reemplazó.')
    }
  }

  let backupKey: string | null = null
  if (current) {
    backupKey = buildBackupKey(request.destination, request.relativePath, new Date().toISOString())
    await copyForBackup(key, backupKey)
    const afterBackup = await getMetadata(key)
    if (!afterBackup || afterBackup.size !== current.size || cleanEtag(afterBackup.etag) !== cleanEtag(current.etag)) {
      throw new Error('El archivo de OBS cambió mientras se preparaba el respaldo. No se reemplazó.')
    }
  }

  const result = await new Promise((resolve, reject) => {
    client.putObject({
      Bucket: config.bucket,
      Key: key,
      SourceFile: localPath,
      ContentLength: stats.size,
      Metadata: { sha256: digest.sha256 },
      ProgressCallback: (transferredAmount, totalAmount, totalSeconds) => {
        event.sender.send('obs:uploadProgress', {
          transferId: request.transferId,
          transferred: Number(transferredAmount),
          total: Number(totalAmount || stats.size),
          elapsedSeconds: Number(totalSeconds || 0)
        } satisfies UploadProgress)
      }
    }, (error, response) => error ? reject(error) : resolve(response))
  })

  if (result.CommonMsg.Status >= 300) {
    throw new Error(`OBS rechazó la carga: ${result.CommonMsg.Message ?? result.CommonMsg.Status}`)
  }

  const uploaded = await getMetadata(key)
  const verified = Boolean(
    uploaded && uploaded.size === stats.size && (
      uploaded.sha256?.toLowerCase() === digest.sha256 ||
      cleanEtag(uploaded.etag) === digest.md5
    )
  )
  if (!verified) {
    throw new Error('OBS recibió el archivo, pero no se pudo verificar su contenido. No continúes sin revisarlo.')
  }

  return {
    key,
    replaced: current !== null,
    backupKey,
    verified,
    etag: uploaded?.etag ?? null
  }
}

export const obsHandlers: Record<string, (event: IpcMainInvokeEvent, ...args: any[]) => Promise<unknown>> = {
  'obs:configure': async (_event, config: OBSConfigInput) => configure(config),
  'obs:connectStored': async () => connectStored(),
  'obs:testConnection': async () => {
    const { client, config } = requireConnection()
    return headBucket(client, config.bucket)
  },
  'obs:listMusicFolders': async () => listMusicFolders(),
  'obs:listAllObjects': async (_event, prefix: string) => listAllObjects(prefix),
  'obs:getObjectMetadata': async (_event, key: string) => getMetadata(key),
  'obs:uploadFile': putFile
}
