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

export function App() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [showSessionSetup, setShowSessionSetup] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'setup' | 'detail'>('list')

  const loadSessions = useCallback(async () => {
    try {
      const records = await window.sanma.getSessions()
      setSessions(records)
    } catch (err) {
      console.error('[sanma] failed to load sessions', err)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const handleOpenSessionSetup = useCallback(() => {
    setView('setup')
    setShowSessionSetup(true)
  }, [])

  const handleCreateSession = useCallback(async (title: string, duration: number, agendaItems: string[]) => {
    try {
      setIsCreating(true)
      const session = await window.sanma.createSession({ title, duration, agendaItems })
      // Start the session immediately
      const startedSession = await window.sanma.startSession({ sessionId: session.id })
      setSessions((prev) => [startedSession, ...prev.filter(s => s.id !== session.id)])
      setSelectedSessionId(startedSession.id)
      setView('detail')
      setShowSessionSetup(false)
    } catch (err) {
      console.error('[sanma] failed to create session', err)
    } finally {
      setIsCreating(false)
    }
  }, [])

  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId)
    setView('detail')
  }, [])

  const handleBackToList = useCallback(() => {
    setView('list')
    setSelectedSessionId(null)
    void loadSessions()
  }, [loadSessions])

  // Show session setup modal
  if (view === 'setup') {
    return (
      <SessionSetupModal
        onClose={() => {
          setShowSessionSetup(false)
          setView('list')
        }}
        onCreate={handleCreateSession}
        isCreating={isCreating}
      />
    )
  }

  // Show session list
  if (view === 'list') {
    return (
      <SessionListScreen
        sessions={sessions}
        onSelectSession={handleSelectSession}
        onCreateNew={handleOpenSessionSetup}
      />
    )
  }

  // Show session detail
  const selectedSession = sessions.find((s) => s.id === selectedSessionId)
  if (!selectedSession) {
    return (
      <SessionListScreen
        sessions={sessions}
        onSelectSession={handleSelectSession}
        onCreateNew={handleOpenSessionSetup}
      />
    )
  }

  return (
    <main className="flex h-screen flex-col bg-slate-950">
      {/* Top Bar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-3">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleBackToList}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
          >
            ← 一覧
          </button>
          <h1 className="text-lg font-semibold text-slate-100">{selectedSession.title}</h1>
          <span className="text-sm text-slate-400">
            {selectedSession.startedAt && new Date(selectedSession.startedAt).toLocaleString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (selectedSession.id) {
              await window.sanma.endSession({ sessionId: selectedSession.id })
              handleBackToList()
            }
          }}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
        >
          セッション終了
        </button>
      </header>

      {/* Main 3-Column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Agenda */}
        <aside className="w-80 border-r border-slate-800 bg-slate-900/50 overflow-y-auto">
          <AgendaPanel
            session={selectedSession}
            onTriggerAISummary={() => {
              window.dispatchEvent(new CustomEvent('trigger-ai-summary'))
            }}
          />
        </aside>

        {/* Center - Live Transcription */}
        <main className="flex-1 overflow-y-auto bg-slate-950/30">
          <MicrophonePanel sessionId={selectedSession.id} />
        </main>

        {/* Right Sidebar - AI Suggestions */}
        <aside className="w-96 border-l border-slate-800 bg-slate-900/50 overflow-y-auto">
          <SuggestionPanel sessionId={selectedSession.id} />
        </aside>
      </div>
    </main>
  )
}

type SessionListScreenProps = {
  sessions: SessionRecord[]
  onSelectSession: (sessionId: string) => void
  onCreateNew: () => void
}

function SessionListScreen({ sessions, onSelectSession, onCreateNew }: SessionListScreenProps) {
  return (
    <main className="flex h-screen flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 px-8 py-6 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">さんま - セッション一覧</h1>
            <p className="mt-1 text-sm text-gray-600">
              {sessions.length > 0 ? `${sessions.length}件のセッション` : 'セッションがまだありません'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateNew}
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            + 新規セッション
          </button>
        </div>
      </header>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto p-8">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-200">
                <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-medium text-gray-900">セッションがありません</h3>
              <p className="mb-6 text-sm text-gray-500">
                新規セッションボタンをクリックして、最初のディスカッションを開始しましょう
              </p>
              <button
                type="button"
                onClick={onCreateNew}
                className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                + 新規セッション
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => {
              const isActive = session.startedAt && !session.endedAt
              const duration = session.duration ? `${session.duration}分` : ''
              const startedDate = session.startedAt
                ? new Date(session.startedAt).toLocaleString('ja-JP', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : new Date(session.createdAt).toLocaleString('ja-JP', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })

              return (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className="group relative rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
                >
                  {isActive && (
                    <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                      進行中
                    </div>
                  )}

                  <h3 className="mb-2 text-base font-semibold text-gray-900 group-hover:text-blue-600">
                    {session.title}
                  </h3>

                  <div className="space-y-1.5 text-xs text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {startedDate}
                    </div>
                    {duration && (
                      <div className="flex items-center gap-1.5">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        {duration}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 text-xs font-medium text-blue-600 opacity-0 transition group-hover:opacity-100">
                    詳細を見る →
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

type AgendaPanelProps = {
  session?: SessionRecord
  onTriggerAISummary?: () => void
}

function AgendaPanel({ session, onTriggerAISummary }: AgendaPanelProps) {
  const sessionId = session?.id
  const [agendas, setAgendas] = useState<AgendaRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadAgendas = useCallback(async () => {
    if (!sessionId) {
      setAgendas([])
      return
    }

    try {
      setIsLoading(true)
      const records = await window.sanma.getAgendas({ sessionId })
      setAgendas(records)
    } catch (err) {
      console.error('[sanma] failed to load agendas', err)
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void loadAgendas()
  }, [loadAgendas])

  if (!sessionId) {
    return (
      <div className="p-6">
        <h2 className="text-sm font-medium text-slate-400">議題リスト</h2>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
          セッションを選択してください
        </div>
      </div>
    )
  }

  const currentAgenda = agendas.find((a) => a.status === 'current')

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-sm font-medium text-slate-400">議題リスト</h2>

      {isLoading ? (
        <div className="text-sm text-slate-500">読み込み中...</div>
      ) : agendas.length > 0 ? (
        <ul className="space-y-2">
          {agendas.map((agenda, index) => {
            const isCurrent = currentAgenda?.id === agenda.id
            return (
              <li
                key={agenda.id}
                className={`rounded-lg px-4 py-3 text-sm transition ${
                  isCurrent
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-slate-800/40 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono">#{index + 1}</span>
                  {isCurrent && <span className="text-xs">(current)</span>}
                  <span className="flex-1">{agenda.title}</span>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
          議題がありません
        </div>
      )}
    </div>
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

    const handleTriggerEvent = () => {
      void handleGenerateSuggestion()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('trigger-ai-summary', handleTriggerEvent)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('trigger-ai-summary', handleTriggerEvent)
    }
  }, [handleGenerateSuggestion])

  if (!sessionId) {
    return null
  }

  const latestSuggestion = suggestions[0]

  return (
    <section className="p-6 space-y-6">
      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Generating indicator */}
      {isGenerating && (
        <div className="flex items-center gap-3 rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          <span className="text-sm text-violet-100">AI生成中...</span>
        </div>
      )}

      {/* Suggestion display */}
      {latestSuggestion ? (
        <div className="space-y-4">
          {/* Summary section */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-400">要約</h3>
            <div className="rounded-lg bg-slate-800/40 px-4 py-3">
              <p className="text-sm leading-relaxed text-slate-200">{latestSuggestion.summary}</p>
            </div>
          </div>

          {/* Bridging question section */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-400">繋ぎの一言</h3>
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-4 py-3">
              <p className="text-sm leading-relaxed text-yellow-200">{latestSuggestion.bridgingQuestion}</p>
            </div>
          </div>

          {/* Follow-up questions section */}
          {latestSuggestion.followUpQuestions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-400">追加質問</h3>
              <div className="space-y-2">
                {latestSuggestion.followUpQuestions.map((question, index) => (
                  <div key={index} className="flex items-start gap-3 rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3">
                    <span className="shrink-0 rounded bg-green-600 px-2 py-0.5 text-xs font-semibold text-white">
                      Q{index + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-green-200">{question}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generation timestamp */}
          <p className="text-xs text-slate-500">
            生成時刻: {new Date(latestSuggestion.createdAt).toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
        </div>
      ) : !isGenerating && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-400 mb-4">AI提案はまだありません</p>
          <button
            type="button"
            onClick={handleGenerateSuggestion}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700"
          >
            提案を生成
          </button>
        </div>
      )}
    </section>
  )
}

type RecorderStatus = 'idle' | 'initializing' | 'recording' | 'denied' | 'unsupported' | 'error'
type TranscriptionStatus = 'idle' | 'pending' | 'error'

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
  const transcriptionQueueRef = useRef<boolean>(false)
  const continuousCycleTimerRef = useRef<number | null>(null)
  const continuousModeRef = useRef<boolean>(false)

  const [status, setStatus] = useState<RecorderStatus>(() =>
    supportsMediaRecorder ? 'idle' : 'unsupported',
  )
  const [elapsedMs, setElapsedMs] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus>('idle')
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null)
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)
  const [continuousMode, setContinuousMode] = useState(false)
  const [chunkCount, setChunkCount] = useState(0)
  const [summary, setSummary] = useState<string>('')
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState<number | null>(null)
  const [isSummaryGenerating, setIsSummaryGenerating] = useState(false)
  const summaryTimerRef = useRef<number | null>(null)

  const generateAndUpdateSummary = useCallback(async () => {
    if (!sessionId || isSummaryGenerating) return

    try {
      setIsSummaryGenerating(true)
      const newSummary = await window.sanma.generateSummary({ sessionId })
      setSummary(newSummary)
      setSummaryUpdatedAt(Date.now())
    } catch (error) {
      console.error('[sanma] Failed to generate summary:', error)
    } finally {
      setIsSummaryGenerating(false)
    }
  }, [sessionId, isSummaryGenerating])

  const cleanup = useCallback(
    (options: { resetElapsed?: boolean; keepStream?: boolean } = {}) => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }

      if (continuousCycleTimerRef.current !== null) {
        window.clearTimeout(continuousCycleTimerRef.current)
        continuousCycleTimerRef.current = null
      }

      if (summaryTimerRef.current !== null) {
        window.clearInterval(summaryTimerRef.current)
        summaryTimerRef.current = null
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

      if (!options.keepStream && streamRef.current) {
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
    async (blob: Blob, options: { isChunk?: boolean } = {}) => {
      if (!options.isChunk) {
        setTranscription(null)
        setTranscriptionError(null)
        setTranscriptionStatus('pending')
      }

      try {
        const arrayBuffer = await blob.arrayBuffer()
        const payload = new Uint8Array(arrayBuffer)
        const result = await window.sanma.transcribeAudio({
          data: payload,
          mimeType: blob.type || mimeTypeRef.current,
        })

        if (!options.isChunk) {
          setTranscription(result)
          setTranscriptionStatus('idle')
        }

        // Save transcription to database
        if (sessionId && result.text) {
          try {
            await window.sanma.saveTranscription({
              sessionId,
              text: result.text,
              locale: result.locale,
              confidence: result.confidence,
            })
            console.log('[sanma] Transcription saved to database', options.isChunk ? '(chunk)' : '')
          } catch (err) {
            console.error('[sanma] Failed to save transcription:', err)
          }
        }
      } catch (error) {
        if (!options.isChunk) {
          setTranscriptionStatus('error')
          setTranscriptionError(error instanceof Error ? error.message : String(error))
        } else {
          console.error('[sanma] Chunk transcription failed:', error)
        }
      }
    },
    [sessionId],
  )

  const transcribeChunk = useCallback(
    async (blob: Blob) => {
      if (transcriptionQueueRef.current) {
        console.log('[sanma] Transcription already in progress, skipping chunk')
        return
      }

      try {
        transcriptionQueueRef.current = true
        await transcribeBlob(blob, { isChunk: true })
      } finally {
        transcriptionQueueRef.current = false
      }
    },
    [transcribeBlob],
  )

  const startContinuousRecordingCycle = useCallback(async () => {
    if (!streamRef.current) {
      console.error('[sanma] No stream available for continuous recording')
      return
    }

    console.log('[sanma] Starting new continuous recording cycle...')

    const stream = streamRef.current
    const supportedType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type))
    const recorder = supportedType
      ? new MediaRecorder(stream, { mimeType: supportedType })
      : new MediaRecorder(stream)

    recorderRef.current = recorder
    mimeTypeRef.current = recorder.mimeType || supportedType || 'audio/webm'
    chunksRef.current = []

    const handleData = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        console.log(`[sanma] Received data chunk: ${(event.data.size / 1024).toFixed(1)}KB`)
        chunksRef.current.push(event.data)
      }
    }

    const handleStop = () => {
      console.log('[sanma] Recorder stopped, processing chunks...')
      const parts = chunksRef.current.slice()
      const mimeType = recorder.mimeType || mimeTypeRef.current || 'audio/webm'

      recorder.removeEventListener('dataavailable', handleData)
      recorder.removeEventListener('stop', handleStop)

      const blob = new Blob(parts, { type: mimeType })
      console.log(`[sanma] Blob created: ${(blob.size / 1024).toFixed(1)}KB, continuousMode: ${continuousModeRef.current}`)

      // Minimum 25KB for 10-second chunks
      if (blob.size >= 25000) {
        console.log(`[sanma] Continuous cycle complete, size: ${(blob.size / 1024).toFixed(1)}KB`)
        setChunkCount((prev) => prev + 1)
        void transcribeChunk(blob)
      } else {
        console.log(`[sanma] Skipping small recording: ${(blob.size / 1024).toFixed(1)}KB`)
      }

      // Start next cycle if still in continuous mode
      if (continuousModeRef.current && streamRef.current) {
        console.log('[sanma] Scheduling next cycle in 500ms...')
        continuousCycleTimerRef.current = window.setTimeout(() => {
          void startContinuousRecordingCycle()
        }, 500) // Small delay between cycles
      } else {
        console.log('[sanma] Not starting next cycle. continuousMode:', continuousModeRef.current, 'stream:', !!streamRef.current)
      }
    }

    recorder.addEventListener('dataavailable', handleData)
    recorder.addEventListener('stop', handleStop)

    recorder.start()
    console.log('[sanma] Recorder started, will stop in 10 seconds')

    // Stop this recording after 10 seconds
    continuousCycleTimerRef.current = window.setTimeout(() => {
      console.log('[sanma] 10 seconds elapsed, stopping recorder...')
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop()
      } else {
        console.log('[sanma] Recorder not in recording state:', recorderRef.current?.state)
      }
    }, 10000)
  }, [preferredMimeTypes, transcribeChunk])

  const startRecording = useCallback(async (isContinuous = false) => {
    if (!supportsMediaRecorder || status === 'recording' || status === 'initializing') {
      return
    }

    setErrorMessage(null)
    setTranscription(null)
    setTranscriptionError(null)
    setTranscriptionStatus('idle')
    setChunkCount(0)

    try {
      setStatus('initializing')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      if (isContinuous) {
        // Continuous mode: start the cycle
        setContinuousMode(true)
        continuousModeRef.current = true
        setStatus('recording')
        setElapsedMs(0)
        timerRef.current = window.setInterval(() => {
          setElapsedMs((prev) => prev + 1000)
        }, 1000)

        // Start summary generation timer (every 30 seconds)
        summaryTimerRef.current = window.setInterval(() => {
          void generateAndUpdateSummary()
        }, 30000)

        // Generate initial summary immediately
        void generateAndUpdateSummary()

        // Start the first cycle
        void startContinuousRecordingCycle()
      } else {
        // Manual mode: traditional one-shot recording
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
            // Recording summary removed - not used in new UI
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
      }
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
  }, [cleanup, elapsedMs, preferredMimeTypes, status, supportsMediaRecorder, transcribeBlob, startContinuousRecordingCycle, generateAndUpdateSummary])

  const stopRecording = useCallback(() => {
    if (status !== 'recording' && status !== 'initializing') {
      return
    }

    setContinuousMode(false)
    continuousModeRef.current = false

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    } else {
      cleanup()
      setStatus('idle')
    }
  }, [cleanup, status])

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
    <section className="flex h-full flex-col p-6">
      {/* Header with recording status */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-medium text-slate-100">現在の議論</h2>
        {status === 'recording' && continuousMode && (
          <div className="flex items-center gap-2 rounded-full bg-red-500/20 border border-red-500/50 px-3 py-1.5">
            <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs text-red-200 font-medium">録音中</span>
          </div>
        )}
      </div>

      {/* Error messages */}
      {errorMessage && (
        <div className="mb-4 rounded-lg border border-rose-400/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      )}

      {/* Transcription display */}
      <div className="flex-1 space-y-6 overflow-y-auto">
        {/* Current Speech Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            現在の発言
          </div>

          {transcription && (
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 px-4 py-3 space-y-2">
              <div className="text-xs text-blue-300">
                {new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <div className="text-sm leading-relaxed text-slate-200">{transcription.text}</div>
            </div>
          )}

          {transcriptionStatus === 'pending' && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-800/40 px-4 py-3 text-sm text-slate-400">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
              <span>文字起こし中...</span>
            </div>
          )}

          {transcriptionError && (
            <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {transcriptionError}
            </div>
          )}
        </div>

        {/* Summary Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            これまでのサマリ
            {isSummaryGenerating && (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-green-400 border-t-transparent ml-2" />
            )}
          </div>

          <div className="rounded-lg bg-slate-800/40 px-4 py-3">
            {summary ? (
              <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">{summary}</p>
            ) : (
              <p className="text-sm leading-relaxed text-slate-400 italic">
                {isSummaryGenerating ? 'サマリを生成中...' : '録音を開始すると、30秒ごとに会話内容がサマライズされます。'}
              </p>
            )}
          </div>

          {summaryUpdatedAt && (
            <div className="text-xs text-slate-500">
              最終更新: {new Date(summaryUpdatedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="mt-6 flex gap-3">
        {status === 'recording' && continuousMode ? (
          <button
            type="button"
            onClick={stopRecording}
            className="flex-1 rounded-lg bg-red-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-red-700"
          >
            録音停止
          </button>
        ) : (
          <button
            type="button"
            onClick={() => startRecording(true)}
            disabled={status === 'recording' || status === 'initializing'}
            className="flex-1 rounded-lg bg-red-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'initializing' ? '初期化中...' : '録音開始'}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('trigger-ai-summary'))
          }}
          disabled={!sessionId}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          提案する 🎨
        </button>
      </div>
    </section>
  )
}

type SessionSetupModalProps = {
  onClose: () => void
  onCreate: (title: string, duration: number, agendaItems: string[]) => void
  isCreating: boolean
}

function SessionSetupModal({ onClose, onCreate, isCreating }: SessionSetupModalProps) {
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(60) // Default 60 minutes
  const [agendaItems, setAgendaItems] = useState<string[]>([])
  const [newAgendaItem, setNewAgendaItem] = useState('')

  const handleAddAgenda = () => {
    if (newAgendaItem.trim()) {
      setAgendaItems((prev) => [...prev, newAgendaItem.trim()])
      setNewAgendaItem('')
    }
  }

  const handleRemoveAgenda = (index: number) => {
    setAgendaItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    if (title.trim() && agendaItems.length > 0) {
      onCreate(title.trim(), duration, agendaItems)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 backdrop-blur-sm">
      <div className="w-full max-w-2xl space-y-8 p-12">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">さんま - セッション設定</h1>
          <p className="text-sm text-gray-600">議論を始める前に、セッションタイトルと議題を設定してください</p>
        </div>

        {/* Session Title */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">セッションタイトル</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: プロダクト開発ディスカッション 2025-10"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* Agenda List */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">議題リスト</label>

          {/* Agenda Items */}
          {agendaItems.length > 0 && (
            <div className="space-y-2">
              {agendaItems.map((item, index) => (
                <div key={index} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5">
                  <span className="flex-1 text-sm text-gray-900">{item}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAgenda(index)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add New Agenda Item */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newAgendaItem}
              onChange={(e) => setNewAgendaItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddAgenda()
                }
              }}
              placeholder="新しい議題を入力..."
              className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              type="button"
              onClick={handleAddAgenda}
              disabled={!newAgendaItem.trim()}
              className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + 追加
            </button>
          </div>

          {/* Empty State */}
          {agendaItems.length === 0 && (
            <p className="text-center py-8 text-sm text-gray-400">議題を追加してください</p>
          )}
        </div>

        {/* Start Button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isCreating || !title.trim() || agendaItems.length === 0}
          className="w-full rounded-lg bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isCreating ? 'セッションを作成中...' : 'セッションを開始'}
        </button>
      </div>
    </div>
  )
}

