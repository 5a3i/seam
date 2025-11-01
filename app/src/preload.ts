import { contextBridge, ipcRenderer } from 'electron'
import type {
  SessionRecord,
  AgendaRecord,
  TranscriptionResult,
  TranscriptionRecord,
  SuggestionRecord,
  SummaryRecord,
  ConfirmationRecord,
} from './shared/types'

const api = {
  ping: () => 'pong',
  getPlatform: () => process.platform,
  getVersions: () => ({
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron ?? 'unknown',
  }),
  getDatabasePath: () => ipcRenderer.invoke('seam:get-db-path') as Promise<string>,
  getSessions: () => ipcRenderer.invoke('seam:get-sessions') as Promise<SessionRecord[]>,
  createSession: (payload: { title?: string; duration?: number; agendaItems?: string[] }) =>
    ipcRenderer.invoke('seam:create-session', payload) as Promise<SessionRecord>,
  startSession: (payload: { sessionId: string }) =>
    ipcRenderer.invoke('seam:start-session', payload) as Promise<SessionRecord>,
  endSession: (payload: { sessionId: string }) =>
    ipcRenderer.invoke('seam:end-session', payload) as Promise<SessionRecord>,
  getAgendas: (payload: { sessionId: string }) =>
    ipcRenderer.invoke('seam:get-agendas', payload) as Promise<AgendaRecord[]>,
  createAgenda: (payload: { sessionId: string; title: string }) =>
    ipcRenderer.invoke('seam:create-agenda', payload) as Promise<AgendaRecord>,
  updateAgenda: (payload: { id: string; title?: string; status?: string }) =>
    ipcRenderer.invoke('seam:update-agenda', payload) as Promise<AgendaRecord>,
  deleteAgenda: (payload: { id: string }) =>
    ipcRenderer.invoke('seam:delete-agenda', payload) as Promise<void>,
  reorderAgendas: (payload: { sessionId: string; agendaIds: string[] }) =>
    ipcRenderer.invoke('seam:reorder-agendas', payload) as Promise<AgendaRecord[]>,
  getSuggestions: (payload: { sessionId: string; limit?: number }) =>
    ipcRenderer.invoke('seam:get-suggestions', payload) as Promise<SuggestionRecord[]>,
  generateSuggestion: (payload: { sessionId: string; currentAgendaTitle?: string; nextAgendaTitle?: string }) =>
    ipcRenderer.invoke('seam:generate-suggestion', payload) as Promise<SuggestionRecord>,
  generateSummary: (payload: { sessionId: string; secondsAgo?: number }) =>
    ipcRenderer.invoke('seam:generate-summary', payload) as Promise<string>,
  saveTranscription: (payload: { sessionId: string; text: string; locale: string; confidence: number }) =>
    ipcRenderer.invoke('seam:save-transcription', payload) as Promise<TranscriptionRecord>,
  getTranscriptions: (payload: { sessionId: string; secondsAgo?: number }) =>
    ipcRenderer.invoke('seam:get-transcriptions', payload) as Promise<TranscriptionRecord[]>,
  getSetting: (payload: { key: string }) =>
    ipcRenderer.invoke('seam:get-setting', payload) as Promise<string | null>,
  setSetting: (payload: { key: string; value: string }) =>
    ipcRenderer.invoke('seam:set-setting', payload) as Promise<void>,
  getSummaries: (payload: { sessionId: string; limit?: number }) =>
    ipcRenderer.invoke('seam:get-summaries', payload) as Promise<SummaryRecord[]>,
  saveSummary: (payload: { sessionId: string; content: string }) =>
    ipcRenderer.invoke('seam:save-summary', payload) as Promise<SummaryRecord>,
  getConfirmations: (payload: { sessionId: string }) =>
    ipcRenderer.invoke('seam:get-confirmations', payload) as Promise<ConfirmationRecord[]>,
  createConfirmation: (payload: { sessionId: string; title: string }) =>
    ipcRenderer.invoke('seam:create-confirmation', payload) as Promise<ConfirmationRecord>,
  updateConfirmation: (payload: { id: string; title?: string; status?: 'pending' | 'completed'; summary?: string }) =>
    ipcRenderer.invoke('seam:update-confirmation', payload) as Promise<ConfirmationRecord>,
  deleteConfirmation: (payload: { id: string }) =>
    ipcRenderer.invoke('seam:delete-confirmation', payload) as Promise<void>,
  checkConfirmations: (payload: { sessionId: string; secondsAgo?: number }) =>
    ipcRenderer.invoke('seam:check-confirmations', payload) as Promise<{ id: string; shouldCheck: boolean; reason: string; excerpt: string }[]>,
  transcribeAudio: (payload: { data: Uint8Array; mimeType: string; locale?: string }) =>
    ipcRenderer.invoke('seam:transcribe-buffer', {
      data: Buffer.from(payload.data),
      mimeType: payload.mimeType,
      locale: payload.locale,
    }) as Promise<TranscriptionResult>,
} as const

contextBridge.exposeInMainWorld('seam', api)

export type SeamApi = typeof api
