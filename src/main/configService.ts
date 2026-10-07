import Store from 'electron-store'
import { app, safeStorage, type IpcMainInvokeEvent } from 'electron'
import { mkdirSync } from 'fs'
import type { OperatorStatus } from '../shared/contracts'
import type { DestinationPrefix } from '../shared/uploadPolicy'
import { isAllowedDestination } from '../shared/uploadPolicy'

type Theme = 'light' | 'dark' | 'system'
type PreferenceKey = 'localPath' | 'destination' | 'theme'

interface Settings {
  operatorUsername?: string
  operatorRefreshEncrypted?: string
  obsEncrypted?: string // Removed on upgrade from the AK/SK application.
  localPath?: string
  destination?: DestinationPrefix
  theme?: Theme
}

interface LegacySettings { obs?: unknown }

let storeInstance: Store<Settings> | null = null
const preferenceKeys = new Set<PreferenceKey>(['localPath', 'destination', 'theme'])

function ensureUserDataDirectory(): string {
  const userData = app.getPath('userData')
  mkdirSync(userData, { recursive: true })
  return userData
}

function getStore(): Store<Settings> {
  if (!storeInstance) {
    storeInstance = new Store<Settings>({
      cwd: ensureUserDataDirectory(),
      name: 'clubf5-uploader-settings',
      defaults: { destination: 'Music/online/Progressive/', theme: 'system' }
    })
    // Do not keep legacy Huawei credentials after the app is upgraded.
    storeInstance.delete('obsEncrypted')
    const legacy = new Store<LegacySettings>({
      cwd: ensureUserDataDirectory(), name: 'sync-obs-config',
      encryptionKey: 'sync-obs-clubf5-secure-key'
    })
    legacy.delete('obs')
  }
  return storeInstance
}

function encryptionRequired(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('No se puede proteger la sesión en este equipo')
  }
}

export function saveOperatorRefresh(username: string, refresh: string): void {
  encryptionRequired()
  const encrypted = safeStorage.encryptString(refresh).toString('base64')
  const store = getStore()
  store.set('operatorRefreshEncrypted', encrypted)
  store.set('operatorUsername', username)
}

export function loadOperatorRefresh(): { username: string; refresh: string } | null {
  const store = getStore()
  const username = store.get('operatorUsername')
  const encrypted = store.get('operatorRefreshEncrypted')
  if (!username || !encrypted) return null
  encryptionRequired()
  return { username, refresh: safeStorage.decryptString(Buffer.from(encrypted, 'base64')) }
}

export function clearOperatorRefresh(): void {
  const store = getStore()
  store.delete('operatorUsername')
  store.delete('operatorRefreshEncrypted')
}

export function getLocalPathPreference(): string | null {
  return getStore().get('localPath') ?? null
}

function getOperatorStatus(): OperatorStatus {
  const username = getStore().get('operatorUsername')
  return { configured: Boolean(username), username: username ?? '', displayName: '', tenantId: null }
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
  'config:getOperatorStatus': () => getOperatorStatus()
}
