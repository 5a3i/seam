# プロダクト要求仕様書 (PRD): Seam  
バージョン: 1.1  
作成日: 2025年10月17日  
ステータス: ドラフト  

---

## 1. 概要 (Overview)

**Seam ()** は、パネルディスカッションや会議の司会者・ファシリテーターを支援するためのデスクトップアプリケーションである。  
マイクから入力された議論をリアルタイムで文字起こしし、**ユーザーのリクエスト操作（または音声トリガ）**に応じてAIが議論を要約し、  
「次にどう進めるか」の提案（繋ぎの一言や質問）を生成することで、司会者の思考負担を軽減する。

---

## 2. 背景と課題 (Problem Statement)

司会者・ファシリテーターは、議論中に次のような複雑な認知タスクを同時に行っている。

- 登壇者の発言内容を記憶し、整理する  
- 議論が脱線しないように方向づける  
- 時間内に全ての議題を消化する  
- 文脈に沿って自然に次の話題に移る

特に最後の「**次にどう繋ぐかを考える**」部分は経験依存度が高く、  
新人ファシリテーターにとって大きな心理的負荷となる。  
Seamはこれを**オンデマンドにAIへ委譲**することで、思考の“補助脳”として働くことを狙う。

---

## 3. ターゲットユーザー (Target Audience)

- **プライマリ**：パネルディスカッション・セミナー・ワークショップの司会者  
- **セカンダリ**：社内ミーティングの進行役、議事録作成者

---

## 4. ゴールと提供価値 (Goals & Value Proposition)

### ゴール
誰でもプロフェッショナルな議論進行ができるようにする。

### 提供価値
- **思考負荷の軽減**：記憶・構成・次展開の考案をAIに部分委譲  
- **進行品質の向上**：議論の停滞・脱線を防止  
- **操作主導性の維持**：必要なときにだけAIを呼び出せる「司会者中心設計」

---

## 5. 機能要件 (Functional Requirements)

### F-01: リアルタイム音声認識（STT）
- **内容**:  
  Electron レンダラがマイク入力を `MediaRecorder` で分割収集し、Electron メイン経由で OpenAI Whisper API（`gpt-4o-mini-transcribe`）へ順次送信する。  
  取得したテキストは確定テキストとして逐次表示し、Seam の transcript DB に保存する。  
  API キーは環境変数 `OPENAI_API_KEY` または設定ストアから取得する。
- **受理基準**:  
  発話終了から6秒以内に確定テキストが表示される。  
  認識エラー時はUIにエラーメッセージが表示され、録音は継続可能。

---

### F-02’: オンデマンドAIサジェスト（新仕様）
- **内容**:  
  ユーザーがボタン、ショートカット、または音声トリガで「提案」をリクエストすると、  
  直近の議論内容を要約し、「繋ぎの一言」と「追い質問2つ」を自動生成して表示する。
  
  - ボタン：UI上の「提案する」ボタン  
  - ショートカット：⌘J（WindowsではCtrl+J）  
  - 音声トリガ：STT上に「提案ください」「サジェストして」等が検出されたとき
- **処理内容**:
  - 直近120〜180秒（最大5分）の確定テキストを抽出
  - 現在および次の議題タイトルをプロンプトに含める
  - Gemini Flash APIで生成し、サジェストカードに表示
- **受理基準**:
  - 操作から3秒以内にサジェスト結果が表示される
  - 要約は100〜160字、繋ぎ文は自然で読み上げ可能、追い質問は短く具体的に2件

---

### F-03: 議題リスト管理
- **内容**:  
  セッション開始前に、議題リストを追加・削除・並べ替えできる。  
  現在の議題／次の議題をAIが参照可能。
- **受理基準**:  
  議題のCRUD操作が直感的に行えること。  
  サジェスト生成時に次の議題が適切に反映されること。

---

### F-04: サジェスト履歴管理（新）
- **内容**:  
  サジェスト結果を履歴として保持し、矢印操作で前後の提案を再表示できる。  
- **受理基準**:  
  直近5件の履歴に即時アクセスできる。Undo/Redoが即応答であること。

---

## 6. 非機能要件 (Non-Functional Requirements)

| 項目 | 内容 |
|------|------|
| プラットフォーム | Electron (macOS) |
| 音声認識 | OpenAI Whisper API（gpt-4o-mini-transcribe、クラウド） |
| LLM | Google Gemini 1.5 Flash / Flash-Lite |
| パフォーマンス | サジェストは3秒以内、STT遅延3秒以内 |
| 精度 | 実用レベルの日本語議論を正確に要約できる |
| コスト | STT無料、LLM課金のみ（1時間あたり¥1未満） |
| ユーザビリティ | 司会者が話しながら片手で操作できるUI |
| セキュリティ | 音声データはローカル処理、LLM送信はテキストのみ |

---

## 7. 技術スタック (Tech Stack)

| 分類 | 技術 |
|------|------|
| フロント/UI | React + TailwindCSS |
| アプリランタイム | Electron + Vite |
| 音声認識 | Apple Speech Framework (SFSpeechRecognizer) |
| AIモデル | Gemini 1.5 Flash / Flash-Lite |
| データ保存 | SQLite（セッション/議題/転記/サジェスト） |
| 言語 | TypeScript + Swift (Bridge) |

---

## 8. データモデル (主要)

```ts
type Session = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  currentAgendaId?: string;
};

type TranscriptChunk = {
  id: string;
  sessionId: string;
  startedAt: number;
  endedAt: number;
  text: string;
  isFinal: boolean;
};

type Suggestion = {
  id: string;
  sessionId: string;
  windowStart: number;
  windowEnd: number;
  summary: string;
  bridgePhrase: string;
  followupQuestions: string[];
  createdAt: number;
};

type Agenda = {
  id: string;
  sessionId: string;
  title: string;
  order: number;
};
