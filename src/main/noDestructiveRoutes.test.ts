import { describe, expect, it } from 'vitest'
import { readFile } from 'fs/promises'
import { resolve } from 'path'

describe('puente de seguridad de Electron', () => {
  it('no expone rutas de borrado ni descarga de OBS', async () => {
    const files = await Promise.all([
      readFile(resolve('src/main/obsService.ts'), 'utf8'),
      readFile(resolve('src/preload/index.ts'), 'utf8')
    ])
    const bridge = files.join('\n')

    expect(bridge).not.toMatch(/deleteObject|deleteObjects|downloadObject/)
    expect(bridge).not.toMatch(/obs:delete|obs:download/)
  })
})
