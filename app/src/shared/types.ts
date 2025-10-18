export type SessionRecord = {
  id: string
  title: string
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
