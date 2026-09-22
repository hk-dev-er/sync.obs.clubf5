<script setup lang="ts">
const appTitle = 'ClubF5 Cargador OBS'

const minimize = () => window.electronAPI.minimize()
const maximize = () => window.electronAPI.maximize()
const close = () => window.electronAPI.close()
</script>

<template>
  <div class="title-bar drag-region">
    <div class="title-bar-icon">
      <svg class="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    </div>
    <span class="title-bar-text">{{ appTitle }}</span>
    <div class="title-bar-controls no-drag">
      <button @click="minimize" class="control-btn minimize" title="Minimizar">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
        </svg>
      </button>
      <button @click="maximize" class="control-btn maximize" title="Maximizar">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>
      <button @click="close" class="control-btn close" title="Cerrar">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.title-bar {
  @apply flex items-center h-9 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700;
}

.title-bar-icon {
  @apply px-3;
}

.title-bar-text {
  @apply flex-1 text-sm font-medium text-gray-700 dark:text-gray-200;
}

.title-bar-controls {
  @apply flex items-center;
}

.control-btn {
  @apply p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors;
}

.control-btn.close:hover {
  @apply bg-red-500 text-white;
}
</style>
