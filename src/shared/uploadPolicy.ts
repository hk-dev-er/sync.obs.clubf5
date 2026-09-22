export const ALLOWED_DESTINATIONS = [
  'Music/online/Progressive/',
  'Music/online/Melodic_Techno/'
] as const

export type DestinationPrefix = (typeof ALLOWED_DESTINATIONS)[number]

export function isAllowedDestination(value: string): value is DestinationPrefix {
  return (ALLOWED_DESTINATIONS as readonly string[]).includes(value)
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
