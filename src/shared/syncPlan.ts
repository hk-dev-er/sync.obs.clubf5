export interface LocalAudioFile {
  name: string
  path: string
  relativePath: string
  size: number
  md5: string
  sha256: string
}

export interface RemoteAudioFile {
  key: string
  relativePath: string
  size: number
  etag: string | null
  sha256?: string | null
  lastModified?: string | null
}

export type PlanKind = 'upload-new' | 'identical' | 'conflict' | 'remote-only'
export type UploadDecision = 'upload' | 'replace' | 'keep'

export interface UploadPlanItem {
  id: string
  relativePath: string
  kind: PlanKind
  decision: UploadDecision
  reason: string
  local: LocalAudioFile | null
  remote: RemoteAudioFile | null
}

export interface UploadPlan {
  items: UploadPlanItem[]
  counts: {
    newFiles: number
    identical: number
    conflicts: number
    remoteOnly: number
  }
}

export function normalizeEtag(etag: string | null | undefined): string | null {
  if (!etag) return null
  const value = etag.trim().replace(/^"|"$/g, '').toLowerCase()
  return /^[a-f0-9]{32}$/.test(value) ? value : null
}

function matchesExactly(local: LocalAudioFile, remote: RemoteAudioFile): boolean {
  if (local.size !== remote.size) return false

  if (remote.sha256 && /^[a-f0-9]{64}$/i.test(remote.sha256)) {
    return local.sha256.toLowerCase() === remote.sha256.toLowerCase()
  }

  const etag = normalizeEtag(remote.etag)
  return etag !== null && local.md5.toLowerCase() === etag
}

export function buildUploadPlan(
  localFiles: LocalAudioFile[],
  remoteFiles: RemoteAudioFile[]
): UploadPlan {
  const localByPath = new Map(localFiles.map(file => [file.relativePath, file]))
  const remoteByPath = new Map(remoteFiles.map(file => [file.relativePath, file]))
  const paths = new Set([...localByPath.keys(), ...remoteByPath.keys()])
  const items: UploadPlanItem[] = []

  for (const relativePath of [...paths].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))) {
    const local = localByPath.get(relativePath) ?? null
    const remote = remoteByPath.get(relativePath) ?? null

    if (local && !remote) {
      items.push({
        id: relativePath,
        relativePath,
        kind: 'upload-new',
        decision: 'upload',
        reason: 'Archivo nuevo: se cargará sin reemplazar nada.',
        local,
        remote
      })
      continue
    }

    if (!local && remote) {
      items.push({
        id: relativePath,
        relativePath,
        kind: 'remote-only',
        decision: 'keep',
        reason: 'Solo existe en OBS: se conserva.',
        local,
        remote
      })
      continue
    }

    if (local && remote && matchesExactly(local, remote)) {
      items.push({
        id: relativePath,
        relativePath,
        kind: 'identical',
        decision: 'keep',
        reason: 'Contenido idéntico: no se vuelve a cargar.',
        local,
        remote
      })
      continue
    }

    items.push({
      id: relativePath,
      relativePath,
      kind: 'conflict',
      decision: 'keep',
      reason: local?.size !== remote?.size
        ? 'Mismo nombre, contenido distinto: se conserva OBS hasta que elijas reemplazar.'
        : 'No se pudo demostrar que sean idénticos: se conserva OBS por seguridad.',
      local,
      remote
    })
  }

  return {
    items,
    counts: {
      newFiles: items.filter(item => item.kind === 'upload-new').length,
      identical: items.filter(item => item.kind === 'identical').length,
      conflicts: items.filter(item => item.kind === 'conflict').length,
      remoteOnly: items.filter(item => item.kind === 'remote-only').length
    }
  }
}
