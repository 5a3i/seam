import { contextBridge, ipcRenderer } from 'electron'
import type { SessionRecord, AgendaRecord, TranscriptionResult, TranscriptionRecord, SuggestionRecord } from './shared/types'

const api = {
  ping: () => 'pong',
  getPlatform: () => process.platform,
  getVersions: () => ({
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron ?? 'unknown',
  }),
  getDatabasePath: () => ipcRenderer.invoke('sanma:get-db-path') as Promise<string>,
  getSessions: () => ipcRenderer.invoke('sanma:get-sessions') as Promise<SessionRecord[]>,
  createSession: (payload: { title?: string }) =>
    ipcRenderer.invoke('sanma:create-session', payload) as Promise<SessionRecord>,
  getAgendas: (payload: { sessionId: string }) =>
    ipcRenderer.invoke('sanma:get-agendas', payload) as Promise<AgendaRecord[]>,
  createAgenda: (payload: { sessionId: string; title: string }) =>
    ipcRenderer.invoke('sanma:create-agenda', payload) as Promise<AgendaRecord>,
  updateAgenda: (payload: { id: string; title?: string; status?: string }) =>
    ipcRenderer.invoke('sanma:update-agenda', payload) as Promise<AgendaRecord>,
  deleteAgenda: (payload: { id: string }) =>
    ipcRenderer.invoke('sanma:delete-agenda', payload) as Promise<void>,
  reorderAgendas: (payload: { sessionId: string; agendaIds: string[] }) =>
    ipcRenderer.invoke('sanma:reorder-agendas', payload) as Promise<AgendaRecord[]>,
  getSuggestions: (payload: { sessionId: string; limit?: number }) =>
    ipcRenderer.invoke('sanma:get-suggestions', payload) as Promise<SuggestionRecord[]>,
  generateSuggestion: (payload: { sessionId: string; currentAgendaTitle?: string; nextAgendaTitle?: string }) =>
    ipcRenderer.invoke('sanma:generate-suggestion', payload) as Promise<SuggestionRecord>,
  saveTranscription: (payload: { sessionId: string; text: string; locale: string; confidence: number }) =>
    ipcRenderer.invoke('sanma:save-transcription', payload) as Promise<TranscriptionRecord>,
  getSetting: (payload: { key: string }) =>
    ipcRenderer.invoke('sanma:get-setting', payload) as Promise<string | null>,
  setSetting: (payload: { key: string; value: string }) =>
    ipcRenderer.invoke('sanma:set-setting', payload) as Promise<void>,
  transcribeAudio: (payload: { data: Uint8Array; mimeType: string; locale?: string }) =>
    ipcRenderer.invoke('sanma:transcribe-buffer', {
      data: Buffer.from(payload.data),
      mimeType: payload.mimeType,
      locale: payload.locale,
    }) as Promise<TranscriptionResult>,
} as const

contextBridge.exposeInMainWorld('sanma', api)

export type SanmaApi = typeof api
