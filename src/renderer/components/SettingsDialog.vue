<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useConfigStore } from '../stores/configStore'
import { useUIStore } from '../stores/uiStore'

const emit = defineEmits<{ close: [] }>()
const configStore = useConfigStore()
const uiStore = useUIStore()
const saving = ref(false)
const form = ref({ accessKeyId: '', secretAccessKey: '', endpoint: '', bucket: '' })

const canClose = computed(() => configStore.hasOBSConfig)
const canSave = computed(() => Object.values(form.value).every(value => value.trim().length > 0))

onMounted(() => {
  form.value.endpoint = configStore.obsStatus.endpoint
  form.value.bucket = configStore.obsStatus.bucket
})

function close(): void {
  if (canClose.value) emit('close')
}

async function save(): Promise<void> {
  if (!canSave.value) return
  saving.value = true
  const connected = await configStore.configureOBS({ ...form.value })
  saving.value = false

  if (connected) {
    uiStore.notify({ type: 'success', title: 'Conexión verificada y guardada' })
    emit('close')
  } else {
    uiStore.notify({
      type: 'error',
      title: 'No se pudo conectar',
      message: configStore.connectionError ?? undefined,
      duration: 0
    })
  }
}
</script>

<template>
  <div class="settings-overlay" @click.self="close">
    <section class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header class="modal-header">
        <div>
          <p class="eyebrow">Conexión protegida</p>
          <h2 id="settings-title">Huawei OBS</h2>
        </div>
        <button v-if="canClose" class="close-btn" aria-label="Cerrar" @click="close">×</button>
      </header>

      <div v-if="configStore.obsStatus.configured" class="saved-connection">
        <span class="status-dot"></span>
        <div>
          <strong>Hay una credencial guardada</strong>
          <p>{{ configStore.obsStatus.accessKeyIdHint }} · {{ configStore.obsStatus.bucket }}</p>
        </div>
      </div>

      <div class="modal-content">
        <p class="intro">
          Estos datos se guardan cifrados por Windows. Para cambiar la conexión, completá los cuatro campos.
        </p>

        <label>
          <span>Access Key ID</span>
          <input v-model="form.accessKeyId" class="input" autocomplete="off" />
        </label>
        <label>
          <span>Secret Access Key</span>
          <input v-model="form.secretAccessKey" class="input" type="password" autocomplete="new-password" />
        </label>
        <label>
          <span>Endpoint</span>
          <input v-model="form.endpoint" class="input" placeholder="https://obs.region.myhuaweicloud.com" />
        </label>
        <label>
          <span>Bucket</span>
          <input v-model="form.bucket" class="input" />
        </label>

        <p v-if="configStore.connectionError" class="error-copy">{{ configStore.connectionError }}</p>
      </div>

      <footer class="modal-actions">
        <button v-if="canClose" class="btn btn-secondary" @click="close">Cancelar</button>
        <button class="btn btn-primary" :disabled="!canSave || saving" @click="save">
          {{ saving ? 'Verificando…' : 'Verificar y guardar' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.settings-overlay { @apply fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6; }
.settings-modal { @apply w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl; }
.modal-header { @apply flex items-center justify-between border-b border-slate-700 px-6 py-5; }
.modal-header h2 { @apply text-2xl font-semibold; }
.eyebrow { @apply mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-400; }
.close-btn { @apply rounded-lg px-3 py-1 text-2xl text-slate-400 hover:bg-slate-800 hover:text-white; }
.saved-connection { @apply mx-6 mt-5 flex items-center gap-3 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4; }
.saved-connection p { @apply mt-0.5 text-sm text-emerald-200/70; }
.status-dot { @apply h-3 w-3 rounded-full bg-emerald-400; }
.modal-content { @apply space-y-4 px-6 py-5; }
.intro { @apply text-sm leading-6 text-slate-400; }
label { @apply block space-y-1.5 text-sm font-medium text-slate-200; }
.error-copy { @apply rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300; }
.modal-actions { @apply flex justify-end gap-3 border-t border-slate-700 px-6 py-4; }
</style>
