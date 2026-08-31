declare module 'electron' {
  export interface IpcMainInvokeEvent {
    frameId: number
    processId: number
    sender: WebContents
  }

  export interface IpcRendererEvent {
    sender: IpcRenderer
    senderId: number
    ports: MessagePort[]
  }

  export interface WebContents {
    send(channel: string, ...args: unknown[]): void
    openDevTools(): void
  }

  export interface IpcRenderer {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
    on(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): this
    send(channel: string, ...args: unknown[]): void
  }

  export interface IpcMain {
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<unknown> | unknown): void
    on(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => void): void
  }

  export interface BrowserWindow {
    loadURL(url: string): Promise<void>
    loadFile(filePath: string): Promise<void>
    on(event: string, listener: (...args: unknown[]) => void): this
    minimize(): void
    maximize(): void
    unmaximize(): void
    isMaximized(): boolean
    isMinimized(): boolean
    restore(): void
    focus(): void
    close(): void
    webContents: WebContents
  }

  export interface BrowserWindowConstructorOptions {
    width?: number
    height?: number
    minWidth?: number
    minHeight?: number
    frame?: boolean
    titleBarStyle?: 'default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover'
    webPreferences?: {
      preload?: string
      contextIsolation?: boolean
      nodeIntegration?: boolean
      sandbox?: boolean
    }
    icon?: string
  }

  export interface Dialog {
    showOpenDialog(options: {
      properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>
      filters?: Array<{ name: string; extensions: string[] }>
    }): Promise<{ canceled: boolean; filePaths: string[] }>
  }

  export interface Shell {
    openExternal(url: string): Promise<void>
  }

  export interface App {
    requestSingleInstanceLock(): boolean
    quit(): void
    getVersion(): string
    on(event: string, listener: (...args: unknown[]) => void): this
    whenReady(): Promise<void>
  }

  export interface ContextBridge {
    exposeInMainWorld(apiKey: string, api: unknown): void
  }

  export interface WebUtils {
    getPathForFile(file: File): string
  }

  export const BrowserWindow: {
    new (options?: BrowserWindowConstructorOptions): BrowserWindow
    getAllWindows(): BrowserWindow[]
  }

  export const ipcMain: IpcMain
  export const ipcRenderer: IpcRenderer
  export const dialog: Dialog
  export const shell: Shell
  export const app: App
  export const contextBridge: ContextBridge
  export const webUtils: WebUtils
}
