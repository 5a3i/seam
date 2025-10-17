import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SessionRecord } from '../shared/types'

const fallbackVersions = {
  node: '-',
  chrome: '-',
  electron: '-',
} as const

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export function App() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [dbPath, setDbPath] = useState<string | null>(null)
  const [status, setStatus] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const system = useMemo(() => {
    try {
      return {
        ping: window.sanma.ping(),
        platform: window.sanma.getPlatform(),
        versions: window.sanma.getVersions(),
      }
    } catch {
      return {
        ping: 'unavailable',
        platform: 'unknown',
        versions: fallbackVersions,
      }
    }
  }, [])

  const { ping, platform, versions } = system

  const loadSessions = useCallback(async () => {
    try {
      setStatus('loading')
      setError(null)
      const [records, resolvedPath] = await Promise.all([
        window.sanma.getSessions(),
        window.sanma.getDatabasePath(),
      ])
      setSessions(records)
      setDbPath(resolvedPath)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
      console.error('[sanma] failed to load sessions', err)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const handleCreateSession = useCallback(async () => {
    try {
      setIsCreating(true)
      const timestamp = new Date()
      const title = `追加セッション ${timestamp.toLocaleTimeString()}`
      const session = await window.sanma.createSession({ title })
      setSessions((prev) => [session, ...prev])
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
      console.error('[sanma] failed to create session', err)
    } finally {
      setIsCreating(false)
    }
  }, [])

  const handleRefresh = useCallback(() => {
    void loadSessions()
  }, [loadSessions])

  return (
    <main className="app">
      <div className="w-full max-w-2xl space-y-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-xl shadow-black/40 backdrop-blur">
        <header className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
            Ready
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-50">Sanma Native DB</h1>
          <p className="text-sm leading-relaxed text-slate-300">
            better-sqlite3 をメインプロセスで開き、IPC 経由で React からレコードを取得・追加できるようになりました。
          </p>
        </header>

        <section className="grid gap-4 text-left sm:grid-cols-3">
          <StatCard label="Platform" value={platform} />
          <StatCard label="Electron" value={versions.electron ?? fallbackVersions.electron} />
          <StatCard label="Ping" value={ping} />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Runtime versions
          </h2>
          <ul className="grid gap-2 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 text-sm text-slate-300 sm:grid-cols-3">
            <li className="flex flex-col gap-1 rounded-lg bg-slate-900/60 p-3">
              <span className="text-xs uppercase tracking-wide text-slate-500">Node.js</span>
              <span className="font-medium text-slate-100">{versions.node}</span>
            </li>
            <li className="flex flex-col gap-1 rounded-lg bg-slate-900/60 p-3">
              <span className="text-xs uppercase tracking-wide text-slate-500">Chromium</span>
              <span className="font-medium text-slate-100">{versions.chrome}</span>
            </li>
            <li className="flex flex-col gap-1 rounded-lg bg-slate-900/60 p-3">
              <span className="text-xs uppercase tracking-wide text-slate-500">Electron</span>
              <span className="font-medium text-slate-100">
                {versions.electron ?? fallbackVersions.electron}
              </span>
            </li>
          </ul>
        </section>

        <section className="space-y-4 text-left">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Session table
              </h2>
              <p className="text-xs text-slate-500">
                {status === 'ready' && sessions.length > 0
                  ? `${sessions.length} record${sessions.length === 1 ? '' : 's'} saved`
                  : status === 'loading'
                    ? 'Loading better-sqlite3...'
                    : status === 'error'
                      ? 'Failed to load database'
                      : 'Initializing...'}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={status === 'loading'}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={handleCreateSession}
                disabled={isCreating}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreating ? 'Adding…' : 'Add Session'}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : sessions.length > 0 ? (
            <ul className="grid gap-3">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4"
                >
                  <p className="text-sm font-semibold text-slate-50">{session.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(session.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          ) : status === 'loading' ? (
            <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-300">
              Opening database...
            </div>
          ) : null}

          {dbPath ? (
            <p className="text-[11px] text-slate-500">
              DB located at:
              <br />
              <span className="font-mono text-slate-400 break-all">{dbPath}</span>
            </p>
          ) : null}
        </section>
      </div>
    </main>
  )
}

type StatCardProps = {
  label: string
  value: string
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  )
}
