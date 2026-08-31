<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useConfigStore } from './stores/configStore'
import { useUIStore } from './stores/uiStore'
import { obsService, type OBSObject } from './services/obsService'
import { filterService } from './services/filterService'
import { transferService } from './services/transferService'
import type { FileInfo } from '../../electron'

// Components
import TitleBar from './components/TitleBar.vue'
import Toolbar from './components/Toolbar.vue'
import FilePanel from './components/FilePanel.vue'
import StatusBar from './components/StatusBar.vue'
import TransferQueue from './components/TransferQueue.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import SyncDialog from './components/SyncDialog.vue'
import NewFolderDialog from './components/NewFolderDialog.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import Notifications from './components/Notifications.vue'

// Types
interface LocalItem extends FileInfo {
  type: 'local'
}

interface RemoteItem extends OBSObject {
  type: 'remote'
  path: string
}

type FileItem = LocalItem | RemoteItem

const configStore = useConfigStore()
const uiStore = useUIStore()

// Panel states
const localPath = ref('')
const remotePath = ref('')
const localItems = ref<LocalItem[]>([])
const remoteItems = ref<RemoteItem[]>([])
const localLoading = ref(false)
const remoteLoading = ref(false)

// Dialog states
const showSettings = computed(() => uiStore.activeModal === 'settings')
const showSync = computed(() => uiStore.activeModal === 'sync')
const showNewFolder = ref(false)
const newFolderTarget = ref<'local' | 'obs'>('local')

const confirmDialog = ref({
  show: false,
  title: '',
  message: '',
  type: 'info' as 'info' | 'warning' | 'danger',
  onConfirm: () => {}
})

// Active panel (for knowing where operations should happen)
const activePanel = ref<'local' | 'obs'>('local')

// Initialize
onMounted(async () => {
  await configStore.loadConfig()

  // Si no hay configuración OBS, mostrar el diálogo de configuración como primera pantalla
  if (!configStore.hasOBSConfig) {
    uiStore.openModal('settings')
    return // No cargar nada más hasta que se configure
  }

  // Set initial paths
  localPath.value = configStore.config.localPath || await window.electronAPI.getHomePath()
  remotePath.value = configStore.config.remotePath || ''

  // Load file lists
  await refreshLocal()
  if (configStore.isConnected) {
    await refreshRemote()
  }

  // Set up filter service
  filterService.setPatterns(configStore.config.excludePatterns)

  // Set up watch events
  window.electronAPI.onWatchEvent((event) => {
    console.log('Watch event:', event)
    // Refresh local panel on changes
    if (event.path.startsWith(localPath.value)) {
      refreshLocal()
    }
  })

  // Start watch if enabled
  if (configStore.config.watchEnabled && localPath.value) {
    window.electronAPI.startWatch(localPath.value, configStore.config.excludePatterns)
  }
})

// Watch for connection changes
watch(() => configStore.isConnected, async (connected) => {
  if (connected) {
    // Si es la primera vez que se conecta (después del onboarding), inicializar
    if (!localPath.value || !remotePath.value) {
      localPath.value = configStore.config.localPath || await window.electronAPI.getHomePath()
      remotePath.value = configStore.config.remotePath || ''

      await refreshLocal()
      filterService.setPatterns(configStore.config.excludePatterns)

      // Set up watch events
      window.electronAPI.onWatchEvent((event) => {
        console.log('Watch event:', event)
        if (event.path.startsWith(localPath.value)) {
          refreshLocal()
        }
      })

      // Start watch if enabled
      if (configStore.config.watchEnabled && localPath.value) {
        window.electronAPI.startWatch(localPath.value, configStore.config.excludePatterns)
      }
    }

    await refreshRemote()
  } else {
    remoteItems.value = []
  }
})

// Methods
async function refreshLocal() {
  if (!localPath.value) return
  
  localLoading.value = true
  try {
    const items = await window.electronAPI.readDirectory(localPath.value)
    const filtered = filterService.filterPaths(items)
    localItems.value = filtered.map(item => ({ ...item, type: 'local' as const }))
  } catch (error) {
    uiStore.notify({
      type: 'error',
      title: 'Error al leer carpeta local',
      message: (error as Error).message
    })
  } finally {
    localLoading.value = false
  }
}

async function refreshRemote() {
  if (!configStore.isConnected) return
  
  remoteLoading.value = true
  try {
    const items = await obsService.listObjects(remotePath.value)
    const filtered = filterService.filterPaths(items)
    remoteItems.value = filtered.map(item => ({ 
      ...item, 
      type: 'remote' as const,
      path: item.key
    }))
  } catch (error) {
    uiStore.notify({
      type: 'error',
      title: 'Error al leer OBS',
      message: (error as Error).message
    })
  } finally {
    remoteLoading.value = false
  }
}

async function navigateLocal(path: string) {
  localPath.value = path
  uiStore.clearLocalSelection()
  await refreshLocal()
}

async function navigateRemote(path: string) {
  remotePath.value = path
  uiStore.clearRemoteSelection()
  await refreshRemote()
}

function handleLocalPathChange(path: string) {
  navigateLocal(path)
}

function handleRemotePathChange(path: string) {
  navigateRemote(path)
}

function handleLocalSelect(item: FileItem, multi: boolean) {
  if (item.type === 'local') {
    activePanel.value = 'local'
    uiStore.selectLocalItem(item.path, multi)
  }
}

function handleRemoteSelect(item: FileItem, multi: boolean) {
  if (item.type === 'remote') {
    activePanel.value = 'obs'
    uiStore.selectRemoteItem(item.key, multi)
  }
}

function handleLocalOpen(item: FileItem) {
  if (item.type === 'local' && item.isDirectory) {
    navigateLocal(item.path)
  }
  // For files, could open with system default app
}

function handleRemoteOpen(item: FileItem) {
  if (item.type === 'remote' && item.isDirectory) {
    navigateRemote(item.key)
  }
}

// Toolbar actions
async function handleCopy() {
  const localSelected = uiStore.selectedLocalItems
  const remoteSelected = uiStore.selectedRemoteItems
  
  if (localSelected.length > 0) {
    // Copy local → OBS
    const files = localSelected
      .map(p => localItems.value.find(f => f.path === p))
      .filter((f): f is LocalItem => !!f && !f.isDirectory)

    // Detect which files already exist in OBS
    const existing: LocalItem[] = []
    for (const item of files) {
      const targetKey = remotePath.value + item.name
      const metadata = await obsService.getObjectMetadata(targetKey)
      if (metadata) {
        existing.push(item)
      }
    }

    const doUpload = () => {
      for (const item of files) {
        const targetKey = remotePath.value + item.name
        transferService.queueUpload(item.path, targetKey, item.name, item.size)
      }
      uiStore.clearAllSelections()
      uiStore.notify({ type: 'info', title: `${files.length} archivo(s) en cola de subida` })
    }

    if (existing.length > 0) {
      const names = existing.map(f => f.name).join(', ')
      confirmDialog.value = {
        show: true,
        title: 'Archivo(s) ya existe(n)',
        message: `${names}: ya existe(n) en OBS. ¿Desea reemplazarlo(s)?`,
        type: 'warning',
        onConfirm: () => {
          confirmDialog.value.show = false
          doUpload()
        }
      }
      return
    }

    doUpload()
  } else if (remoteSelected.length > 0) {
    // Copy OBS → local
    const files = remoteSelected
      .map(k => remoteItems.value.find(f => f.key === k))
      .filter((f): f is RemoteItem => !!f && !f.isDirectory)

    // Detect which files already exist locally
    const existing: RemoteItem[] = []
    for (const item of files) {
      const targetPath = await window.electronAPI.joinPath(localPath.value, item.name)
      if (await window.electronAPI.exists(targetPath)) {
        existing.push(item)
      }
    }

    const doDownload = async () => {
      for (const item of files) {
        const targetPath = await window.electronAPI.joinPath(localPath.value, item.name)
        transferService.queueDownload(item.key, targetPath, item.name, item.size)
      }
      uiStore.clearAllSelections()
      uiStore.notify({ type: 'info', title: `${files.length} archivo(s) en cola de descarga` })
    }

    if (existing.length > 0) {
      const names = existing.map(f => f.name).join(', ')
      confirmDialog.value = {
        show: true,
        title: 'Archivo(s) ya existe(n)',
        message: `${names}: ya existe(n) localmente. ¿Desea reemplazarlo(s)?`,
        type: 'warning',
        onConfirm: () => {
          confirmDialog.value.show = false
          doDownload()
        }
      }
      return
    }

    doDownload()
  }
}

async function handleDropFiles(fileList: FileList) {
  if (!configStore.isConnected) {
    uiStore.notify({ type: 'warning', title: 'No conectado', message: 'Conecta a OBS antes de subir archivos' })
    return
  }

  const files = Array.from(fileList)

  // Detect which files already exist in the target remote folder
  const existing: string[] = []
  const toUpload: { data: ArrayBuffer; name: string; size: number }[] = []

  for (const file of files) {
    const targetKey = remotePath.value + file.name
    let metadata: Awaited<ReturnType<typeof obsService.getObjectMetadata>> = null
    try {
      metadata = await obsService.getObjectMetadata(targetKey)
    } catch {
      metadata = null
    }
    if (metadata) {
      existing.push(file.name)
    }
    const data = await file.arrayBuffer()
    toUpload.push({ data, name: file.name, size: file.size })
  }

  const doUpload = () => {
    for (const f of toUpload) {
      transferService.queueUploadData(remotePath.value + f.name, f.name, f.data, f.size)
    }
    uiStore.notify({ type: 'info', title: `${toUpload.length} archivo(s) en cola de subida` })
  }

  if (existing.length > 0) {
    confirmDialog.value = {
      show: true,
      title: 'Archivo(s) ya existe(n)',
      message: `${existing.join(', ')}: ya existe(n) en OBS. ¿Desea reemplazarlo(s)?`,
      type: 'warning',
      onConfirm: () => {
        confirmDialog.value.show = false
        doUpload()
      }
    }
    return
  }

  doUpload()
}

async function handleUpload() {
  if (!configStore.isConnected) {
    uiStore.notify({ type: 'warning', title: 'No conectado', message: 'Conecta a OBS antes de subir archivos' })
    return
  }

  const paths = await window.electronAPI.selectFiles()
  if (!paths.length) return

  const existing: string[] = []
  const toUpload: { path: string; name: string; size: number }[] = []

  for (const p of paths) {
    const stats = await window.electronAPI.getFileStats(p)
    const targetKey = remotePath.value + stats.name
    let metadata: Awaited<ReturnType<typeof obsService.getObjectMetadata>> = null
    try {
      metadata = await obsService.getObjectMetadata(targetKey)
    } catch {
      metadata = null
    }
    if (metadata) {
      existing.push(stats.name)
    }
    toUpload.push({ path: p, name: stats.name, size: stats.size })
  }

  const doUpload = () => {
    for (const f of toUpload) {
      transferService.queueUpload(f.path, remotePath.value + f.name, f.name, f.size)
    }
    uiStore.notify({ type: 'info', title: `${toUpload.length} archivo(s) en cola de subida` })
  }

  if (existing.length > 0) {
    confirmDialog.value = {
      show: true,
      title: 'Archivo(s) ya existe(n)',
      message: `${existing.join(', ')}: ya existe(n) en OBS. ¿Desea reemplazarlo(s)?`,
      type: 'warning',
      onConfirm: () => {
        confirmDialog.value.show = false
        doUpload()
      }
    }
    return
  }

  doUpload()
}

function handleDelete() {
  const localSelected = uiStore.selectedLocalItems
  const remoteSelected = uiStore.selectedRemoteItems
  const total = localSelected.length + remoteSelected.length
  
  if (total === 0) return
  
  confirmDialog.value = {
    show: true,
    title: 'Confirmar eliminación',
    message: `¿Eliminar ${total} elemento(s) seleccionados?`,
    type: 'danger',
    onConfirm: async () => {
      confirmDialog.value.show = false
      
      // Delete local files
      for (const path of localSelected) {
        try {
          const item = localItems.value.find(f => f.path === path)
          
          // Prevent deleting current folder or parent folders
          const normalizedPath = path.replace(/\\/g, '/').toLowerCase()
          const normalizedLocalPath = localPath.value.replace(/\\/g, '/').toLowerCase()
          
          if (normalizedLocalPath.startsWith(normalizedPath) || normalizedLocalPath === normalizedPath) {
            uiStore.notify({ 
              type: 'warning', 
              title: 'No se puede eliminar', 
              message: `No se puede eliminar la carpeta actual o sus padres: ${item?.name || path}` 
            })
            continue
          }
          
          if (item?.isDirectory) {
            await window.electronAPI.deleteFolder(path)
          } else {
            await window.electronAPI.deleteFile(path)
          }
        } catch (error) {
          uiStore.notify({ type: 'error', title: 'Error', message: (error as Error).message })
        }
      }
      
      // Delete remote files
      for (const key of remoteSelected) {
        try {
          const item = remoteItems.value.find(f => f.key === key)
          
          // Prevent deleting current folder or parent folders
          const normalizedKey = key.endsWith('/') ? key : key + '/'
          const normalizedRemotePath = remotePath.value.endsWith('/') ? remotePath.value : remotePath.value + '/'
          
          if (normalizedRemotePath.startsWith(normalizedKey)) {
            uiStore.notify({ 
              type: 'warning', 
              title: 'No se puede eliminar', 
              message: `No se puede eliminar la carpeta actual o sus padres: ${item?.name || key}` 
            })
            continue
          }
          
          if (item?.isDirectory) {
            await obsService.deleteFolderRecursive(key)
          } else {
            await obsService.deleteObject(key)
          }
        } catch (error) {
          uiStore.notify({ type: 'error', title: 'Error', message: (error as Error).message })
        }
      }
      
      uiStore.clearAllSelections()
      uiStore.notify({ type: 'success', title: 'Elementos eliminados' })
      
      await refreshLocal()
      await refreshRemote()
    }
  }
}

function handleNewFolder() {
  // Determine which panel is active
  newFolderTarget.value = activePanel.value
  showNewFolder.value = true
}

async function createNewFolder(name: string) {
  showNewFolder.value = false
  
  try {
    if (newFolderTarget.value === 'local') {
      const folderPath = await window.electronAPI.joinPath(localPath.value, name)
      await window.electronAPI.createFolder(folderPath)
      await refreshLocal()
    } else {
      const folderKey = remotePath.value + name + '/'
      await obsService.createFolder(folderKey)
      await refreshRemote()
    }
    uiStore.notify({ type: 'success', title: 'Carpeta creada' })
  } catch (error) {
    uiStore.notify({ type: 'error', title: 'Error', message: (error as Error).message })
  }
}

function handleSync() {
  uiStore.openModal('sync')
}

function handleRefresh() {
  refreshLocal()
  refreshRemote()
}

function handleSyncComplete() {
  refreshLocal()
  refreshRemote()
}

// Drag & drop (window-level, so it works regardless of where the file is dropped)
const isDraggingOver = ref(false)
let dragDepth = 0

function onWindowDragEnter(event: DragEvent) {
  event.preventDefault()
  dragDepth++
  isDraggingOver.value = true
  console.log('[dnd] dragenter', dragDepth)
}

function onWindowDragOver(event: DragEvent) {
  event.preventDefault()
  isDraggingOver.value = true
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function onWindowDragLeave() {
  dragDepth--
  if (dragDepth <= 0) {
    dragDepth = 0
    isDraggingOver.value = false
  }
  console.log('[dnd] dragleave', dragDepth)
}

function onWindowDrop(event: DragEvent) {
  event.preventDefault()
  dragDepth = 0
  isDraggingOver.value = false
  console.log('[dnd] drop', event.dataTransfer?.files?.length)
  if (event.dataTransfer?.files?.length) {
    handleDropFiles(event.dataTransfer.files)
  }
}

// Keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  if (uiStore.activeModal) return
  
  switch (e.key) {
    case 'F2':
      handleRefresh()
      break
    case 'F5':
      handleCopy()
      break
    case 'F7':
      handleNewFolder()
      break
    case 'Delete':
      handleDelete()
      break
  }
}

// Add keyboard listener
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

// Add global drag & drop listeners
onMounted(() => {
  window.addEventListener('dragenter', onWindowDragEnter)
  window.addEventListener('dragover', onWindowDragOver)
  window.addEventListener('dragleave', onWindowDragLeave)
  window.addEventListener('drop', onWindowDrop)
})
</script>

<template>
  <div class="app">
    <!-- Title Bar -->
    <TitleBar />
    
    <!-- Toolbar -->
    <Toolbar 
      @copy="handleCopy"
      @delete="handleDelete"
      @new-folder="handleNewFolder"
      @sync="handleSync"
      @refresh="handleRefresh"
      @upload="handleUpload"
    />
    
    <!-- Main Content -->
    <div class="main-content">
      <!-- Panels -->
      <div class="panels">
        <!-- Local Panel -->
        <FilePanel
          source="local"
          :current-path="localPath"
          :items="localItems"
          :loading="localLoading"
          @navigate="navigateLocal"
          @select="handleLocalSelect"
          @open="handleLocalOpen"
          @path-change="handleLocalPathChange"
        />
        
        <!-- Remote Panel -->
        <FilePanel
          source="obs"
          :current-path="remotePath"
          :items="remoteItems"
          :loading="remoteLoading"
          @navigate="navigateRemote"
          @select="handleRemoteSelect"
          @open="handleRemoteOpen"
          @path-change="handleRemotePathChange"
        />
      </div>
      
      <!-- Transfer Queue (side panel) -->
      <Transition name="slide">
        <div v-if="uiStore.isTransferPanelOpen" class="transfer-sidebar">
          <TransferQueue />
        </div>
      </Transition>
    </div>
    
    <!-- Status Bar -->
    <StatusBar />
    
    <!-- Dialogs -->
    <SettingsDialog 
      v-if="showSettings" 
      @close="uiStore.closeModal()" 
    />
    
    <SyncDialog 
      v-if="showSync" 
      @close="uiStore.closeModal()"
      @complete="handleSyncComplete"
    />
    
    <NewFolderDialog
      v-if="showNewFolder"
      @close="showNewFolder = false"
      @submit="createNewFolder"
    />
    
    <ConfirmDialog
      :show="confirmDialog.show"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :type="confirmDialog.type"
      @confirm="confirmDialog.onConfirm"
      @cancel="confirmDialog.show = false"
    />
    
    <!-- Notifications -->
    <Notifications />

    <!-- Drag & drop overlay -->
    <div v-if="isDraggingOver" class="drop-overlay">
      <div class="drop-overlay-content">
        <svg class="w-16 h-16 mx-auto text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <p>Suelta para subir a OBS</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  @apply flex flex-col h-screen overflow-hidden;
}

.main-content {
  @apply flex-1 flex overflow-hidden;
}

.panels {
  @apply flex-1 flex gap-2 p-2 overflow-hidden;
}

.panels > * {
  @apply flex-1;
}

.transfer-sidebar {
  @apply w-80 flex-shrink-0;
}

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.drop-overlay {
  @apply fixed inset-0 z-50 bg-primary-500/20 backdrop-blur-sm flex items-center justify-center;
  pointer-events: none;
}

.drop-overlay-content {
  @apply text-center text-white;
}

.drop-overlay-content p {
  @apply mt-4 text-lg font-semibold;
}
</style>
