# sol-checker ロードマップ

> 設計書: [2026-02-28-sol-checker-design.md](file:///Users/rosemary/projects/sol-checker/docs/plans/2026-02-28-sol-checker-design.md)
> 作成日: 2026-03-08

---

## Phase 0: プロジェクト初期化 (Day 1)

**目標**: ビルド・テスト・実行の基盤を整える

- [x] `npm init` + `package.json` 作成
- [x] TypeScript (`tsconfig.json`) セットアップ
- [x] Vitest 導入・動作確認
- [x] `.gitignore` 設定
- [x] ディレクトリ構造作成 (`src/`, `prompts/`, `test/fixtures/`)
- [x] `tsx` で `src/index.ts` がハロワ実行できる状態にする

**完了基準**: `npx tsx src/index.ts` が動作する

---

## Phase 1: CLI スケルトン (Day 2) ✅

**目標**: コマンドラインインターフェースの骨格

- [x] `commander.js` で `scan`, `init`, `--help` コマンド登録 (`src/index.ts`)
- [x] `src/config.ts` — `~/.sol-checker/config.toml` の読み書き
- [x] `sol-checker init` で設定ファイルを生成
- [x] CLI オプション: `--provider`, `--model`, `--output`
- [x] 引数バリデーション + エラーメッセージ

**完了基準**: `sol-checker scan foo.sol` でファイル名が表示される、`sol-checker init` で config.toml が生成される

---

## Phase 2: File Reader + Prompt Builder (Day 3)

**目標**: `.sol` ファイルを読み込み、LLM に渡すプロンプトを組み立てる

- [ ] `src/scanner.ts` — `.sol` ファイル読み込み + 存在チェック
- [ ] `prompts/checker-system.md` — セキュリティ専門家システムプロンプト作成
- [ ] `src/prompt.ts` — システムプロンプト + ソースコード注入 → 最終プロンプト構築
- [ ] `test/fixtures/vulnerable.sol` — テスト用脆弱コントラクト作成
- [ ] `test/scanner.test.ts` — ファイル読み込み + プロンプト構築のユニットテスト

**完了基準**: `vitest` でプロンプト構築テストが通る

---

## Phase 3: LLM Provider — Claude (Day 4–5)

**目標**: Anthropic API を叩いて構造化レスポンスを得る

- [ ] `src/providers/base.ts` — LLM プロバイダー共通インターフェース定義
- [ ] `src/providers/claude.ts` — `@anthropic-ai/sdk` を使った実装
- [ ] JSON Schema で構造化出力を強制（severity, line, description, impact, fix）
- [ ] API キーの読み込み（config.toml or 環境変数）
- [ ] エラーハンドリング（API エラー, レートリミット, タイムアウト）
- [ ] LLM レスポンスのバリデーション

**完了基準**: 実際の `.sol` ファイルを渡して、構造化 JSON が返ってくる

---

## Phase 4: Report Generator (Day 6)

**目標**: LLM の結果を人間が読めるレポートに変換

- [ ] `src/reporter.ts` — JSON → Markdown 変換
- [ ] ターミナル色分け表示（`chalk`）: HIGH=赤, MEDIUM=黄, LOW=青, INFO=灰
- [ ] Severity サマリーテーブル生成
- [ ] `--output` 指定時にファイル書き出し
- [ ] レポーターのユニットテスト

**完了基準**: Markdown レポートが生成され、ターミナル出力に色が付く

---

## Phase 5: パイプライン結合 + E2E (Day 7–8)

**目標**: 全コンポーネントを繋いで一気通貫で動かす

- [ ] `src/scanner.ts` にパイプライン制御ロジックを実装
  - File Reader → Prompt Builder → LLM Provider → Report Generator
- [ ] E2E テスト: `sol-checker scan test/fixtures/vulnerable.sol` が最後まで動く
- [ ] スピナー / プログレス表示
- [ ] エラー発生時の graceful な終了

**完了基準**: `sol-checker scan vulnerable.sol` でレポートが出力される

---

## Phase 6: 配布準備 (Day 9–10)

**目標**: npm パッケージとして公開できる状態にする

- [ ] `package.json` の `bin` フィールド設定
- [ ] `npm link` でローカルテスト
- [ ] README.md 作成（インストール方法, 使い方, 出力例）
- [ ] LICENSE ファイル追加
- [ ] CI (GitHub Actions) セットアップ: lint + test
- [ ] npm publish（scoped or unscoped）

**完了基準**: `npm install -g sol-checker` → `sol-checker scan` が動く

---

## Post-MVP (将来)

優先度順:

| 優先度 | 機能 | 備考 |
|--------|------|------|
| ★★★ | ディレクトリスキャン | 複数 `.sol` を一括チェック |
| ★★★ | OpenAI プロバイダー追加 | `--provider openai` |
| ★★☆ | `--severity` フィルタ | HIGH のみ表示など |
| ★★☆ | JSON 出力 (`--format json`) | CI/CD パイプライン連携用 |
| ★☆☆ | Gemini プロバイダー追加 | |
| ★☆☆ | Slither / Foundry 連携 | 静的解析との組み合わせ |
| ★☆☆ | 有料ティア | プライベートプロンプト等 |

---

## タイムライン概要

```
Week 1: Phase 0–3 (基盤 + コア機能)
Week 2: Phase 4–6 (レポート + 結合 + 配布)
Week 3~: Post-MVP 機能追加
```
