<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useConfigStore } from './stores/configStore'
import { useUIStore } from './stores/uiStore'

import TitleBar from './components/TitleBar.vue'
import StatusBar from './components/StatusBar.vue'
import SyncView from './components/SyncView.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import Notifications from './components/Notifications.vue'

const configStore = useConfigStore()
const uiStore = useUIStore()

const showSettings = computed(() => uiStore.activeModal === 'settings')

onMounted(async () => {
  await configStore.loadConfig()

  if (!configStore.hasOBSConfig) {
    uiStore.openModal('settings')
  }
})
</script>

<template>
  <div class="app">
    <TitleBar />

    <div class="app-header">
      <div>
        <span class="app-header-title">ClubF5 · Cargador de música</span>
        <span class="safe-label">Solo carga · nunca elimina</span>
      </div>
      <button @click="uiStore.openModal('settings')" class="btn btn-secondary">
        Configuración
      </button>
    </div>

    <div class="main-content">
      <SyncView />
    </div>

    <StatusBar />

    <SettingsDialog v-if="showSettings" @close="uiStore.closeModal()" />
    <Notifications />
  </div>
</template>

<style scoped>
.app {
  @apply flex flex-col h-screen overflow-hidden;
}

.app-header {
  @apply flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700;
}

.app-header-title {
  @apply text-sm font-semibold text-gray-700 dark:text-gray-200;
}

.safe-label {
  @apply ml-3 text-xs font-medium text-emerald-600 dark:text-emerald-400;
}

.main-content {
  @apply flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900;
}
</style>
