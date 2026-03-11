# npm パブリッシュ チェックリスト & ルールテンプレート

> 初回パブリッシュ〜継続運用まで。他プロジェクトでも再利用可能。

---

## 1. パブリッシュ前：パッケージ品質チェック

### 1-1. package.json 必須フィールド

```bash
# 確認コマンド
node -e "const p=require('./package.json'); ['name','version','description','main','bin','license','keywords'].forEach(k=>console.log(k+': '+(p[k]?'✔':'✘ MISSING')))"
```

| フィールド | 用途 | 例 |
|-----------|------|-----|
| `name` | パッケージ名（npm 上で一意） | `sol-checker` |
| `version` | semver（初回は `0.1.0` が安全） | `0.1.0` |
| `description` | npm 検索に表示される | 1文で何をするツールか |
| `main` | エントリポイント | `dist/index.js` |
| `bin` | CLI コマンド名 → 実行ファイル | `{ "sol-checker": "./dist/index.js" }` |
| `license` | OSS ライセンス | `MIT` |
| `keywords` | npm 検索用タグ（5-10個） | `["solidity","security","audit"]` |
| `files` | パッケージに含めるファイル（ホワイトリスト） | `["dist/","prompts/"]` |
| `repository` | GitHub リンク | `{ "type": "git", "url": "..." }` |
| `engines` | 動作保証する Node バージョン | `{ "node": ">=20" }` |

### 1-2. ビルド & テスト

```bash
# クリーンビルド
rm -rf dist && npm run build

# テスト全通過
npm test

# ビルド成果物の確認
ls dist/
head -1 dist/index.js  # shebang #!/usr/bin/env node があるか
```

### 1-3. パッケージ内容の確認

```bash
# 何が入るか確認（最重要）
npm pack --dry-run

# チェックポイント:
# ✔ dist/ が入っている
# ✔ 実行に必要なリソース（prompts/ 等）が入っている
# ✔ README.md が入っている
# ✘ src/ が入っていない（ソースコードは不要）
# ✘ test/ が入っていない
# ✘ docs/ が入っていない
# ✘ .env, config.toml 等の秘密情報が入っていない ← 最重要
```

### 1-4. ローカル動作確認

```bash
# npm link で擬似インストール
npm link
sol-checker --help
sol-checker --version

# 実際のコマンドを試す
sol-checker scan path/to/contract.sol

# 確認後クリーンアップ
npm unlink -g sol-checker
```

### 1-5. README 確認

手動で読み直して確認:

- [ ] インストール手順が正確か（コピペで動くか）
- [ ] Quick Start が3ステップ以内か
- [ ] 出力例が実際の出力と一致するか
- [ ] API キー等の前提条件が明記されているか
- [ ] ライセンスが記載されているか

---

## 2. パブリッシュ実行

### 2-1. npm アカウント

```bash
# ログイン確認
npm whoami

# 未ログインなら
npm adduser
# → ブラウザで npmjs.com の認証画面が開く
```

### 2-2. パッケージ名の最終確認

```bash
# 名前が空いているか
npm view <package-name>
# 404 = 空いている = OK
```

### 2-3. Dry run（最終確認）

```bash
npm publish --dry-run
# エラーがないこと、内容が正しいことを確認
```

### 2-4. パブリッシュ

```bash
# 初回（public パッケージ）
npm publish --access public

# scoped パッケージの場合（@masaky/sol-checker）
npm publish --access public
```

### 2-5. 公開直後の確認

```bash
# npmjs.com で確認
open https://www.npmjs.com/package/<package-name>

# 別環境でインストールテスト
cd /tmp && mkdir test-install && cd test-install
npm install -g <package-name>
<command-name> --help
<command-name> --version

# クリーンアップ
npm uninstall -g <package-name>
cd ~ && rm -rf /tmp/test-install
```

---

## 3. パブリッシュ後：やること

### 3-1. Git タグ

```bash
git tag v0.1.0
git push origin v0.1.0
```

### 3-2. GitHub リポジトリ設定

- [ ] リポジトリを public に変更（必要なら）
- [ ] Description に1文説明を設定
- [ ] Topics（タグ）を設定: solidity, security, cli, etc.
- [ ] npmjs.com のパッケージページからリンクが正しいか確認

### 3-3. CI でパブリッシュが壊れないことを確認

- [ ] `git push` して CI が通ることを確認
- [ ] 今後のコミットで `npm run build && npm test` が通り続けるか

---

## 4. バージョン管理ルール（semver）

```
MAJOR.MINOR.PATCH
  │      │     └── バグ修正（後方互換あり）
  │      └──────── 機能追加（後方互換あり）
  └─────────────── 破壊的変更（後方互換なし）
```

| 変更内容 | バージョン | 例 |
|---------|-----------|-----|
| バグ修正 | `npm version patch` | 0.1.0 → 0.1.1 |
| 新機能追加 | `npm version minor` | 0.1.1 → 0.2.0 |
| 破壊的変更（CLI オプション変更等） | `npm version major` | 0.2.0 → 1.0.0 |

```bash
# バージョンアップ → コミット → タグ作成を一発で
npm version patch  # or minor, major
git push && git push --tags
npm publish
```

**注意**: `0.x.y` の間は「まだ不安定」というシグナル。1.0.0 にするのは安定したと判断したとき。

---

## 5. アップデート時のパブリッシュ手順

```bash
# 1. 変更を実装・テスト
npm test

# 2. バージョンアップ
npm version patch -m "release: v%s"

# 3. ビルド確認
npm run build

# 4. パッケージ内容確認
npm pack --dry-run

# 5. パブリッシュ
npm publish

# 6. プッシュ
git push && git push --tags
```

---

## 6. やってはいけないこと

| NG | 理由 | 代わりに |
|----|------|---------|
| API キーをコードにハードコード | 漏洩 | 環境変数 or config ファイル |
| `npm publish` を CI から自動実行（初期） | 事故リスク | 手動で慣れてから自動化 |
| `.npmignore` なしで publish | テストや秘密情報が含まれる | `files` + `.npmignore` で制御 |
| テスト失敗のまま publish | ユーザーの信頼喪失 | `prepublishOnly` でガード |
| CHANGELOG なしでバージョンアップ | 何が変わったかわからない | 最低限 GitHub Releases に書く |
| unpublish を気軽にする | 他人の依存を壊す | 72時間以内なら可能だが最終手段 |

---

## 7. 便利コマンド集

```bash
# パッケージ情報確認
npm info <package-name>

# ダウンロード数確認
npm info <package-name> | grep downloads

# 自分のパッケージ一覧
npm search --searchopts=maintainer=<npm-username>

# 特定バージョンの内容確認
npm pack <package-name>@0.1.0 --dry-run

# deprecate（非推奨にする。unpublish より安全）
npm deprecate <package-name>@"< 0.2.0" "Use >= 0.2.0"
```
