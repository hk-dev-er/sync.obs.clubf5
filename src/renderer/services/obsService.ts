// OBS Service - Wrapper that uses IPC to communicate with main process
// This avoids CORS issues by running OBS SDK in Node.js (main process)

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
  lastModified: Date | null
  etag?: string
}

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

class OBSService {
  private config: OBSConfig | null = null
  private initialized: boolean = false

  /**
   * Initialize OBS client with credentials
   */
  async initialize(config: OBSConfig): Promise<void> {
    this.config = config
    // Convert to plain object for IPC
    const plainConfig = JSON.parse(JSON.stringify(config))
    await window.electronAPI.obsInitialize(plainConfig)
    this.initialized = true
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.config !== null
  }

  /**
   * Get current bucket name
   */
  getBucket(): string {
    return this.config?.bucket || ''
  }

  /**
   * Test connection to OBS
   */
  async testConnection(): Promise<boolean> {
    if (!this.initialized) {
      return false
    }

    try {
      return await window.electronAPI.obsTestConnection()
    } catch {
      return false
    }
  }

  /**
   * List objects in a prefix (folder)
   */
  async listObjects(prefix: string = ''): Promise<OBSObject[]> {
    if (!this.initialized) {
      throw new Error('OBS client not initialized')
    }

    const objects = await window.electronAPI.obsListObjects(prefix) as Array<{
      key: string
      name: string
      isDirectory: boolean
      size: number
      lastModified: string | null
      etag?: string
    }>

    // Convert lastModified strings to Date objects
    return objects.map(obj => ({
      ...obj,
      lastModified: obj.lastModified ? new Date(obj.lastModified) : null
    }))
  }

  /**
   * List all objects under a prefix recursively (no delimiter)
   */
  async listAllObjects(prefix: string = ''): Promise<OBSObject[]> {
    if (!this.initialized) {
      throw new Error('OBS client not initialized')
    }

    const objects = await window.electronAPI.obsListAllObjects(prefix) as Array<{
      key: string
      name: string
      isDirectory: boolean
      size: number
      lastModified: string | null
      etag?: string
    }>

    return objects.map(obj => ({
      ...obj,
      lastModified: obj.lastModified ? new Date(obj.lastModified) : null
    }))
  }

  /**
   * Upload a file to OBS
   */
  async uploadObject(
    key: string,
    data: ArrayBuffer | Blob | File,
    _onProgress?: (progress: UploadProgress) => void
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error('OBS client not initialized')
    }

    // Convert Blob/File to ArrayBuffer if needed
    let arrayBuffer: ArrayBuffer
    if (data instanceof Blob) {
      arrayBuffer = await data.arrayBuffer()
    } else {
      arrayBuffer = data
    }

    await window.electronAPI.obsUploadObject(key, arrayBuffer)
  }

  /**
   * Download an object from OBS
   */
  async downloadObject(key: string): Promise<ArrayBuffer> {
    if (!this.initialized) {
      throw new Error('OBS client not initialized')
    }

    return await window.electronAPI.obsDownloadObject(key)
  }

  /**
   * Delete an object from OBS
   */
  async deleteObject(key: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('OBS client not initialized')
    }

    await window.electronAPI.obsDeleteObject(key)
  }

  /**
   * Delete multiple objects
   */
  async deleteObjects(keys: string[]): Promise<void> {
    if (!this.initialized) {
      throw new Error('OBS client not initialized')
    }

    await window.electronAPI.obsDeleteObjects(keys)
  }

  /**
   * Create a folder (empty object with trailing slash)
   */
  async createFolder(prefix: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('OBS client not initialized')
    }

    await window.electronAPI.obsCreateFolder(prefix)
  }

  /**
   * Get object metadata
   */
  async getObjectMetadata(key: string): Promise<{
    size: number
    lastModified: Date
    etag: string
  } | null> {
    if (!this.initialized) {
      throw new Error('OBS client not initialized')
    }

    const metadata = await window.electronAPI.obsGetObjectMetadata(key)
    if (!metadata) {
      return null
    }

    return {
      size: metadata.size,
      lastModified: new Date(metadata.lastModified),
      etag: metadata.etag
    }
  }

  /**
   * Delete a folder and all its contents recursively
   */
  async deleteFolderRecursive(prefix: string): Promise<number> {
    if (!this.initialized) {
      throw new Error('OBS client not initialized')
    }

    return await window.electronAPI.obsDeleteFolderRecursive(prefix)
  }
}

// Export singleton instance
export const obsService = new OBSService()
export default obsService
