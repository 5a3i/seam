import { app, BrowserWindow, ipcMain } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { SessionRecord } from './shared/types'
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
