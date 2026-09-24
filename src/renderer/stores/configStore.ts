import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { OperatorLogin, OperatorStatus } from '../../shared/contracts'
import type { DestinationPrefix } from '../../shared/uploadPolicy'

type Theme = 'light' | 'dark' | 'system'

export const useConfigStore = defineStore('config', () => {
  const localPath = ref('')
  const destination = ref<DestinationPrefix>('Music/online/Progressive/')
  const availableDestinations = ref<DestinationPrefix[]>([])
  const theme = ref<Theme>('system')
  const operator = ref<OperatorStatus>({ configured: false, username: '', displayName: '', tenantId: null })
  const isConnected = ref(false)
  const connectionRevision = ref(0)
  const isLoading = ref(false)
  const connectionError = ref<string | null>(null)

  const hasOperatorSession = computed(() => operator.value.configured && isConnected.value)
  const hasAuthorizedDestination = computed(() =>
    isConnected.value && availableDestinations.value.includes(destination.value))
  const effectiveTheme = computed<'light' | 'dark'>(() => {
    if (theme.value === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return theme.value
  })

  function applyTheme(): void {
    document.documentElement.classList.toggle('dark', effectiveTheme.value === 'dark')
  }

  async function loadConfig(): Promise<void> {
    isLoading.value = true
    try {
      localPath.value = await window.electronAPI.getPreference<string>('localPath') ?? ''
      destination.value = await window.electronAPI.getPreference<DestinationPrefix>('destination')
        ?? 'Music/online/Progressive/'
      theme.value = await window.electronAPI.getPreference<Theme>('theme') ?? 'system'
      applyTheme()
      const restored = await window.electronAPI.operatorConnectStored()
      if (restored) {
        operator.value = restored
        isConnected.value = true
        connectionRevision.value += 1
      }
    } catch (error) {
      connectionError.value = (error as Error).message
    } finally {
      isLoading.value = false
    }
  }

  async function login(credentials: OperatorLogin): Promise<boolean> {
    isLoading.value = true
    connectionError.value = null
    try {
      operator.value = await window.electronAPI.operatorLogin(credentials)
      isConnected.value = true
      connectionRevision.value += 1
      return true
    } catch (error) {
      connectionError.value = (error as Error).message
      isConnected.value = false
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await window.electronAPI.operatorLogout()
    } finally {
      operator.value = { configured: false, username: '', displayName: '', tenantId: null }
      isConnected.value = false
      availableDestinations.value = []
      connectionRevision.value += 1
    }
  }

  async function saveLocalPath(value: string): Promise<void> {
    localPath.value = value
    await window.electronAPI.setPreference('localPath', value)
  }

  async function saveDestination(value: DestinationPrefix): Promise<void> {
    destination.value = value
    await window.electronAPI.setPreference('destination', value)
  }

  function setAvailableDestinations(value: DestinationPrefix[]): void {
    availableDestinations.value = value
  }

  async function saveTheme(value: Theme): Promise<void> {
    theme.value = value
    await window.electronAPI.setPreference('theme', value)
    applyTheme()
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (theme.value === 'system') applyTheme()
  })

  return { localPath, destination, availableDestinations, theme, operator, isConnected, connectionRevision,
    isLoading, connectionError, hasOperatorSession, hasAuthorizedDestination, effectiveTheme, loadConfig,
    login, logout, saveLocalPath, saveDestination, setAvailableDestinations, saveTheme, applyTheme }
})
