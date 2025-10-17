いいですね。では「起動で詰まらない」ことを最優先に、超スモールステップのPhase設計で進めましょう。各Phaseに「目的 / 作業 / 検証(Exit Criteria) / つまずきポイント」を付けています。ここまで細かければ、どこで失敗しても原因切り分けが容易です。

⸻

Phase 0：環境の土台を固定する

目的：毎回の差異をなくす（Node/パッケージ/CPUアーキ）。
作業
	1.	Node LTS & Core Tools
	•	brew install fnm → fnm install --lts → fnm use --lts
	•	node -v を記録（例: v20.x）
	•	corepack enable（pnpm同梱化）
	2.	作業用ディレクトリ
	•	mkdir sanma && cd sanma && git init && echo node_modules >> .gitignore

検証
	•	node -v がLTS、pnpm -v 実行可。
つまずきポイント
	•	Rosetta/arm64の混在：Apple Siliconで古いx64バイナリを混ぜない（Homebrewも単一アーキで統一）。

⸻

Phase 1：最小Electron+Vite+Reactが「起動する」状態

目的：GUIウィンドウを出すだけの最小構成を安定させる。
作業
	1.	React+Vite（TS）
	•	pnpm create vite@latest app --template react-ts
	•	cd app && pnpm i
	2.	Electron統合（最短ルート）
	•	pnpm add -D vite-plugin-electron electron @types/node
	•	src/main.ts（Electron Main）/ src/preload.ts を作成
	•	vite.config.ts に vite-plugin-electron を組み込み
	3.	スクリプト
	•	"dev": "vite"（Electronはプラグインが自動起動）
	•	"type": "module" を package.json に設定（ESM整合）

検証（Exit Criteria）
	•	pnpm dev でElectronウィンドウが開き、React画面が表示。
つまずきポイント
	•	ESM/CJS不整合："type": "module" と import/require を混在させない。
	•	メイン/プリロードのパス誤り：vite-plugin-electron の entry が実ファイルと一致しているか。

⸻

Phase 2：Tailwind導入＆Preload疎通の可視化

目的：UIとメイン⇔レンダラ間の橋渡しを最小で確認。
作業
	1.	Tailwindセットアップ
	•	pnpm add -D tailwindcss postcss autoprefixer && npx tailwindcss init -p
	•	tailwind.config.js の content に ./index.html, ./src/**/*.{ts,tsx}
	•	src/index.css に @tailwind base; @tailwind components; @tailwind utilities;
	2.	Preload→RendererのIPC
	•	preload.ts で contextBridge.exposeInMainWorld(...)
	•	React側で window.api.getPlatform() を呼んで表示

検証
	•	画面に “Hello Sanma + (platform名)” がTailwindで整ったUIで表示。
つまずきポイント
	•	contextIsolation/preload未設定：BrowserWindow 生成時のオプションを再確認。

⸻

Phase 3：SQLite（まずはWASM→後でネイティブ）

目的：DBの確実な書き込み/読み出しを得る。最初はビルドが楽なWASM(sql.js)でOK。
作業（WASM版）
	•	pnpm add sql.js
	•	アプリ起動時にメモリDB→/UserData/sanma.dbへ保存（Rendererでも動く）
	•	最小テーブル Session を作り、1レコードinsert→read表示

検証
	•	画面に 作成したSessionのタイトル が表示される。
	•	アプリ終了後も sanma.db が残る（永続化OK）。
つまずきポイント
	•	いきなり better-sqlite3 などのネイティブに行くとリビルド地獄（次Phaseで移行）。

⸻

Phase 4：ネイティブSQLite（better-sqlite3）への移行

目的：本番を見据えた高速・安定DB。
作業
	•	pnpm add better-sqlite3
	•	MainプロセスでDBオープン（RendererからはIPCでクエリ要求）
	•	electron-rebuild は 後述のパッケージングPhase で実行方針を固める

検証
	•	IPC経由で insert/read が成功し、WASM版と同等の表示ができる。
つまずきポイント
	•	ネイティブモジュールとNode/Electron ABIの不一致：Electronのバージョンに合わせて再ビルド。

⸻

Phase 5：マイク入力だけ（STTなし）

目的：起動直後にマイクで落ちないこと、権限ダイアログの挙動確認。
作業
	•	Rendererで navigator.mediaDevices.getUserMedia({ audio: true })
	•	取得ストリームの MediaRecorder 開始/停止ボタンを実装
	•	Info.plist（後でビルドに使用） 用に NSMicrophoneUsageDescription 文言を決めておく

検証
	•	初回アクセスでマイク許可ダイアログが出て、録音タイマーがカウントするUIが動く。
つまずきポイント
	•	何も出ない：Electronの権限ハンドラ/セキュリティ設定を確認（session.setPermissionRequestHandler 等は原則不要）。

⸻

Phase 6：macosのspeech APIでSTT最小実装

目的：短い音声→テキスト化の“スルッと通る”成功体験。
作業

検証
	•	発話→6秒以内に画面へ確定テキスト反映（PRDの受理基準準拠）。

⸻

Phase 7：議題リスト（CRUD）と「現在/次の議題」参照

目的：F-03を最小で満たす。
作業
	•	Agendas テーブルを追加。ドラッグ並べ替え（DndKit等）→ order 更新
	•	ヘッダに 現在/次の議題 を表示して常時見える状態に
	•	DBはMain→IPC経由で更新/取得

検証
	•	並べ替え/追加/削除が即時反映。
つまずきポイント
	•	レンダラ直書きでDB触らない（セキュリティ&将来の分離のためIPC統一）。

⸻

Phase 8：F-02’ オンデマンドAIサジェスト（Gemini Flash）

目的：⌘J で3秒以内に「要約/繋ぎ/追い質問×2」を返す最小ループ。
作業
	•	.env に Google API キー
	•	直近 120–180秒 の確定テキストをDBから抽出
	•	現在/次の議題タイトルをプロンプトに含めてGemini Flashへ
	•	結果はサジェストカードに表示＋DB Suggestion へ保存、履歴UIも追加（直近5件、Undo/Redo）

検証
	•	⌘J → 3秒以内にカード表示、要約100–160字、追い質問2件。
つまずきポイント
	•	レイテンシ：トークン節約（要約対象トリミング/短プロンプト/Flash-Lite併用）。

⸻

Phase 9：パッケージング（ローカル配布できる形）

目的：配布しても起動でこけない。
作業
	•	pnpm add -D electron-builder
	•	electron-builder.yml（macOSターゲット：dmg/zip）
	•	mac セクションに hardenedRuntime: true、entitlements、NSMicrophoneUsageDescription
	•	Dev配布段階は未公証でもOK（社内配布）。公証/署名は最後に。

検証
	•	生成された .dmg からインストール → Gatekeeperを越えて起動できる。
つまずきポイント
	•	better-sqlite3 再ビルド忘れ（packaging前に electron-builder install-app-deps などで解決）。
	•	EntitlementsやInfo.plistの不足でマイクが無効化。

⸻

共通の“起動できない”時のチェックリスト（上から順に見るだけでOK）
	1.	Node/ElectronのABI不一致：rm -rf node_modules && pnpm i → pnpm exec electron --version と better-sqlite3 の再ビルド。
	2.	ESM/CJS衝突："type":"module" の有無、require と import の混在を除去。
	3.	preloadのパス/指定ミス：BrowserWindow({ webPreferences: { preload }}) を実ファイルに一致。
	4.	IPCで循環参照/未定義呼び出し：チャネル名・型を1ファイルで定義共有。
	5.	権限/Info.plist：NSMicrophoneUsageDescription、Hardened Runtime、Entitlements。
	6.	ネイティブ依存：Apple Siliconでx64混入（古いbrewパス）を排除。
	7.	.env未読込：dotenv を Mainの最初で読み込み。
	8.	コードサイン/公証：配布時のみ。開発中は不要（余計なエラー原因を増やさない）。

⸻

次アクション（私の提案）
	1.	Phase 0〜2をこの順で一気に終わらせ、ウィンドウが必ず出る状態を固定。
	2.	その後、Phase 5→6（音→テキスト）まで通して“基本価値”を確認。
	3.	問題が出たら、上記チェックリストで該当Phaseに戻るだけの運用にします。

必要なら、このPhaseごとのコマンドと最小コード雛形をすぐ用意します。どのPhaseからコード化に進めますか？（デフォルトはPhase 1の最小テンプレから出します）