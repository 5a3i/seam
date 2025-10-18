import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SessionRecord, AgendaRecord, TranscriptionResult, SuggestionRecord } from '../shared/types'

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

        <AgendaPanel sessionId={sessions[0]?.id} />

        <SuggestionPanel sessionId={sessions[0]?.id} />

        <MicrophonePanel sessionId={sessions[0]?.id} />
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

type AgendaPanelProps = {
  sessionId?: string
}

function AgendaPanel({ sessionId }: AgendaPanelProps) {
  const [agendas, setAgendas] = useState<AgendaRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newAgendaTitle, setNewAgendaTitle] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const loadAgendas = useCallback(async () => {
    if (!sessionId) {
      setAgendas([])
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const records = await window.sanma.getAgendas({ sessionId })
      setAgendas(records)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('[sanma] failed to load agendas', err)
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void loadAgendas()
  }, [loadAgendas])

  const handleCreateAgenda = useCallback(async () => {
    if (!sessionId || !newAgendaTitle.trim()) return

    try {
      setIsCreating(true)
      const agenda = await window.sanma.createAgenda({ sessionId, title: newAgendaTitle.trim() })
      setAgendas((prev) => [...prev, agenda])
      setNewAgendaTitle('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('[sanma] failed to create agenda', err)
    } finally {
      setIsCreating(false)
    }
  }, [sessionId, newAgendaTitle])

  const handleDeleteAgenda = useCallback(async (id: string) => {
    try {
      await window.sanma.deleteAgenda({ id })
      setAgendas((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('[sanma] failed to delete agenda', err)
    }
  }, [])

  const handleUpdateAgendaStatus = useCallback(async (id: string, status: string) => {
    try {
      const updated = await window.sanma.updateAgenda({ id, status })
      setAgendas((prev) => prev.map((a) => (a.id === id ? updated : a)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('[sanma] failed to update agenda status', err)
    }
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event

      if (!over || active.id === over.id || !sessionId) return

      const oldIndex = agendas.findIndex((a) => a.id === active.id)
      const newIndex = agendas.findIndex((a) => a.id === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(agendas, oldIndex, newIndex)
      setAgendas(reordered)

      try {
        const agendaIds = reordered.map((a) => a.id)
        await window.sanma.reorderAgendas({ sessionId, agendaIds })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        console.error('[sanma] failed to reorder agendas', err)
        void loadAgendas()
      }
    },
    [agendas, sessionId, loadAgendas],
  )

  const currentAgenda = agendas.find((a) => a.status === 'current')
  const nextAgenda = agendas.find((a) => a.status === 'pending')

  if (!sessionId) {
    return (
      <section className="space-y-3 text-left">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Agenda list</h2>
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-400">
          セッションを選択してください
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4 text-left">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Agenda list</h2>
          {(currentAgenda || nextAgenda) && (
            <div className="mt-2 space-y-1 text-xs">
              {currentAgenda && (
                <p className="text-emerald-300">
                  <span className="text-slate-500">Current:</span> {currentAgenda.title}
                </p>
              )}
              {nextAgenda && (
                <p className="text-sky-300">
                  <span className="text-slate-500">Next:</span> {nextAgenda.title}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newAgendaTitle}
          onChange={(e) => setNewAgendaTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCreateAgenda()
          }}
          placeholder="新しい議題を追加"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
        />
        <button
          type="button"
          onClick={handleCreateAgenda}
          disabled={isCreating || !newAgendaTitle.trim()}
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCreating ? 'Adding…' : 'Add'}
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-300">
          Loading agendas...
        </div>
      ) : agendas.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={agendas.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {agendas.map((agenda) => (
                <SortableAgendaItem
                  key={agenda.id}
                  agenda={agenda}
                  onDelete={handleDeleteAgenda}
                  onUpdateStatus={handleUpdateAgendaStatus}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-400">
          議題がまだありません
        </div>
      )}
    </section>
  )
}

type SortableAgendaItemProps = {
  agenda: AgendaRecord
  onDelete: (id: string) => void
  onUpdateStatus: (id: string, status: string) => void
}

function SortableAgendaItem({ agenda, onDelete, onUpdateStatus }: SortableAgendaItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: agenda.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const statusColors = {
    pending: 'border-slate-800/60 bg-slate-950/40',
    current: 'border-emerald-500/40 bg-emerald-500/10',
    completed: 'border-slate-700/40 bg-slate-800/40 opacity-60',
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border p-4 ${statusColors[agenda.status]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 items-start gap-3">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="mt-1 cursor-grab text-slate-500 hover:text-slate-300 active:cursor-grabbing"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-50">{agenda.title}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => onUpdateStatus(agenda.id, 'pending')}
                disabled={agenda.status === 'pending'}
                className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
              >
                Pending
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus(agenda.id, 'current')}
                disabled={agenda.status === 'current'}
                className="text-xs text-emerald-400 hover:text-emerald-200 disabled:opacity-50"
              >
                Current
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus(agenda.id, 'completed')}
                disabled={agenda.status === 'completed'}
                className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
              >
                Completed
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDelete(agenda.id)}
          className="text-xs font-semibold text-rose-400 hover:text-rose-200"
        >
          Delete
        </button>
      </div>
    </li>
  )
}

type SuggestionPanelProps = {
  sessionId?: string
}

function SuggestionPanel({ sessionId }: SuggestionPanelProps) {
  const [suggestions, setSuggestions] = useState<SuggestionRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSuggestions = useCallback(async () => {
    if (!sessionId) {
      setSuggestions([])
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const records = await window.sanma.getSuggestions({ sessionId, limit: 5 })
      setSuggestions(records)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('[sanma] failed to load suggestions', err)
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void loadSuggestions()
  }, [loadSuggestions])

  const handleGenerateSuggestion = useCallback(async () => {
    if (!sessionId) return

    try {
      setIsGenerating(true)
      setError(null)
      const suggestion = await window.sanma.generateSuggestion({ sessionId })
      setSuggestions((prev) => [suggestion, ...prev.slice(0, 4)])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('[sanma] failed to generate suggestion', err)
    } finally {
      setIsGenerating(false)
    }
  }, [sessionId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'j') {
        event.preventDefault()
        void handleGenerateSuggestion()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleGenerateSuggestion])

  if (!sessionId) {
    return null
  }

  const latestSuggestion = suggestions[0]

  return (
    <section className="space-y-4 text-left">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">AI Suggestions</h2>
          <p className="text-xs text-slate-500">Press ⌘J to generate suggestions</p>
        </div>
        <button
          type="button"
          onClick={handleGenerateSuggestion}
          disabled={isGenerating}
          className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? 'Generating…' : 'Generate (⌘J)'}
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {isGenerating ? (
        <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-4 text-sm text-violet-100">
          AI is generating suggestions...
        </div>
      ) : null}

      {latestSuggestion ? (
        <div className="space-y-3 rounded-xl border border-violet-500/40 bg-violet-500/10 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-violet-300">Summary</p>
            <p className="mt-1 text-sm text-violet-50">{latestSuggestion.summary}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-violet-300">Bridging Question</p>
            <p className="mt-1 text-sm text-violet-50">{latestSuggestion.bridgingQuestion}</p>
          </div>

          {latestSuggestion.followUpQuestions.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-violet-300">Follow-up Questions</p>
              <ul className="mt-1 space-y-1 text-sm text-violet-50">
                {latestSuggestion.followUpQuestions.map((question, index) => (
                  <li key={index}>• {question}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-[11px] text-violet-300">
            Generated at {new Date(latestSuggestion.createdAt).toLocaleTimeString()}
          </p>
        </div>
      ) : null}

      {suggestions.length > 1 ? (
        <details className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-400">
            History ({suggestions.length - 1} previous)
          </summary>
          <ul className="mt-3 space-y-3">
            {suggestions.slice(1).map((suggestion) => (
              <li key={suggestion.id} className="rounded-lg border border-slate-800/40 bg-slate-900/40 p-3">
                <p className="text-xs text-slate-400">{suggestion.summary}</p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {new Date(suggestion.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : isLoading ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-300">
          Loading suggestions...
        </div>
      ) : null}
    </section>
  )
}

type RecorderStatus = 'idle' | 'initializing' | 'recording' | 'denied' | 'unsupported' | 'error'
type TranscriptionStatus = 'idle' | 'pending' | 'error'

type RecordingSummary = {
  url: string
  size: number
  mimeType: string
  createdAt: number
  durationMs: number
}

type MicrophonePanelProps = {
  sessionId?: string
}

function MicrophonePanel({ sessionId }: MicrophonePanelProps) {
  const supportsMediaRecorder = useMemo(() => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
      return false
    }
    return Boolean(navigator.mediaDevices?.getUserMedia) && 'MediaRecorder' in window
  }, [])

  const preferredMimeTypes = useMemo(
    () => [
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/aac',
      'audio/webm;codecs=opus',
      'audio/webm',
    ],
    [],
  )

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const startTimestampRef = useRef<number | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const lastRecordingUrlRef = useRef<string | null>(null)
  const mimeTypeRef = useRef<string>('audio/webm')

  const [status, setStatus] = useState<RecorderStatus>(() =>
    supportsMediaRecorder ? 'idle' : 'unsupported',
  )
  const [elapsedMs, setElapsedMs] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [latestRecording, setLatestRecording] = useState<RecordingSummary | null>(null)
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus>('idle')
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null)
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)

  const cleanup = useCallback(
    (options: { resetElapsed?: boolean } = {}) => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }

      if (recorderRef.current) {
        try {
          if (recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop()
          }
        } catch {
          // recorder might already be stopped
        }
        recorderRef.current = null
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      chunksRef.current = []
      startTimestampRef.current = null

      if (options.resetElapsed !== false) {
        setElapsedMs(0)
      }
    },
    [],
  )

  useEffect(() => {
    return () => {
      cleanup()
      if (lastRecordingUrlRef.current) {
        URL.revokeObjectURL(lastRecordingUrlRef.current)
        lastRecordingUrlRef.current = null
      }
    }
  }, [cleanup])

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      setTranscription(null)
      setTranscriptionError(null)
      setTranscriptionStatus('pending')

      try {
        const arrayBuffer = await blob.arrayBuffer()
        const payload = new Uint8Array(arrayBuffer)
        const result = await window.sanma.transcribeAudio({
          data: payload,
          mimeType: blob.type || mimeTypeRef.current,
        })
        setTranscription(result)
        setTranscriptionStatus('idle')

        // Save transcription to database
        if (sessionId && result.text) {
          try {
            await window.sanma.saveTranscription({
              sessionId,
              text: result.text,
              locale: result.locale,
              confidence: result.confidence,
            })
            console.log('[sanma] Transcription saved to database')
          } catch (err) {
            console.error('[sanma] Failed to save transcription:', err)
          }
        }
      } catch (error) {
        setTranscriptionStatus('error')
        setTranscriptionError(error instanceof Error ? error.message : String(error))
      }
    },
    [sessionId],
  )

  const startRecording = useCallback(async () => {
    if (!supportsMediaRecorder || status === 'recording' || status === 'initializing') {
      return
    }

    setErrorMessage(null)
    setTranscription(null)
    setTranscriptionError(null)
    setTranscriptionStatus('idle')

    try {
      setStatus('initializing')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const supportedType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = supportedType
        ? new MediaRecorder(stream, { mimeType: supportedType })
        : new MediaRecorder(stream)
      recorderRef.current = recorder
      mimeTypeRef.current = recorder.mimeType || supportedType || 'audio/webm'
      chunksRef.current = []
      startTimestampRef.current = Date.now()

      const handleData = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      const handleStop = () => {
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current)
          timerRef.current = null
        }

        const durationMs =
          startTimestampRef.current !== null ? Date.now() - startTimestampRef.current : elapsedMs
        const parts = chunksRef.current.slice()
        const mimeType = recorder.mimeType || mimeTypeRef.current || 'audio/webm'

        recorder.removeEventListener('dataavailable', handleData)
        recorder.removeEventListener('stop', handleStop)

        cleanup({ resetElapsed: true })

        const blob = new Blob(parts, { type: mimeType })
        if (blob.size > 0) {
          if (lastRecordingUrlRef.current) {
            URL.revokeObjectURL(lastRecordingUrlRef.current)
          }
          const url = URL.createObjectURL(blob)
          lastRecordingUrlRef.current = url
          const summary: RecordingSummary = {
            url,
            size: blob.size,
            mimeType: blob.type,
            createdAt: Date.now(),
            durationMs,
          }
          setLatestRecording(summary)
          void transcribeBlob(blob)
        }

        setStatus('idle')
      }

      recorder.addEventListener('dataavailable', handleData)
      recorder.addEventListener('stop', handleStop)

      recorder.start()
      setStatus('recording')
      setElapsedMs(0)
      timerRef.current = window.setInterval(() => {
        setElapsedMs((prev) => prev + 1000)
      }, 1000)
    } catch (err) {
      cleanup()
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        setStatus('denied')
        setErrorMessage('マイクへのアクセスが拒否されました。システム設定を確認してください。')
      } else {
        setStatus('error')
        setErrorMessage(
          err instanceof Error ? err.message : 'マイク初期化中にエラーが発生しました。',
        )
      }
    }
  }, [cleanup, elapsedMs, preferredMimeTypes, status, supportsMediaRecorder, transcribeBlob])

  const stopRecording = useCallback(() => {
    if (status !== 'recording' && status !== 'initializing') {
      return
    }

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    } else {
      cleanup()
      setStatus('idle')
    }
  }, [cleanup, status])

  const resetLatestRecording = useCallback(() => {
    if (lastRecordingUrlRef.current) {
      URL.revokeObjectURL(lastRecordingUrlRef.current)
      lastRecordingUrlRef.current = null
    }
    setLatestRecording(null)
    setTranscription(null)
    setTranscriptionError(null)
    setTranscriptionStatus('idle')
  }, [])

  const formatDuration = (durationMs: number) => {
    const totalSeconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  if (!supportsMediaRecorder) {
    return (
      <section className="space-y-3 text-left">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Microphone capture
        </h2>
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-200">
          この環境では MediaRecorder API が利用できないため、マイク録音のデモは無効化されています。
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4 text-left">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Microphone capture
          </h2>
          <p className="text-xs text-slate-500">
            MediaRecorder でマイク入力を取得し、録音時間を計測します。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={startRecording}
            disabled={status === 'recording' || status === 'initializing'}
            className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'recording' ? 'Recording…' : 'Start Recording'}
          </button>
          <button
            type="button"
            onClick={stopRecording}
            disabled={status !== 'recording' && status !== 'initializing'}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Stop
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-300">
        <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
        <p className="mt-1 font-semibold text-slate-100">{renderStatusLabel(status)}</p>
        {status === 'recording' ? (
          <p className="mt-2 text-2xl font-semibold text-rose-300 tabular-nums">
            {formatDuration(elapsedMs)}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-2 rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {errorMessage}
          </p>
        ) : null}
      </div>

      {latestRecording ? (
        <div className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-950/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Last recording</p>
              <p className="text-sm font-semibold text-slate-100">
                {formatDuration(latestRecording.durationMs)}
              </p>
            </div>
            <button
              type="button"
              onClick={resetLatestRecording}
              className="text-xs font-semibold uppercase tracking-wide text-slate-400 transition hover:text-slate-200"
            >
              Clear
            </button>
          </div>
          <audio controls src={latestRecording.url} className="w-full" />
          <p className="text-[11px] text-slate-500">
            {latestRecording.mimeType} · {(latestRecording.size / 1024).toFixed(1)} KB ·{' '}
            {new Date(latestRecording.createdAt).toLocaleTimeString()}
          </p>
        </div>
      ) : null}

      {transcriptionStatus === 'pending' ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          音声を文字起こししています…
        </div>
      ) : null}

      {transcription ? (
        <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-950/40 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Transcription</p>
          <p className="text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
            {transcription.text}
          </p>
          <p className="text-[11px] text-slate-500">
            Locale: {transcription.locale} · Confidence: {(transcription.confidence * 100).toFixed(1)}%
          </p>
          {transcription.segments.length > 0 ? (
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer select-none text-slate-300">Segments</summary>
              <ul className="mt-2 space-y-1">
                {transcription.segments.slice(0, 5).map((segment, index) => (
                  <li key={`${segment.timestamp}-${index}`} className="rounded border border-slate-800/60 bg-slate-900/40 p-2">
                    <span className="font-semibold text-slate-200">{segment.substring}</span>
                    <span className="ml-2 text-[10px] text-slate-500">
                      {segment.timestamp.toFixed(2)}s · conf {(segment.confidence * 100).toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {transcriptionError ? (
        <div className="rounded-xl border border-rose-400/50 bg-rose-500/10 p-4 text-sm text-rose-200">
          {transcriptionError}
        </div>
      ) : null}
    </section>
  )
}

function renderStatusLabel(status: RecorderStatus) {
  switch (status) {
    case 'idle':
      return '待機中'
    case 'initializing':
      return 'マイク初期化中…'
    case 'recording':
      return '録音中'
    case 'denied':
      return 'マイク権限が拒否されました'
    case 'unsupported':
      return '未対応の環境です'
    case 'error':
      return 'エラーが発生しました'
    default:
      return '状態不明'
  }
}
