import { contextBridge, ipcRenderer } from 'electron'
import type { SessionRecord } from './shared/types'

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
} as const

contextBridge.exposeInMainWorld('sanma', api)

export type SanmaApi = typeof api
