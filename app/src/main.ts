import 'dotenv/config'
import { app, BrowserWindow, ipcMain } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { mkdirSync, existsSync, promises as fsPromises } from 'node:fs'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { transcribeAudioFile, normalizeToBuffer, extensionFromMime } from './main/transcription'
import {
  generateAIResponse,
  parseAIJsonResponse,
  validateAPIKey,
  type AIProviderConfig,
} from './main/ai-provider'
import type {
  SessionRecord,
  AgendaRecord,
  SuggestionRecord,
  TranscriptionRecord,
  SummaryRecord,
  ConfirmationRecord,
  AIProvider,
} from './shared/types'
import type { Database as BetterSqliteDatabase } from 'better-sqlite3'

const require = createRequire(import.meta.url)
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
const DB_FILENAME = 'seam.db'
let cachedDbPath: string | null = null
let db: BetterSqliteDatabase | null = null
let isDbInitialized = false
type SessionDbRow = { id: string; title: string; duration: number | null; started_at: number | null; ended_at: number | null; ai_provider: string | null; created_at: number }
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
type SettingDbRow = {
  key: string
  value: string
  updated_at: number
}
type SummaryDbRow = {
  id: string
  session_id: string
  content: string
  created_at: number
}
type ConfirmationDbRow = {
  id: string
  session_id: string
  title: string
  status: string
  summary: string | null
  created_at: number
  completed_at: number | null
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
      duration INTEGER,
      started_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `)

  // Migration: Add duration, started_at, and ended_at columns if they don't exist
  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN duration INTEGER`)
  } catch (err) {
    // Column already exists, ignore
  }

  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN started_at INTEGER`)
  } catch (err) {
    // Column already exists, ignore
  }

  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN ended_at INTEGER`)
  } catch (err) {
    // Column already exists, ignore
  }

  // Migration: Add ai_provider column if it doesn't exist
  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN ai_provider TEXT DEFAULT 'gemini'`)
  } catch (err) {
    // Column already exists, ignore
  }

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

  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id)
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS confirmations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      summary TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_confirmations_session ON confirmations(session_id, created_at)
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
  duration: row.duration ?? undefined,
  startedAt: row.started_at ?? undefined,
  endedAt: row.ended_at ?? undefined,
  aiProvider: (row.ai_provider as AIProvider) ?? undefined,
  createdAt: row.created_at,
})

const listSessions = (): SessionRecord[] => {
  const database = openDatabase()
  const rows = database
    .prepare<[], SessionDbRow>('SELECT id, title, duration, started_at, ended_at, ai_provider, created_at FROM sessions ORDER BY created_at DESC LIMIT 20')
    .all()

  return rows.map(mapSessionRow)
}

const createSession = (input: { title?: string; duration?: number; agendaItems?: string[]; aiProvider?: AIProvider } = {}): SessionRecord => {
  const database = openDatabase()
  const title =
    typeof input.title === 'string' && input.title.trim().length > 0
      ? input.title.trim()
      : `新規セッション ${new Date().toLocaleTimeString()}`

  const now = Date.now()
  const id = randomUUID()
  const duration = input.duration ?? null
  const startedAt = null // Will be set when session actually starts
  const aiProvider = input.aiProvider ?? 'gemini' // Default to gemini if not specified

  database.prepare<[string, string, number | null, number | null, string, number]>(
    'INSERT INTO sessions (id, title, duration, started_at, ai_provider, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, title, duration, startedAt, aiProvider, now)

  // Create agenda items if provided
  if (input.agendaItems && input.agendaItems.length > 0) {
    const insertAgenda = database.prepare<[string, string, string, number, string, number]>(
      'INSERT INTO agendas (id, session_id, title, "order", status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    input.agendaItems.forEach((agendaTitle, index) => {
      const agendaId = randomUUID()
      const status = index === 0 ? 'current' : 'pending'
      insertAgenda.run(agendaId, id, agendaTitle, index, status, now)
    })
  }

  return {
    id,
    title,
    duration: duration ?? undefined,
    startedAt: startedAt ?? undefined,
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

const startSession = (sessionId: string): SessionRecord => {
  const database = openDatabase()
  const now = Date.now()

  const existingRow = database
    .prepare<[string], SessionDbRow>('SELECT id, title, duration, started_at, ended_at, created_at FROM sessions WHERE id = ?')
    .get(sessionId)

  if (!existingRow) {
    throw new Error('Session not found')
  }

  database
    .prepare<[number, string]>('UPDATE sessions SET started_at = ? WHERE id = ?')
    .run(now, sessionId)

  return {
    ...mapSessionRow(existingRow),
    startedAt: now,
  }
}

const endSession = (sessionId: string): SessionRecord => {
  const database = openDatabase()
  const now = Date.now()

  const existingRow = database
    .prepare<[string], SessionDbRow>('SELECT id, title, duration, started_at, ended_at, created_at FROM sessions WHERE id = ?')
    .get(sessionId)

  if (!existingRow) {
    throw new Error('Session not found')
  }

  database
    .prepare<[number, string]>('UPDATE sessions SET ended_at = ? WHERE id = ?')
    .run(now, sessionId)

  return {
    ...mapSessionRow(existingRow),
    endedAt: now,
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

const getSetting = (key: string): string | null => {
  const database = openDatabase()
  const row = database
    .prepare<[string], SettingDbRow>('SELECT key, value, updated_at FROM settings WHERE key = ?')
    .get(key)

  return row?.value ?? null
}

const setSetting = (key: string, value: string): void => {
  const database = openDatabase()
  const now = Date.now()

  database
    .prepare<[string, string, number]>(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
    )
    .run(key, value, now)
}

/**
 * Get AI provider configuration from settings or session
 */
const getAIProviderConfig = (sessionId?: string): AIProviderConfig => {
  let provider: AIProvider

  // If sessionId is provided, use session-specific provider
  if (sessionId) {
    const database = openDatabase()
    const row = database
      .prepare<[string], SessionDbRow>('SELECT ai_provider FROM sessions WHERE id = ?')
      .get(sessionId)

    provider = (row?.ai_provider as AIProvider) || 'gemini'
  } else {
    // Otherwise, use global setting (default to 'gemini' for backward compatibility)
    provider = (getSetting('ai_provider') as AIProvider) || 'gemini'
  }

  // Get API key based on provider
  let apiKey: string | undefined

  switch (provider) {
    case 'gemini':
      apiKey = getSetting('gemini_api_key') || undefined
      break
    case 'claude':
      apiKey = getSetting('claude_api_key') || undefined
      break
    case 'chatgpt':
      apiKey = getSetting('chatgpt_api_key') || undefined
      break
  }

  // Validate API key is configured
  validateAPIKey(apiKey, provider)

  return {
    provider,
    apiKey: apiKey!,
  }
}

const mapSummaryRow = (row: SummaryDbRow): SummaryRecord => ({
  id: row.id,
  sessionId: row.session_id,
  content: row.content,
  createdAt: row.created_at,
})

const getSummaries = (sessionId: string, limit = 100): SummaryRecord[] => {
  const database = openDatabase()
  const rows = database
    .prepare<[string, number], SummaryDbRow>(
      'SELECT id, session_id, content, created_at FROM summaries WHERE session_id = ? ORDER BY created_at ASC LIMIT ?'
    )
    .all(sessionId, limit)

  return rows.map(mapSummaryRow)
}

const saveSummary = (input: { sessionId: string; content: string }): SummaryRecord => {
  const database = openDatabase()
  const { sessionId, content } = input
  const now = Date.now()

  // Always create new summary (append mode)
  const id = randomUUID()
  database
    .prepare<[string, string, string, number]>(
      'INSERT INTO summaries (id, session_id, content, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(id, sessionId, content, now)

  return {
    id,
    sessionId,
    content,
    createdAt: now,
  }
}

const mapConfirmationRow = (row: ConfirmationDbRow): ConfirmationRecord => ({
  id: row.id,
  sessionId: row.session_id,
  title: row.title,
  status: (row.status as 'pending' | 'completed') ?? 'pending',
  summary: row.summary ?? undefined,
  createdAt: row.created_at,
  completedAt: row.completed_at ?? undefined,
})

const listConfirmations = (sessionId: string): ConfirmationRecord[] => {
  const database = openDatabase()
  const rows = database
    .prepare<[string], ConfirmationDbRow>(
      'SELECT id, session_id, title, status, summary, created_at, completed_at FROM confirmations WHERE session_id = ? ORDER BY status ASC, created_at ASC'
    )
    .all(sessionId)

  return rows.map(mapConfirmationRow)
}

const createConfirmation = (input: { sessionId: string; title: string }): ConfirmationRecord => {
  const database = openDatabase()
  if (!input.title?.trim()) {
    throw new Error('Confirmation title is required')
  }

  const now = Date.now()
  const id = randomUUID()
  database
    .prepare(
      'INSERT INTO confirmations (id, session_id, title, status, created_at) VALUES (@id, @sessionId, @title, @status, @createdAt)'
    )
    .run({
      id,
      sessionId: input.sessionId,
      title: input.title.trim(),
      status: 'pending',
      createdAt: now,
    })

  return {
    id,
    sessionId: input.sessionId,
    title: input.title.trim(),
    status: 'pending',
    createdAt: now,
  }
}

const updateConfirmation = (input: {
  id: string
  title?: string
  status?: 'pending' | 'completed'
  summary?: string
}): ConfirmationRecord => {
  const database = openDatabase()
  const existing = database
    .prepare<[string], ConfirmationDbRow>(
      'SELECT id, session_id, title, status, summary, created_at, completed_at FROM confirmations WHERE id = ?'
    )
    .get(input.id)

  if (!existing) {
    throw new Error('Confirmation not found')
  }

  const newTitle = input.title?.trim() && input.title.trim().length > 0 ? input.title.trim() : existing.title
  const newSummary = input.summary !== undefined ? input.summary : existing.summary ?? ''

  let newStatus = existing.status as 'pending' | 'completed'
  let newCompletedAt = existing.completed_at

  if (input.status) {
    newStatus = input.status
    newCompletedAt = input.status === 'completed' ? newCompletedAt ?? Date.now() : null
  }

  database
    .prepare(
      'UPDATE confirmations SET title = @title, status = @status, summary = @summary, completed_at = @completedAt WHERE id = @id'
    )
    .run({
      title: newTitle,
      status: newStatus,
      summary: newSummary,
      completedAt: newCompletedAt,
      id: input.id,
    })

  return {
    id: existing.id,
    sessionId: existing.session_id,
    title: newTitle,
    status: newStatus,
    summary: newSummary || undefined,
    createdAt: existing.created_at,
    completedAt: newCompletedAt ?? undefined,
  }
}

const deleteConfirmation = (id: string) => {
  const database = openDatabase()
  database.prepare<[string]>('DELETE FROM confirmations WHERE id = ?').run(id)
}

const generateAiSuggestion = async (input: {
  sessionId: string
  currentAgendaTitle?: string
  nextAgendaTitle?: string
}): Promise<SuggestionRecord> => {
  // Get AI provider configuration for this session
  const config = getAIProviderConfig(input.sessionId)

  // Fetch recent transcriptions from the database (last 120-180 seconds)
  const transcriptions = getRecentTranscriptions(input.sessionId, 180)

  console.log('[AI] Fetched transcriptions:', {
    count: transcriptions.length,
    sessionId: input.sessionId,
    provider: config.provider,
    timestamps: transcriptions.map(t => ({
      time: new Date(t.createdAt).toISOString(),
      preview: t.text.substring(0, 30) + '...'
    }))
  })

  const recentTranscriptions = transcriptions.length > 0
    ? transcriptions.map((t) => t.text).join('\n')
    : '（まだ会話内容がありません）'

  console.log('[AI] Combined transcriptions length:', recentTranscriptions.length, 'chars')
  console.log('[AI] Combined transcriptions preview:', recentTranscriptions.substring(0, 200) + '...')

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

  console.log(`[AI] Full prompt being sent to ${config.provider}:`)
  console.log('=====================================')
  console.log(prompt)
  console.log('=====================================')

  const text = await generateAIResponse(config, prompt)

  const parsed = parseAIJsonResponse<{
    summary: string
    bridgingQuestion: string
    followUpQuestions: string[]
  }>(text)

  return createSuggestion({
    sessionId: input.sessionId,
    summary: parsed.summary,
    bridgingQuestion: parsed.bridgingQuestion,
    followUpQuestions: parsed.followUpQuestions,
  })
}

const generateSummary = async (input: {
  sessionId: string
  secondsAgo?: number
}): Promise<string> => {
  // Get AI provider configuration for this session
  const config = getAIProviderConfig(input.sessionId)

  // Fetch all transcriptions from the session start
  const transcriptions = getRecentTranscriptions(input.sessionId, input.secondsAgo ?? 999999)

  console.log('[Summary] Fetched transcriptions:', {
    count: transcriptions.length,
    sessionId: input.sessionId,
    provider: config.provider,
  })

  if (transcriptions.length === 0) {
    return '会話内容がまだありません。'
  }

  const allTranscriptions = transcriptions.map((t) => t.text).join('\n')

  console.log('[Summary] Combined transcriptions length:', allTranscriptions.length, 'chars')

  const prompt = `以下の会話内容全体を簡潔にまとめてください。

会話内容:
${allTranscriptions}

要件:
- 話し合われた主要なトピックを箇条書きで整理してください
- 全体で200〜300字程度にまとめてください

JSON形式ではなく、読みやすい日本語の文章で回答してください。`

  console.log('[Summary] Generating summary...')

  const text = await generateAIResponse(config, prompt)

  console.log('[Summary] Generated summary:', text.substring(0, 100) + '...')

  // Save summary to database
  const summaryContent = text.trim()
  saveSummary({ sessionId: input.sessionId, content: summaryContent })

  return summaryContent
}

const checkConfirmations = async (input: {
  sessionId: string
  secondsAgo?: number
}): Promise<{ id: string; shouldCheck: boolean; reason: string; excerpt: string }[]> => {
  // Get AI provider configuration for this session
  const config = getAIProviderConfig(input.sessionId)

  // Fetch pending confirmations
  const confirmations = listConfirmations(input.sessionId).filter(c => c.status === 'pending')

  if (confirmations.length === 0) {
    console.log('[ConfirmationCheck] No pending confirmations')
    return []
  }

  // Fetch recent transcriptions
  const transcriptions = getRecentTranscriptions(input.sessionId, input.secondsAgo ?? 180)

  if (transcriptions.length === 0) {
    console.log('[ConfirmationCheck] No transcriptions available')
    return []
  }

  const recentText = transcriptions.map((t) => t.text).join('\n')

  console.log('[ConfirmationCheck] Checking confirmations:', {
    count: confirmations.length,
    transcriptionLength: recentText.length,
    provider: config.provider,
  })

  // Create confirmation list for prompt
  const confirmationList = confirmations.map((c, idx) => `${idx + 1}. [ID: ${c.id}] ${c.title}`).join('\n')

  const prompt = `あなたは会議の確認事項チェックアシスタントです。以下の会話内容を見て、各確認事項について言及されたか判定してください。

確認事項リスト:
${confirmationList}

最近の会話内容:
${recentText}

各確認事項について、会話内で言及されたか判定し、以下のJSON形式で回答してください：
{
  "checks": [
    {
      "id": "確認事項のID",
      "shouldCheck": true または false,
      "reason": "判定理由（30文字以内）",
      "excerpt": "該当する会話の抜粋（言及されていた場合のみ、60文字程度）"
    }
  ]
}

判定基準:
- 確認事項のトピックについて明確に言及されている場合は shouldCheck: true
- 単なるキーワードの一致だけでなく、内容的に言及されているかを判断してください
- 不明確な場合は shouldCheck: false としてください
- excerpt は該当する会話内容を元の文章から抜粋してください（言及されていない場合は空文字列）

JSON以外の文字は含めないでください。`

  console.log(`[ConfirmationCheck] Sending request to ${config.provider}...`)

  const text = await generateAIResponse(config, prompt)

  const parsed = parseAIJsonResponse<{
    checks: { id: string; shouldCheck: boolean; reason: string; excerpt: string }[]
  }>(text)

  console.log('[ConfirmationCheck] Results:', parsed.checks)

  return parsed.checks
}

const registerIpcHandlers = () => {
  openDatabase()

  ipcMain.handle('seam:get-db-path', () => resolveDbPath())
  ipcMain.handle('seam:get-sessions', () => listSessions())
  ipcMain.handle('seam:create-session', (_event, payload: { title?: string; duration?: number; agendaItems?: string[] }) => createSession(payload ?? {}))
  ipcMain.handle('seam:start-session', (_event, payload: { sessionId: string }) => startSession(payload.sessionId))
  ipcMain.handle('seam:end-session', (_event, payload: { sessionId: string }) => endSession(payload.sessionId))

  ipcMain.handle('seam:get-agendas', (_event, payload: { sessionId: string }) => listAgendas(payload.sessionId))
  ipcMain.handle('seam:create-agenda', (_event, payload: { sessionId: string; title: string }) => createAgenda(payload))
  ipcMain.handle('seam:update-agenda', (_event, payload: { id: string; title?: string; status?: string }) => updateAgenda(payload))
  ipcMain.handle('seam:delete-agenda', (_event, payload: { id: string }) => deleteAgenda(payload.id))
  ipcMain.handle('seam:reorder-agendas', (_event, payload: { sessionId: string; agendaIds: string[] }) => reorderAgendas(payload))

  ipcMain.handle('seam:get-suggestions', (_event, payload: { sessionId: string; limit?: number }) =>
    listSuggestions(payload.sessionId, payload.limit)
  )
  ipcMain.handle(
    'seam:generate-suggestion',
    async (_event, payload: { sessionId: string; currentAgendaTitle?: string; nextAgendaTitle?: string }) =>
      generateAiSuggestion(payload)
  )

  ipcMain.handle(
    'seam:generate-summary',
    async (_event, payload: { sessionId: string; secondsAgo?: number }) =>
      generateSummary(payload)
  )

  ipcMain.handle(
    'seam:save-transcription',
    (_event, payload: { sessionId: string; text: string; locale: string; confidence: number }) =>
      createTranscription(payload)
  )

  ipcMain.handle(
    'seam:get-transcriptions',
    (_event, payload: { sessionId: string; secondsAgo?: number }) =>
      getRecentTranscriptions(payload.sessionId, payload.secondsAgo ?? 180)
  )

  ipcMain.handle('seam:get-setting', (_event, payload: { key: string }) => getSetting(payload.key))
  ipcMain.handle('seam:set-setting', (_event, payload: { key: string; value: string }) => {
    setSetting(payload.key, payload.value)
  })

  ipcMain.handle('seam:get-summaries', (_event, payload: { sessionId: string; limit?: number }) => getSummaries(payload.sessionId, payload.limit))
  ipcMain.handle('seam:save-summary', (_event, payload: { sessionId: string; content: string }) => saveSummary(payload))

  ipcMain.handle('seam:get-confirmations', (_event, payload: { sessionId: string }) => listConfirmations(payload.sessionId))
  ipcMain.handle(
    'seam:create-confirmation',
    (_event, payload: { sessionId: string; title: string }) => createConfirmation(payload)
  )
  ipcMain.handle(
    'seam:update-confirmation',
    (_event, payload: { id: string; title?: string; status?: 'pending' | 'completed'; summary?: string }) =>
      updateConfirmation(payload)
  )
  ipcMain.handle('seam:delete-confirmation', (_event, payload: { id: string }) => deleteConfirmation(payload.id))
  ipcMain.handle(
    'seam:check-confirmations',
    async (_event, payload: { sessionId: string; secondsAgo?: number }) => checkConfirmations(payload)
  )

  ipcMain.handle('seam:transcribe-audio', async (_event, payload: { path: string; locale?: string }) => {
    if (!payload?.path) {
      throw new Error('Audio path is required')
    }

    return transcribeAudioFile(payload.path, payload.locale)
  })
  ipcMain.handle(
    'seam:transcribe-buffer',
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

      // Check minimum size (50KB for 20-second chunks)
      if (buffer.length < 50000) {
        console.warn('[transcribe-buffer] Audio buffer too small, skipping:', buffer.length, 'bytes')
        throw new Error(`Audio buffer too small: ${buffer.length} bytes (minimum 50KB required)`)
      }

      const mimeType = payload.mimeType ?? 'audio/mp4'
      const extension = extensionFromMime(mimeType)
      const tempPath = join(tmpdir(), `seam-audio-${randomUUID()}.${extension}`)

      console.log('[transcribe-buffer] Writing audio buffer:', {
        size: buffer.length,
        mimeType,
        extension,
        tempPath,
      })

      await fsPromises.writeFile(tempPath, buffer)

      // Verify file was written
      const stats = await fsPromises.stat(tempPath)
      console.log('[transcribe-buffer] File written successfully:', stats.size, 'bytes')

      // Wait a bit to ensure file is fully flushed to disk
      await new Promise(resolve => setTimeout(resolve, 100))

      // Also save a copy for debugging
      const debugPath = join(app.getPath('userData'), `debug-audio-latest.${extension}`)
      await fsPromises.writeFile(debugPath, buffer).catch(() => undefined)
      console.log('[transcribe-buffer] Debug copy saved to:', debugPath)

      try {
        return await transcribeAudioFile(tempPath, payload.locale)
      } catch (error) {
        console.error('[transcribe-buffer] Transcription failed:', error)
        console.error('[transcribe-buffer] File info:', {
          path: tempPath,
          size: stats.size,
          mimeType,
          exists: existsSync(tempPath)
        })
        throw error
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
    // In packaged app, dist files are in the same directory structure
    const indexPath = join(__dirname, '../dist/index.html')
    await mainWindow.loadFile(indexPath)
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
