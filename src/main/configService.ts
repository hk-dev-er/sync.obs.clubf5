import Store from 'electron-store'
import { app, safeStorage, type IpcMainInvokeEvent } from 'electron'
import { mkdirSync } from 'fs'
import type { OBSConfigInput, OBSConfigStatus } from '../shared/contracts'
import type { DestinationPrefix } from '../shared/uploadPolicy'
import { isAllowedDestination } from '../shared/uploadPolicy'

type Theme = 'light' | 'dark' | 'system'
type PreferenceKey = 'localPath' | 'destination' | 'theme'

interface SecureSettings {
  obsEncrypted?: string
  localPath?: string
  destination?: DestinationPrefix
  theme?: Theme
}

interface LegacySettings {
  obs?: OBSConfigInput
}

let storeInstance: Store<SecureSettings> | null = null
let legacyStoreInstance: Store<LegacySettings> | null = null

const preferenceKeys = new Set<PreferenceKey>(['localPath', 'destination', 'theme'])

function ensureUserDataDirectory(): string {
  const userData = app.getPath('userData')
  mkdirSync(userData, { recursive: true })
  return userData
}

function getStore(): Store<SecureSettings> {
  if (!storeInstance) {
    storeInstance = new Store<SecureSettings>({
      cwd: ensureUserDataDirectory(),
      name: 'clubf5-uploader-settings',
      defaults: {
        destination: 'Music/online/Progressive/',
        theme: 'system'
      }
    })
  }
  return storeInstance
}

function getLegacyStore(): Store<LegacySettings> {
  if (!legacyStoreInstance) {
    legacyStoreInstance = new Store<LegacySettings>({
      cwd: ensureUserDataDirectory(),
      name: 'sync-obs-config',
      encryptionKey: 'sync-obs-clubf5-secure-key'
    })
  }
  return legacyStoreInstance
}

function assertEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows no permite proteger la credencial en este momento')
  }
}

export function saveOBSConfig(config: OBSConfigInput): void {
  assertEncryptionAvailable()
  const encrypted = safeStorage.encryptString(JSON.stringify(config)).toString('base64')
  getStore().set('obsEncrypted', encrypted)
}

export function loadOBSConfig(): OBSConfigInput | null {
  const encrypted = getStore().get('obsEncrypted')
  if (encrypted) {
    assertEncryptionAvailable()
    const json = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    return JSON.parse(json) as OBSConfigInput
  }

  const legacyStore = getLegacyStore()
  const legacy = legacyStore.get('obs')
  if (legacy && safeStorage.isEncryptionAvailable()) {
    saveOBSConfig(legacy)
    legacyStore.delete('obs')
    return legacy
  }

  return null
}

export function getLocalPathPreference(): string | null {
  return getStore().get('localPath') ?? null
}

function getOBSStatus(): OBSConfigStatus {
  const config = loadOBSConfig()
  return {
    configured: config !== null,
    endpoint: config?.endpoint ?? '',
    bucket: config?.bucket ?? '',
    accessKeyIdHint: config ? `••••${config.accessKeyId.slice(-4)}` : ''
  }
}

function getPreference<T>(_event: IpcMainInvokeEvent, key: PreferenceKey): T | undefined {
  if (!preferenceKeys.has(key)) throw new Error('Preferencia no autorizada')
  return getStore().get(key) as T | undefined
}

function setPreference(_event: IpcMainInvokeEvent, key: PreferenceKey, value: unknown): void {
  if (!preferenceKeys.has(key)) throw new Error('Preferencia no autorizada')
  if (key === 'destination' && (typeof value !== 'string' || !isAllowedDestination(value))) {
    throw new Error('Destino no autorizado')
  }
  if (key === 'theme' && !['light', 'dark', 'system'].includes(String(value))) {
    throw new Error('Tema no válido')
  }
  if (key === 'localPath' && typeof value !== 'string') {
    throw new Error('Carpeta local no válida')
  }
  getStore().set(key, value as never)
}

export const configHandlers = {
  'config:getPreference': getPreference,
  'config:setPreference': setPreference,
  'config:getOBSStatus': () => getOBSStatus()
}
