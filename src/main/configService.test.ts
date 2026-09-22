import { existsSync } from 'fs'
import { rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterAll, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({ constructorCalls: 0 }))
const testRoot = join(tmpdir(), `clubf5-config-service-${process.pid}`)
const userData = join(testRoot, 'missing-parent', 'user-data')

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: vi.fn(),
    decryptString: vi.fn()
  }
}))

vi.mock('electron-store', () => ({
  default: class MockStore {
    private values = new Map<string, unknown>()

    constructor(options: { defaults?: Record<string, unknown> }) {
      testState.constructorCalls += 1
      for (const [key, value] of Object.entries(options.defaults ?? {})) this.values.set(key, value)
    }

    get(key: string): unknown { return this.values.get(key) }
    set(key: string, value: unknown): void { this.values.set(key, value) }
    delete(key: string): void { this.values.delete(key) }
  }
}))

import { configHandlers } from './configService'

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

describe('config service startup', () => {
  it('no toca el sistema de archivos al importar el proceso principal', () => {
    expect(testState.constructorCalls).toBe(0)
    expect(existsSync(userData)).toBe(false)
  })

  it('crea el directorio de configuración recién cuando recibe una consulta', () => {
    const status = configHandlers['config:getOBSStatus']()

    expect(status).toEqual({ configured: false, endpoint: '', bucket: '', accessKeyIdHint: '' })
    expect(existsSync(userData)).toBe(true)
    expect(testState.constructorCalls).toBe(2)
  })
})
