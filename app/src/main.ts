import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { join, dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { mkdirSync, existsSync, promises as fsPromises } from 'node:fs'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { SessionRecord, TranscriptionResult } from './shared/types'
import type { Database as BetterSqliteDatabase } from 'better-sqlite3'

const require = createRequire(import.meta.url)
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
const DB_FILENAME = 'sanma.db'
let cachedDbPath: string | null = null
let db: BetterSqliteDatabase | null = null
let isDbInitialized = false
type SessionDbRow = { id: string; title: string; created_at: number }

const resolveDbPath = () => {
  if (!cachedDbPath) {
    cachedDbPath = join(app.getPath('userData'), DB_FILENAME)
  }
  return cachedDbPath
}

const openDatabase = () => {
  if (!db) {
    const dbPath = resolveDbPath()
    mkdirSync(dirname(dbPath), { recursive: true })
    db = new BetterSqlite3(dbPath)
    db.pragma('journal_mode = WAL')
  }

  if (!isDbInitialized && db) {
    ensureSchema(db)
    seedInitialSession(db)
    isDbInitialized = true
  }

  return db!
}

const closeDatabase = () => {
  if (db) {
    db.close()
    db = null
    isDbInitialized = false
  }
}

const ensureSchema = (database: BetterSqliteDatabase) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)
}

const seedInitialSession = (database: BetterSqliteDatabase) => {
  const countRow = database.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM sessions')
  const result = countRow.get()
  const count = result?.count ?? 0
  if (count > 0) return

  const now = Date.now()
  const id = randomUUID()
  const title = '初回セッション (better-sqlite3)'

  database.prepare<[string, string, number]>('INSERT INTO sessions (id, title, created_at) VALUES (?, ?, ?)').run(id, title, now)
}

const mapSessionRow = (row: SessionDbRow): SessionRecord => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
})

const listSessions = (): SessionRecord[] => {
  const database = openDatabase()
  const rows = database
    .prepare<[], SessionDbRow>('SELECT id, title, created_at FROM sessions ORDER BY created_at DESC LIMIT 20')
    .all()

  return rows.map(mapSessionRow)
}

const createSession = (input: { title?: string } = {}): SessionRecord => {
  const database = openDatabase()
  const title =
    typeof input.title === 'string' && input.title.trim().length > 0
      ? input.title.trim()
      : `新規セッション ${new Date().toLocaleTimeString()}`

  const now = Date.now()
  const id = randomUUID()

  database.prepare<[string, string, number]>('INSERT INTO sessions (id, title, created_at) VALUES (?, ?, ?)').run(id, title, now)

  return {
    id,
    title,
    createdAt: now,
  }
}

const registerIpcHandlers = () => {
  openDatabase()

  ipcMain.handle('sanma:get-db-path', () => resolveDbPath())
  ipcMain.handle('sanma:get-sessions', () => listSessions())
  ipcMain.handle('sanma:create-session', (_event, payload: { title?: string }) => createSession(payload ?? {}))
  ipcMain.handle('sanma:transcribe-audio', async (_event, payload: { path: string; locale?: string }) => {
    if (!payload?.path) {
      throw new Error('Audio path is required')
    }

    return transcribeAudioFile(payload.path, payload.locale)
  })
  ipcMain.handle(
    'sanma:transcribe-buffer',
    async (
      _event,
      payload: { data: ArrayBuffer | Uint8Array | Buffer; mimeType: string; locale?: string },
    ) => {
      if (!payload?.data) {
        throw new Error('Audio buffer is required')
      }

      const buffer = normalizeToBuffer(payload.data)
      if (!buffer || buffer.length === 0) {
        throw new Error('Audio buffer is required')
      }

      const mimeType = payload.mimeType ?? 'audio/mp4'
      const extension = extensionFromMime(mimeType)
      const tempPath = join(tmpdir(), `sanma-audio-${randomUUID()}.${extension}`)

      console.log('[transcribe-buffer] Writing audio buffer:', {
        size: buffer.length,
        mimeType,
        extension,
        tempPath,
      })

      await fsPromises.writeFile(tempPath, buffer)

      // Also save a copy for debugging
      const debugPath = join(app.getPath('userData'), `debug-audio-latest.${extension}`)
      await fsPromises.writeFile(debugPath, buffer).catch(() => undefined)
      console.log('[transcribe-buffer] Debug copy saved to:', debugPath)

      try {
        return await transcribeAudioFile(tempPath, payload.locale)
      } finally {
        await fsPromises.unlink(tempPath).catch(() => undefined)
      }
    },
  )
}

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (!app.isPackaged && devServerUrl) {
    await mainWindow.loadURL(devServerUrl)
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  registerIpcHandlers()
  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('before-quit', () => {
  closeDatabase()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const resolveSpeechBinary = () => {
  if (process.env.SANMA_SPEECH_BIN) {
    return process.env.SANMA_SPEECH_BIN
  }

  const baseDir = app.isPackaged ? app.getAppPath() : join(app.getAppPath(), '..')
  return resolvePath(baseDir, 'native', 'speech', '.build', 'debug', 'speech')
}

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

const transcribeAudioFile = async (audioPath: string, locale?: string): Promise<TranscriptionResult> => {
  const binary = resolveSpeechBinary()

  if (!existsSync(binary)) {
    throw new Error(`Speech binary not found at ${binary}. Build it with "swift build" inside native/speech.`)
  }

  const args = [audioPath, '--json', '--timeout=60']
  if (locale) {
    args.push(`--locale=${locale}`)
  }

  console.log('[transcribe] Running speech binary:', binary, 'with args:', args)
  const result = await runProcess(binary, args)
  console.log('[transcribe] Exit code:', result.exitCode, 'stdout length:', result.stdout.length, 'stderr:', result.stderr)

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

const extensionFromMime = (mimeType: string) => {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('wav')) return 'wav'
  if (normalized.includes('m4a') || normalized.includes('aac')) return 'm4a'
  if (normalized.includes('mp4')) return 'm4a'
  if (normalized.includes('webm')) return 'webm'
  if (normalized.includes('ogg')) return 'ogg'
  return 'm4a'
}

const normalizeToBuffer = (source: ArrayBuffer | Uint8Array | Buffer) => {
  if (Buffer.isBuffer(source)) return source
  if (source instanceof Uint8Array) {
    return Buffer.from(source.buffer, source.byteOffset, source.byteLength)
  }
  if (source instanceof ArrayBuffer) {
    return Buffer.from(source)
  }
  return null
}
