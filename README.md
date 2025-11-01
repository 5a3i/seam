# Seam

Seam は、パネルディスカッションやミーティングのモデレーターを支援する macOS デスクトップアプリです。マイク入力を文字起こしし、議論の流れに合わせた要約や次の質問案を Gemini で生成します。Electron + React の UI と、SQLite を扱う TypeScript 製メインプロセス、Apple Speech Framework を呼び出す Swift 製 CLI を同梱したハイブリッド構成になっています。

## 特徴
- **セッション管理**: セッションの作成・開始・終了を行い、最新 20 件まで履歴を保持。
- **アジェンダ運用**: 事前に並べ替え可能なアジェンダを用意し、状態（`pending` / `current` / `completed`）を切り替えながら進行。
- **ライブ文字起こし**: レンダラで `MediaRecorder` により音声を収集し、Swift CLI（`native/speech`）経由で `SFSpeechRecognizer` を利用したオンデバイス認識を実施。信頼度やタイムスタンプも取得します。
- **オンデマンド提案**: ボタン、ショートカット、声かけで Gemini 2.5 Flash にリクエストし、100〜160 字の要約とブリッジングフレーズ、フォローアップ質問 2 件を生成。直近 5 件の履歴を参照できます。
- **サマリー蓄積**: 任意タイミングで議論全体の要約を生成し、DB に保存して振り返りに活用。
- **単一 DB 保存**: セッション、アジェンダ、転記、提案、サマリー、設定はすべて `seam.db` に保存され、macOS では `~/Library/Application Support/Seam` に配置されます。

## フォルダ構成
```
app/                 Electron + React（Vite ベース）
  src/main.ts        メインプロセス: IPC、SQLite、音声認識と Gemini 連携
  src/renderer/      React UI（セッション一覧・アジェンダ・録音・AI パネル）
  src/preload.ts     レンダラへ公開する IPC API (`window.seam`)
  src/shared/        共有 TypeScript 型
  dist-*/            ビルド産物（通常は git 管理外）
native/speech/       Apple Speech をラップした Swift Package
build_*.sh           macOS アプリを組み立てるスクリプト
docs/                PRD、設計タスク、スクリーンショット
```

## 必要環境
- macOS 13 以上（オンデバイス認識を推奨。13 未満ではクラウド認識にフォールバック）
- Xcode Command Line Tools（Swift と codesign に必要）
- Node.js 20 以上と npm（Electron + Vite のツールチェーン）
- Google Gemini API キー（取得先: https://makersuite.google.com/app/apikey）

## 初期セットアップ
1. **JavaScript 依存関係のインストール**
   ```bash
   cd app
   npm install
   ```
2. **音声認識バイナリのビルド**（開発ではデバッグビルドを使用）
   ```bash
   cd ../native/speech
   swift build
   ```
   これにより `.build/debug/speech` が生成され、メインプロセスから呼び出されます。別パスを使いたい場合は環境変数 `SEAM_SPEECH_BIN` を設定してください。
3. **Gemini キーの登録**
   - アプリ起動前に `GOOGLE_API_KEY` を環境変数として設定する、または
   - アプリ内の設定画面にキーを入力します（`settings` テーブルに `gemini_api_key` として保存）。

## 開発フロー
```bash
cd app
npm run dev
```
Vite + `vite-plugin-electron` により、レンダラとメインプロセスの両方でホットリロードが有効になります。初回起動時にサンプルセッション付きで DB が自動生成されます。

### オプション設定
- `SEAM_SPEECH_BIN`: 任意の `speech` 実行ファイルへのパスを指定。
- `GOOGLE_API_KEY`: 設定画面を使わずに Gemini キーを注入したいときに利用。

## macOS 向けパッケージング
`app/package.json` には `electron-builder` の設定が含まれています。Swift バイナリ込みで再現性のあるバンドルを生成するには、プロジェクトルートで以下を実行します。
```bash
./build_electron_app.sh
```
このスクリプトは Swift をリリースビルドし、Electron アプリをビルドして `release/Sanma Codex.app` を組み立て、アドホック署名を付与します。DMG 化などの配布方法は `README_SHARING.md` を参照してください。

## データモデル概要
| テーブル | 役割 |
| -------- | ---- |
| `sessions` | セッション情報（タイトル、開始／終了時刻、所要時間）。 |
| `agendas` | セッション単位のアジェンダ項目と順序、状態管理。 |
| `transcriptions` | 文字起こし結果（テキスト、言語、信頼度、作成時刻）。 |
| `suggestions` | Gemini の提案（要約・ブリッジング・フォローアップ）。 |
| `summaries` | 任意タイミングで生成された議事サマリー。 |
| `settings` | ローカル設定ストア（現在は Gemini API キーのみ）。 |

## 主要フロー
- **文字起こし**: レンダラが一定サイズ（50KB 以上）の音声チャンクをメインプロセスへ送信 → 一時ファイルとして保存 → Swift 製 `speech` バイナリを実行 → 結果を UI 表示と DB 保存。
- **提案生成**: 直近 3 分の文字起こしとアジェンダの現在／次項目をまとめて Gemini 2.5 Flash に投げ、JSON 形式の応答を検証後に保存・表示。
- **サマリー生成**: セッション全体、または指定期間を対象に Gemini に要約を生成させ、継続的な記録として `summaries` に追加。

## 参考資料
- `docs/prd.md`: プロダクト要求仕様書とターゲット定義。
- `docs/task.md`: 実装タスクとマイルストーンの記録。
- `README_SHARING.md`: `.app` または DMG の配布手順。
- `CHANGELOG.md`: v1.0 系の更新履歴。

## 今後のアイデア
- PRD で記載した音声トリガーと提案リクエストの連携を実装。
- アジェンダ並べ替えやプロンプト生成の IPC ハンドラに対する自動テスト追加。
- 設定ストアを拡張し、複数の AI プロバイダやプライバシー設定を扱えるようにする。
