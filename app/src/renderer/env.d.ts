import type { SanmaApi } from '../preload'

export {}

declare global {
  interface Window {
    sanma: SanmaApi
  }
}
