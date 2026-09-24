import type { IpcMainInvokeEvent } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import type { OperatorLogin, OperatorStatus, RemoteObjectMetadata, UploadProgress,
  UploadRequest, UploadResult } from '../shared/contracts'
import type { RemoteAudioFile } from '../shared/syncPlan'
import { buildObjectKey, isAllowedDestination, type DestinationPrefix } from '../shared/uploadPolicy'
import { hashAndValidateOgg, validateLocalAudioPath } from './fileSystem'
import { clearOperatorRefresh, loadOperatorRefresh, saveOperatorRefresh } from './configService'

const API_ROOT = 'https://api.clubf5.com/api'
const API_TIMEOUT_MS = 30_000

interface TokenPair { access_token: string; refresh_token: string }
interface Account { username: string; tenantId: number; displayName: string; allowedPrefixes: string[] }
interface Session { id: string; expiresAt: string }
interface Job {
  id: string; clientFileId: string; objectKey: string; sizeBytes: number; sha256: string
  partSizeBytes: number; partCount: number; replaceExisting: boolean
  previousETag: string | null; backupKey: string | null; status: string
}
interface RemoteMetadata { sizeBytes: number; eTag: string; sha256: string | null;
  jobId: string | null; lastModified: string | null }
interface Part { number: number; sizeBytes: number; eTag: string }

class ApiError extends Error {
  constructor(readonly status: number, code: string) {
    super(`ClubF5 rechazó la operación: ${code}`)
  }
}

let accessToken: string | null = null
let refreshInFlight: Promise<void> | null = null
let allowedFolders = new Set<DestinationPrefix>()

function apiUrl(path: string): string { return `${API_ROOT}${path}` }

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code = `HTTP ${response.status}`
    try {
      const body = await response.json() as { error?: string }
      if (body.error) code = body.error
    } catch { /* Keep the status without exposing server internals. */ }
    throw new ApiError(response.status, code)
  }
  return response.json() as Promise<T>
}

async function rawApi(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), { ...init, signal: AbortSignal.timeout(API_TIMEOUT_MS) })
}

async function rotateToken(): Promise<void> {
  const saved = loadOperatorRefresh()
  if (!saved) throw new Error('Iniciá sesión con tu usuario de carga')
  const response = await rawApi('/token/music-uploader-refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(saved)
  })
  if (response.status === 401) {
    clearOperatorRefresh()
    accessToken = null
    throw new Error('La sesión terminó o el operador fue deshabilitado. Iniciá sesión nuevamente.')
  }
  const pair = await readJson<TokenPair>(response)
  if (!pair.access_token || !pair.refresh_token) throw new Error('Respuesta de sesión incompleta')
  saveOperatorRefresh(saved.username, pair.refresh_token)
  accessToken = pair.access_token
}

async function refreshOnce(): Promise<void> {
  refreshInFlight ??= rotateToken().finally(() => { refreshInFlight = null })
  await refreshInFlight
}

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (!accessToken) await refreshOnce()
  const request = () => rawApi(path, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  let response = await request()
  if (response.status === 401) {
    await refreshOnce()
    response = await request()
  }
  if (response.status === 204) return undefined as T
  return readJson<T>(response)
}

async function getAccount(): Promise<Account> {
  const next = await api<Account>('/music-uploader/me')
  allowedFolders = new Set(next.allowedPrefixes.filter(isAllowedDestination))
  return next
}

function status(value: Account): OperatorStatus {
  return { configured: true, username: value.username,
    displayName: value.displayName, tenantId: value.tenantId }
}

async function login(credentials: OperatorLogin): Promise<OperatorStatus> {
  if (!credentials.username.trim() || !credentials.password) throw new Error('Completá usuario y contraseña')
  const response = await rawApi('/token/login', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`,
      'Content-Type': 'application/json' }, body: JSON.stringify({ admin: 0 })
  })
  const pair = await readJson<TokenPair>(response)
  if (!pair.access_token || !pair.refresh_token) throw new Error('Respuesta de sesión incompleta')
  accessToken = pair.access_token
  try {
    const value = await getAccount() // A normal ClubF5 user cannot use this app.
    saveOperatorRefresh(value.username, pair.refresh_token)
    return status(value)
  } catch (error) {
    accessToken = null
    throw error
  }
}

async function connectStored(): Promise<OperatorStatus | null> {
  if (!loadOperatorRefresh()) return null
  await refreshOnce()
  return status(await getAccount())
}

async function logout(): Promise<void> {
  const saved = loadOperatorRefresh()
  try {
    if (saved) {
      // A logout revokes all active upload sessions, not just the short JWT.
      for (const session of await api<Session[]>('/music-uploader/sessions')) {
        await api<void>(`/music-uploader/sessions/${session.id}`, 'DELETE')
      }
      const response = await rawApi('/token/logout', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saved) })
      if (!response.ok) throw new ApiError(response.status, 'logout_not_confirmed')
    }
  } finally {
    clearOperatorRefresh()
    accessToken = null
    allowedFolders = new Set()
  }
}

async function listMusicFolders(): Promise<DestinationPrefix[]> {
  await getAccount()
  return [...allowedFolders].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

function requireFolder(prefix: string): DestinationPrefix {
  if (!isAllowedDestination(prefix) || !allowedFolders.has(prefix)) {
    throw new Error('La carpeta ya no está autorizada. Actualizá la lista.')
  }
  return prefix
}

function cleanEtag(value: string | null | undefined): string | null {
  return value?.trim().replace(/^"|"$/g, '').toLowerCase() ?? null
}

async function listAllObjects(value: string): Promise<RemoteAudioFile[]> {
  await getAccount()
  const prefix = requireFolder(value)
  const files: RemoteAudioFile[] = []
  let marker: string | null = null
  do {
    const query = new URLSearchParams({ prefix })
    if (marker) query.set('marker', marker)
    const page = await api<{ objects: Array<{ key: string; sizeBytes: number; eTag: string;
      lastModified: string | null }>; nextMarker: string | null }>(`/music-uploader/objects?${query}`)
    for (const item of page.objects) {
      if (!item.key.startsWith(prefix) || item.key.endsWith('/') || !item.key.toLowerCase().endsWith('.ogg')) continue
      files.push({ key: item.key, relativePath: item.key.slice(prefix.length).normalize('NFC'),
        size: item.sizeBytes, etag: cleanEtag(item.eTag), lastModified: item.lastModified })
    }
    if (page.nextMarker && page.nextMarker === marker) throw new Error('La lista remota no avanzó')
    marker = page.nextMarker
  } while (marker)
  return files
}

async function getMetadata(key: string): Promise<RemoteObjectMetadata | null> {
  await getAccount()
  const prefix = [...allowedFolders].find(folder => key.startsWith(folder))
  if (!prefix || !key.toLowerCase().endsWith('.ogg')) throw new Error('Archivo fuera de las carpetas autorizadas')
  try {
    const item = await api<RemoteMetadata>(`/music-uploader/objects/metadata?key=${encodeURIComponent(key)}`)
    return { key, relativePath: key.slice(prefix.length), size: item.sizeBytes,
      etag: cleanEtag(item.eTag), sha256: item.sha256, jobId: item.jobId,
      lastModified: item.lastModified,
      metadata: item.sha256 ? { sha256: item.sha256 } : {} }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

async function sessionFor(request: UploadRequest, key: string): Promise<{ session: Session; job: Job | null }> {
  const sessions = await api<Session[]>('/music-uploader/sessions')
  for (const session of sessions) {
    const result = await api<{ jobs: Job[] }>(`/music-uploader/sessions/${session.id}/jobs`)
    const job = result.jobs.find(item => item.objectKey === key && item.sizeBytes === request.digest.size
      && item.sha256?.toLowerCase() === request.digest.sha256.toLowerCase()
      && item.replaceExisting === request.allowReplace
      && (!request.allowReplace || cleanEtag(item.previousETag) === cleanEtag(request.expectedRemote?.etag))
      && (item.status === 'uploading' || item.status === 'completing' || item.status === 'completed'))
    if (job) return { session, job }
  }
  return { session: sessions[0] ?? await api<Session>('/music-uploader/sessions', 'POST'), job: null }
}

async function partMd5(file: string, start: number, size: number): Promise<string> {
  const hash = createHash('md5')
  for await (const chunk of createReadStream(file, { start, end: start + size - 1 })) hash.update(chunk)
  return hash.digest('base64')
}

async function sendPart(file: string, job: Job, sessionId: string, number: number,
  contentMd5: string): Promise<void> {
  const start = (number - 1) * job.partSizeBytes
  const size = Math.min(job.partSizeBytes, job.sizeBytes - start)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const signed = await api<{ url: string; headers: Record<string, string>; expectedBytes: number }>(
      `/music-uploader/sessions/${sessionId}/files/${job.id}/parts/${number}/url`, 'POST', { contentMd5 })
    const signedHost = new URL(signed.url)
    if (signed.expectedBytes !== size || signedHost.protocol !== 'https:'
      || !signedHost.hostname.endsWith('.myhuaweicloud.com')
      || !Object.keys(signed.headers).some(name => name.toLowerCase() === 'content-md5')) {
      throw new Error('ClubF5 devolvió una URL de carga inesperada')
    }
    let response: Response
    try {
      response = await fetch(signed.url, { method: 'PUT', headers: { ...signed.headers,
        'Content-Length': String(size) },
        body: createReadStream(file, { start, end: start + size - 1 }) as unknown as BodyInit,
        duplex: 'half', signal: AbortSignal.timeout(15 * 60_000) } as RequestInit & { duplex: 'half' })
    } catch {
      if (attempt === 2) throw new Error(`No se pudo enviar la parte ${number}. Se puede reanudar más tarde.`)
      continue
    }
    if (response.ok) return
    await response.arrayBuffer() // Drain without logging the signed URL or private response.
    if (attempt === 2 || ![403, 408, 429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`OBS rechazó la parte ${number}: HTTP ${response.status}`)
    }
  }
}

async function uploadFile(event: IpcMainInvokeEvent, request: UploadRequest): Promise<UploadResult> {
  await getAccount()
  const destination = requireFolder(request.destination)
  const key = buildObjectKey(destination, request.relativePath)
  const file = await validateLocalAudioPath(request.localPath, request.relativePath)
  const size = (await stat(file)).size
  const digest = await hashAndValidateOgg(file)
  if (size !== request.digest.size || digest.sha256 !== request.digest.sha256 || digest.md5 !== request.digest.md5) {
    throw new Error('El archivo local cambió desde la comparación. Compará nuevamente.')
  }
  const resumed = await sessionFor(request, key)
  if (resumed.job?.status === 'completing') {
    resumed.job = await api<Job>(
      `/music-uploader/sessions/${resumed.session.id}/files/${resumed.job.id}/complete`, 'POST')
  }
  if (resumed.job?.status === 'completed') {
    const published = await getMetadata(key)
    if (published?.size === size && published.sha256?.toLowerCase() === digest.sha256
      && published.jobId?.toLowerCase() === resumed.job.id.toLowerCase()) {
      return { key, replaced: request.allowReplace, backupKey: resumed.job.backupKey,
        verified: true, etag: published.etag }
    }
    // The completed object may have been removed later. Do not reuse its old job.
    resumed.job = null
  }
  const remote = await getMetadata(key)
  if (remote && !request.allowReplace) throw new Error('El archivo apareció en OBS. Compará nuevamente.')
  if (!remote && request.allowReplace) throw new Error('El archivo remoto desapareció. Compará nuevamente.')
  if (remote && request.allowReplace && (!request.expectedRemote
    || request.expectedRemote.size !== remote.size
    || cleanEtag(request.expectedRemote.etag) !== cleanEtag(remote.etag))) {
    throw new Error('El archivo remoto cambió. Compará nuevamente.')
  }

  const session = resumed.session
  let job = resumed.job
  if (!job) {
    job = await api<Job>(`/music-uploader/sessions/${session.id}/files`, 'POST', {
      clientFileId: randomUUID(), prefix: destination, relativePath: request.relativePath,
      sizeBytes: size, sha256: digest.sha256, replaceExisting: request.allowReplace,
      expectedRemote: remote ? { sizeBytes: remote.size, eTag: remote.etag } : null
    })
  }

  const started = Date.now()
  if (job.status !== 'completed') {
    const state = await api<{ job: Job; parts: Part[] }>(
      `/music-uploader/sessions/${session.id}/files/${job.id}`)
    job = state.job
    if (job.status === 'uploading') {
      const uploaded = new Map(state.parts.map(part => [part.number, part]))
      let transferred = 0
      for (let number = 1; number <= job.partCount; number += 1) {
        const expected = Math.min(job.partSizeBytes, size - (number - 1) * job.partSizeBytes)
        const md5 = await partMd5(file, (number - 1) * job.partSizeBytes, expected)
        const prior = uploaded.get(number)
        if (prior?.sizeBytes !== expected || cleanEtag(prior.eTag) !== Buffer.from(md5, 'base64').toString('hex')) {
          await sendPart(file, job, session.id, number, md5)
        }
        transferred += expected
        event.sender.send('obs:uploadProgress', { transferId: request.transferId, transferred,
          total: size, elapsedSeconds: (Date.now() - started) / 1000 } satisfies UploadProgress)
      }
      job = await api<Job>(`/music-uploader/sessions/${session.id}/files/${job.id}/complete`, 'POST')
    }
    if (job.status === 'completing') {
      job = await api<Job>(`/music-uploader/sessions/${session.id}/files/${job.id}/complete`, 'POST')
    }
  }
  if (job.status !== 'completed') throw new Error('La carga no quedó confirmada. Podés reanudarla más tarde.')
  const [published, after] = await Promise.all([getMetadata(key), hashAndValidateOgg(file)])
  if (!published || published.size !== size || published.sha256?.toLowerCase() !== digest.sha256
    || published.jobId?.toLowerCase() !== job.id.toLowerCase()
    || after.sha256 !== digest.sha256) {
    throw new Error('No se pudo confirmar el contenido final. No continúes sin revisarlo.')
  }
  return { key, replaced: request.allowReplace, backupKey: job.backupKey,
    verified: true, etag: published.etag }
}

export const obsHandlers: Record<string, (event: IpcMainInvokeEvent, ...args: any[]) => Promise<unknown>> = {
  'auth:login': async (_event, credentials: OperatorLogin) => login(credentials),
  'auth:connectStored': async () => connectStored(),
  'auth:logout': async () => logout(),
  'obs:listMusicFolders': async () => listMusicFolders(),
  'obs:listAllObjects': async (_event, prefix: string) => listAllObjects(prefix),
  'obs:getObjectMetadata': async (_event, key: string) => getMetadata(key),
  'obs:uploadFile': uploadFile
}
