import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'crypto'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { hashAndValidateOgg } from './fileSystem'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function temporaryFile(name: string, content: Buffer): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'clubf5-uploader-'))
  temporaryDirectories.push(directory)
  const filePath = join(directory, name)
  await writeFile(filePath, content)
  return filePath
}

describe('hashAndValidateOgg', () => {
  it('calcula MD5 y SHA-256 de un contenedor OGG', async () => {
    const content = Buffer.from('OggS\u0000\u0002contenido-de-prueba', 'utf8')
    const filePath = await temporaryFile('audio.ogg', content)

    await expect(hashAndValidateOgg(filePath)).resolves.toEqual({
      md5: createHash('md5').update(content).digest('hex'),
      sha256: createHash('sha256').update(content).digest('hex')
    })
  })

  it('rechaza un archivo renombrado a OGG sin cabecera OggS', async () => {
    const filePath = await temporaryFile('falso.ogg', Buffer.from('no-es-audio'))
    await expect(hashAndValidateOgg(filePath)).rejects.toThrow(/cabecera OGG válida/)
  })
})
