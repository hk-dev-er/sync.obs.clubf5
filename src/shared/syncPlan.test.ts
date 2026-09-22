import { describe, expect, it } from 'vitest'
import { buildUploadPlan, normalizeEtag, type LocalAudioFile, type RemoteAudioFile } from './syncPlan'

const local = (relativePath: string, overrides: Partial<LocalAudioFile> = {}): LocalAudioFile => ({
  name: relativePath.split('/').slice(-1)[0] ?? relativePath,
  path: `C:/music/${relativePath}`,
  relativePath,
  size: 100,
  md5: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  sha256: 'b'.repeat(64),
  ...overrides
})

const remote = (relativePath: string, overrides: Partial<RemoteAudioFile> = {}): RemoteAudioFile => ({
  key: `Music/online/Progressive/${relativePath}`,
  relativePath,
  size: 100,
  etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
  ...overrides
})

describe('buildUploadPlan', () => {
  it('carga archivos locales nuevos', () => {
    const plan = buildUploadPlan([local('nuevo.ogg')], [])
    expect(plan.items[0]).toMatchObject({ kind: 'upload-new', decision: 'upload' })
  })

  it('nunca elimina un archivo que solo existe en OBS', () => {
    const plan = buildUploadPlan([], [remote('remoto.ogg')])
    expect(plan.items[0]).toMatchObject({ kind: 'remote-only', decision: 'keep' })
    expect(plan.items.map(item => item.decision)).not.toContain('replace')
  })

  it('reconoce una coincidencia exacta por ETag MD5', () => {
    const plan = buildUploadPlan([local('igual.ogg')], [remote('igual.ogg')])
    expect(plan.items[0]).toMatchObject({ kind: 'identical', decision: 'keep' })
  })

  it('prioriza SHA-256 cuando OBS lo informa', () => {
    const plan = buildUploadPlan(
      [local('igual.ogg')],
      [remote('igual.ogg', { etag: 'multipart-etag', sha256: 'b'.repeat(64) })]
    )
    expect(plan.items[0].kind).toBe('identical')
  })

  it('deja un conflicto en conservar de forma predeterminada', () => {
    const plan = buildUploadPlan(
      [local('conflicto.ogg')],
      [remote('conflicto.ogg', { etag: 'cccccccccccccccccccccccccccccccc' })]
    )
    expect(plan.items[0]).toMatchObject({ kind: 'conflict', decision: 'keep' })
  })

  it('no confunde archivos del mismo tamaño si no puede verificar el digest', () => {
    const plan = buildUploadPlan(
      [local('incierto.ogg')],
      [remote('incierto.ogg', { etag: 'multipart-2', sha256: null })]
    )
    expect(plan.items[0].kind).toBe('conflict')
  })

  it('mantiene rutas sensibles a mayúsculas y un orden estable', () => {
    const plan = buildUploadPlan(
      [local('b.ogg'), local('A.ogg')],
      [remote('a.ogg')]
    )
    expect(plan.items.map(item => item.relativePath)).toEqual(['A.ogg', 'a.ogg', 'b.ogg'])
  })
})

describe('normalizeEtag', () => {
  it('acepta MD5 entre comillas', () => {
    expect(normalizeEtag('"ABCDEFABCDEFABCDEFABCDEFABCDEFAB"')).toBe('abcdefabcdefabcdefabcdefabcdefab')
  })

  it('rechaza ETags multipart', () => {
    expect(normalizeEtag('abcdefabcdefabcdefabcdefabcdefab-2')).toBeNull()
  })
})
