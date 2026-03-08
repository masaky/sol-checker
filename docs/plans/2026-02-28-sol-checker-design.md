# sol-checker Design Document

## Overview

Solidity スマートコントラクトの脆弱性を LLM で診断する CLI ツール。
個人 Solidity 開発者がデプロイ前に `sol-checker scan MyToken.sol` で即チェックできる。

## Target User

- 個人 Solidity 開発者
- CLI 完結を好む層
- 監査会社に数百万円払えないが最低限のチェックがほしい人

## Business Model

- まず無料で公開し信頼構築
- 将来的に有料ティア導入

## Architecture

```
$ sol-checker scan ./src/MyToken.sol
         │
         ▼
┌─────────────────────────┐
│  1. File Reader         │  .sol ファイル読み込み
└─────────────┬───────────┘
              ▼
┌─────────────────────────┐
│  2. Prompt Builder      │  セキュリティ専門家プロンプト + ソース注入
└─────────────┬───────────┘
              ▼
┌─────────────────────────┐
│  3. LLM Provider        │  Claude (default) / OpenAI / Gemini (後日)
└─────────────┬───────────┘
              ▼
┌─────────────────────────┐
│  4. Report Generator    │  Markdown レポート + ターミナル色分け表示
└─────────────────────────┘
```

シングルパス解析（1回の API 呼び出し）。シンプルで最速 MVP。

## CLI Interface

### MVP Commands

```bash
sol-checker scan <file>          # スキャン実行
sol-checker init                 # ~/.sol-checker/config.toml 生成
sol-checker --help
```

### Options

```bash
sol-checker scan ./src/MyToken.sol \
    --provider claude \
    --model claude-sonnet-4-20250514 \
    --output ./report.md
```

### Config File (~/.sol-checker/config.toml)

```toml
[llm]
provider = "claude"
api_key = "sk-ant-..."
model = "claude-sonnet-4-20250514"

[output]
format = "markdown"
color = true
```

### Deferred (post-MVP)

- ディレクトリスキャン（複数ファイル）
- `--severity` フィルタ
- JSON 出力

## Report Format

### Markdown Output

```markdown
# Sol-Checker Report
**File:** src/MyToken.sol
**Date:** 2026-02-28
**Provider:** claude (claude-sonnet-4-20250514)

## Summary
| Severity | Count |
|----------|-------|
| HIGH     | 1     |
| MEDIUM   | 2     |
| LOW      | 1     |

## Findings

### [HIGH] Reentrancy in withdraw()
**Line:** 42
**Description:** External call before state update allows reentrancy attack
**Impact:** Attacker can drain contract funds
**Fix:** (code example)
```

### Terminal Colors

- HIGH = red
- MEDIUM = yellow
- LOW = blue
- INFO = gray

LLM には JSON schema で構造化出力を返させ、Markdown とターミナル表示の両方に変換。

## Project Structure

```
~/projects/sol-checker/
├── package.json
├── tsconfig.json
├── .gitignore
├── src/
│   ├── index.ts              # CLI エントリポイント (commander.js)
│   ├── scanner.ts            # ファイル読み込み + パイプライン制御
│   ├── prompt.ts             # プロンプト構築
│   ├── providers/
│   │   ├── base.ts           # LLM プロバイダー共通インターフェース
│   │   └── claude.ts         # Anthropic SDK 実装 (MVP)
│   ├── reporter.ts           # JSON → Markdown 変換 + ターミナル色付け
│   └── config.ts             # config.toml の読み書き
├── prompts/
│   └── checker-system.md     # システムプロンプト（外部ファイル化）
└── test/
    ├── fixtures/
    │   └── vulnerable.sol    # テスト用脆弱コントラクト
    └── scanner.test.ts
```

## Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.52",
    "commander": "^13",
    "chalk": "^5",
    "toml": "^3"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "vitest": "^3",
    "tsx": "^4"
  }
}
```

## Tech Decisions

- **TypeScript**: Solidity 開発者は Node 環境が前提。npm 配布が最も簡単
- **LLM のみ（静的解析ツール不要）**: MVP 最速。Slither/Foundry 連携は後日
- **プロンプト外部ファイル化**: コード変更なしでプロンプト調整可能
- **Provider パターン**: base.ts でインターフェース定義、追加プロバイダーは実装クラスを足すだけ
