declare module 'esdk-obs-nodejs' {
  export interface OBSConfig {
    access_key_id: string
    secret_access_key: string
    server: string
  }

  class ObsClient {
    constructor(config: OBSConfig)
    readonly enums: { CopyMetadata: string }
    close(): void
    headBucket(params: unknown, callback: (error: Error | null, result: any) => void): void
    listObjects(params: unknown, callback: (error: Error | null, result: any) => void): void
    getObjectMetadata(params: unknown, callback: (error: Error | null, result: any) => void): void
    putObject(params: unknown, callback: (error: Error | null, result: any) => void): void
    copyObject(params: unknown, callback: (error: Error | null, result: any) => void): void
  }

  export default ObsClient
}
