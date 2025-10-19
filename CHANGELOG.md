# Sanma Codex - 変更履歴

## v1.0.1 (2025-10-19)

### 🐛 バグ修正
- パッケージ化されたアプリでJavaScriptエラーが発生する問題を修正
- HTMLファイルのパス解決を修正 (`dist/index.html`への正しいパス設定)
- `package.json`のmainエントリを`dist-electron/main.js`に修正
- 不要な`launcher.js`ファイルを削除してシンプルなエントリポイントに変更

### 🔧 技術的な変更
- **main.ts (L672-674)**: パッケージ化されたアプリのHTMLファイルパスを`../dist/index.html`に修正
- **build_electron_app.sh (L98-104)**: launcher.jsの作成を削除し、package.jsonを直接更新

### ✅ 動作確認済み
- macOS 14.x でパッケージ化されたアプリが正常に起動
- UI表示が正常に動作
- データベース、音声認識、AI機能が正常に動作

## v1.0.0 (2025-10-18)

### ✨ 初回リリース

#### 主な機能
- **セッション管理**: パネルディスカッションのセッション作成・管理
- **タイマー機能**: セッション時間のカウントダウン表示
- **アジェンダ管理**: ドラッグ&ドロップによるアジェンダ項目の並び替え
- **リアルタイム文字起こし**: macOS標準の音声認識による日本語文字起こし
- **AI提案機能**: Google Gemini APIを使用した議論サポート提案

#### 技術スタック
- **フロントエンド**: React 19 + TypeScript + Tailwind CSS
- **バックエンド**: Electron + better-sqlite3
- **ネイティブ**: Swift (macOS Speech Framework)
- **AI**: Google Generative AI (Gemini)

#### UIデザイン
- 3カラムレイアウト (アジェンダ/文字起こし/AI提案)
- ダークテーマ
- レスポンシブデザイン
