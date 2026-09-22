import { describe, expect, it } from 'vitest'
import {
  buildBackupKey,
  buildObjectKey,
  destinationLabel,
  destinationFromObjectKey,
  isAllowedDestination,
  musicDestinationsFromCommonPrefixes,
  normalizeRelativePath
} from './uploadPolicy'

describe('upload policy', () => {
  it('admite cualquier carpeta musical directa bajo Music/online', () => {
    expect(buildObjectKey('Music/online/Organic House/', 'Artist/track.ogg'))
      .toBe('Music/online/Organic House/Artist/track.ogg')
    expect(() => buildObjectKey('otra/', 'track.ogg')).toThrow(/no está autorizada/)
    expect(() => buildObjectKey('Music/online/', 'track.ogg')).toThrow(/no está autorizada/)
    expect(() => buildObjectKey('Music/online/Progressive/Subcarpeta/', 'track.ogg')).toThrow(/no está autorizada/)
    expect(isAllowedDestination('Music/online/Carpeta\nFalsa/')).toBe(false)
  })

  it('deriva la carpeta directa sin confundir subcarpetas', () => {
    expect(destinationFromObjectKey('Music/online/Organic House/Artist/track.ogg'))
      .toBe('Music/online/Organic House/')
    expect(destinationFromObjectKey('Spots/online/Organic House/track.ogg')).toBeNull()
    expect(destinationLabel('Music/online/Melodic_Techno/')).toBe('Melodic Techno')
  })

  it('filtra, ordena y deduplica únicamente carpetas musicales directas descubiertas en OBS', () => {
    expect(musicDestinationsFromCommonPrefixes([
      { Prefix: 'Music/online/Progressive/' },
      { Prefix: 'Music/online/Organic_House/' },
      { Prefix: 'Music/online/Progressive/' },
      { Prefix: 'Music/online/Organic_House/2026/' },
      { Prefix: 'Spots/Noticias/' },
      { Prefix: 42 },
      null
    ])).toEqual([
      'Music/online/Organic_House/',
      'Music/online/Progressive/'
    ])
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
