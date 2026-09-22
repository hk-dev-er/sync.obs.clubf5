export const MUSIC_ROOT = 'Music/online/' as const

export type DestinationPrefix = `${typeof MUSIC_ROOT}${string}/`

export function isAllowedDestination(value: string): value is DestinationPrefix {
  if (!value.startsWith(MUSIC_ROOT) || !value.endsWith('/')) return false
  const folderName = value.slice(MUSIC_ROOT.length, -1)
  return Boolean(
    folderName &&
    folderName !== '.' &&
    folderName !== '..' &&
    !folderName.includes('/') &&
    !/[\u0000-\u001f\u007f]/.test(folderName)
  )
}

export function destinationLabel(destination: DestinationPrefix): string {
  return destination.slice(MUSIC_ROOT.length, -1).replace(/_/g, ' ')
}

export function destinationFromObjectKey(key: string): DestinationPrefix | null {
  if (!key.startsWith(MUSIC_ROOT)) return null
  const folderName = key.slice(MUSIC_ROOT.length).split('/')[0]
  const destination = `${MUSIC_ROOT}${folderName}/`
  return isAllowedDestination(destination) ? destination : null
}

export function musicDestinationsFromCommonPrefixes(values: unknown[]): DestinationPrefix[] {
  const destinations = new Set<DestinationPrefix>()
  for (const value of values) {
    const prefix = typeof value === 'string'
      ? value
      : value && typeof value === 'object' && 'Prefix' in value
        ? (value as { Prefix?: unknown }).Prefix
        : null
    if (typeof prefix === 'string' && isAllowedDestination(prefix)) destinations.add(prefix)
  }
  return [...destinations].sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
}

export function normalizeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').normalize('NFC')
  const segments = normalized.split('/').filter(Boolean)

  if (segments.length === 0 || segments.some(segment => segment === '.' || segment === '..')) {
    throw new Error('Ruta relativa inválida')
  }

  return segments.join('/')
}

export function buildObjectKey(destination: string, relativePath: string): string {
  if (!isAllowedDestination(destination)) {
    throw new Error('La carpeta de destino no está autorizada')
  }

  const safeRelativePath = normalizeRelativePath(relativePath)
  if (!safeRelativePath.toLowerCase().endsWith('.ogg')) {
    throw new Error('Solo se permiten archivos OGG')
  }

  return `${destination}${safeRelativePath}`
}

export function buildBackupKey(destination: string, relativePath: string, timestamp: string): string {
  const objectKey = buildObjectKey(destination, relativePath)
  const safeTimestamp = timestamp.replace(/[^0-9TZ-]/g, '-')
  return `_clubf5-backups/${safeTimestamp}/${objectKey}`
}
