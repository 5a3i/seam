export type SessionRecord = {
  id: string
  title: string
  duration?: number // Session duration in minutes
  startedAt?: number // Unix timestamp when session started
  endedAt?: number // Unix timestamp when session ended
  aiProvider?: AIProvider // AI provider used for this session
  createdAt: number
}

export type AgendaRecord = {
  id: string
  sessionId: string
  title: string
  order: number
  status: 'pending' | 'current' | 'completed'
  createdAt: number
}

export type TranscriptionSegment = {
  substring: string
  confidence: number
  timestamp: number
  duration: number
}

export type TranscriptionResult = {
  locale: string
  text: string
  confidence: number
  segments: TranscriptionSegment[]
  audioPath: string
}

export type SuggestionRecord = {
  id: string
  sessionId: string
  summary: string
  bridgingQuestion: string
  followUpQuestions: string[]
  createdAt: number
}

export type TranscriptionRecord = {
  id: string
  sessionId: string
  text: string
  locale: string
  confidence: number
  createdAt: number
}

export type SummaryRecord = {
  id: string
  sessionId: string
  content: string
  createdAt: number
}

export type ConfirmationRecord = {
  id: string
  sessionId: string
  title: string
  status: 'pending' | 'completed'
  summary?: string
  createdAt: number
  completedAt?: number
}

export type AIProvider = 'gemini' | 'claude' | 'chatgpt'

export type AISettings = {
  provider: AIProvider
  geminiApiKey?: string
  claudeApiKey?: string
  chatgptApiKey?: string
}
