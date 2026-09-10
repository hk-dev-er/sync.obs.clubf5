// OBS Service for Main Process - Using Node.js SDK (no CORS issues)
// @ts-nocheck
import ObsClient from 'esdk-obs-nodejs'
import type { IpcMainInvokeEvent } from 'electron'

export interface OBSConfig {
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  bucket: string
}

export interface OBSObject {
  key: string
  name: string
  isDirectory: boolean
  size: number
  lastModified: string | null
  etag?: string
}

let obsClient: typeof ObsClient | null = null
let currentConfig: OBSConfig | null = null

function initialize(config: OBSConfig): void {
  if (!config || !config.endpoint) {
    throw new Error('Endpoint OBS no configurado')
  }
  currentConfig = config
  obsClient = new ObsClient({
    access_key_id: config.accessKeyId,
    secret_access_key: config.secretAccessKey,
    server: config.endpoint
  })
}

function isInitialized(): boolean {
  return obsClient !== null && currentConfig !== null
}

async function testConnection(): Promise<boolean> {
  if (!obsClient || !currentConfig) {
    return false
  }

  return new Promise((resolve) => {
    obsClient.headBucket({
      Bucket: currentConfig!.bucket
    }, (err: Error | null, result: { CommonMsg: { Status: number } }) => {
      if (err) {
        resolve(false)
      } else {
        resolve(result.CommonMsg.Status === 200)
      }
    })
  })
}

async function listObjects(prefix: string = ''): Promise<OBSObject[]> {
  if (!obsClient || !currentConfig) {
    throw new Error('OBS client not initialized')
  }

  return new Promise((resolve, reject) => {
    obsClient.listObjects({
      Bucket: currentConfig!.bucket,
      Prefix: prefix,
      Delimiter: '/'
    }, (err: Error | null, result: {
      CommonMsg: { Status: number; Message: string }
      InterfaceResult: {
        CommonPrefixes?: { Prefix: string }[]
        Contents?: { Key: string; Size: number; LastModified: string; ETag: string }[]
      }
    }) => {
      if (err) {
        reject(err)
        return
      }

      if (result.CommonMsg.Status !== 200) {
        reject(new Error(`Failed to list objects: ${result.CommonMsg.Message}`))
        return
      }

      const objects: OBSObject[] = []

      // Add directories (CommonPrefixes)
      if (result.InterfaceResult.CommonPrefixes) {
        for (const dir of result.InterfaceResult.CommonPrefixes) {
          const key = dir.Prefix
          const name = key.replace(prefix, '').replace(/\/$/, '')
          if (name) {
            objects.push({
              key,
              name,
              isDirectory: true,
              size: 0,
              lastModified: null
            })
          }
        }
      }

      // Add files (Contents)
      if (result.InterfaceResult.Contents) {
        for (const obj of result.InterfaceResult.Contents) {
          const key = obj.Key
          const name = key.replace(prefix, '')
          if (name && !name.endsWith('/')) {
            objects.push({
              key,
              name,
              isDirectory: false,
              size: obj.Size,
              lastModified: obj.LastModified || null,
              etag: obj.ETag
            })
          }
        }
      }

      // Sort: directories first, then alphabetically
      objects.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      })

      resolve(objects)
    })
  })
}

async function uploadObject(key: string, data: Buffer): Promise<void> {
  if (!obsClient || !currentConfig) {
    throw new Error('OBS client not initialized')
  }

  return new Promise((resolve, reject) => {
    obsClient.putObject({
      Bucket: currentConfig!.bucket,
      Key: key,
      Body: data
    }, (err: Error | null, result: { CommonMsg: { Status: number; Message: string } }) => {
      if (err) {
        reject(err)
      } else if (result.CommonMsg.Status !== 200) {
        reject(new Error(`Failed to upload: ${result.CommonMsg.Message}`))
      } else {
        resolve()
      }
    })
  })
}

async function downloadObject(key: string): Promise<Buffer> {
  if (!obsClient || !currentConfig) {
    throw new Error('OBS client not initialized')
  }

  return new Promise((resolve, reject) => {
    obsClient.getObject({
      Bucket: currentConfig!.bucket,
      Key: key,
      SaveAsStream: true
    }, (err: Error | null, result: {
      CommonMsg: { Status: number; Message: string }
      InterfaceResult: { Content: Buffer | NodeJS.ReadableStream }
    }) => {
      if (err) {
        reject(err)
        return
      }
      if (result.CommonMsg.Status !== 200) {
        reject(new Error(`Failed to download: ${result.CommonMsg.Message}`))
        return
      }

      const content = result.InterfaceResult.Content

      // With SaveAsStream the content is a readable stream; collect it into a Buffer
      // so binary objects are preserved (a string would corrupt binary data via UTF-8)
      if (Buffer.isBuffer(content)) {
        resolve(content)
      } else if (content && typeof (content as NodeJS.ReadableStream).on === 'function') {
        const chunks: Buffer[] = []
        const stream = content as NodeJS.ReadableStream
        stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
        stream.on('end', () => resolve(Buffer.concat(chunks)))
        stream.on('error', reject)
      } else {
        reject(new Error('No content received from OBS'))
      }
    })
  })
}

async function deleteObject(key: string): Promise<void> {
  if (!obsClient || !currentConfig) {
    throw new Error('OBS client not initialized')
  }

  return new Promise((resolve, reject) => {
    obsClient.deleteObject({
      Bucket: currentConfig!.bucket,
      Key: key
    }, (err: Error | null, result: { CommonMsg: { Status: number; Message: string } }) => {
      if (err) {
        reject(err)
      } else if (result.CommonMsg.Status !== 204 && result.CommonMsg.Status !== 200) {
        reject(new Error(`Failed to delete: ${result.CommonMsg.Message}`))
      } else {
        resolve()
      }
    })
  })
}

async function deleteObjects(keys: string[]): Promise<void> {
  if (!obsClient || !currentConfig) {
    throw new Error('OBS client not initialized')
  }

  const objects = keys.map(key => ({ Key: key }))

  return new Promise((resolve, reject) => {
    obsClient.deleteObjects({
      Bucket: currentConfig!.bucket,
      Quiet: true,
      Objects: objects
    }, (err: Error | null, result: { CommonMsg: { Status: number; Message: string } }) => {
      if (err) {
        reject(err)
      } else if (result.CommonMsg.Status !== 200) {
        reject(new Error(`Failed to delete objects: ${result.CommonMsg.Message}`))
      } else {
        resolve()
      }
    })
  })
}

async function createFolder(prefix: string): Promise<void> {
  if (!obsClient || !currentConfig) {
    throw new Error('OBS client not initialized')
  }

  const folderKey = prefix.endsWith('/') ? prefix : prefix + '/'

  return new Promise((resolve, reject) => {
    obsClient.putObject({
      Bucket: currentConfig!.bucket,
      Key: folderKey,
      Body: ''
    }, (err: Error | null, result: { CommonMsg: { Status: number; Message: string } }) => {
      if (err) {
        reject(err)
      } else if (result.CommonMsg.Status !== 200) {
        reject(new Error(`Failed to create folder: ${result.CommonMsg.Message}`))
      } else {
        resolve()
      }
    })
  })
}

async function listAllObjects(prefix: string = ''): Promise<OBSObject[]> {
  if (!obsClient || !currentConfig) {
    throw new Error('OBS client not initialized')
  }

  const objects: OBSObject[] = []

  const listPage = (marker?: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const params: Record<string, unknown> = {
        Bucket: currentConfig!.bucket,
        Prefix: prefix,
        MaxKeys: 1000
      }
      if (marker) params.Marker = marker

      obsClient.listObjects(params, (err: Error | null, result: {
        CommonMsg: { Status: number; Message: string }
        InterfaceResult: {
          Contents?: { Key: string; Size: number; LastModified: string; ETag: string }[]
          IsTruncated?: boolean
          NextMarker?: string
        }
      }) => {
        if (err) {
          reject(err)
          return
        }
        if (result.CommonMsg.Status !== 200) {
          reject(new Error(`Failed to list objects: ${result.CommonMsg.Message}`))
          return
        }

        const iface = result.InterfaceResult
        if (iface.Contents) {
          for (const obj of iface.Contents) {
            const key = obj.Key
            if (key === prefix) continue
            const name = key.replace(prefix, '')
            if (!name) continue
            const isDirectory = key.endsWith('/')
            objects.push({
              key,
              name,
              isDirectory,
              size: isDirectory ? 0 : obj.Size,
              lastModified: obj.LastModified || null,
              etag: obj.ETag
            })
          }
        }

        if (iface.IsTruncated && iface.NextMarker) {
          listPage(iface.NextMarker).then(resolve, reject)
        } else {
          resolve()
        }
      })
    })
  }

  await listPage()
  return objects
}

async function getObjectMetadata(key: string): Promise<{ size: number; lastModified: string; etag: string } | null> {
  if (!obsClient || !currentConfig) {
    throw new Error('OBS client not initialized')
  }

  return new Promise((resolve) => {
    obsClient.getObjectMetadata({
      Bucket: currentConfig!.bucket,
      Key: key
    }, (err: Error | null, result: {
      CommonMsg: { Status: number }
      InterfaceResult: { ContentLength: number; LastModified: string; ETag: string }
    }) => {
      if (err || result.CommonMsg.Status !== 200) {
        resolve(null)
      } else {
        resolve({
          size: result.InterfaceResult.ContentLength,
          lastModified: result.InterfaceResult.LastModified,
          etag: result.InterfaceResult.ETag
        })
      }
    })
  })
}

// IPC Handlers
export const obsHandlers: Record<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>> = {
  'obs:initialize': async (_, config: OBSConfig) => {
    initialize(config)
    return true
  },

  'obs:testConnection': async () => {
    return testConnection()
  },

  'obs:isInitialized': async () => {
    return isInitialized()
  },

  'obs:listObjects': async (_, prefix: string) => {
    return listObjects(prefix || '')
  },

  'obs:listAllObjects': async (_, prefix: string) => {
    return listAllObjects(prefix || '')
  },

  'obs:uploadObject': async (_, key: string, data: ArrayBuffer) => {
    const buffer = Buffer.from(data)
    await uploadObject(key, buffer)
    return true
  },

  'obs:downloadObject': async (_, key: string) => {
    const buffer = await downloadObject(key)
    // Convert Buffer to Uint8Array for safe IPC transfer
    return new Uint8Array(buffer).buffer
  },

  'obs:deleteObject': async (_, key: string) => {
    await deleteObject(key)
    return true
  },

  'obs:deleteObjects': async (_, keys: string[]) => {
    await deleteObjects(keys)
    return true
  },

  'obs:createFolder': async (_, prefix: string) => {
    await createFolder(prefix)
    return true
  },

  'obs:getObjectMetadata': async (_, key: string) => {
    return getObjectMetadata(key)
  }
}
