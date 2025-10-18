import 'dotenv/config'
import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { join, dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { mkdirSync, existsSync, promises as fsPromises } from 'node:fs'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { SessionRecord, AgendaRecord, TranscriptionResult, SuggestionRecord, TranscriptionRecord } from './shared/types'
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
type AgendaDbRow = { id: string; session_id: string; title: string; order: number; status: string; created_at: number }
type SuggestionDbRow = {
  id: string
  session_id: string
  summary: string
  bridging_question: string
  follow_up_questions: string
  created_at: number
}
type TranscriptionDbRow = {
  id: string
  session_id: string
  text: string
  locale: string
  confidence: number
  created_at: number
}

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

  database.exec(`
    CREATE TABLE IF NOT EXISTS agendas (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_agendas_session_order ON agendas(session_id, "order")
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      bridging_question TEXT NOT NULL,
      follow_up_questions TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_suggestions_session ON suggestions(session_id, created_at DESC)
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS transcriptions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      text TEXT NOT NULL,
      locale TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_transcriptions_session ON transcriptions(session_id, created_at DESC)
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

const mapAgendaRow = (row: AgendaDbRow): AgendaRecord => ({
  id: row.id,
  sessionId: row.session_id,
  title: row.title,
  order: row.order,
  status: row.status as 'pending' | 'current' | 'completed',
  createdAt: row.created_at,
})

const listAgendas = (sessionId: string): AgendaRecord[] => {
  const database = openDatabase()
  const rows = database
    .prepare<[string], AgendaDbRow>('SELECT id, session_id, title, "order", status, created_at FROM agendas WHERE session_id = ? ORDER BY "order" ASC')
    .all(sessionId)

  return rows.map(mapAgendaRow)
}

const createAgenda = (input: { sessionId: string; title: string }): AgendaRecord => {
  const database = openDatabase()
  const { sessionId, title } = input

  if (!title?.trim()) {
    throw new Error('Agenda title is required')
  }

  const maxOrderRow = database
    .prepare<[string], { max_order: number | null }>('SELECT MAX("order") AS max_order FROM agendas WHERE session_id = ?')
    .get(sessionId)

  const order = (maxOrderRow?.max_order ?? -1) + 1
  const now = Date.now()
  const id = randomUUID()

  database
    .prepare<[string, string, string, number, string, number]>(
      'INSERT INTO agendas (id, session_id, title, "order", status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, sessionId, title.trim(), order, 'pending', now)

  return {
    id,
    sessionId,
    title: title.trim(),
    order,
    status: 'pending',
    createdAt: now,
  }
}

const updateAgenda = (input: { id: string; title?: string; status?: string }): AgendaRecord => {
  const database = openDatabase()
  const { id, title, status } = input

  const existingRow = database
    .prepare<[string], AgendaDbRow>('SELECT id, session_id, title, "order", status, created_at FROM agendas WHERE id = ?')
    .get(id)

  if (!existingRow) {
    throw new Error('Agenda not found')
  }

  const newTitle = title?.trim() ?? existingRow.title
  const newStatus = status ?? existingRow.status

  database
    .prepare<[string, string, string]>('UPDATE agendas SET title = ?, status = ? WHERE id = ?')
    .run(newTitle, newStatus, id)

  return {
    ...mapAgendaRow(existingRow),
    title: newTitle,
    status: newStatus as 'pending' | 'current' | 'completed',
  }
}

const deleteAgenda = (id: string): void => {
  const database = openDatabase()
  database.prepare<[string]>('DELETE FROM agendas WHERE id = ?').run(id)
}

const reorderAgendas = (input: { sessionId: string; agendaIds: string[] }): AgendaRecord[] => {
  const database = openDatabase()
  const { sessionId, agendaIds } = input

  const updateStmt = database.prepare<[number, string]>('UPDATE agendas SET "order" = ? WHERE id = ?')

  const transaction = database.transaction((ids: string[]) => {
    ids.forEach((agendaId, index) => {
      updateStmt.run(index, agendaId)
    })
  })

  transaction(agendaIds)

  return listAgendas(sessionId)
}

const mapSuggestionRow = (row: SuggestionDbRow): SuggestionRecord => ({
  id: row.id,
  sessionId: row.session_id,
  summary: row.summary,
  bridgingQuestion: row.bridging_question,
  followUpQuestions: JSON.parse(row.follow_up_questions) as string[],
  createdAt: row.created_at,
})

const listSuggestions = (sessionId: string, limit = 5): SuggestionRecord[] => {
  const database = openDatabase()
  const rows = database
    .prepare<[string, number], SuggestionDbRow>(
      'SELECT id, session_id, summary, bridging_question, follow_up_questions, created_at FROM suggestions WHERE session_id = ? ORDER BY created_at DESC LIMIT ?'
    )
    .all(sessionId, limit)

  return rows.map(mapSuggestionRow)
}

const createSuggestion = (input: {
  sessionId: string
  summary: string
  bridgingQuestion: string
  followUpQuestions: string[]
}): SuggestionRecord => {
  const database = openDatabase()
  const { sessionId, summary, bridgingQuestion, followUpQuestions } = input

  const now = Date.now()
  const id = randomUUID()
  const followUpQuestionsJson = JSON.stringify(followUpQuestions)

  database
    .prepare<[string, string, string, string, string, number]>(
      'INSERT INTO suggestions (id, session_id, summary, bridging_question, follow_up_questions, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, sessionId, summary, bridgingQuestion, followUpQuestionsJson, now)

  return {
    id,
    sessionId,
    summary,
    bridgingQuestion,
    followUpQuestions,
    createdAt: now,
  }
}

const mapTranscriptionRow = (row: TranscriptionDbRow): TranscriptionRecord => ({
  id: row.id,
  sessionId: row.session_id,
  text: row.text,
  locale: row.locale,
  confidence: row.confidence,
  createdAt: row.created_at,
})

const createTranscription = (input: {
  sessionId: string
  text: string
  locale: string
  confidence: number
}): TranscriptionRecord => {
  const database = openDatabase()
  const { sessionId, text, locale, confidence } = input

  const now = Date.now()
  const id = randomUUID()

  database
    .prepare<[string, string, string, string, number, number]>(
      'INSERT INTO transcriptions (id, session_id, text, locale, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, sessionId, text, locale, confidence, now)

  return {
    id,
    sessionId,
    text,
    locale,
    confidence,
    createdAt: now,
  }
}

const getRecentTranscriptions = (sessionId: string, secondsAgo = 180): TranscriptionRecord[] => {
  const database = openDatabase()
  const cutoffTime = Date.now() - secondsAgo * 1000

  const rows = database
    .prepare<[string, number], TranscriptionDbRow>(
      'SELECT id, session_id, text, locale, confidence, created_at FROM transcriptions WHERE session_id = ? AND created_at >= ? ORDER BY created_at ASC'
    )
    .all(sessionId, cutoffTime)

  return rows.map(mapTranscriptionRow)
}

const generateAiSuggestion = async (input: {
  sessionId: string
  currentAgendaTitle?: string
  nextAgendaTitle?: string
}): Promise<SuggestionRecord> => {
  const apiKey = process.env.GOOGLE_API_KEY

  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not set in environment variables')
  }

  // Fetch recent transcriptions from the database (last 120-180 seconds)
  const transcriptions = getRecentTranscriptions(input.sessionId, 180)
  const recentTranscriptions = transcriptions.length > 0
    ? transcriptions.map((t) => t.text).join('\n')
    : '（まだ会話内容がありません）'

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `あなたは会議のファシリテーターアシスタントです。以下の会話内容を元に、簡潔な提案を生成してください。

現在の議題: ${input.currentAgendaTitle ?? '未設定'}
次の議題: ${input.nextAgendaTitle ?? '未設定'}

最近の会話内容（直近3分間）:
${recentTranscriptions}

以下の形式でJSON形式で回答してください：
{
  "summary": "100〜160字の要約",
  "bridgingQuestion": "現在の議題から次の議題への繋ぎの質問",
  "followUpQuestions": ["追加質問1", "追加質問2"]
}

JSON以外の文字は含めないでください。`

  const result = await model.generateContent(prompt)
  const response = result.response
  const text = response.text()

  let parsed: { summary: string; bridgingQuestion: string; followUpQuestions: string[] }

  try {
    // JSONブロックから抽出を試みる
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0])
    } else {
      parsed = JSON.parse(text)
    }
  } catch (error) {
    console.error('[AI] Failed to parse response:', text)
    throw new Error(`Failed to parse AI response: ${(error as Error).message}`)
  }

  return createSuggestion({
    sessionId: input.sessionId,
    summary: parsed.summary,
    bridgingQuestion: parsed.bridgingQuestion,
    followUpQuestions: parsed.followUpQuestions,
  })
}

const registerIpcHandlers = () => {
  openDatabase()

  ipcMain.handle('sanma:get-db-path', () => resolveDbPath())
  ipcMain.handle('sanma:get-sessions', () => listSessions())
  ipcMain.handle('sanma:create-session', (_event, payload: { title?: string }) => createSession(payload ?? {}))

  ipcMain.handle('sanma:get-agendas', (_event, payload: { sessionId: string }) => listAgendas(payload.sessionId))
  ipcMain.handle('sanma:create-agenda', (_event, payload: { sessionId: string; title: string }) => createAgenda(payload))
  ipcMain.handle('sanma:update-agenda', (_event, payload: { id: string; title?: string; status?: string }) => updateAgenda(payload))
  ipcMain.handle('sanma:delete-agenda', (_event, payload: { id: string }) => deleteAgenda(payload.id))
  ipcMain.handle('sanma:reorder-agendas', (_event, payload: { sessionId: string; agendaIds: string[] }) => reorderAgendas(payload))

  ipcMain.handle('sanma:get-suggestions', (_event, payload: { sessionId: string; limit?: number }) =>
    listSuggestions(payload.sessionId, payload.limit)
  )
  ipcMain.handle(
    'sanma:generate-suggestion',
    async (_event, payload: { sessionId: string; currentAgendaTitle?: string; nextAgendaTitle?: string }) =>
      generateAiSuggestion(payload)
  )

  ipcMain.handle(
    'sanma:save-transcription',
    (_event, payload: { sessionId: string; text: string; locale: string; confidence: number }) =>
      createTranscription(payload)
  )

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
