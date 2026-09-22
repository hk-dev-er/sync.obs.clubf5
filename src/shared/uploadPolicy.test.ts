import { describe, expect, it } from 'vitest'
import { buildBackupKey, buildObjectKey, normalizeRelativePath } from './uploadPolicy'

describe('upload policy', () => {
  it('solo arma claves dentro de destinos autorizados', () => {
    expect(buildObjectKey('Music/online/Progressive/', 'Artist/track.ogg'))
      .toBe('Music/online/Progressive/Artist/track.ogg')
    expect(() => buildObjectKey('otra/', 'track.ogg')).toThrow(/no está autorizada/)
  })

  it('rechaza traversal y extensiones distintas de OGG', () => {
    expect(() => normalizeRelativePath('../track.ogg')).toThrow(/inválida/)
    expect(() => buildObjectKey('Music/online/Progressive/', 'track.mp3')).toThrow(/Solo se permiten/)
  })

  it('crea respaldos fuera de las carpetas al aire', () => {
    expect(buildBackupKey('Music/online/Melodic_Techno/', 'track.ogg', '2026-09-22T12:00:00.000Z'))
      .toBe('_clubf5-backups/2026-09-22T12-00-00-000Z/Music/online/Melodic_Techno/track.ogg')
  })
})
