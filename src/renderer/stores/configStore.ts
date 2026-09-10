import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { obsService, type OBSConfig } from '../services/obsService'

export interface AppConfig {
  obs: OBSConfig | null
  localPath: string
  remotePath: string
  excludePatterns: string[]
  watchEnabled: boolean
  theme: 'light' | 'dark' | 'system'
}

export const useConfigStore = defineStore('config', () => {
  // State
  const config = ref<AppConfig>({
    obs: null,
    localPath: '',
    remotePath: '',
    excludePatterns: [
      '*.tmp',
      '*.log',
      '*.bak',
      'node_modules/**',
      '.git/**',
      'Thumbs.db',
      '.DS_Store'
    ],
    watchEnabled: false,
    theme: 'system'
  })

  const isConnected = ref(false)
  const isLoading = ref(false)
  const connectionError = ref<string | null>(null)

  // Computed
  const hasOBSConfig = computed(() => {
    const obs = config.value.obs
    if (!obs) return false
    return Boolean(obs.accessKeyId && obs.secretAccessKey && obs.endpoint && obs.bucket)
  })
  
  const effectiveTheme = computed(() => {
    if (config.value.theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return config.value.theme
  })

  // Actions
  async function loadConfig(): Promise<void> {
    isLoading.value = true
    try {
      const savedObs = await window.electronAPI.getConfig<OBSConfig>('obs')
      const savedLocalPath = await window.electronAPI.getConfig<string>('localPath')
      const savedRemotePath = await window.electronAPI.getConfig<string>('remotePath')
      const savedPatterns = await window.electronAPI.getConfig<string[]>('excludePatterns')
      const savedWatch = await window.electronAPI.getConfig<boolean>('watchEnabled')
      const savedTheme = await window.electronAPI.getConfig<'light' | 'dark' | 'system'>('theme')

      if (savedObs) config.value.obs = savedObs
      if (savedLocalPath) config.value.localPath = savedLocalPath
      if (savedRemotePath) config.value.remotePath = savedRemotePath
      if (savedPatterns) config.value.excludePatterns = savedPatterns
      if (savedWatch !== undefined) config.value.watchEnabled = savedWatch
      if (savedTheme) config.value.theme = savedTheme

      // Try to connect if we have OBS config
      if (config.value.obs) {
        await connect()
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    } finally {
      isLoading.value = false
    }
  }

  async function saveOBSConfig(obsConfig: OBSConfig): Promise<void> {
    config.value.obs = obsConfig
    // Convert to plain object to avoid IPC cloning issues with Vue proxies
    await window.electronAPI.setConfig('obs', JSON.parse(JSON.stringify(obsConfig)))
  }

  async function saveLocalPath(path: string): Promise<void> {
    config.value.localPath = path
    await window.electronAPI.setConfig('localPath', path)
  }

  async function saveRemotePath(path: string): Promise<void> {
    config.value.remotePath = path
    await window.electronAPI.setConfig('remotePath', path)
  }

  async function saveExcludePatterns(patterns: string[]): Promise<void> {
    config.value.excludePatterns = patterns
    // Convert to plain array to avoid IPC cloning issues
    await window.electronAPI.setConfig('excludePatterns', [...patterns])
  }

  async function saveWatchEnabled(enabled: boolean): Promise<void> {
    config.value.watchEnabled = enabled
    await window.electronAPI.setConfig('watchEnabled', enabled)
  }

  async function saveTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
    config.value.theme = theme
    await window.electronAPI.setConfig('theme', theme)
    applyTheme()
  }

  async function connect(): Promise<boolean> {
    if (!config.value.obs) {
      connectionError.value = 'No hay configuración OBS'
      return false
    }

    isLoading.value = true
    connectionError.value = null

    try {
      // Initialize is now async (uses IPC)
      await obsService.initialize(config.value.obs)
      const success = await obsService.testConnection()
      
      if (success) {
        isConnected.value = true
        return true
      } else {
        connectionError.value = 'No se pudo conectar al bucket'
        return false
      }
    } catch (error) {
      connectionError.value = (error as Error).message
      return false
    } finally {
      isLoading.value = false
    }
  }

  function disconnect(): void {
    isConnected.value = false
  }

  function applyTheme(): void {
    const theme = effectiveTheme.value
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  // Apply theme on init
  applyTheme()

  // Watch for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (config.value.theme === 'system') {
      applyTheme()
    }
  })

  return {
    config,
    isConnected,
    isLoading,
    connectionError,
    hasOBSConfig,
    effectiveTheme,
    loadConfig,
    saveOBSConfig,
    saveLocalPath,
    saveRemotePath,
    saveExcludePatterns,
    saveWatchEnabled,
    saveTheme,
    connect,
    disconnect,
    applyTheme
  }
})
