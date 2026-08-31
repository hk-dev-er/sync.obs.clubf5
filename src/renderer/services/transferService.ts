// Transfer Service - Manage file transfer queue
import { ref, computed } from 'vue'
import { obsService } from './obsService'

export type TransferType = 'upload' | 'download'
export type TransferStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled'

export interface TransferItem {
  id: string
  type: TransferType
  localPath: string
  remotePath: string
  fileName: string
  size: number
  progress: number
  status: TransferStatus
  data?: ArrayBuffer
  error?: string
  startTime?: number
  endTime?: number
}

class TransferService {
  private queue = ref<TransferItem[]>([])
  private isProcessing = ref(false)
  private concurrency = 3
  private activeTransfers = 0

  /**
   * Get the transfer queue
   */
  getQueue() {
    return this.queue
  }

  /**
   * Check if currently processing
   */
  getIsProcessing() {
    return this.isProcessing
  }

  /**
   * Computed stats
   */
  getStats() {
    return computed(() => {
      const q = this.queue.value
      return {
        total: q.length,
        pending: q.filter(t => t.status === 'pending').length,
        inProgress: q.filter(t => t.status === 'in-progress').length,
        completed: q.filter(t => t.status === 'completed').length,
        failed: q.filter(t => t.status === 'failed').length
      }
    })
  }

  /**
   * Add upload to queue
   */
  queueUpload(localPath: string, remotePath: string, fileName: string, size: number): string {
    const id = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    this.queue.value.push({
      id,
      type: 'upload',
      localPath,
      remotePath,
      fileName,
      size,
      progress: 0,
      status: 'pending'
    })

    this.processQueue()
    return id
  }

  /**
   * Add an upload to queue that already has its content in memory (e.g. drag & drop)
   */
  queueUploadData(remotePath: string, fileName: string, data: ArrayBuffer, size: number): string {
    const id = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    this.queue.value.push({
      id,
      type: 'upload',
      localPath: '',
      remotePath,
      fileName,
      size,
      progress: 0,
      status: 'pending',
      data
    })

    this.processQueue()
    return id
  }

  /**
   * Add download to queue
   */
  queueDownload(remotePath: string, localPath: string, fileName: string, size: number): string {
    const id = `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    this.queue.value.push({
      id,
      type: 'download',
      localPath,
      remotePath,
      fileName,
      size,
      progress: 0,
      status: 'pending'
    })

    this.processQueue()
    return id
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing.value) return
    this.isProcessing.value = true

    while (true) {
      // Get pending items up to concurrency limit
      const pendingItems = this.queue.value.filter(
        t => t.status === 'pending'
      )

      if (pendingItems.length === 0) break
      if (this.activeTransfers >= this.concurrency) {
        await new Promise(resolve => setTimeout(resolve, 100))
        continue
      }

      const item = pendingItems[0]
      this.processItem(item)
    }

    this.isProcessing.value = false
  }

  /**
   * Process a single transfer item
   */
  private async processItem(item: TransferItem): Promise<void> {
    item.status = 'in-progress'
    item.startTime = Date.now()
    this.activeTransfers++

    try {
      if (item.type === 'upload') {
        const buffer = item.data ?? await window.electronAPI.readFileAsBuffer(item.localPath)
        await obsService.uploadObject(item.remotePath, buffer, (progress) => {
          item.progress = progress.percentage
        })
      } else {
        const data = await obsService.downloadObject(item.remotePath)
        await window.electronAPI.writeFile(item.localPath, data)
        item.progress = 100
      }

      item.status = 'completed'
      item.endTime = Date.now()
    } catch (error) {
      item.status = 'failed'
      item.error = (error as Error).message
      item.endTime = Date.now()
    } finally {
      this.activeTransfers--
    }
  }

  /**
   * Cancel a transfer
   */
  cancel(id: string): void {
    const item = this.queue.value.find(t => t.id === id)
    if (item && item.status === 'pending') {
      item.status = 'cancelled'
    }
  }

  /**
   * Retry a failed transfer
   */
  retry(id: string): void {
    const item = this.queue.value.find(t => t.id === id)
    if (item && item.status === 'failed') {
      item.status = 'pending'
      item.progress = 0
      item.error = undefined
      this.processQueue()
    }
  }

  /**
   * Remove a transfer from queue
   */
  remove(id: string): void {
    const index = this.queue.value.findIndex(t => t.id === id)
    if (index > -1) {
      const item = this.queue.value[index]
      if (item.status !== 'in-progress') {
        this.queue.value.splice(index, 1)
      }
    }
  }

  /**
   * Clear completed/failed/cancelled transfers
   */
  clearCompleted(): void {
    this.queue.value = this.queue.value.filter(
      t => t.status === 'pending' || t.status === 'in-progress'
    )
  }

  /**
   * Cancel all pending transfers
   */
  cancelAll(): void {
    for (const item of this.queue.value) {
      if (item.status === 'pending') {
        item.status = 'cancelled'
      }
    }
  }
}

export const transferService = new TransferService()
export default transferService
