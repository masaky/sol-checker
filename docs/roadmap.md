# sol-checker ロードマップ

> 設計書: [2026-02-28-sol-checker-design.md](./plans/2026-02-28-sol-checker-design.md)
> 作成日: 2026-03-08 / 更新日: 2026-03-11

---

## Phase 0: プロジェクト初期化 ✅

**目標**: ビルド・テスト・実行の基盤を整える

- [x] `npm init` + `package.json` 作成
- [x] TypeScript (`tsconfig.json`) セットアップ
- [x] Vitest 導入・動作確認
- [x] `.gitignore` 設定
- [x] ディレクトリ構造作成 (`src/`, `prompts/`, `test/fixtures/`)
- [x] `tsx` で `src/index.ts` がハロワ実行できる状態にする

---

## Phase 1: CLI スケルトン ✅

**目標**: コマンドラインインターフェースの骨格

- [x] `commander.js` で `scan`, `init`, `--help` コマンド登録
- [x] `src/config.ts` — `~/.sol-checker/config.toml` の読み書き
- [x] `sol-checker init` で設定ファイルを生成
- [x] CLI オプション: `--provider`, `--model`, `--output`
- [x] 引数バリデーション + エラーメッセージ

---

## Phase 2: File Reader + Prompt Builder ✅

**目標**: `.sol` ファイルを読み込み、LLM に渡すプロンプトを組み立てる

- [x] `src/scanner.ts` — `.sol` ファイル読み込み + 存在チェック
- [x] `prompts/checker-system.md` — セキュリティ専門家システムプロンプト作成
- [x] `src/prompt.ts` — システムプロンプト + ソースコード注入 → 最終プロンプト構築
- [x] `test/fixtures/vulnerable.sol` — テスト用脆弱コントラクト作成
- [x] テスト完備

---

## Phase 3: LLM Provider — Claude ✅

**目標**: Anthropic API を叩いて構造化レスポンスを得る

- [x] `src/providers/base.ts` — LLM プロバイダー共通インターフェース定義
- [x] `src/providers/claude.ts` — `@anthropic-ai/sdk` を使った実装
- [x] `src/providers/validate.ts` — 構造化出力バリデーション
- [x] API キー解決（config.toml → 環境変数 `ANTHROPIC_API_KEY`）
- [x] エラーハンドリング（API エラー, レートリミット, タイムアウト）

---

## Phase 4: Report Generator + パイプライン統合 ✅

**目標**: レポート生成 + 全コンポーネントを繋いで E2E 動作

- [x] `src/reporter.ts` — `formatTerminal`（色付きターミナル出力）
- [x] `src/reporter.ts` — `formatMarkdown`（Markdown レポート生成）
- [x] `src/index.ts` — scan パイプライン統合（read → prompt → LLM → report）
- [x] `--output` 指定時にファイル書き出し
- [x] エラー発生時の graceful な終了
- [x] テスト 63/63 通過

**完了**: `sol-checker scan vulnerable.sol` で E2E レポート出力を確認済み

---

## Phase 5: 実戦テスト + 品質強化 ← NOW

**目標**: 自分のプロジェクトで使い、配布品質まで磨く

### 5-1. 自プロジェクトでの実戦テスト

- [ ] `gen-art/on-chain-esc-game/contracts/src/OnChainEscape.sol` をスキャン
- [ ] `gen-art/shadow-chain/contracts/ShadowChain.sol` をスキャン
- [ ] 検出結果を確認し、プロンプトの精度を評価・改善
- [ ] 誤検知（false positive）が多い場合、`prompts/checker-system.md` を調整
- [ ] レポート出力を実際に読み、わかりにくい箇所を改善

### 5-2. CLI の使い勝手改善

- [ ] スキャン中のスピナー / プログレス表示（LLM 応答待ちが無言で不安）
- [ ] `--version` にビルド情報を含める
- [ ] エラーメッセージの改善（API キー未設定時のガイダンス強化）

### 5-3. npm パッケージ化

- [ ] `package.json` に `bin` フィールド追加（`"bin": { "sol-checker": "./dist/index.js" }`）
- [ ] `tsc` ビルドが通ることを確認
- [ ] `npm link` → `sol-checker scan` でローカル動作確認
- [ ] shebang (`#!/usr/bin/env node`) を dist エントリポイントに追加

**完了基準**: `npm link` 後、任意のディレクトリから `sol-checker scan <file.sol>` が動く

---

## Phase 6: 配布準備

**目標**: 誰でもインストールして即使える状態にする

### 6-1. ドキュメント

- [ ] README.md 作成
  - インストール方法 (`npm install -g sol-checker`)
  - クイックスタート（3ステップ: install → init → scan）
  - 出力例（ターミナルスクリーンショット + Markdown サンプル）
  - API キー設定方法
  - オプション一覧
- [ ] CHANGELOG.md（v0.1.0 初回リリース）

### 6-2. CI / 品質ゲート

- [ ] GitHub Actions: テスト（`vitest run`）
- [ ] GitHub Actions: TypeScript ビルド確認（`tsc --noEmit`）
- [ ] npm publish 用 `.npmignore`（test/, docs/, .claude/ 除外）

### 6-3. npm publish

- [ ] npm アカウント確認・ログイン
- [ ] `sol-checker` パッケージ名の空き確認
- [ ] `npm publish --access public`
- [ ] `npx sol-checker scan` で動作確認（publish 後の E2E）

### 6-4. 公開後チェック

- [ ] npmjs.com のパッケージページ確認
- [ ] 別マシン or 別環境で `npm install -g sol-checker` → `sol-checker scan` テスト
- [ ] GitHub リポジトリを public に変更

**完了基準**: `npm install -g sol-checker` → `sol-checker scan MyToken.sol` が初見ユーザーでも動く

---

## Post-MVP (将来)

優先度順:

| 優先度 | 機能 | 備考 |
|--------|------|------|
| ★★★ | ディレクトリスキャン | 複数 `.sol` を一括チェック |
| ★★★ | crypthub.app 連携 | クイズ → sol-checker 導線 |
| ★★☆ | OpenAI プロバイダー追加 | `--provider openai` |
| ★★☆ | `--severity` フィルタ | HIGH のみ表示など |
| ★★☆ | JSON 出力 (`--format json`) | CI/CD パイプライン連携用 |
| ★☆☆ | Gemini プロバイダー追加 | |
| ★☆☆ | Slither / Foundry 連携 | 静的解析との組み合わせ |
| ★☆☆ | 有料ティア | ホスティング型移行時に検討 |
