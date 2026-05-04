# task-manager

自分用のタスク管理アプリ。Claude Codeなどのタスク情報をMCPで同期して永続化するのに活用している。<br>
React フロントエンド + Hono API サーバーの2層構成。<br>
Neon をバックエンドDBに使用することで複数端末間でタスクを同期できる。<br>

アプリURL:
https://d3pi0juuilndgb.cloudfront.net

### デモアカウント

| メール           | パスワード   |
| ---------------- | ------------ |
| demo@example.com | password1234 |

このアカウントは共有デモのため、パスワード変更・アカウント削除・MCP トークン発行は
サーバー側で 403 拒否される (`DEMO_USER_EMAILS` 環境変数で指定)。タスク・カテゴリは
自由に作成・編集できるが、他のデモ利用者にも見える点に注意。

## 構成

```
task-manager/
├── front/                              # フロントエンド (React + Vite)
│   ├── index.html
│   ├── public/
│   └── src/                            # React/TS ソース一式
├── api/                                # バックエンド (Hono + クリーンアーキテクチャ)
│   ├── dev.ts                          # ローカル Node サーバ (port 3456)
│   ├── lambda.ts                       # AWS Lambda エントリ
│   └── src/
│       ├── domain/                     # entities / value-objects / repositories(I/F) / services(I/F) / exceptions
│       ├── usecases/                   # auth / tasks / categories（input-port / interactor / output-port）
│       ├── interface-adapters/         # Prisma リポジトリ実装、scrypt / jose サービス実装
│       └── framework/                  # Hono app / controllers / middleware / DI / Prisma client
├── test/                               # 全テスト（front/src と api/src を mirror）
├── prisma/
│   ├── schema.prisma                   # DBスキーマ定義
│   └── migrations/                     # prisma migrate deploy で適用される SQL
├── mcp-server.ts                       # Claude Code 連携用 MCP サーバー
└── issue-token.ts                      # MCP用 長期JWT 発行 CLI
```

## 技術スタック

| 役割              | 技術                                         |
| ----------------- | -------------------------------------------- |
| フロントエンド    | React 19 + TypeScript + Vite + Tailwind CSS  |
| ルーティング      | react-router-dom                             |
| API サーバー      | Hono (Node / AWS Lambda 両対応)              |
| ORM               | Prisma + @prisma/adapter-neon                |
| データベース      | Neon PostgreSQL                              |
| 認証              | JWT (jose) + crypto.scrypt                   |
| ドラッグ&ドロップ | @dnd-kit                                     |
| テスト            | Vitest + @testing-library/react              |
| インフラ          | AWS (S3 + CloudFront + Lambda + API Gateway) |
| IaC               | Terraform                                    |
| CI/CD             | GitHub Actions                               |

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` を作成（gitignore 済み）:

```bash
cp .env.example .env
# 各値を埋める
```

必要な変数:

- `DATABASE_URL` — Neon の接続文字列
- `JWT_SECRET` — JWT 署名用の乱数（`openssl rand -base64 48` 推奨）
- `TASK_APP_TOKEN` — MCP サーバーを使う場合のみ

`JWT_SECRET` は未設定だと `JoseTokenService` 構築時に例外を投げる（fail-fast）。
`api/src/framework/prisma/client.ts` が起動時に `.env` を自動読み込みするため、スクリプト側で `dotenv` 不要。

### 3. Prisma Client 生成 + マイグレーション適用

```bash
npx prisma generate
npx prisma migrate deploy
```

`prisma/migrations/` 配下の未適用 SQL がすべて適用される。新規ユーザー向けのデフォルトカテゴリは登録時に自動投入される（DB シード不要）。

### スキーマ変更時の手順

`prisma/schema.prisma` を編集したら:

```bash
# 新しいマイグレーションを生成（Neon の shadow DB 制約を回避するため --create-only）
npx prisma migrate dev --create-only --name <description>

# 内容を確認後、適用
npx prisma migrate deploy
npx prisma generate
```

CI (`.github/workflows/deploy.yml`) は main マージ時に `prisma migrate deploy` を自動実行する。

### ⚠️ 既存環境のベースライン (本 PR マージ前に一度だけ実行)

本リポジトリは生 SQL の `migrate.ts` から Prisma migrations 運用に移行した。**この移行 PR をマージする前** に、既存の Neon 本番 DB に対して 0_init を「適用済み」マークする必要がある（テーブルは既に存在するため、未マークのまま CI が走ると `CREATE TABLE` 衝突で deploy 失敗）。

```bash
# 順序が重要 — マージより先に実行すること
DATABASE_URL='<prod connection string>' npx prisma migrate resolve --applied 0_init

# 完了確認
DATABASE_URL='<prod connection string>' npx prisma migrate status
# → "Database schema is up to date!" が出れば OK
```

実行後は `_prisma_migrations` テーブルに `0_init` が記録され、以降の CI は新規マイグレーションのみ流す。

## 起動

### フロントエンド（開発サーバー）

```bash
npm run dev
# → http://localhost:5173
```

### API サーバー

```bash
npm run dev:api
# → http://localhost:3456
```

フロントエンドはこの API サーバーを通じて DB と通信する。本番（Lambda）では `api/lambda.ts` を esbuild でバンドルした成果物が同じ Hono app を提供する。

### 統合テスト (実 Postgres を使うもの)

`*.integration.test.ts` (例: `PrismaTaskRepository.cursor.integration.test.ts`) は `@testcontainers/postgresql` で実 Postgres を立てて検証する。docker daemon が動いていない環境では `docker info` の成否で自動 skip される。

```bash
# 1. Docker / Colima を起動
colima start   # もしくは Docker Desktop を起動

# 2. テストを通常どおり実行 (skip されず実コンテナで走る)
npm run test
```

## REST API

### 認証（公開）

| メソッド | パス                 | 説明                               |
| -------- | -------------------- | ---------------------------------- |
| POST     | `/api/auth/register` | アカウント登録（利用規約同意必須） |
| POST     | `/api/auth/login`    | ログイン（JWT発行）                |

### 認証必須

| メソッド | パス                  | 説明                             |
| -------- | --------------------- | -------------------------------- |
| GET      | `/api/auth/me`        | ログインユーザー情報取得         |
| PATCH    | `/api/auth/password`  | パスワード変更                   |
| DELETE   | `/api/auth/account`   | アカウント削除（タスク連動削除） |
| GET      | `/api/tasks`          | ユーザーのタスク一覧取得         |
| POST     | `/api/tasks`          | タスク作成                       |
| PATCH    | `/api/tasks/:id`      | タスク更新                       |
| DELETE   | `/api/tasks/:id`      | タスク削除                       |
| GET      | `/api/categories`     | ユーザーのカテゴリ一覧取得       |
| POST     | `/api/categories`     | カテゴリ作成                     |
| PATCH    | `/api/categories/:id` | カテゴリ更新                     |
| DELETE   | `/api/categories/:id` | カテゴリ削除                     |

## DB スキーマ

Prisma で管理。`prisma/schema.prisma` を参照。

```
User ─┬── Task (1:N)
      └── Category (1:N)
```

| テーブル   | 説明                                             |
| ---------- | ------------------------------------------------ |
| users      | ユーザー（メール・パスワード・利用規約同意日時） |
| tasks      | タスク（ユーザー別、カテゴリはテキスト）         |
| categories | カテゴリ（ユーザー別、並び順付き）               |

## MCP サーバー

Claude Code からタスクを直接操作するための MCP サーバー。
**長期JWTによる認証必須**（旧実装の IDOR 脆弱性は恒久対応済み）。

### 提供ツール

| ツール            | 説明                                           |
| ----------------- | ---------------------------------------------- |
| `whoami`          | 接続中アカウント確認（破壊的操作前の安全確認） |
| `list_tasks`      | ステータス／カテゴリでフィルタした一覧         |
| `list_categories` | 自分のカテゴリ一覧                             |
| `create_task`     | 新規タスク作成                                 |
| `update_task`     | ステータス・優先度・メモ等の更新               |
| `delete_task`     | タスク削除（タイトル一致による誤削除防止付き） |

### セットアップ

1. 長期JWTを発行（1年有効）:
   - **UI から発行（推奨）**: アカウント画面 → 「MCP トークン」セクション → ラベルを入力して「新規発行」
   - **CLI から発行**:
     ```bash
     npx tsx issue-token.ts <your-email> [label]
     ```
     どちらも `tokens` テーブルに `jti` を記録し、UI から個別に取消できる。

2. 出力されたJWTを `.env` の `TASK_APP_TOKEN=` にセット

3. Claude Code の MCP 設定に登録（絶対パス）:

   ```bash
   claude mcp add task-app --scope user -- npx tsx <project-root>/mcp-server.ts
   ```

   `api/src/framework/prisma/client.ts` がプロジェクトルートの `.env` を自動読み込みするため、`claude mcp` 側で環境変数を個別に渡す必要はない。

4. 動作確認:

   ```
   claude mcp list
   # task-app: ... - ✓ Connected
   ```

### トークン失効

- **個別失効**: アカウント画面の「MCP トークン」セクションで一覧表示と取消ができる。取消後はそのトークンによる API 呼び出しが即座に 401 になる
- **一括失効**: JWT_SECRET をローテートすれば全トークン（session + mcp）を一度に無効化できる
- **本機構導入前に発行された旧 mcp トークン**（jti claim 無し）は受理されないため、再発行が必要
