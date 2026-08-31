<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FileInfo } from '../../../electron'
import type { OBSObject } from '../services/obsService'
import { useUIStore } from '../stores/uiStore'

type PanelSource = 'local' | 'obs'
type SortField = 'name' | 'size' | 'date'
type SortDirection = 'asc' | 'desc'

interface LocalItem extends FileInfo {
  type: 'local'
}

interface RemoteItem extends OBSObject {
  type: 'remote'
  path: string
}

type FileItem = LocalItem | RemoteItem

const props = defineProps<{
  source: PanelSource
  currentPath: string
  items: FileItem[]
  loading?: boolean
}>()

const emit = defineEmits<{
  navigate: [path: string]
  select: [item: FileItem, multi: boolean]
  open: [item: FileItem]
  pathChange: [path: string]
}>()

const uiStore = useUIStore()

// Local state
const pathInput = ref(props.currentPath)
const sortField = ref<SortField>('name')
const sortDirection = ref<SortDirection>('asc')

// Watch for path changes from parent
watch(() => props.currentPath, (newPath) => {
  pathInput.value = newPath
})

// Computed
const selectedItems = computed(() => {
  return props.source === 'local' 
    ? uiStore.selectedLocalItems 
    : uiStore.selectedRemoteItems
})

const sortedItems = computed(() => {
  const items = [...props.items]
  
  // Always show directories first
  items.sort((a, b) => {
    const aIsDir = a.isDirectory
    const bIsDir = b.isDirectory
    
    if (aIsDir && !bIsDir) return -1
    if (!aIsDir && bIsDir) return 1
    
    // Sort by selected field
    let comparison = 0
    switch (sortField.value) {
      case 'name':
        comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        break
      case 'size':
        comparison = (a.size || 0) - (b.size || 0)
        break
      case 'date':
        const aTime = a.type === 'local' ? a.modifiedTime : (a.lastModified?.getTime() || 0)
        const bTime = b.type === 'local' ? b.modifiedTime : (b.lastModified?.getTime() || 0)
        comparison = aTime - bTime
        break
    }
    
    return sortDirection.value === 'asc' ? comparison : -comparison
  })
  
  return items
})

// Methods
function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatDate(timestamp: number | Date | null): string {
  if (!timestamp) return '-'
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getFileIcon(item: FileItem): string {
  if (item.isDirectory) return '📁'
  
  const ext = item.name.split('.').pop()?.toLowerCase() || ''
  
  const icons: Record<string, string> = {
    // Images
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
    // Documents
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙', txt: '📄',
    // Audio
    mp3: '🎵', wav: '🎵', ogg: '🎵', flac: '🎵', m4a: '🎵',
    // Video
    mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬', webm: '🎬',
    // Archives
    zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
    // Code
    js: '📜', ts: '📜', vue: '📜', html: '📜', css: '📜', json: '📜'
  }
  
  return icons[ext] || '📄'
}

function isSelected(item: FileItem): boolean {
  const key = item.type === 'local' ? item.path : item.key
  return selectedItems.value.includes(key)
}

function handleItemClick(item: FileItem, event: MouseEvent) {
  const multi = event.ctrlKey || event.metaKey
  emit('select', item, multi)
}

function handleItemDoubleClick(item: FileItem) {
  if (item.isDirectory) {
    emit('navigate', item.type === 'local' ? item.path : item.key)
  } else {
    emit('open', item)
  }
}

async function navigateUp() {
  const currentPath = props.currentPath
  
  if (props.source === 'local') {
    const parent = await window.electronAPI.getParentPath(currentPath)
    if (parent && parent !== currentPath) {
      emit('navigate', parent)
    }
  } else {
    // OBS path handling
    const parts = currentPath.split('/').filter(p => p)
    if (parts.length > 0) {
      parts.pop()
      emit('navigate', parts.length > 0 ? parts.join('/') + '/' : '')
    }
  }
}

function handlePathSubmit() {
  emit('pathChange', pathInput.value)
}

function setSort(field: SortField) {
  if (sortField.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDirection.value = 'asc'
  }
}

function getSortIcon(field: SortField): string {
  if (sortField.value !== field) return ''
  return sortDirection.value === 'asc' ? '↑' : '↓'
}
</script>

<template>
  <div class="file-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="panel-title">
        <span v-if="source === 'local'" class="panel-icon">💻</span>
        <span v-else class="panel-icon">☁️</span>
        <span>{{ source === 'local' ? 'Local' : 'OBS' }}</span>
      </div>
    </div>
    
    <!-- Path bar -->
    <div class="path-bar">
      <button @click="navigateUp" class="path-btn" title="Subir">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      </button>
      <input
        v-model="pathInput"
        @keyup.enter="handlePathSubmit"
        class="path-input"
        :placeholder="source === 'local' ? 'C:\\ruta\\carpeta' : 'prefix/carpeta/'"
      />
      <button @click="handlePathSubmit" class="path-btn" title="Ir">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </button>
    </div>
    
    <!-- Column headers -->
    <div class="column-headers">
      <div class="col-name" @click="setSort('name')">
        Nombre {{ getSortIcon('name') }}
      </div>
      <div class="col-size" @click="setSort('size')">
        Tamaño {{ getSortIcon('size') }}
      </div>
      <div class="col-date" @click="setSort('date')">
        Fecha {{ getSortIcon('date') }}
      </div>
    </div>
    
    <!-- File list -->
    <div class="file-list" v-if="!loading">
      <div
        v-for="item in sortedItems"
        :key="item.type === 'local' ? item.path : item.key"
        :class="['file-item', { selected: isSelected(item) }]"
        @click="handleItemClick(item, $event)"
        @dblclick="handleItemDoubleClick(item)"
      >
        <div class="col-name">
          <span class="file-icon">{{ getFileIcon(item) }}</span>
          <span class="file-name" :title="item.name">{{ item.name }}</span>
        </div>
        <div class="col-size">{{ item.isDirectory ? '-' : formatSize(item.size) }}</div>
        <div class="col-date">
          {{ formatDate(item.type === 'local' ? item.modifiedTime : item.lastModified) }}
        </div>
      </div>
      
      <!-- Empty state -->
      <div v-if="sortedItems.length === 0" class="empty-state">
        <svg class="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p>Carpeta vacía</p>
      </div>
    </div>
    
    <!-- Loading state -->
    <div v-else class="loading-state">
      <svg class="animate-spin w-8 h-8 text-primary-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p>Cargando...</p>
    </div>
  </div>
</template>

<style scoped>
.file-panel {
  @apply flex flex-col h-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden;
}

.panel-header {
  @apply flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-700;
}

.panel-title {
  @apply flex items-center gap-2 font-medium text-gray-700 dark:text-gray-200;
}

.panel-icon {
  @apply text-lg;
}

.path-bar {
  @apply flex items-center gap-1 px-2 py-1.5 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-700;
}

.path-btn {
  @apply p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200;
  @apply hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors;
}

.path-input {
  @apply flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded;
  @apply focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500;
  @apply text-gray-700 dark:text-gray-200;
}

.column-headers {
  @apply flex items-center px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400;
  @apply bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-700;
  @apply select-none cursor-pointer;
}

.col-name {
  @apply flex-1 flex items-center gap-2 min-w-0;
}

.col-size {
  @apply w-24 text-right;
}

.col-date {
  @apply w-36 text-right;
}

.file-list {
  @apply flex-1 overflow-y-auto;
}

.file-item {
  @apply flex items-center px-3 py-1.5 text-sm cursor-pointer;
  @apply hover:bg-gray-100 dark:hover:bg-gray-700;
  @apply border-b border-gray-100 dark:border-gray-700;
}

.file-item.selected {
  @apply bg-primary-100 dark:bg-primary-900/30 hover:bg-primary-200 dark:hover:bg-primary-900/40;
}

.file-icon {
  @apply text-base flex-shrink-0;
}

.file-name {
  @apply truncate text-gray-700 dark:text-gray-200;
}

.empty-state,
.loading-state {
  @apply flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500;
}

.empty-state p,
.loading-state p {
  @apply mt-2 text-sm;
}
</style>
