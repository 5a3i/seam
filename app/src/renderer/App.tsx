import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  SessionRecord,
  AgendaRecord,
  TranscriptionResult,
  SuggestionRecord,
  SummaryRecord,
  ConfirmationRecord,
  AIProvider,
} from '../shared/types'

export function App() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'setup' | 'detail' | 'settings'>('list')
  const [isStartingSession, setIsStartingSession] = useState(false)

  const loadSessions = useCallback(async () => {
    try {
      const records = await window.seam.getSessions()
      setSessions(records)
    } catch (err) {
      console.error('[seam] failed to load sessions', err)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const handleOpenSessionSetup = useCallback(() => {
    setView('setup')
  }, [])

  const handleOpenSettings = useCallback(() => {
    setView('settings')
  }, [])

  const handleCreateSession = useCallback(async (title: string, duration: number, agendaItems: string[], aiProvider: AIProvider) => {
    try {
      setIsCreating(true)
      const session = await window.seam.createSession({ title, duration, agendaItems, aiProvider })
      setSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)])
      setSelectedSessionId(session.id)
      setView('detail')
    } catch (err) {
      console.error('[seam] failed to create session', err)
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

  const handleStartSession = useCallback(async (sessionId: string) => {
    try {
      setIsStartingSession(true)
      const started = await window.seam.startSession({ sessionId })
      setSessions((prev) =>
        prev.map((session) => (session.id === sessionId ? started : session))
      )
    } catch (err) {
      console.error('[seam] failed to start session', err)
    } finally {
      setIsStartingSession(false)
    }
  }, [])

  // Show settings screen
  if (view === 'settings') {
    return (
      <SettingsScreen
        onClose={() => setView('list')}
      />
    )
  }

  // Show session setup modal
  if (view === 'setup') {
    return (
      <SessionSetupModal
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
        onOpenSettings={handleOpenSettings}
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
        onOpenSettings={handleOpenSettings}
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
          {selectedSession.aiProvider && (
            <span className="rounded-full bg-blue-600/20 px-3 py-1 text-xs font-medium text-blue-400 border border-blue-500/30">
              {selectedSession.aiProvider === 'gemini' && '🤖 Gemini 2.5 Flash'}
              {selectedSession.aiProvider === 'claude' && '🤖 Claude Sonnet 4'}
              {selectedSession.aiProvider === 'chatgpt' && '🤖 GPT-4o'}
            </span>
          )}
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
          <SessionTimer
            startedAt={selectedSession.startedAt}
            endedAt={selectedSession.endedAt}
            durationMinutes={selectedSession.duration}
          />
        </div>
        <div className="flex items-center gap-3">
          {!selectedSession.startedAt && !selectedSession.endedAt && (
            <button
              type="button"
              onClick={() => {
                if (selectedSession.id) {
                  void handleStartSession(selectedSession.id)
                }
              }}
              disabled={isStartingSession}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isStartingSession ? '開始中...' : 'セッション開始'}
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              if (selectedSession.id) {
                await window.seam.endSession({ sessionId: selectedSession.id })
                handleBackToList()
              }
            }}
            disabled={!selectedSession.startedAt || !!selectedSession.endedAt}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            セッション終了
          </button>
        </div>
      </header>

      {/* Main 3-Column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Agenda */}
        <aside className="w-80 border-r border-slate-800 bg-slate-900/50">
          <div className="h-full overflow-y-auto">
            <AgendaPanel session={selectedSession} />
            <ConfirmationPanel sessionId={selectedSession.id} />
          </div>
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
  onOpenSettings: () => void
}

type SessionTimerProps = {
  startedAt?: number
  endedAt?: number
  durationMinutes?: number
}

function SessionTimer({ startedAt, endedAt, durationMinutes }: SessionTimerProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt || !durationMinutes) return
    if (endedAt) {
      setNow(endedAt)
      return
    }

    const id = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(id)
    }
  }, [startedAt, durationMinutes, endedAt])

  if (!startedAt || !durationMinutes || durationMinutes <= 0) {
    if (!durationMinutes || durationMinutes <= 0) {
      return null
    }

    return (
      <div className="flex flex-col items-start gap-1 text-xs font-medium">
        <div className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-slate-200">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6v6l3 3m5-3a8 8 0 11-16 0 8 8 0 0116 0z"
            />
          </svg>
          <span>未開始</span>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-slate-500">
          全体 {durationMinutes}分
        </span>
      </div>
    )
  }

  const durationMs = durationMinutes * 60_000
  const referenceTime = endedAt ?? now
  const endTime = startedAt + durationMs

  const elapsedMs = Math.max(0, referenceTime - startedAt)
  const remainingMs = endTime - referenceTime
  const isOver = remainingMs < 0
  const absRemaining = Math.abs(remainingMs)
  const totalSeconds = Math.floor(absRemaining / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  const progressRatio = durationMs === 0 ? 0 : Math.min(1, Math.max(0, elapsedMs / durationMs))
  const barWidth = isOver ? 100 : progressRatio * 100

  const statusLabel = endedAt
    ? isOver
      ? '終了 (超過)'
      : '終了 (残り)'
    : isOver
      ? '超過'
      : '残り'

  return (
    <div className="flex flex-col items-start gap-1 text-xs font-medium">
      <div
        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
          isOver
            ? 'border-rose-500 bg-rose-500/10 text-rose-100'
            : 'border-emerald-500 bg-emerald-500/10 text-emerald-100'
        }`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 6v6l3 3m5-3a8 8 0 11-16 0 8 8 0 0116 0z"
          />
        </svg>
        <span>{statusLabel}</span>
        <span className="text-sm font-semibold tracking-widest text-white">{formatted}</span>
      </div>
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`${isOver ? 'bg-rose-500' : 'bg-emerald-500'} h-full transition-[width] duration-500`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <span className="text-[10px] uppercase tracking-wide text-slate-500">
        全体 {durationMinutes}分
      </span>
    </div>
  )
}

type ConfirmationPanelProps = {
  sessionId?: string
}

function ConfirmationPanel({ sessionId }: ConfirmationPanelProps) {
  const [confirmations, setConfirmations] = useState<ConfirmationRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [editSummaries, setEditSummaries] = useState<Record<string, string>>({})
  const [isSavingSummary, setIsSavingSummary] = useState<Record<string, boolean>>({})
  const [isAutoChecking, setIsAutoChecking] = useState(false)
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({})
  const autoCheckTimerRef = useRef<number | null>(null)

  const loadConfirmations = useCallback(async () => {
    if (!sessionId) {
      setConfirmations([])
      setEditSummaries({})
      return
    }

    try {
      setIsLoading(true)
      const records = await window.seam.getConfirmations({ sessionId })
      setConfirmations(records)
      setEditSummaries(
        records.reduce<Record<string, string>>((acc, record) => {
          acc[record.id] = record.summary ?? ''
          return acc
        }, {})
      )
    } catch (error) {
      console.error('[seam] Failed to load confirmations:', error)
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void loadConfirmations()
  }, [loadConfirmations])

  const handleAdd = async () => {
    if (!sessionId || !newTitle.trim()) return
    try {
      const record = await window.seam.createConfirmation({ sessionId, title: newTitle.trim() })
      setConfirmations((prev) => [record, ...prev])
      setEditSummaries((prev) => ({ ...prev, [record.id]: '' }))
      setNewTitle('')
    } catch (error) {
      console.error('[seam] Failed to create confirmation item:', error)
    }
  }

  const handleToggleStatus = async (item: ConfirmationRecord, checked: boolean) => {
    try {
      const updated = await window.seam.updateConfirmation({
        id: item.id,
        status: checked ? 'completed' : 'pending',
      })
      setConfirmations((prev) => prev.map((record) => (record.id === updated.id ? updated : record)))
      setEditSummaries((prev) => ({ ...prev, [updated.id]: updated.summary ?? '' }))
    } catch (error) {
      console.error('[seam] Failed to update confirmation status:', error)
    }
  }

  const handleSummaryChange = (id: string, value: string) => {
    setEditSummaries((prev) => ({ ...prev, [id]: value }))
  }

  const handleSummarySave = async (item: ConfirmationRecord) => {
    const summary = editSummaries[item.id] ?? ''
    try {
      setIsSavingSummary((prev) => ({ ...prev, [item.id]: true }))
      const updated = await window.seam.updateConfirmation({ id: item.id, summary })
      setConfirmations((prev) => prev.map((record) => (record.id === updated.id ? updated : record)))
      setEditSummaries((prev) => ({ ...prev, [item.id]: updated.summary ?? '' }))
    } catch (error) {
      console.error('[seam] Failed to save confirmation summary:', error)
    } finally {
      setIsSavingSummary((prev) => ({ ...prev, [item.id]: false }))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await window.seam.deleteConfirmation({ id })
      setConfirmations((prev) => prev.filter((record) => record.id !== id))
      setEditSummaries((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setExpandedSummaries((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    } catch (error) {
      console.error('[seam] Failed to delete confirmation item:', error)
    }
  }

  const toggleSummaryExpanded = (id: string) => {
    setExpandedSummaries((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const checkConfirmationsAuto = useCallback(async () => {
    if (!sessionId || isAutoChecking) return

    const pending = confirmations.filter((item) => item.status === 'pending')
    if (pending.length === 0) return

    try {
      setIsAutoChecking(true)
      console.log('[ConfirmationPanel] Running auto-check...')
      const results = await window.seam.checkConfirmations({ sessionId, secondsAgo: 180 })

      // Update confirmations that should be checked
      for (const result of results) {
        if (result.shouldCheck) {
          console.log(`[ConfirmationPanel] Auto-checking: ${result.id} - ${result.reason}`)

          // Build summary with reason and excerpt
          let summaryText = `【判定理由】\n${result.reason}`
          if (result.excerpt && result.excerpt.trim().length > 0) {
            summaryText += `\n\n【該当する会話】\n${result.excerpt}`
          }

          const updated = await window.seam.updateConfirmation({
            id: result.id,
            status: 'completed',
            summary: summaryText,
          })
          setConfirmations((prev) => prev.map((record) => (record.id === updated.id ? updated : record)))
          setEditSummaries((prev) => ({ ...prev, [updated.id]: updated.summary ?? '' }))
        }
      }
    } catch (error) {
      console.error('[ConfirmationPanel] Auto-check failed:', error)
    } finally {
      setIsAutoChecking(false)
    }
  }, [sessionId, isAutoChecking, confirmations])

  // Start auto-check timer when recording starts
  useEffect(() => {
    return () => {
      if (autoCheckTimerRef.current !== null) {
        window.clearInterval(autoCheckTimerRef.current)
        autoCheckTimerRef.current = null
      }
    }
  }, [])

  // Expose start/stop auto-check functions via custom events
  useEffect(() => {
    const handleStartAutoCheck = () => {
      console.log('[ConfirmationPanel] Starting auto-check timer')
      if (autoCheckTimerRef.current !== null) {
        window.clearInterval(autoCheckTimerRef.current)
      }
      // Run immediately
      void checkConfirmationsAuto()
      // Then every 30 seconds
      autoCheckTimerRef.current = window.setInterval(() => {
        void checkConfirmationsAuto()
      }, 30000)
    }

    const handleStopAutoCheck = () => {
      console.log('[ConfirmationPanel] Stopping auto-check timer')
      if (autoCheckTimerRef.current !== null) {
        window.clearInterval(autoCheckTimerRef.current)
        autoCheckTimerRef.current = null
      }
    }

    window.addEventListener('start-confirmation-autocheck', handleStartAutoCheck)
    window.addEventListener('stop-confirmation-autocheck', handleStopAutoCheck)

    return () => {
      window.removeEventListener('start-confirmation-autocheck', handleStartAutoCheck)
      window.removeEventListener('stop-confirmation-autocheck', handleStopAutoCheck)
    }
  }, [checkConfirmationsAuto])

  const pendingCount = confirmations.filter((item) => item.status === 'pending').length

  return (
    <div className="border-t border-slate-800/80 bg-slate-950/40">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-slate-300">確認事項</h2>
            <p className="text-xs text-slate-500">
              事前に確認したいポイントを記録して進行時にチェックしましょう
              {isAutoChecking && <span className="ml-2 text-emerald-400">• AI自動チェック中...</span>}
            </p>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] uppercase tracking-wide text-slate-400">
            残り {pendingCount}
          </span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAdd()
              }
            }}
            placeholder="例: カスタマーからの要望事項"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newTitle.trim() || !sessionId}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            追加
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-slate-500">
            読み込み中...
          </div>
        ) : confirmations.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
            確認したいポイントを追加するとここに表示されます
          </div>
        ) : (
          <ul className="space-y-3">
            {confirmations.map((item) => {
              const summaryDraft = editSummaries[item.id] ?? ''
              const originalSummary = item.summary ?? ''
              const isCompleted = item.status === 'completed'
              const isDirty = summaryDraft !== originalSummary
              const saving = isSavingSummary[item.id]

              return (
                <li
                  key={item.id}
                  className={`rounded-lg border px-4 py-3 ${
                    isCompleted
                      ? 'border-emerald-600/40 bg-emerald-600/10'
                      : 'border-slate-800 bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isCompleted}
                      onChange={(e) => handleToggleStatus(item, e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`text-sm font-medium ${isCompleted ? 'text-emerald-100' : 'text-slate-100'}`}>
                            {item.title}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {isCompleted
                              ? item.completedAt
                                ? `確認済み: ${new Date(item.completedAt).toLocaleTimeString('ja-JP', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })}`
                                : '確認済み'
                              : '未確認'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="text-slate-500 transition hover:text-slate-300"
                          aria-label="確認事項を削除"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {isCompleted && item.summary ? (
                        <div className="mt-2 space-y-2">
                          {/* Summary preview/toggle button */}
                          <button
                            type="button"
                            onClick={() => toggleSummaryExpanded(item.id)}
                            className="flex w-full items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-900/20 px-3 py-2 text-left transition hover:bg-emerald-900/30"
                          >
                            <div className="flex items-center gap-2">
                              <svg
                                className={`h-4 w-4 text-emerald-400 transition-transform ${expandedSummaries[item.id] ? 'rotate-90' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="text-xs font-medium text-emerald-300">
                                {expandedSummaries[item.id] ? '詳細を閉じる' : '詳細を見る'}
                              </span>
                            </div>
                            <span className="text-[10px] text-emerald-400">
                              {summaryDraft.length}文字
                            </span>
                          </button>

                          {/* Expanded summary content */}
                          {expandedSummaries[item.id] && (
                            <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-slate-900/40 p-3">
                              <textarea
                                value={summaryDraft}
                                onChange={(e) => handleSummaryChange(item.id, e.target.value)}
                                placeholder="会話の要点や合意事項をメモ"
                                className="w-full rounded-lg border border-emerald-500/40 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                rows={6}
                              />
                              <div className="flex items-center justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleSummarySave(item)}
                                  disabled={!isDirty || saving}
                                  className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {saving ? '保存中...' : '保存'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : isCompleted && !item.summary ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={summaryDraft}
                            onChange={(e) => handleSummaryChange(item.id, e.target.value)}
                            placeholder="会話の要点や合意事項をメモ"
                            className="w-full rounded-lg border border-emerald-500/40 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                            rows={3}
                          />
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>{summaryDraft.length}文字</span>
                            <button
                              type="button"
                              onClick={() => handleSummarySave(item)}
                              disabled={!isDirty || saving}
                              className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {saving ? '保存中...' : '保存'}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function SessionListScreen({ sessions, onSelectSession, onCreateNew, onOpenSettings }: SessionListScreenProps) {
  return (
    <main className="flex h-screen flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 px-8 py-6 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Seam - セッション一覧</h1>
            <p className="mt-1 text-sm text-gray-600">
              {sessions.length > 0 ? `${sessions.length}件のセッション` : 'セッションがまだありません'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-slate-50"
            >
              ⚙️ 設定
            </button>
            <button
              type="button"
              onClick={onCreateNew}
              className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              + 新規セッション
            </button>
          </div>
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
          <div className="mx-auto max-w-4xl space-y-8">
            {(() => {
              // Group sessions by date
              const groupedSessions = sessions.reduce((groups, session) => {
                const date = new Date(session.startedAt || session.createdAt)
                const dateKey = date.toLocaleDateString('ja-JP', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                })

                if (!groups[dateKey]) {
                  groups[dateKey] = []
                }
                groups[dateKey].push(session)
                return groups
              }, {} as Record<string, typeof sessions>)

              // Get today, yesterday for special labels
              const today = new Date()
              const yesterday = new Date(today)
              yesterday.setDate(yesterday.getDate() - 1)

              const todayKey = today.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
              const yesterdayKey = yesterday.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })

              return Object.entries(groupedSessions).map(([dateKey, dateSessions]) => {
                let dateLabel = dateKey
                if (dateKey === todayKey) {
                  dateLabel = '今日'
                } else if (dateKey === yesterdayKey) {
                  dateLabel = '昨日'
                }

                return (
                  <div key={dateKey} className="space-y-3">
                    <h2 className="sticky top-0 z-10 bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-2 text-sm font-semibold text-gray-700">
                      {dateLabel}
                    </h2>
                    <div className="space-y-2">
                      {dateSessions.map((session) => {
                        const isActive = session.startedAt && !session.endedAt
                        const duration = session.duration ? `${session.duration}分` : ''
                        const time = new Date(session.startedAt || session.createdAt).toLocaleTimeString('ja-JP', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })

                        return (
                          <button
                            key={session.id}
                            onClick={() => onSelectSession(session.id)}
                            className="group relative flex w-full items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-md"
                          >
                            {/* Time */}
                            <div className="flex-shrink-0 text-center">
                              <div className="text-sm font-semibold text-gray-900">{time}</div>
                              {duration && <div className="text-xs text-gray-500">{duration}</div>}
                            </div>

                            {/* Divider */}
                            <div className="h-12 w-px bg-slate-200" />

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="truncate text-base font-semibold text-gray-900 group-hover:text-blue-600">
                                  {session.title}
                                </h3>
                                {isActive && (
                                  <span className="flex-shrink-0 flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                                    進行中
                                  </span>
                                )}
                              </div>
                              {session.aiProvider && (
                                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                  <span>🤖</span>
                                  {session.aiProvider === 'gemini' && 'Gemini 2.5 Flash'}
                                  {session.aiProvider === 'claude' && 'Claude Sonnet 4'}
                                  {session.aiProvider === 'chatgpt' && 'GPT-4o'}
                                </div>
                              )}
                            </div>

                            {/* Arrow */}
                            <div className="flex-shrink-0 text-gray-400 transition group-hover:text-blue-600">
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>
    </main>
  )
}

type AgendaPanelProps = {
  session?: SessionRecord
}

function AgendaPanel({ session }: AgendaPanelProps) {
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
      const records = await window.seam.getAgendas({ sessionId })
      setAgendas(records)
    } catch (err) {
      console.error('[seam] failed to load agendas', err)
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
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSuggestions = useCallback(async () => {
    if (!sessionId) {
      setSuggestions([])
      return
    }

    try {
      setError(null)
      const records = await window.seam.getSuggestions({ sessionId, limit: 5 })
      setSuggestions(records)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('[seam] failed to load suggestions', err)
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
      const suggestion = await window.seam.generateSuggestion({ sessionId })
      setSuggestions((prev) => [suggestion, ...prev.slice(0, 4)])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('[seam] failed to generate suggestion', err)
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
  const [summaries, setSummaries] = useState<SummaryRecord[]>([])
  const [isSummaryGenerating, setIsSummaryGenerating] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const summaryTimerRef = useRef<number | null>(null)
  const summaryContainerRef = useRef<HTMLDivElement | null>(null)

  // Load existing summaries when component mounts or sessionId changes
  useEffect(() => {
    const loadSummaries = async () => {
      if (!sessionId) {
        setSummaries([])
        return
      }

      try {
        const summaryRecords = await window.seam.getSummaries({ sessionId })
        setSummaries(summaryRecords)
      } catch (error) {
        console.error('[seam] Failed to load summaries:', error)
      }
    }

    void loadSummaries()
  }, [sessionId])

  // Auto-scroll to latest summary when summaries are updated
  useEffect(() => {
    if (summaries.length > 0 && summaryContainerRef.current) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        summaryContainerRef.current?.scrollTo({
          top: summaryContainerRef.current.scrollHeight,
          behavior: 'smooth',
        })
      }, 100)
    }
  }, [summaries.length])

  const generateAndUpdateSummary = useCallback(async () => {
    if (!sessionId || isSummaryGenerating) return

    try {
      setIsSummaryGenerating(true)
      setSummaryError(null)
      // Generate summary and save to database
      await window.seam.generateSummary({ sessionId })
      // Reload all summaries to get the updated list
      const updatedSummaries = await window.seam.getSummaries({ sessionId })
      setSummaries(updatedSummaries)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[seam] Failed to generate summary:', errorMessage)
      setSummaryError(errorMessage)
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
        const result = await window.seam.transcribeAudio({
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
            await window.seam.saveTranscription({
              sessionId,
              text: result.text,
              locale: result.locale,
              confidence: result.confidence,
            })
            console.log('[seam] Transcription saved to database', options.isChunk ? '(chunk)' : '')
          } catch (err) {
            console.error('[seam] Failed to save transcription:', err)
          }
        }
      } catch (error) {
        if (!options.isChunk) {
          setTranscriptionStatus('error')
          setTranscriptionError(error instanceof Error ? error.message : String(error))
        } else {
          console.error('[seam] Chunk transcription failed:', error)
        }
      }
    },
    [sessionId],
  )

  const transcribeChunk = useCallback(
    async (blob: Blob) => {
      if (transcriptionQueueRef.current) {
        console.log('[seam] Transcription already in progress, skipping chunk')
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
      console.error('[seam] No stream available for continuous recording')
      return
    }

    console.log('[seam] Starting new continuous recording cycle...')

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
      console.log('[seam] Recorder stopped, processing chunks...')
      const parts = chunksRef.current.slice()
      const mimeType = recorder.mimeType || mimeTypeRef.current || 'audio/webm'

      recorder.removeEventListener('dataavailable', handleData)
      recorder.removeEventListener('stop', handleStop)

      const blob = new Blob(parts, { type: mimeType })
      console.log(`[sanma] Blob created: ${(blob.size / 1024).toFixed(1)}KB, continuousMode: ${continuousModeRef.current}`)

      // Minimum 25KB for 10-second chunks
      if (blob.size >= 25000) {
        console.log(`[sanma] Continuous cycle complete, size: ${(blob.size / 1024).toFixed(1)}KB`)
        void transcribeChunk(blob)
      } else {
        console.log(`[sanma] Skipping small recording: ${(blob.size / 1024).toFixed(1)}KB`)
      }

      // Start next cycle if still in continuous mode
      if (continuousModeRef.current && streamRef.current) {
        console.log('[seam] Scheduling next cycle in 500ms...')
        continuousCycleTimerRef.current = window.setTimeout(() => {
          void startContinuousRecordingCycle()
        }, 500) // Small delay between cycles
      } else {
        console.log('[seam] Not starting next cycle. continuousMode:', continuousModeRef.current, 'stream:', !!streamRef.current)
      }
    }

    recorder.addEventListener('dataavailable', handleData)
    recorder.addEventListener('stop', handleStop)

    recorder.start()
    console.log('[seam] Recorder started, will stop in 10 seconds')

    // Stop this recording after 10 seconds
    continuousCycleTimerRef.current = window.setTimeout(() => {
      console.log('[seam] 10 seconds elapsed, stopping recorder...')
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop()
      } else {
        console.log('[seam] Recorder not in recording state:', recorderRef.current?.state)
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

        // Start confirmation auto-check
        window.dispatchEvent(new CustomEvent('start-confirmation-autocheck'))

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

    // Stop confirmation auto-check
    window.dispatchEvent(new CustomEvent('stop-confirmation-autocheck'))

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
            これまでのサマリ {summaries.length > 0 && `(${summaries.length}件)`}
            {isSummaryGenerating && (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-green-400 border-t-transparent ml-2" />
            )}
          </div>

          {summaryError && (
            <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              サマリ生成エラー: {summaryError}
            </div>
          )}

          {summaries.length > 0 ? (
            <div
              ref={summaryContainerRef}
              className="space-y-2 max-h-96 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
            >
              {summaries.map((summary, index) => (
                <div key={summary.id} className="rounded-lg bg-green-900/20 border border-green-800/30 px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-green-400">#{index + 1}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(summary.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">{summary.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-slate-800/40 px-4 py-3">
              <p className="text-sm leading-relaxed text-slate-400 italic">
                {isSummaryGenerating ? 'サマリを生成中...' : '録音を開始すると、30秒ごとに会話内容がサマライズされます。'}
              </p>
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

type SettingsScreenProps = {
  onClose: () => void
}

function SettingsScreen({ onClose }: SettingsScreenProps) {
  const [aiProvider, setAiProvider] = useState<AIProvider>('gemini')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [claudeApiKey, setClaudeApiKey] = useState('')
  const [chatgptApiKey, setChatgptApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true)

        // Load AI provider selection
        const provider = await window.seam.getSetting({ key: 'ai_provider' })
        if (provider) {
          setAiProvider(provider as AIProvider)
        }

        // Load all API keys
        const geminiKey = await window.seam.getSetting({ key: 'gemini_api_key' })
        if (geminiKey) setGeminiApiKey(geminiKey)

        const claudeKey = await window.seam.getSetting({ key: 'claude_api_key' })
        if (claudeKey) setClaudeApiKey(claudeKey)

        const chatgptKey = await window.seam.getSetting({ key: 'chatgpt_api_key' })
        if (chatgptKey) setChatgptApiKey(chatgptKey)

      } catch (err) {
        console.error('[seam] Failed to load settings:', err)
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setIsLoading(false)
      }
    }
    void loadSettings()
  }, [])

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setError(null)
      setSaveSuccess(false)

      // Save AI provider selection
      await window.seam.setSetting({ key: 'ai_provider', value: aiProvider })

      // Save all API keys
      await window.seam.setSetting({ key: 'gemini_api_key', value: geminiApiKey })
      await window.seam.setSetting({ key: 'claude_api_key', value: claudeApiKey })
      await window.seam.setSetting({ key: 'chatgpt_api_key', value: chatgptApiKey })

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error('[seam] Failed to save settings:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSaving(false)
    }
  }

  // Get current API key based on selected provider
  const currentApiKey = useMemo(() => {
    switch (aiProvider) {
      case 'gemini':
        return geminiApiKey
      case 'claude':
        return claudeApiKey
      case 'chatgpt':
        return chatgptApiKey
      default:
        return ''
    }
  }, [aiProvider, geminiApiKey, claudeApiKey, chatgptApiKey])

  return (
    <main className="flex h-screen flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 px-8 py-6 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">設定</h1>
            <p className="mt-1 text-sm text-gray-600">AI プロバイダーと API キーの設定</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-slate-50"
          >
            ← 戻る
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* AI Provider Selection */}
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="mb-6 text-lg font-semibold text-gray-900">AI プロバイダー</h2>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  使用する AI プロバイダーを選択してください
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => setAiProvider('gemini')}
                    className={`rounded-lg border-2 p-4 text-center transition ${
                      aiProvider === 'gemini'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">Gemini</div>
                    <div className="mt-1 text-xs text-gray-600">2.5 Flash</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiProvider('claude')}
                    className={`rounded-lg border-2 p-4 text-center transition ${
                      aiProvider === 'claude'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">Claude</div>
                    <div className="mt-1 text-xs text-gray-600">Sonnet 4.5</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiProvider('chatgpt')}
                    className={`rounded-lg border-2 p-4 text-center transition ${
                      aiProvider === 'chatgpt'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">ChatGPT</div>
                    <div className="mt-1 text-xs text-gray-600">GPT-4o</div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* API Keys Configuration */}
          {!isLoading && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="mb-6 text-lg font-semibold text-gray-900">
                API キー
              </h2>

              <div className="space-y-6">
                {/* Info box */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm text-blue-900">
                    {aiProvider === 'gemini' && (
                      <>
                        AI機能を使用するには、Gemini API キーが必要です。
                        <br />
                        <a
                          href="https://aistudio.google.com/app/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block font-medium text-blue-700 underline hover:text-blue-800"
                        >
                          Google AI Studio でAPIキーを取得 →
                        </a>
                      </>
                    )}
                    {aiProvider === 'claude' && (
                      <>
                        AI機能を使用するには、Claude API キーが必要です。
                        <br />
                        <a
                          href="https://console.anthropic.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block font-medium text-blue-700 underline hover:text-blue-800"
                        >
                          Anthropic Console でAPIキーを取得 →
                        </a>
                      </>
                    )}
                    {aiProvider === 'chatgpt' && (
                      <>
                        AI機能を使用するには、OpenAI API キーが必要です。
                        <br />
                        <a
                          href="https://platform.openai.com/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block font-medium text-blue-700 underline hover:text-blue-800"
                        >
                          OpenAI Platform でAPIキーを取得 →
                        </a>
                      </>
                    )}
                  </p>
                </div>

                {/* Gemini API Key */}
                {aiProvider === 'gemini' && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Gemini APIキー
                    </label>
                    <input
                      type="password"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder="AIza..."
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <p className="text-xs text-gray-500">
                      APIキーは暗号化されてローカルに保存されます
                    </p>
                  </div>
                )}

                {/* Claude API Key */}
                {aiProvider === 'claude' && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Claude APIキー
                    </label>
                    <input
                      type="password"
                      value={claudeApiKey}
                      onChange={(e) => setClaudeApiKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <p className="text-xs text-gray-500">
                      APIキーは暗号化されてローカルに保存されます
                    </p>
                  </div>
                )}

                {/* ChatGPT API Key */}
                {aiProvider === 'chatgpt' && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                      OpenAI APIキー
                    </label>
                    <input
                      type="password"
                      value={chatgptApiKey}
                      onChange={(e) => setChatgptApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <p className="text-xs text-gray-500">
                      APIキーは暗号化されてローカルに保存されます
                    </p>
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="text-sm text-red-900">{error}</p>
                  </div>
                )}

                {/* Success message */}
                {saveSuccess && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <p className="text-sm text-green-900">✓ 保存しました</p>
                  </div>
                )}

                {/* Save button */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || !currentApiKey.trim()}
                    className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

type SessionSetupModalProps = {
  onCreate: (title: string, duration: number, agendaItems: string[], aiProvider: AIProvider) => void
  isCreating: boolean
}

function SessionSetupModal({ onCreate, isCreating }: SessionSetupModalProps) {
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(20) // Default 20 minutes session
  const [agendaItems, setAgendaItems] = useState<string[]>([])
  const [newAgendaItem, setNewAgendaItem] = useState('')
  const [aiProvider, setAiProvider] = useState<AIProvider>('gemini')

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
    if (title.trim() && agendaItems.length > 0 && duration > 0) {
      onCreate(title.trim(), duration, agendaItems, aiProvider)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 backdrop-blur-sm">
      <div className="w-full max-w-2xl space-y-8 p-12">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Seam - セッション設定</h1>
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

        {/* Session Duration */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">セッションの所要時間 (分)</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDuration((prev) => Math.max(5, prev - 5))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              -5
            </button>
            <input
              type="number"
              min={5}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Math.max(5, Number(e.target.value) || 5))}
              className="w-32 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-center text-sm font-semibold text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              type="button"
              onClick={() => setDuration((prev) => Math.min(180, prev + 5))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              +5
            </button>
            <span className="text-xs text-gray-500">5〜180分の範囲で設定できます</span>
          </div>
        </div>

        {/* AI Provider Selection */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">AI モデル</label>
          <p className="text-xs text-gray-500">このセッションで使用するAIモデルを選択してください</p>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setAiProvider('gemini')}
              className={`rounded-lg border-2 p-3 text-center transition ${
                aiProvider === 'gemini'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-gray-900">Gemini</div>
              <div className="mt-1 text-xs text-gray-600">2.5 Flash</div>
            </button>
            <button
              type="button"
              onClick={() => setAiProvider('claude')}
              className={`rounded-lg border-2 p-3 text-center transition ${
                aiProvider === 'claude'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-gray-900">Claude</div>
              <div className="mt-1 text-xs text-gray-600">Sonnet 4</div>
            </button>
            <button
              type="button"
              onClick={() => setAiProvider('chatgpt')}
              className={`rounded-lg border-2 p-3 text-center transition ${
                aiProvider === 'chatgpt'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-gray-900">ChatGPT</div>
              <div className="mt-1 text-xs text-gray-600">GPT-4o</div>
            </button>
          </div>
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
