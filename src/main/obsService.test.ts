import { createHash } from 'crypto'
import { writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const secrets = vi.hoisted(() => ({ username: '', refresh: '' }))
const sha256 = 'a'.repeat(64)
const md5 = 'b'.repeat(32)

vi.mock('./configService', () => ({
  clearOperatorRefresh: () => { secrets.username = ''; secrets.refresh = '' },
  loadOperatorRefresh: () => secrets.refresh ? { username: secrets.username, refresh: secrets.refresh } : null,
  saveOperatorRefresh: (username: string, refresh: string) => {
    secrets.username = username; secrets.refresh = refresh
  }
}))
vi.mock('./fileSystem', () => ({
  validateLocalAudioPath: async (path: string) => path,
  hashAndValidateOgg: async () => ({ md5: 'b'.repeat(32), sha256: 'a'.repeat(64) })
}))

import { obsHandlers } from './obsService'

const path = join(tmpdir(), `clubf5-uploader-resume-${process.pid}.ogg`)
const bytes = Buffer.from('OggS-test-part')
const key = 'Music/online/Progressive/test.ogg'
const digest = { size: bytes.length, md5, sha256 }
const partEtag = createHash('md5').update(bytes).digest('hex')

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status,
    headers: { 'Content-Type': 'application/json' } })
}

beforeEach(async () => {
  secrets.username = ''
  secrets.refresh = ''
  await writeFile(path, bytes)
})
afterAll(async () => { await rm(path, { force: true }) })

describe('uploader account and resumable transfer', () => {
  it('rejects a normal account before storing its refresh token', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/token/login')) return json({ access_token: 'jwt', refresh_token: 'refresh' })
      return json({ error: 'forbidden' }, 403)
    }))

    await expect(obsHandlers['auth:login']({} as never,
      { username: 'normal', password: 'secret' })).rejects.toThrow()
    expect(secrets.refresh).toBe('')
    vi.unstubAllGlobals()
  })

  it('resumes OBS parts already matching the local file without uploading them again', async () => {
    const calls: string[] = []
    let metadataReads = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/token/login')) return json({ access_token: 'jwt', refresh_token: 'refresh' })
      if (url.endsWith('/music-uploader/me')) return json({ username: 'operator', tenantId: 7,
        displayName: 'Operador', allowedPrefixes: ['Music/online/Progressive/'] })
      if (url.endsWith('/music-uploader/sessions')) return json([{ id: 'session', expiresAt: '2099-01-01' }])
      if (url.endsWith('/music-uploader/sessions/session/jobs')) return json({ jobs: [{
        id: 'job', clientFileId: 'file', objectKey: key, sizeBytes: bytes.length,
        sha256, partSizeBytes: 8 * 1024 * 1024, partCount: 1,
        replaceExisting: false, previousETag: null, backupKey: null, status: 'uploading'
      }] })
      if (url.includes('/objects/metadata?')) {
        metadataReads += 1
        return metadataReads === 1 ? json({ error: 'not_found' }, 404)
          : json({ sizeBytes: bytes.length, eTag: 'final-etag', sha256, lastModified: null })
      }
      if (url.endsWith('/files/job')) return json({ job: { id: 'job', objectKey: key,
        sizeBytes: bytes.length, sha256, partSizeBytes: 8 * 1024 * 1024,
        partCount: 1, backupKey: null, status: 'uploading' },
        parts: [{ number: 1, sizeBytes: bytes.length, eTag: partEtag }] })
      if (url.endsWith('/files/job/complete')) return json({ id: 'job', objectKey: key,
        sizeBytes: bytes.length, sha256, backupKey: null, status: 'completed' })
      throw new Error(`Unexpected request: ${url}`)
    }))

    const account = await obsHandlers['auth:login']({} as never,
      { username: 'operator', password: 'secret' })
    expect(account).toMatchObject({ username: 'operator', tenantId: 7 })
    expect(secrets.refresh).toBe('refresh')
    const folders = await obsHandlers['obs:listMusicFolders']({} as never)
    expect(folders).toEqual(['Music/online/Progressive/'])
    const result = await obsHandlers['obs:uploadFile']({ sender: { send: vi.fn() } } as never, {
      transferId: 'transfer', localPath: path, relativePath: 'test.ogg',
      destination: 'Music/online/Progressive/', allowReplace: false,
      expectedRemote: null, digest
    })
    expect(result).toMatchObject({ key, verified: true, replaced: false })
    expect(calls.some(call => call.includes('/parts/1/url'))).toBe(false)
    expect(calls.some(call => call.startsWith('PUT https://'))).toBe(false)
    vi.unstubAllGlobals()
  })

  it('uploads a new part with its signed MD5 and never forwards the ClubF5 token to OBS', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    let metadataReads = 0
    const contentMd5 = createHash('md5').update(bytes).digest('base64')
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.endsWith('/token/login')) return json({ access_token: 'jwt', refresh_token: 'refresh' })
      if (url.endsWith('/music-uploader/me')) return json({ username: 'operator', tenantId: 7,
        displayName: 'Operador', allowedPrefixes: ['Music/online/Progressive/'] })
      if (url.endsWith('/music-uploader/sessions') && init?.method === 'POST') {
        return json({ id: 'session', expiresAt: '2099-01-01' }, 201)
      }
      if (url.endsWith('/music-uploader/sessions')) return json([])
      if (url.includes('/objects/metadata?')) {
        metadataReads += 1
        return metadataReads === 1 ? json({ error: 'not_found' }, 404)
          : json({ sizeBytes: bytes.length, eTag: 'final-etag', sha256, lastModified: null })
      }
      if (url.endsWith('/sessions/session/files') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { sha256: string; replaceExisting: boolean }
        expect(body).toMatchObject({ sha256, replaceExisting: false })
        return json({ id: 'job', objectKey: key, sizeBytes: bytes.length,
          sha256, partSizeBytes: 8 * 1024 * 1024, partCount: 1,
          backupKey: null, status: 'uploading' }, 201)
      }
      if (url.endsWith('/files/job')) return json({ job: { id: 'job', objectKey: key,
        sizeBytes: bytes.length, sha256, partSizeBytes: 8 * 1024 * 1024,
        partCount: 1, backupKey: null, status: 'uploading' }, parts: [] })
      if (url.endsWith('/parts/1/url')) {
        expect(JSON.parse(String(init?.body))).toEqual({ contentMd5 })
        return json({ url: 'https://bucket.obs.sa-argentina-1.myhuaweicloud.com/part',
          headers: { 'Content-MD5': contentMd5 }, expectedBytes: bytes.length })
      }
      if (url.startsWith('https://bucket.obs.')) return new Response(null, { status: 200 })
      if (url.endsWith('/files/job/complete')) return json({ id: 'job', objectKey: key,
        sizeBytes: bytes.length, sha256, backupKey: null, status: 'completed' })
      throw new Error(`Unexpected request: ${url}`)
    }))

    await obsHandlers['auth:login']({} as never, { username: 'operator', password: 'secret' })
    const result = await obsHandlers['obs:uploadFile']({ sender: { send: vi.fn() } } as never, {
      transferId: 'transfer', localPath: path, relativePath: 'test.ogg',
      destination: 'Music/online/Progressive/', allowReplace: false, expectedRemote: null, digest
    })

    expect(result).toMatchObject({ key, verified: true })
    const directPut = calls.find(call => call.url.startsWith('https://bucket.obs.'))
    expect(directPut?.init?.method).toBe('PUT')
    expect(directPut?.init?.headers).toMatchObject({ 'Content-MD5': contentMd5 })
    expect(directPut?.init?.headers).not.toHaveProperty('Authorization')
    vi.unstubAllGlobals()
  })
})
