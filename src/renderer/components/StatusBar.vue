<script setup lang="ts">
import { computed } from 'vue'
import { useConfigStore } from '../stores/configStore'

const configStore = useConfigStore()
const destination = computed(() => configStore.destination.includes('Melodic_Techno') ? 'Melodic Techno' : 'Progressive')
</script>

<template>
  <footer class="status-bar">
    <div class="status-section">
      <span :class="['status-indicator', { connected: configStore.isConnected }]"></span>
      <span>{{ configStore.isConnected ? 'OBS conectado' : 'OBS desconectado' }}</span>
    </div>
    <div class="status-section"><span>Destino: {{ destination }}</span></div>
    <div class="flex-1"></div>
    <button
      class="theme-toggle"
      :title="configStore.effectiveTheme === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'"
      @click="configStore.saveTheme(configStore.effectiveTheme === 'dark' ? 'light' : 'dark')"
    >
      {{ configStore.effectiveTheme === 'dark' ? '☀' : '☾' }}
    </button>
  </footer>
</template>

<style scoped>
.status-bar { @apply flex items-center gap-5 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400; }
.status-section { @apply flex items-center gap-2; }
.status-indicator { @apply h-2 w-2 rounded-full bg-slate-400; }
.status-indicator.connected { @apply bg-emerald-500; }
.theme-toggle { @apply rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-700; }
</style>
