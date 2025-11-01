import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd(),
  },
}))

import { transcribeAudioFile } from './transcription'

describe('transcribeAudioFile', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'seam-speech-test-'))
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  afterEach(() => {
    delete process.env.SEAM_SPEECH_BIN
  })

  const createMockBinary = (source: string) => {
    const scriptPath = join(tempDir, `speech-mock-${randomUUID()}`)
    writeFileSync(scriptPath, source)
    chmodSync(scriptPath, 0o755)
    return scriptPath
  }

  it('parses JSON output from the speech binary', async () => {
    const script = `#!/usr/bin/env node\n` +
      `const result = {\n` +
      `  locale: 'ja-JP',\n` +
      `  text: '音声認識テストの結果です。',\n` +
      `  confidence: 0.92,\n` +
      `  segments: [{ substring: '音声認識テスト', confidence: 0.9, timestamp: 0, duration: 1.2 }],\n` +
      `  audioPath: process.argv[2]\n` +
      `};\n` +
      `process.stdout.write(JSON.stringify(result));\n`

    const binaryPath = createMockBinary(script)
    process.env.SEAM_SPEECH_BIN = binaryPath

    const fakeAudioPath = '/tmp/sample.m4a'
    const result = await transcribeAudioFile(fakeAudioPath, 'ja-JP')

    expect(result.locale).toBe('ja-JP')
    expect(result.text).toContain('音声認識テストの結果')
    expect(result.segments).toHaveLength(1)
    expect(result.audioPath).toBe(fakeAudioPath)
  })

  it('throws when the speech binary emits no output', async () => {
    const script = `#!/usr/bin/env node\nprocess.exit(0)\n`
    const binaryPath = createMockBinary(script)
    process.env.SEAM_SPEECH_BIN = binaryPath

    await expect(transcribeAudioFile('/tmp/sample.m4a')).rejects.toThrow('Speech binary produced no output')
  })

  it('propagates stderr message when the speech binary fails', async () => {
    const script = `#!/usr/bin/env node\nconsole.error('simulated failure')\nprocess.exit(2)\n`
    const binaryPath = createMockBinary(script)
    process.env.SEAM_SPEECH_BIN = binaryPath

    await expect(transcribeAudioFile('/tmp/sample.m4a')).rejects.toThrow('simulated failure')
  })
})
