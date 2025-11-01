import { app } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'
import type { TranscriptionResult } from '../shared/types'

const runProcess = (command: string, args: string[]) =>
  new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 })
    })
  })

export const resolveSpeechBinary = () => {
  if (process.env.SEAM_SPEECH_BIN) {
    return process.env.SEAM_SPEECH_BIN
  }

  if (app.isPackaged) {
    return resolvePath(process.resourcesPath, 'speech')
  }

  const baseDir = join(app.getAppPath(), '..')
  return resolvePath(baseDir, 'native', 'speech', '.build', 'debug', 'speech')
}

export const transcribeAudioFile = async (audioPath: string, locale?: string): Promise<TranscriptionResult> => {
  const binary = resolveSpeechBinary()

  if (!existsSync(binary)) {
    throw new Error(`Speech binary not found at ${binary}. Build it with "swift build" inside native/speech.`)
  }

  const args = [audioPath, '--json', '--timeout=60']
  if (locale) {
    args.push(`--locale=${locale}`)
  }

  const result = await runProcess(binary, args)

  if (result.exitCode !== 0) {
    const message = result.stderr.trim() || `Speech process exited with code ${result.exitCode}`
    throw new Error(message)
  }

  const output = result.stdout.trim()
  if (!output) {
    const errorHint = result.stderr.trim()
      ? `\nBinary error output: ${result.stderr.trim()}`
      : '\nThe speech binary produced no output. This may indicate an unsupported audio format (WebM/Ogg are not supported by macOS Speech framework - use M4A/AAC/MP4 instead).'
    throw new Error(`Speech binary produced no output.${errorHint}`)
  }

  try {
    return JSON.parse(output) as TranscriptionResult
  } catch (error) {
    throw new Error(`Failed to parse speech output: ${(error as Error).message}\nOutput received: ${output.substring(0, 200)}`)
  }
}

export const extensionFromMime = (mimeType: string) => {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('wav')) return 'wav'
  if (normalized.includes('m4a') || normalized.includes('aac')) return 'm4a'
  if (normalized.includes('mp4')) return 'm4a'
  if (normalized.includes('webm')) return 'webm'
  if (normalized.includes('ogg')) return 'ogg'
  return 'm4a'
}

export const normalizeToBuffer = (source: ArrayBuffer | Uint8Array | Buffer) => {
  if (Buffer.isBuffer(source)) return source
  if (source instanceof Uint8Array) {
    return Buffer.from(source.buffer, source.byteOffset, source.byteLength)
  }
  if (source instanceof ArrayBuffer) {
    return Buffer.from(source)
  }
  return null
}
