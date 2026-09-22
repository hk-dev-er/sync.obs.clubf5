import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import { fileSystemHandlers } from './fileSystem'
import { configHandlers } from './configService'
import { obsHandlers } from './obsService'
import type { UploadReport } from '../shared/contracts'

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    icon: join(__dirname, '../../public/icon.png')
  })

  // Development or production
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Register all IPC handlers
function registerHandlers() {
  // File system handlers
  Object.entries(fileSystemHandlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, handler)
  })

  // Config handlers
  Object.entries(configHandlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, handler)
  })

  // OBS handlers
  Object.entries(obsHandlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, handler)
  })

  // Dialog handlers
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('report:save', async (_event, report: UploadReport) => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const result = await dialog.showSaveDialog({
      defaultPath: `informe-carga-clubf5-${stamp}.json`,
      filters: [{ name: 'Informe JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, JSON.stringify(report, null, 2), 'utf8')
    return result.filePath
  })

  // App handlers
  ipcMain.handle('app:getVersion', () => app.getVersion())

  // Window controls
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.close())
}

// App lifecycle
app.whenReady().then(() => {
  registerHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle second instance
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})
