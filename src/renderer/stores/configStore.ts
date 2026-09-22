import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { OBSConfigInput, OBSConfigStatus } from '../../shared/contracts'
import type { DestinationPrefix } from '../../shared/uploadPolicy'

type Theme = 'light' | 'dark' | 'system'

export const useConfigStore = defineStore('config', () => {
  const localPath = ref('')
  const destination = ref<DestinationPrefix>('Music/online/Progressive/')
  const theme = ref<Theme>('system')
  const obsStatus = ref<OBSConfigStatus>({
    configured: false,
    endpoint: '',
    bucket: '',
    accessKeyIdHint: ''
  })
  const isConnected = ref(false)
  const connectionRevision = ref(0)
  const isLoading = ref(false)
  const connectionError = ref<string | null>(null)

  const hasOBSConfig = computed(() => obsStatus.value.configured)
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
      obsStatus.value = await window.electronAPI.getOBSStatus()
      applyTheme()

      if (obsStatus.value.configured) {
        isConnected.value = await window.electronAPI.obsConnectStored()
        if (isConnected.value) connectionRevision.value += 1
        if (!isConnected.value) connectionError.value = 'No se pudo conectar con la credencial guardada'
      }
    } catch (error) {
      connectionError.value = (error as Error).message
    } finally {
      isLoading.value = false
    }
  }

  async function configureOBS(config: OBSConfigInput): Promise<boolean> {
    isLoading.value = true
    connectionError.value = null
    try {
      const connected = await window.electronAPI.obsConfigure(config)
      isConnected.value = connected
      if (connected) {
        connectionRevision.value += 1
        obsStatus.value = await window.electronAPI.getOBSStatus()
      } else {
        connectionError.value = 'La credencial o los datos del bucket fueron rechazados'
      }
      return connected
    } catch (error) {
      connectionError.value = (error as Error).message
      isConnected.value = false
      return false
    } finally {
      isLoading.value = false
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

  async function saveTheme(value: Theme): Promise<void> {
    theme.value = value
    await window.electronAPI.setPreference('theme', value)
    applyTheme()
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (theme.value === 'system') applyTheme()
  })

  return {
    localPath,
    destination,
    theme,
    obsStatus,
    isConnected,
    connectionRevision,
    isLoading,
    connectionError,
    hasOBSConfig,
    effectiveTheme,
    loadConfig,
    configureOBS,
    saveLocalPath,
    saveDestination,
    saveTheme,
    applyTheme
  }
})
