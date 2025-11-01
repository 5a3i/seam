# Seam

Seam (codename: "Sanma Codex") is a macOS desktop assistant for panel moderators. It captures the conversation from the microphone, turns it into a structured transcript, and uses Gemini to suggest the next talking points on demand. The project combines an Electron + React front end, a TypeScript main process backed by SQLite, and a Swift command line tool that wraps the Apple Speech framework for high-quality local transcription.

## Highlights
- **Session-driven workflow:** Create, start, and close sessions with automatic agenda scaffolding and a searchable history capped at the latest 20 records.
- **Agenda orchestration:** Plan the run-of-show ahead of time, drag to reorder items, and mark their state (`pending`, `current`, `completed`) while the AI prompt stays aware of the current and next topics.
- **Live transcription pipeline:** The renderer captures audio with `MediaRecorder`, the main process persists each chunk, and the bundled Swift CLI (`native/speech`) performs on-device recognition through `SFSpeechRecognizer`, returning rich metadata (confidence, segments, timestamps).
- **On-demand AI guidance:** A keyboard shortcut, UI button, or voice trigger can ask Gemini 2.5 Flash for a 100–160 character digest, a bridging phrase, and two follow-up questions. Results are stored so the last five suggestions can be revisited instantly.
- **Concise recaps:** Facilitators can generate rolling summaries that remain in the database for later review or export.
- **Single-file persistence:** All sessions, agendas, transcripts, suggestions, summaries, and settings live inside `seam.db` under the Electron `userData` directory (for macOS: `~/Library/Application Support/Seam`).

## Project Layout
```
app/                 Electron + React code, Vite based
  src/main.ts        Main process: IPC, SQLite access, speech + Gemini bridges
  src/renderer/      React UI (session list, agenda, microphone, AI panels)
  src/preload.ts     IPC surface exposed to the renderer (`window.seam`)
  src/shared/        Shared TypeScript models
  dist-*/            Build outputs (ignored by git in normal workflows)
native/speech/       Swift Package that wraps Apple Speech for offline STT
build_*.sh           One-touch scripts for packaging the macOS bundle
docs/                PRD, design tasks, and reference screenshots
```

## Prerequisites
- macOS 13+ (Apple Speech on-device recognition is preferred; earlier versions fall back to cloud recognition).
- Xcode Command Line Tools (for Swift and codesign).
- Node.js 20+ and npm (Electron + Vite toolchain).
- A Google Gemini API key (`makersuite.google.com/app/apikey`).

## First-time Setup
1. **Install JavaScript dependencies**:
   ```bash
   cd app
   npm install
   ```
2. **Build the speech binary** (debug build used in development):
   ```bash
   cd ../native/speech
   swift build
   ```
   This produces `.build/debug/speech`, which the Electron main process invokes. You can override the location with `SEAM_SPEECH_BIN` if needed.
3. **Expose your Gemini key**:
   - Either set `GOOGLE_API_KEY` before starting the app, or
   - Enter the key inside the in-app settings panel (it is stored in the local `settings` table under `gemini_api_key`).

## Development Workflow
```bash
cd app
npm run dev
```
The Vite + `vite-plugin-electron` setup launches the renderer and spawns Electron with hot reload for both the UI and the main process. The transcript database is created automatically on first run, seeded with an example session.

### Optional Settings
- `SEAM_SPEECH_BIN`: Path to a prebuilt `speech` executable (useful when running from a packaged bundle or a custom build configuration).
- `GOOGLE_API_KEY`: Default Gemini key if you do not want to use the settings UI.

## Packaging for macOS
`electron-builder` is configured in `app/package.json`. For a reproducible bundle that also includes the Swift binary, run:
```bash
./build_electron_app.sh
```
The script compiles the Swift target in release mode, builds the Electron app, stitches the bundle together at `release/Sanma Codex.app`, and applies an ad-hoc code signature. See `README_SHARING.md` for distribution tips, including DMG creation.

## Data Model at a Glance
| Table | Purpose |
| ----- | ------- |
| `sessions` | Session metadata, start/end timestamps, duration. |
| `agendas` | Ordered agenda items with status tracking per session. |
| `transcriptions` | Persisted STT chunks with locale + confidence. |
| `suggestions` | Gemini outputs (summary, bridge, follow-up questions). |
| `summaries` | Long-form recaps generated on demand. |
| `settings` | Local key/value store (currently the Gemini API key). |

## Key Flows
- **Transcription**: The renderer buffers audio chunks (defaulting to AAC/WebM). Once a chunk exceeds 50 KB, it streams the bytes to the main process, which writes a temporary file and calls the Swift `speech` binary. Parsed results are shown immediately and appended to `transcriptions`.
- **Suggestion generation**: When requested, the main process fetches up to the last three minutes of transcript text, injects the current/next agenda titles, and prompts Gemini 2.5 Flash. The JSON response is validated, stored, and surfaced in the UI history carousel.
- **Summaries**: Facilitators can generate rolling summaries. Each response is saved so repeated requests provide an auditable trail of what was discussed.

## Additional Resources
- `docs/prd.md`: Product requirements draft, target users, and success criteria.
- `docs/task.md`: Implementation log with phased milestones.
- `README_SHARING.md`: How to package and share the `.app` or a DMG build.
- `CHANGELOG.md`: Release notes for v1.0.x.

## Roadmap Ideas
- Wire up the voice trigger phrases described in the PRD to auto-request suggestions.
- Add automated tests around the agenda reorder IPC handlers and AI prompt assembly.
- Expand the settings store to hold multiple API providers and privacy toggles.
