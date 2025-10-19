import type { SeamApi } from '../preload'

export {}

declare global {
  interface Window {
    seam: SeamApi
  }
}
