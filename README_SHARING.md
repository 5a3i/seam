# Sanma Codex - アプリ配布方法

## アプリのビルド

プロジェクトルートで以下のコマンドを実行してください:

```bash
./build_electron_app.sh
```

ビルドが完了すると、`release/Sanma Codex.app` にアプリケーションバンドルが作成されます。

## 共有方法

### 方法 1: アプリケーションファイルを直接共有

1. `release` フォルダ内の `Sanma Codex.app` を圧縮します:
   ```bash
   cd release
   zip -r "Sanma Codex.zip" "Sanma Codex.app"
   ```

2. 作成された `Sanma Codex.zip` を共有します（AirDrop、メール、クラウドストレージなど）

3. 受け取った人は:
   - ZIPファイルを解凍
   - `Sanma Codex.app` をアプリケーションフォルダにドラッグ&ドロップ
   - 初回起動時、システムが「開発元を確認できません」と表示する場合があります
   - その場合は、右クリック（またはControlキーを押しながらクリック）して「開く」を選択

### 方法 2: DMG イメージを作成（推奨）

よりプロフェッショナルな配布には、DMGイメージの作成をお勧めします:

```bash
# DMG作成ツールをインストール
npm install -g appdmg

# DMGを作成
hdiutil create -volname "Sanma Codex" -srcfolder release/"Sanma Codex.app" -ov -format UDZO release/"Sanma Codex.dmg"
```

作成された `Sanma Codex.dmg` を共有すれば、受け取った人はDMGをマウントしてアプリをドラッグ&ドロップでインストールできます。

## 初回セットアップ（受け取った人向け）

1. アプリを起動
2. 設定画面で Gemini API キーを設定
   - Google AI Studio (https://makersuite.google.com/app/apikey) でAPIキーを取得
   - アプリの設定画面にAPIキーを入力

## システム要件

- macOS 10.15 (Catalina) 以降
- マイク権限（音声録音用）
- 音声認識権限（文字起こし用）

## トラブルシューティング

### 「開発元を確認できません」エラー

1. アプリを右クリック
2. 「開く」を選択
3. 表示されるダイアログで「開く」をクリック

### マイク・音声認識権限エラー

1. システム設定 > プライバシーとセキュリティ
2. マイク、音声認識の権限を確認
3. Sanma Codex にチェックが入っているか確認

## 注意事項

- このアプリは開発者署名されていません（ad-hoc署名）
- 公開配布する場合は、Apple Developer Program に登録して公証を行うことをお勧めします
- プライベートな配布（知人・同僚など）であれば、このままで問題ありません
