<script setup lang="ts">
import { computed } from 'vue'
import { useConfigStore } from '../stores/configStore'
import { useUIStore } from '../stores/uiStore'

const configStore = useConfigStore()
const uiStore = useUIStore()

const emit = defineEmits<{
  copy: []
  delete: []
  newFolder: []
  sync: []
  refresh: []
  upload: []
}>()

const hasSelection = computed(() => uiStore.hasSelectedItems)
const isConnected = computed(() => configStore.isConnected)
</script>

<template>
  <div class="toolbar">
    <!-- Actions -->
    <div class="toolbar-actions">
      <button 
        @click="emit('copy')" 
        :disabled="!hasSelection"
        class="toolbar-btn"
        title="Copiar (F5)"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
        <span>Copiar</span>
      </button>

      <button 
        @click="emit('delete')" 
        :disabled="!hasSelection"
        class="toolbar-btn toolbar-btn-danger"
        title="Eliminar (Del)"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <span>Eliminar</span>
      </button>

      <div class="toolbar-separator"></div>

      <button 
        @click="emit('newFolder')" 
        class="toolbar-btn"
        title="Nueva carpeta (F7)"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        <span>Carpeta</span>
      </button>

      <button 
        @click="emit('refresh')" 
        class="toolbar-btn"
        title="Actualizar (F2)"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>Actualizar</span>
      </button>

      <div class="toolbar-separator"></div>

      <button 
        @click="emit('upload')" 
        class="toolbar-btn"
        title="Subir archivos"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <span>Subir</span>
      </button>

      <button 
        @click="emit('sync')" 
        :disabled="!isConnected"
        class="toolbar-btn toolbar-btn-primary"
        title="Sincronizar"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>Sincronizar</span>
      </button>
    </div>

    <!-- Right side actions -->
    <div class="toolbar-right">
      <button 
        @click="uiStore.toggleTransferPanel()"
        class="toolbar-btn"
        title="Cola de transferencias"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      </button>

      <button 
        @click="uiStore.openModal('settings')"
        class="toolbar-btn"
        title="Configuración"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  @apply flex items-center justify-between px-2 py-1 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700;
}

.toolbar-actions {
  @apply flex items-center gap-1;
}

.toolbar-right {
  @apply flex items-center gap-1;
}

.toolbar-btn {
  @apply flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 rounded;
  @apply hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors;
  @apply disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent;
}

.toolbar-btn-primary {
  @apply bg-primary-500 text-white hover:bg-primary-600;
  @apply disabled:hover:bg-primary-500;
}

.toolbar-btn-danger:not(:disabled):hover {
  @apply bg-red-500 text-white;
}

.toolbar-separator {
  @apply w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1;
}
</style>
