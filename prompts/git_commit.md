# Git Commit Message Standard

**Version**: 1.0
**Last Updated**: 2025-11-15

---

## Commit Message Format

```
<type>: <subject>

<body>
```

### Subject Line (1行目)
- **50文字以内**の簡潔な要約
- **動詞の原形**で開始（追加、修正、削除、更新、リファクタ）
- 句点（。）は**つけない**
- 全角・半角混在OK、ただし簡潔さ優先

### Body (3行目以降)
- 2行目は**必ず空行**
- 具体的な変更内容を**箇条書き**
- 各項目は `- ` で開始
- 1行1変更点（複合的な変更は分割）
- **WHY（なぜ）** と **WHAT（何を）** を明確に

---

## Type Prefixes

| Prefix | 用途 | 例 |
|--------|------|-----|
| `feat:` | 新機能追加 | feat: Gemma連携によるRAG回答生成 |
| `fix:` | バグ修正 | fix: argparse競合によるquery引数解析エラー |
| `refactor:` | リファクタリング | refactor: DocsIndexerをSRP準拠で分割 |
| `docs:` | ドキュメント更新 | docs: Docs RAG仕様書を新規作成 |
| `test:` | テスト追加・修正 | test: ChromaDB検索の単体テスト追加 |
| `chore:` | 雑務（依存関係更新等） | chore: requirements.txtにchromadb追加 |
| `perf:` | パフォーマンス改善 | perf: FAISSインデックス検索を30%高速化 |
| `style:` | コードスタイル修正 | style: black formatter適用 |

---

## Author Convention

**Format**: `Author: <LLM Name> <llm-id@ai.internal>`

| LLM | Author Line |
|-----|-------------|
| Claude (Anthropic) | `Author: Claude <claude@anthropic.ai>` |
| ChatGPT (OpenAI) | `Author: ChatGPT <gpt@openai.ai>` |
| Gemini (Google) | `Author: Gemini <gemini@google.ai>` |
| Gemma (Local) | `Author: Gemma <gemma@local.llm>` |
| Qwen (Alibaba) | `Author: Qwen <qwen@alibaba.ai>` |
| DeepSeek | `Author: DeepSeek <deepseek@deepseek.ai>` |
| Human | `Author: <Your Name> <your@email.com>` |

---

## Examples

### 良い例 ✅

```
feat: Docs RAGにGemma回答生成機能を追加

- DocsQuery.ask()メソッドを実装（Ollama API経由）
- configs/llm.yamlからGemma設定を自動読み込み
- 検索結果を基にLLMが自然言語回答を生成
- エラーハンドリング（接続エラー、タイムアウト）を追加

Author: Claude <claude@anthropic.ai>
```

```
fix: main.pyのdocs-rag queryコマンド引数解析エラーを修正

- argparse実行前にsys.argvを直接解析する方式に変更
- "query"と"ask"サブコマンドで自由形式テキストを受け付け
- ヘルプメッセージにaskコマンドを追記

Author: Claude <claude@anthropic.ai>
```

```
docs: RAGアーキテクチャ仕様書を新規作成

- docs/rag/architectures/spec.md: 全体フロー図（Mermaid）
- docs/rag/architectures/usage.md: CLI使用ガイド
- Quiz RAG (FAISS) vs Docs RAG (ChromaDB) の比較表
- 将来拡張（多言語モデル移行）をroadmap.mdに追記

Author: Claude <claude@anthropic.ai>
```

### 悪い例 ❌

```
コード更新
```
→ 具体性なし、typeなし

```
feat: 機能追加。いろいろ修正した。テストも書いた。
```
→ 句点あり、箇条書きなし、曖昧

```
- Gemma連携
- バグ修正
- ドキュメント更新
```
→ subjectなし、ワンライナーリスト形式

---

## Git Command Template

```bash
git commit --author="Claude <claude@anthropic.ai>" -m "$(cat <<'EOF'
feat: 機能の簡潔な説明

- 変更点1
- 変更点2
- 変更点3
EOF
)"
```

---

## Enforcement Rules

1. **Subject必須**: 空のsubjectは絶対禁止
2. **Type必須**: prefixなしのcommitは禁止
3. **Body推奨**: 3行以上の変更は必ずbodyを記述
4. **Author必須**: どのLLMか追跡可能にする
5. **一貫性**: プロジェクト内で統一フォーマットを維持

---

## Integration with Claude Code

Claude Codeでcommit時は自動的にこのフォーマットを適用:

```bash
git commit -m "$(cat <<'EOF'
feat: 説明

- 変更1
- 変更2

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**Note**: Claude Codeの標準フッターと本プロジェクトのAuthor規約を併用。
