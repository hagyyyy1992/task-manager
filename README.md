# task-manager

自分用のタスク管理アプリ。<br>
React フロントエンド + Node.js API サーバーの2層構成。<br>
Neon PostgreSQL をバックエンドに使用することで複数端末間でタスクを同期できる。

## 構成

```
task-manager/
├── src/               # React フロントエンド（Vite）
├── prisma/            # Prisma スキーマ・マイグレーション
├── auth.ts            # JWT認証・パスワードハッシュ
├── db.ts              # Prisma Client + DB操作関数
├── handler.ts         # Lambda ハンドラー
├── api-server.ts      # ローカル開発用 API サーバー（port 3456）
├── migrate.ts         # マイグレーション + シード
├── mcp-server.ts      # Claude Code 連携用 MCP サーバー（認証必須）
└── issue-token.ts     # MCP用 長期JWT 発行 CLI
```

## 技術スタック

| 役割 | 技術 |
|------|------|
| フロントエンド | React 19 + TypeScript + Vite + Tailwind CSS |
| ルーティング | react-router-dom |
| API サーバー | Node.js (http モジュール) |
| ORM | Prisma + @prisma/adapter-neon |
| データベース | Neon PostgreSQL |
| 認証 | JWT (jose) + crypto.scrypt |
| ドラッグ&ドロップ | @dnd-kit |
| テスト | Vitest + @testing-library/react |
| インフラ | AWS (S3 + CloudFront + Lambda + API Gateway) |
| IaC | Terraform |
| CI/CD | GitHub Actions |

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env` ファイルをプロジェクトルートに作成（gitignore 済み）:

```
DATABASE_URL=postgresql://...（Neon の接続文字列）
JWT_SECRET=...（32バイト以上の乱数推奨、本番とローカルで別値）
```

1Password を使っている場合は `.env.tpl` 経由で注入できる:

```bash
op run --env-file=.env.tpl -- <command>
```

JWT_SECRET は未設定だと起動時に例外を投げる（fail-fast）。

### 3. Prisma Client 生成

```bash
npx prisma generate
```

### 4. DB マイグレーション

```bash
npx tsx migrate.ts
```

既存ユーザーに対してデフォルトカテゴリが自動作成される。

## 起動

### フロントエンド（開発サーバー）

```bash
npm run dev
# → http://localhost:5173
```

### API サーバー

```bash
npx tsx api-server.ts
# → http://localhost:3456
```

フロントエンドはこの API サーバーを通じて DB と通信する。

## REST API

### 認証（公開）

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/auth/register` | アカウント登録（利用規約同意必須） |
| POST | `/api/auth/login` | ログイン（JWT発行） |

### 認証必須

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/auth/me` | ログインユーザー情報取得 |
| PATCH | `/api/auth/password` | パスワード変更 |
| DELETE | `/api/auth/account` | アカウント削除（タスク連動削除） |
| GET | `/api/tasks` | ユーザーのタスク一覧取得 |
| POST | `/api/tasks` | タスク作成 |
| PATCH | `/api/tasks/:id` | タスク更新 |
| DELETE | `/api/tasks/:id` | タスク削除 |
| GET | `/api/categories` | ユーザーのカテゴリ一覧取得 |
| POST | `/api/categories` | カテゴリ作成 |
| PATCH | `/api/categories/:id` | カテゴリ更新 |
| DELETE | `/api/categories/:id` | カテゴリ削除 |

## DB スキーマ

Prisma で管理。`prisma/schema.prisma` を参照。

```
User ─┬── Task (1:N)
      └── Category (1:N)
```

| テーブル | 説明 |
|---------|------|
| users | ユーザー（メール・パスワード・利用規約同意日時） |
| tasks | タスク（ユーザー別、カテゴリはテキスト） |
| categories | カテゴリ（ユーザー別、並び順付き） |

## MCP サーバー

Claude Code からタスクを直接操作するための MCP サーバー。
**長期JWTによる認証必須**（旧実装の IDOR 脆弱性は恒久対応済み）。

### 提供ツール

| ツール | 説明 |
|--------|------|
| `list_tasks` | ステータス／カテゴリでフィルタした一覧 |
| `list_categories` | 自分のカテゴリ一覧 |
| `create_task` | 新規タスク作成 |
| `update_task` | ステータス・優先度・メモ等の更新 |
| `delete_task` | タスク削除 |

### セットアップ

1. 長期JWTを発行（1年有効）:

   ```bash
   op run --env-file=.env.tpl -- npx tsx issue-token.ts <your-email>
   ```

2. 出力されたJWTを 1Password に保存（例: `op://Personal/task-app/mcp-token`）

3. Claude Code の MCP 設定に登録:

   ```bash
   claude mcp add task-app --scope user \
     -- op run --env-file=/absolute/path/to/.env.tpl \
        -- npx tsx /absolute/path/to/mcp-server.ts
   ```

   `.env.tpl` に `TASK_APP_TOKEN=op://Personal/task-app/mcp-token` を追加しておくこと。

4. 動作確認:

   ```
   claude mcp list
   # task-app: ... - ✓ Connected
   ```

### トークン失効

- JWT_SECRET をローテートすれば既存トークンを一括無効化できる
- 個別失効機構はなし（必要なら `token_revocations` テーブル等の追加検討）
