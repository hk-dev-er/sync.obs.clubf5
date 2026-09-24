<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useConfigStore } from '../stores/configStore'
import { useUIStore } from '../stores/uiStore'
import type {
  LocalScanResult,
  ScanProgress,
  UploadProgress,
  UploadReport,
  UploadReportEntry
} from '../../shared/contracts'
import {
  buildUploadPlan,
  normalizeEtag,
  type UploadPlan,
  type UploadPlanItem
} from '../../shared/syncPlan'
import { destinationLabel, MUSIC_ROOT, type DestinationPrefix } from '../../shared/uploadPolicy'

const configStore = useConfigStore()
const uiStore = useUIStore()

const analyzing = ref(false)
const uploading = ref(false)
const confirming = ref(false)
const scanProgress = ref<ScanProgress>({ processed: 0, total: 0, currentFile: '' })
const scanResult = ref<LocalScanResult | null>(null)
const plan = ref<UploadPlan | null>(null)
const report = ref<UploadReport | null>(null)
const currentFile = ref('')
const currentTransferId = ref('')
const completedBytes = ref(0)
const currentTransferred = ref(0)
const uploadStartedAt = ref(0)
const uploadTotalBytes = ref(0)
const musicFolders = ref<DestinationPrefix[]>([])
const loadingMusicFolders = ref(false)

let unsubscribeScan: (() => void) | null = null
let unsubscribeUpload: (() => void) | null = null
let folderLoadRequest = 0

const newItems = computed(() => plan.value?.items.filter(item => item.kind === 'upload-new') ?? [])
const conflicts = computed(() => plan.value?.items.filter(item => item.kind === 'conflict') ?? [])
const replacements = computed(() => conflicts.value.filter(item => item.decision === 'replace'))
const uploads = computed(() => newItems.value.filter(item => item.decision === 'upload'))
const actionItems = computed(() => [...uploads.value, ...replacements.value])
const unchangedCount = computed(() => (plan.value?.counts.identical ?? 0) +
  (plan.value?.counts.remoteOnly ?? 0) + conflicts.value.length - replacements.value.length)
const progressBytes = computed(() => Math.min(uploadTotalBytes.value, completedBytes.value + currentTransferred.value))
const progressPercent = computed(() => uploadTotalBytes.value === 0
  ? 0
  : Math.round((progressBytes.value / uploadTotalBytes.value) * 100))
const selectedDestination = computed(() => musicFolders.value.includes(configStore.destination)
  ? configStore.destination
  : '')
const speed = computed(() => {
  const seconds = (Date.now() - uploadStartedAt.value) / 1000
  return seconds > 0 ? progressBytes.value / seconds : 0
})
const eta = computed(() => speed.value > 0 ? (uploadTotalBytes.value - progressBytes.value) / speed.value : 0)

onMounted(() => {
  unsubscribeScan = window.electronAPI.onScanProgress(progress => { scanProgress.value = progress })
  unsubscribeUpload = window.electronAPI.onUploadProgress((progress: UploadProgress) => {
    if (progress.transferId === currentTransferId.value) {
      currentTransferred.value = progress.transferred
    }
  })
})

watch(
  () => [configStore.isConnected, configStore.connectionRevision] as const,
  ([connected]) => {
    if (connected) void loadMusicFolders()
    else {
      folderLoadRequest += 1
      musicFolders.value = []
      loadingMusicFolders.value = false
      configStore.setAvailableDestinations([])
      resetAnalysis()
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  unsubscribeScan?.()
  unsubscribeUpload?.()
})

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'calculando…'
  if (seconds < 60) return `${Math.ceil(seconds)} s`
  return `${Math.ceil(seconds / 60)} min`
}

async function loadMusicFolders(): Promise<void> {
  const request = ++folderLoadRequest
  loadingMusicFolders.value = true
  try {
    const folders = await window.electronAPI.obsListMusicFolders()
    if (request !== folderLoadRequest) return
    musicFolders.value = folders
    configStore.setAvailableDestinations(folders)
    if (folders.length === 0) {
      uiStore.notify({
        type: 'error',
        title: 'No tenés carpetas asignadas',
        message: `Pedile al administrador acceso a una carpeta dentro de ${MUSIC_ROOT}.`,
        duration: 0
      })
      return
    }
    if (!folders.includes(configStore.destination)) {
      resetAnalysis()
      uiStore.notify({
        type: 'warning',
        title: 'Elegí la carpeta de destino',
        message: 'Seleccioná una de las carpetas disponibles.'
      })
    }
  } catch (error) {
    if (request !== folderLoadRequest) return
    musicFolders.value = []
    configStore.setAvailableDestinations([])
    uiStore.notify({
      type: 'error',
      title: 'No se pudieron cargar las carpetas musicales',
      message: (error as Error).message,
      duration: 0
    })
  } finally {
    if (request === folderLoadRequest) loadingMusicFolders.value = false
  }
}

async function chooseFolder(): Promise<void> {
  const selected = await window.electronAPI.selectFolder()
  if (!selected) return
  await configStore.saveLocalPath(selected)
  resetAnalysis()
}

async function changeDestination(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value as DestinationPrefix
  await configStore.saveDestination(value)
  resetAnalysis()
}

function resetAnalysis(): void {
  plan.value = null
  scanResult.value = null
  report.value = null
  confirming.value = false
}

async function analyze(): Promise<void> {
  if (!configStore.localPath || !configStore.isConnected || !musicFolders.value.includes(configStore.destination)) return
  analyzing.value = true
  report.value = null
  plan.value = null
  scanProgress.value = { processed: 0, total: 0, currentFile: '' }

  try {
    const [local, remote] = await Promise.all([
      window.electronAPI.scanLocalAudio(configStore.localPath),
      window.electronAPI.obsListAllObjects(configStore.destination)
    ])
    scanResult.value = local

    const localByPath = new Map(local.files.map(file => [file.relativePath, file]))
    for (const remoteFile of remote) {
      const localFile = localByPath.get(remoteFile.relativePath)
      if (localFile && localFile.size === remoteFile.size && !normalizeEtag(remoteFile.etag)) {
        const metadata = await window.electronAPI.obsGetObjectMetadata(remoteFile.key)
        remoteFile.sha256 = metadata?.sha256 ?? null
      }
    }

    plan.value = buildUploadPlan(local.files, remote)
    for (const notification of uiStore.notifications.filter(item => item.title === 'No se pudo comparar')) {
      uiStore.removeNotification(notification.id)
    }
    uiStore.notify({
      type: 'success',
      title: 'Comparación terminada',
      message: `${local.files.length} audios locales revisados por contenido.`
    })
  } catch (error) {
    uiStore.notify({ type: 'error', title: 'No se pudo comparar', message: (error as Error).message, duration: 0 })
  } finally {
    analyzing.value = false
  }
}

function setConflictDecision(item: UploadPlanItem, decision: 'keep' | 'replace'): void {
  item.decision = decision
}

function setAllConflicts(decision: 'keep' | 'replace'): void {
  for (const item of conflicts.value) item.decision = decision
}

function requestConfirmation(): void {
  if (actionItems.value.length === 0) return
  confirming.value = true
}

async function validatePlayable(path: string): Promise<void> {
  const url = await window.electronAPI.getFileUrl(path)
  await new Promise<void>((resolve, reject) => {
    const audio = new Audio()
    const timer = window.setTimeout(() => {
      audio.src = ''
      reject(new Error('El audio no pudo validarse en 10 segundos'))
    }, 10_000)

    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer)
      const valid = Number.isFinite(audio.duration) && audio.duration > 0
      audio.src = ''
      valid ? resolve() : reject(new Error('El audio no tiene una duración válida'))
    }
    audio.onerror = () => {
      window.clearTimeout(timer)
      audio.src = ''
      reject(new Error('Chromium no pudo decodificar el archivo OGG'))
    }
    audio.src = url
  })
}

function baseReportEntries(): UploadReportEntry[] {
  if (!plan.value) return []
  const entries: UploadReportEntry[] = (scanResult.value?.invalid ?? []).map(file => ({
    relativePath: file.path,
    action: 'invalid',
    bytes: 0,
    message: file.reason
  }))
  for (const item of plan.value.items) {
    if (item.kind === 'identical') {
      entries.push({ relativePath: item.relativePath, action: 'identical', bytes: item.local?.size ?? 0, message: item.reason })
    }
    if (item.kind === 'remote-only' || (item.kind === 'conflict' && item.decision === 'keep')) {
      entries.push({ relativePath: item.relativePath, action: 'kept', bytes: item.remote?.size ?? 0, message: item.reason })
    }
  }
  return entries
}

async function runUpload(items: UploadPlanItem[], seedEntries: UploadReportEntry[] = baseReportEntries()): Promise<void> {
  if (items.length === 0) return
  uploading.value = true
  confirming.value = false
  const entries = [...seedEntries]
  uploadTotalBytes.value = items.reduce((sum, item) => sum + (item.local?.size ?? 0), 0)
  completedBytes.value = 0
  currentTransferred.value = 0
  uploadStartedAt.value = Date.now()

  for (const item of items) {
    if (!item.local) continue
    currentFile.value = item.relativePath
    currentTransferred.value = 0
    currentTransferId.value = crypto.randomUUID()

    try {
      await validatePlayable(item.local.path)
      const result = await window.electronAPI.obsUploadFile({
        transferId: currentTransferId.value,
        localPath: item.local.path,
        relativePath: item.relativePath,
        destination: configStore.destination,
        allowReplace: item.kind === 'conflict' && item.decision === 'replace',
        expectedRemote: item.remote ? { size: item.remote.size, etag: item.remote.etag } : null,
        digest: { size: item.local.size, md5: item.local.md5, sha256: item.local.sha256 }
      })
      entries.push({
        relativePath: item.relativePath,
        action: result.replaced ? 'replaced' : 'uploaded',
        bytes: item.local.size,
        message: result.replaced ? 'Reemplazado y verificado; el anterior quedó respaldado.' : 'Cargado y verificado.',
        backupKey: result.backupKey
      })
    } catch (error) {
      entries.push({
        relativePath: item.relativePath,
        action: 'failed',
        bytes: item.local.size,
        message: (error as Error).message
      })
    } finally {
      completedBytes.value += item.local.size
      currentTransferred.value = 0
    }
  }

  currentFile.value = ''
  currentTransferId.value = ''
  uploading.value = false
  report.value = makeReport(entries)

  if (report.value.totals.failed > 0) {
    uiStore.notify({
      type: 'error',
      title: `${report.value.totals.failed} archivo(s) no se cargaron`,
      message: 'Los demás resultados están en el informe. Podés reintentar solo los fallidos.',
      duration: 0
    })
  } else {
    // A completed upload changes OBS, so the previous comparison is no longer current.
    plan.value = null
    scanResult.value = null
    uiStore.notify({ type: 'success', title: 'Carga terminada y verificada' })
  }
}

function makeReport(entries: UploadReportEntry[]): UploadReport {
  const count = (action: UploadReportEntry['action']) => entries.filter(entry => entry.action === action).length
  return {
    generatedAt: new Date().toISOString(),
    sourceFolder: configStore.localPath,
    destination: configStore.destination,
    totals: {
      uploaded: count('uploaded'),
      replaced: count('replaced'),
      kept: count('kept'),
      identical: count('identical'),
      invalid: count('invalid'),
      failed: count('failed')
    },
    entries
  }
}

async function saveReport(): Promise<void> {
  if (!report.value) return
  const plainReport = JSON.parse(JSON.stringify(report.value)) as UploadReport
  const path = await window.electronAPI.saveReport(plainReport)
  if (path) uiStore.notify({ type: 'success', title: 'Informe guardado', message: path })
}

async function retryFailed(): Promise<void> {
  if (!report.value || !plan.value) return
  const failed = new Set(report.value.entries.filter(entry => entry.action === 'failed').map(entry => entry.relativePath))
  const retained = report.value.entries.filter(entry => entry.action !== 'failed')
  await runUpload(actionItems.value.filter(item => failed.has(item.relativePath)), retained)
}
</script>

<template>
  <main class="uploader-shell">
    <section class="hero">
      <div>
        <p class="eyebrow">Carga segura a Huawei OBS</p>
        <h1>Actualizar música</h1>
        <p>La aplicación compara el contenido exacto y nunca borra archivos de OBS.</p>
      </div>
      <span class="direction-pill">PC → OBS</span>
    </section>

    <section class="setup-panel">
      <div class="field source-field">
        <label>Carpeta de la computadora</label>
        <div class="path-row">
          <span :class="{ placeholder: !configStore.localPath }">
            {{ configStore.localPath || 'Elegí la carpeta que contiene los audios OGG' }}
          </span>
          <button class="btn btn-secondary" :disabled="uploading" @click="chooseFolder">Elegir carpeta</button>
        </div>
      </div>

      <div class="field">
        <div class="field-heading">
          <label for="destination">Carpeta de destino</label>
          <button class="refresh-folders" type="button" :disabled="uploading || loadingMusicFolders || !configStore.isConnected" @click="loadMusicFolders">
            {{ loadingMusicFolders ? 'Actualizando…' : 'Actualizar lista' }}
          </button>
        </div>
        <select id="destination" class="input" :value="selectedDestination" :disabled="uploading || loadingMusicFolders || musicFolders.length === 0" @change="changeDestination">
          <option v-if="loadingMusicFolders" disabled>Cargando carpetas…</option>
          <option v-else-if="musicFolders.length === 0" disabled>No hay carpetas musicales</option>
          <option v-else-if="!selectedDestination" value="" disabled>Elegí una carpeta musical</option>
          <option v-for="destination in musicFolders" :key="destination" :value="destination">
            {{ destinationLabel(destination) }}
          </option>
        </select>
      </div>

      <button
        class="btn btn-primary analyze-btn"
        :disabled="!configStore.localPath || !configStore.isConnected || !musicFolders.includes(configStore.destination) || analyzing || uploading"
        @click="analyze"
      >
        {{ analyzing ? 'Comparando contenido…' : 'Comparar antes de cargar' }}
      </button>
    </section>

    <div v-if="analyzing" class="progress-card">
      <div class="progress-copy">
        <strong>Calculando huellas exactas</strong>
        <span>{{ scanProgress.processed }} de {{ scanProgress.total || '…' }}</span>
      </div>
      <p>{{ scanProgress.currentFile || 'Consultando OBS…' }}</p>
      <div class="progress-track"><div :style="{ width: `${scanProgress.total ? (scanProgress.processed / scanProgress.total) * 100 : 8}%` }"></div></div>
    </div>

    <template v-if="plan && !uploading">
      <section class="summary-grid">
        <article><strong>{{ plan.counts.newFiles }}</strong><span>Nuevos</span><small>Listos para cargar</small></article>
        <article><strong>{{ plan.counts.identical }}</strong><span>Idénticos</span><small>No se vuelven a cargar</small></article>
        <article class="warning"><strong>{{ plan.counts.conflicts }}</strong><span>Coincidencias de nombre</span><small>Requieren una decisión</small></article>
        <article><strong>{{ plan.counts.remoteOnly }}</strong><span>Solo en OBS</span><small>Se conservan</small></article>
      </section>

      <p v-if="scanResult?.invalid.length" class="validation-warning">
        {{ scanResult.invalid.length }} archivo(s) OGG inválidos quedaron fuera de la carga.
      </p>
      <p v-if="scanResult?.ignored.length" class="muted-copy">
        {{ scanResult.ignored.length }} archivo(s) que no son OGG fueron ignorados.
      </p>

      <section v-if="conflicts.length" class="conflicts-panel">
        <header>
          <div>
            <p class="eyebrow">Revisión manual</p>
            <h2>Mismo nombre, contenido distinto</h2>
            <p>Por seguridad se conserva el archivo de OBS hasta que elijas reemplazarlo.</p>
          </div>
          <div class="bulk-actions">
            <button class="btn btn-secondary" @click="setAllConflicts('keep')">Conservar todos</button>
            <button class="btn btn-outline-warning" @click="setAllConflicts('replace')">Reemplazar todos</button>
          </div>
        </header>

        <div class="conflict-list">
          <article v-for="item in conflicts" :key="item.id" class="conflict-row">
            <div class="file-copy">
              <strong>{{ item.relativePath }}</strong>
              <span>PC {{ formatBytes(item.local?.size ?? 0) }} · OBS {{ formatBytes(item.remote?.size ?? 0) }}</span>
            </div>
            <div class="decision-buttons">
              <button :class="['decision', { active: item.decision === 'keep' }]" @click="setConflictDecision(item, 'keep')">Conservar OBS</button>
              <button :class="['decision replace', { active: item.decision === 'replace' }]" @click="setConflictDecision(item, 'replace')">Reemplazar</button>
            </div>
          </article>
        </div>
      </section>

      <section class="action-bar">
        <div>
          <strong>{{ uploads.length }} {{ uploads.length === 1 ? 'nuevo' : 'nuevos' }} · {{ replacements.length }} {{ replacements.length === 1 ? 'reemplazo' : 'reemplazos' }}</strong>
          <p>{{ unchangedCount }} {{ unchangedCount === 1 ? 'archivo queda' : 'archivos quedan' }} sin cambios.</p>
        </div>
        <button class="btn btn-primary" :disabled="actionItems.length === 0" @click="requestConfirmation">Revisar carga</button>
      </section>

      <section v-if="confirming" class="confirmation-panel">
        <div>
          <p class="eyebrow">Confirmación final</p>
          <h2>Se cargarán {{ uploads.length }} {{ uploads.length === 1 ? 'archivo nuevo' : 'archivos nuevos' }} y se {{ replacements.length === 1 ? 'reemplazará' : 'reemplazarán' }} {{ replacements.length }}.</h2>
          <p v-if="replacements.length">Cada reemplazo guarda primero una copia del archivo anterior.</p>
          <p>Ningún archivo remoto será eliminado.</p>
        </div>
        <div class="confirmation-actions">
          <button class="btn btn-secondary" @click="confirming = false">Volver</button>
          <button class="btn btn-primary" @click="runUpload([...actionItems])">Confirmar carga</button>
        </div>
      </section>
    </template>

    <section v-if="uploading" class="upload-panel">
      <div class="upload-heading">
        <div><p class="eyebrow">Cargando y verificando</p><h2>{{ currentFile }}</h2></div>
        <strong>{{ progressPercent }}%</strong>
      </div>
      <div class="progress-track large"><div :style="{ width: `${progressPercent}%` }"></div></div>
      <div class="upload-metrics">
        <span>{{ formatBytes(progressBytes) }} / {{ formatBytes(uploadTotalBytes) }}</span>
        <span>{{ formatBytes(speed) }}/s</span>
        <span>Restante: {{ formatEta(eta) }}</span>
      </div>
    </section>

    <section v-if="report && !uploading" class="report-panel">
      <header>
        <div><p class="eyebrow">Resultado</p><h2>Carga finalizada</h2></div>
        <div class="report-actions">
          <button class="btn btn-secondary" @click="saveReport">Guardar informe</button>
          <button v-if="report.totals.failed" class="btn btn-primary" @click="retryFailed">Reintentar fallidos</button>
        </div>
      </header>
      <div class="report-totals">
        <span>{{ report.totals.uploaded }} cargados</span>
        <span>{{ report.totals.replaced }} reemplazados</span>
        <span>{{ report.totals.identical }} idénticos</span>
        <span>{{ report.totals.kept }} conservados</span>
        <span :class="{ failed: report.totals.invalid }">{{ report.totals.invalid }} inválidos</span>
        <span :class="{ failed: report.totals.failed }">{{ report.totals.failed }} fallidos</span>
      </div>
      <details v-if="report.totals.failed || report.totals.invalid">
        <summary>Ver problemas</summary>
        <p v-for="entry in report.entries.filter(item => item.action === 'failed' || item.action === 'invalid')" :key="entry.relativePath">
          <strong>{{ entry.relativePath }}</strong> — {{ entry.message }}
        </p>
      </details>
    </section>
  </main>
</template>

<style scoped>
.uploader-shell { @apply mx-auto h-full max-w-6xl space-y-5 overflow-y-auto p-6 pb-10; }
.hero { @apply flex items-start justify-between; }
.hero h1 { @apply text-3xl font-bold text-slate-950 dark:text-white; }
.hero p:not(.eyebrow) { @apply mt-1 text-slate-600 dark:text-slate-400; }
.eyebrow { @apply text-xs font-bold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-400; }
.direction-pill { @apply rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300; }
.setup-panel { @apply grid grid-cols-[minmax(0,2fr)_minmax(220px,1fr)_auto] items-end gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800; }
.field { @apply space-y-2; }
.field label { @apply text-sm font-semibold text-slate-700 dark:text-slate-200; }
.field-heading { @apply flex items-center justify-between gap-3; }
.refresh-folders { @apply text-xs font-semibold text-sky-600 hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-sky-400 dark:hover:text-sky-300; }
.path-row { @apply flex min-h-10 items-center justify-between gap-3 rounded-lg border border-slate-300 bg-slate-50 pl-3 dark:border-slate-600 dark:bg-slate-900; }
.path-row span { @apply truncate text-sm text-slate-700 dark:text-slate-200; }
.path-row .placeholder { @apply text-slate-400; }
.analyze-btn { @apply h-10 whitespace-nowrap px-5; }
.progress-card, .upload-panel, .report-panel, .confirmation-panel { @apply rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800; }
.progress-copy, .upload-heading { @apply flex items-center justify-between gap-4; }
.progress-card p { @apply mt-2 truncate text-sm text-slate-500; }
.progress-track { @apply mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700; }
.progress-track div { @apply h-full rounded-full bg-sky-500 transition-all; }
.summary-grid { @apply grid grid-cols-4 gap-3; }
.summary-grid article { @apply flex flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800; }
.summary-grid article.warning { @apply border-amber-300 dark:border-amber-800; }
.summary-grid strong { @apply text-3xl text-slate-950 dark:text-white; }
.summary-grid span { @apply mt-1 font-semibold; }
.summary-grid small { @apply mt-1 text-slate-500; }
.validation-warning { @apply rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200; }
.muted-copy { @apply text-sm text-slate-500; }
.conflicts-panel { @apply overflow-hidden rounded-2xl border border-amber-300 bg-white dark:border-amber-800 dark:bg-slate-800; }
.conflicts-panel > header { @apply flex items-start justify-between gap-6 border-b border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30; }
.conflicts-panel h2, .confirmation-panel h2, .upload-panel h2, .report-panel h2 { @apply text-xl font-semibold text-slate-950 dark:text-white; }
.conflicts-panel header p:not(.eyebrow), .confirmation-panel p { @apply mt-1 text-sm text-slate-600 dark:text-slate-400; }
.bulk-actions { @apply flex shrink-0 gap-2; }
.btn-outline-warning { @apply border border-amber-500 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950; }
.conflict-list { @apply max-h-80 divide-y divide-slate-200 overflow-y-auto dark:divide-slate-700; }
.conflict-row { @apply flex items-center justify-between gap-4 p-4; }
.file-copy { @apply min-w-0; }
.file-copy strong { @apply block truncate; }
.file-copy span { @apply mt-1 block text-xs text-slate-500; }
.decision-buttons { @apply flex shrink-0 rounded-lg bg-slate-100 p-1 dark:bg-slate-900; }
.decision { @apply rounded-md px-3 py-1.5 text-sm text-slate-500; }
.decision.active { @apply bg-white font-semibold text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300; }
.decision.replace.active { @apply text-amber-700 dark:text-amber-300; }
.action-bar { @apply flex items-center justify-between rounded-2xl bg-slate-950 p-5 text-white dark:bg-sky-950; }
.action-bar p { @apply mt-1 text-sm text-slate-400; }
.confirmation-panel { @apply flex items-center justify-between gap-5 border-sky-400; }
.confirmation-actions, .report-actions { @apply flex shrink-0 gap-3; }
.upload-heading strong { @apply text-3xl text-sky-500; }
.progress-track.large { @apply h-3; }
.upload-metrics { @apply mt-3 flex justify-between text-sm text-slate-500; }
.report-panel header { @apply flex items-center justify-between; }
.report-totals { @apply mt-4 flex flex-wrap gap-2; }
.report-totals span { @apply rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-700; }
.report-totals span.failed { @apply bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300; }
.report-panel details { @apply mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200; }
.report-panel details p { @apply mt-2; }
@media (max-width: 900px) {
  .setup-panel { @apply grid-cols-1; }
  .summary-grid { @apply grid-cols-2; }
  .conflicts-panel > header, .conflict-row, .confirmation-panel { @apply flex-col items-stretch; }
}
</style>
