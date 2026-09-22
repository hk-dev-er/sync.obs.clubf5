import type { DestinationPrefix } from './uploadPolicy'
import type { LocalAudioFile, RemoteAudioFile } from './syncPlan'

export interface OBSConfigInput {
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  bucket: string
}

export interface OBSConfigStatus {
  configured: boolean
  endpoint: string
  bucket: string
  accessKeyIdHint: string
}

export interface LocalScanResult {
  files: LocalAudioFile[]
  ignored: string[]
  invalid: Array<{ path: string; reason: string }>
}

export interface ScanProgress {
  processed: number
  total: number
  currentFile: string
}

export interface UploadRequest {
  transferId: string
  localPath: string
  relativePath: string
  destination: DestinationPrefix
  allowReplace: boolean
  expectedRemote: { size: number; etag: string | null } | null
  digest: { size: number; md5: string; sha256: string }
}

export interface UploadProgress {
  transferId: string
  transferred: number
  total: number
  elapsedSeconds: number
}

export interface UploadResult {
  key: string
  replaced: boolean
  backupKey: string | null
  verified: boolean
  etag: string | null
}

export interface UploadReportEntry {
  relativePath: string
  action: 'uploaded' | 'replaced' | 'kept' | 'identical' | 'invalid' | 'failed'
  bytes: number
  message: string
  backupKey?: string | null
}

export interface UploadReport {
  generatedAt: string
  sourceFolder: string
  destination: DestinationPrefix
  totals: {
    uploaded: number
    replaced: number
    kept: number
    identical: number
    invalid: number
    failed: number
  }
  entries: UploadReportEntry[]
}

export interface RemoteObjectMetadata extends RemoteAudioFile {
  metadata: Record<string, string>
}
