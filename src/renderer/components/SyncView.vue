<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useConfigStore } from '../stores/configStore'
import { useUIStore } from '../stores/uiStore'
import { syncService, type SyncMode, type SyncResult } from '../services/syncService'
import { obsService, type OBSObject } from '../services/obsService'

const configStore = useConfigStore()
const uiStore = useUIStore()

const step = ref<'config' | 'preview' | 'progress' | 'complete'>('config')

const syncMode = ref<SyncMode>('local-to-obs')
const localPath = ref('')
const remotePath = ref('')
const syncResult = ref<SyncResult | null>(null)
const selectedItems = ref<Set<string>>(new Set())
const isLoading = ref(false)
const progress = ref({ current: 0, total: 0, currentFile: '', percentage: 0 })
const executionResult = ref<{ success: number; failed: number; errors: string[] } | null>(null)

const showObsBrowser = ref(false)
const obsBrowserPrefix = ref('')
const obsBrowserItems = ref<OBSObject[]>([])
const obsBrowserLoading = ref(false)

onMounted(() => {
  localPath.value = configStore.config.localPath || ''
  remotePath.value = configStore.config.remotePath || ''
})

const canCompare = computed(() => Boolean(localPath.value && remotePath.value))

const filteredItems = computed(() => {
  if (!syncResult.value) return []
  return syncResult.value.items.filter(item => item.action !== 'skip')
})

async function selectLocalPath() {
  const path = await window.electronAPI.selectFolder()
  if (path) {
    localPath.value = path
    configStore.saveLocalPath(path)
  }
}

async function compare() {
  if (!canCompare.value) return

  isLoading.value = true
  try {
    syncResult.value = await syncService.compare(localPath.value, remotePath.value, syncMode.value)

    selectedItems.value = new Set(
      syncResult.value.items
        .filter(item => item.action !== 'skip')
        .map(item => item.name)
    )

    configStore.saveRemotePath(remotePath.value)
    step.value = 'preview'
  } catch (error) {
    uiStore.notify({
      type: 'error',
      title: 'Error al comparar',
      message: (error as Error).message
    })
  } finally {
    isLoading.value = false
  }
}

function toggleItem(name: string) {
  if (selectedItems.value.has(name)) {
    selectedItems.value.delete(name)
  } else {
    selectedItems.value.add(name)
  }
}

function selectAll() {
  filteredItems.value.forEach(item => selectedItems.value.add(item.name))
}

function selectNone() {
  selectedItems.value.clear()
}

async function executeSync() {
  if (!syncResult.value) return

  const itemsToSync = syncResult.value.items.filter(
    item => selectedItems.value.has(item.name)
  )

  if (itemsToSync.length === 0) {
    uiStore.notify({ type: 'warning', title: 'No hay elementos seleccionados' })
    return
  }

  step.value = 'progress'

  try {
    executionResult.value = await syncService.execute(itemsToSync, (prog) => {
      progress.value = prog
    })
    step.value = 'complete'
  } catch (error) {
    uiStore.notify({
      type: 'error',
      title: 'Error durante la sincronización',
      message: (error as Error).message
    })
    step.value = 'preview'
  }
}

async function openObsBrowser() {
  showObsBrowser.value = true
  obsBrowserPrefix.value = remotePath.value || ''
  await loadObsBrowser(obsBrowserPrefix.value)
}

async function loadObsBrowser(prefix: string) {
  obsBrowserLoading.value = true
  try {
    obsBrowserItems.value = await obsService.listObjects(prefix)
  } catch (error) {
    uiStore.notify({
      type: 'error',
      title: 'Error al explorar OBS',
      message: (error as Error).message
    })
    obsBrowserItems.value = []
  } finally {
    obsBrowserLoading.value = false
  }
}

async function navigateObs(prefix: string) {
  obsBrowserPrefix.value = prefix
  await loadObsBrowser(prefix)
}

async function goObsUp() {
  const prefix = obsBrowserPrefix.value
  if (!prefix) return
  const trimmed = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  const idx = trimmed.lastIndexOf('/')
  const parent = idx < 0 ? '' : trimmed.slice(0, idx + 1)
  obsBrowserPrefix.value = parent
  await loadObsBrowser(parent)
}

function selectObsPrefix(prefix: string) {
  remotePath.value = prefix
  showObsBrowser.value = false
}

function closeObsBrowser() {
  showObsBrowser.value = false
}

function getActionIcon(action: string): string {
  switch (action) {
    case 'upload': return '⬆️'
    case 'download': return '⬇️'
    case 'delete-local': return '🗑️'
    case 'delete-remote': return '☁️🗑️'
    default: return '⏭️'
  }
}

function getActionLabel(action: string): string {
  switch (action) {
    case 'upload': return 'Subir'
    case 'download': return 'Descargar'
    case 'delete-local': return 'Eliminar local'
    case 'delete-remote': return 'Eliminar remoto'
    default: return 'Omitir'
  }
}

function backToConfig() {
  step.value = 'config'
  syncResult.value = null
  executionResult.value = null
}

function reset() {
  step.value = 'config'
  syncResult.value = null
  executionResult.value = null
  selectedItems.value = new Set()
}
</script>

<template>
  <div class="sync-view">
    <!-- Config Step -->
    <div v-if="step === 'config'" class="sync-card">
      <div class="sync-card-header">
        <h2 class="sync-card-title">Sincronizar</h2>
        <p class="sync-card-subtitle">Compara y sincroniza una carpeta local con OBS de forma recursiva.</p>
      </div>

      <div class="form-group">
        <label class="form-label">Carpeta local</label>
        <div class="flex gap-2">
          <input v-model="localPath" type="text" class="input flex-1" placeholder="Selecciona una carpeta..." />
          <button @click="selectLocalPath" class="btn btn-secondary">Examinar</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Prefijo remoto (OBS)</label>
        <div class="flex gap-2">
          <input v-model="remotePath" type="text" class="input flex-1" placeholder="carpeta/subcarpeta/" />
          <button @click="openObsBrowser" class="btn btn-secondary">Examinar</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Modo de sincronización</label>
        <div class="sync-modes">
          <button @click="syncMode = 'local-to-obs'" :class="['mode-btn', { active: syncMode === 'local-to-obs' }]">
            <span class="mode-icon">💻 → ☁️</span>
            <span class="mode-label">Local → OBS</span>
            <span class="mode-desc">Subir cambios locales</span>
          </button>
          <button @click="syncMode = 'obs-to-local'" :class="['mode-btn', { active: syncMode === 'obs-to-local' }]">
            <span class="mode-icon">☁️ → 💻</span>
            <span class="mode-label">OBS → Local</span>
            <span class="mode-desc">Descargar cambios remotos</span>
          </button>
          <button @click="syncMode = 'bidirectional'" :class="['mode-btn', { active: syncMode === 'bidirectional' }]">
            <span class="mode-icon">💻 ↔ ☁️</span>
            <span class="mode-label">Bidireccional</span>
            <span class="mode-desc">Sincronizar ambos</span>
          </button>
        </div>
      </div>

      <div class="form-actions">
        <button @click="compare" :disabled="!canCompare || isLoading" class="btn btn-primary">
          {{ isLoading ? 'Comparando...' : 'Comparar' }}
        </button>
      </div>
    </div>

    <!-- Preview Step -->
    <div v-if="step === 'preview'" class="sync-card">
      <div class="sync-card-header">
        <h2 class="sync-card-title">Cambios detectados</h2>
        <p class="sync-card-subtitle">
          <span class="mono">{{ localPath }}</span>
          <span class="mx-1">↔</span>
          <span class="mono">{{ remotePath }}</span>
        </p>
      </div>

      <div v-if="syncResult" class="preview-stats">
        <span class="stat">⬆️ {{ syncResult.stats.toUpload }} subir</span>
        <span class="stat">⬇️ {{ syncResult.stats.toDownload }} descargar</span>
        <span class="stat">🗑️ {{ syncResult.stats.toDeleteLocal + syncResult.stats.toDeleteRemote }} eliminar</span>
        <span class="stat">⏭️ {{ syncResult.stats.unchanged }} sin cambios</span>
      </div>

      <div class="preview-actions">
        <button @click="selectAll" class="text-btn">Seleccionar todo</button>
        <button @click="selectNone" class="text-btn">Deseleccionar</button>
      </div>

      <div class="preview-list">
        <div v-for="item in filteredItems" :key="item.name" class="preview-item">
          <input type="checkbox" :checked="selectedItems.has(item.name)" @change="toggleItem(item.name)" class="checkbox" />
          <span class="item-icon">{{ getActionIcon(item.action) }}</span>
          <span class="item-name" :title="item.name">{{ item.name }}</span>
          <span class="item-action">{{ getActionLabel(item.action) }}</span>
          <span class="item-reason">{{ item.reason }}</span>
        </div>

        <p v-if="filteredItems.length === 0" class="text-center text-gray-500 py-4">
          No hay cambios pendientes
        </p>
      </div>

      <div class="form-actions">
        <button @click="backToConfig" class="btn btn-secondary">Atrás</button>
        <button @click="executeSync" :disabled="selectedItems.size === 0" class="btn btn-primary">
          Sincronizar ({{ selectedItems.size }})
        </button>
      </div>
    </div>

    <!-- Progress Step -->
    <div v-if="step === 'progress'" class="sync-card sync-centered">
      <svg class="animate-spin w-12 h-12 text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
      <p class="sync-center-title">Sincronizando...</p>
      <p class="progress-file">{{ progress.currentFile }}</p>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${progress.percentage}%` }"></div>
      </div>
      <p class="progress-text">{{ progress.current }} / {{ progress.total }}</p>
    </div>

    <!-- Complete Step -->
    <div v-if="step === 'complete'" class="sync-card sync-centered">
      <div v-if="executionResult" class="complete-info">
        <div class="complete-icon">✅</div>
        <p class="sync-center-title">Sincronización completada</p>
        <div class="complete-stats">
          <span class="complete-stat success">✓ {{ executionResult.success }} exitosos</span>
          <span v-if="executionResult.failed > 0" class="complete-stat error">✕ {{ executionResult.failed }} fallidos</span>
        </div>

        <div v-if="executionResult.errors.length > 0" class="error-list">
          <p class="error-title">Errores:</p>
          <ul>
            <li v-for="(error, i) in executionResult.errors" :key="i">{{ error }}</li>
          </ul>
        </div>
      </div>

      <div class="form-actions">
        <button @click="reset" class="btn btn-primary">Nueva sincronización</button>
      </div>
    </div>

    <!-- OBS Browser Modal -->
    <div v-if="showObsBrowser" class="obs-browser-overlay" @click.self="closeObsBrowser">
      <div class="obs-browser-modal">
        <div class="modal-header">
          <h2 class="modal-title">Examinar OBS</h2>
          <button @click="closeObsBrowser" class="close-btn">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="modal-content">
          <div class="obs-browser-path">
            <button class="text-btn" :disabled="!obsBrowserPrefix" @click="goObsUp">⬆ Subir</button>
            <button class="text-btn" :disabled="!obsBrowserPrefix" @click="selectObsPrefix('')">⏮ Raíz</button>
            <span class="obs-browser-current">{{ obsBrowserPrefix || '/' }}</span>
          </div>

          <div class="obs-browser-list">
            <p v-if="obsBrowserLoading" class="text-center text-gray-500 py-4">Cargando...</p>
            <template v-else>
              <button v-for="item in obsBrowserItems" :key="item.key" class="obs-browser-item" :disabled="!item.isDirectory" @click="item.isDirectory ? navigateObs(item.key) : undefined">
                <span class="item-icon">{{ item.isDirectory ? '📁' : '📄' }}</span>
                <span class="item-name">{{ item.name }}</span>
                <span v-if="item.isDirectory" class="obs-browser-select">&gt;</span>
              </button>
              <p v-if="obsBrowserItems.length === 0" class="text-center text-gray-500 py-4">
                Esta carpeta está vacía
              </p>
            </template>
          </div>

          <div class="form-actions">
            <button @click="closeObsBrowser" class="btn btn-secondary">Cancelar</button>
            <button @click="selectObsPrefix(obsBrowserPrefix)" class="btn btn-primary">Usar esta carpeta</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sync-view {
  @apply p-4 overflow-y-auto;
}
.sync-card {
  @apply bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-4 max-w-2xl mx-auto;
}
.sync-card-header {
  @apply space-y-0.5;
}
.sync-card-title {
  @apply text-lg font-semibold text-gray-800 dark:text-white;
}
.sync-card-subtitle {
  @apply text-sm text-gray-500 dark:text-gray-400 break-all;
}
.mono {
  @apply font-mono text-xs;
}
.sync-centered {
  @apply flex flex-col items-center justify-center py-8 text-center;
}
.sync-center-title {
  @apply text-lg font-medium text-gray-700 dark:text-gray-200;
}
.form-group {
  @apply space-y-1.5;
}
.form-label {
  @apply block text-sm font-medium text-gray-700 dark:text-gray-200;
}
.form-actions {
  @apply flex gap-2 justify-end pt-4;
}
.sync-modes {
  @apply grid grid-cols-3 gap-2;
}
.mode-btn {
  @apply flex flex-col items-center p-3 border border-gray-300 dark:border-gray-600 rounded-lg;
  @apply hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors;
}
.mode-btn.active {
  @apply border-primary-500 bg-primary-50 dark:bg-primary-900/30;
}
.mode-icon {
  @apply text-2xl mb-1;
}
.mode-label {
  @apply text-sm font-medium text-gray-700 dark:text-gray-200;
}
.mode-desc {
  @apply text-xs text-gray-500 dark:text-gray-400;
}
.preview-stats {
  @apply flex gap-4 text-sm text-gray-600 dark:text-gray-400 flex-wrap;
}
.stat {
  @apply flex items-center gap-1;
}
.preview-actions {
  @apply flex gap-2;
}
.text-btn {
  @apply text-sm text-primary-500 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed;
}
.preview-list {
  @apply max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded;
}
.preview-item {
  @apply flex items-center gap-2 px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-700 last:border-0;
}
.checkbox {
  @apply w-4 h-4 flex-shrink-0;
}
.item-icon {
  @apply text-base flex-shrink-0;
}
.item-name {
  @apply flex-1 truncate text-gray-700 dark:text-gray-200 min-w-0;
}
.item-action {
  @apply text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400 flex-shrink-0;
}
.item-reason {
  @apply text-xs text-gray-500 dark:text-gray-500 flex-shrink-0;
}
.progress-file {
  @apply text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs;
}
.progress-bar {
  @apply w-full max-w-md h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden;
}
.progress-fill {
  @apply h-full bg-primary-500 transition-all;
}
.progress-text {
  @apply text-sm text-gray-500 dark:text-gray-400;
}
.complete-info {
  @apply space-y-4;
}
.complete-icon {
  @apply text-5xl;
}
.complete-stats {
  @apply flex gap-4 justify-center;
}
.complete-stat {
  @apply text-sm;
}
.complete-stat.success {
  @apply text-green-600 dark:text-green-400;
}
.complete-stat.error {
  @apply text-red-600 dark:text-red-400;
}
.error-list {
  @apply mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded text-left max-h-32 overflow-y-auto w-full;
}
.error-title {
  @apply text-sm font-medium text-red-700 dark:text-red-400 mb-1;
}
.error-list ul {
  @apply list-disc list-inside text-xs text-red-600 dark:text-red-300;
}
.obs-browser-overlay {
  @apply fixed inset-0 bg-black/50 flex items-center justify-center z-[60];
}
.obs-browser-modal {
  @apply bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden;
}
.modal-header {
  @apply flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700;
}
.modal-title {
  @apply text-lg font-semibold text-gray-800 dark:text-white;
}
.close-btn {
  @apply p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700;
}
.modal-content {
  @apply p-4 space-y-4;
}
.obs-browser-path {
  @apply flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200;
}
.obs-browser-current {
  @apply flex-1 truncate font-mono text-gray-500 dark:text-gray-400;
}
.obs-browser-list {
  @apply max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded;
}
.obs-browser-item {
  @apply w-full flex items-center gap-2 px-3 py-2 text-sm text-left;
  @apply border-b border-gray-100 dark:border-gray-700 last:border-0;
  @apply hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors;
  @apply disabled:opacity-50 disabled:cursor-default;
}
.obs-browser-select {
  @apply ml-auto text-gray-400;
}
</style>
