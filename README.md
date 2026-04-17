# task-manager

自分用のタスク管理アプリ。<br>
React フロントエンド + Node.js API サーバー + MCP サーバーの3層構成。<br>
Neon PostgreSQL をバックエンドに使用することで複数端末間でタスクを同期できる。

アプリURL: 
https://d3pi0juuilndgb.cloudfront.net

### デモアカウント

| メール | パスワード |
|--------|-----------|
| demo@example.com | password1234 |

## 構成

```
task-manager/
├── src/               # React フロントエンド（Vite）
├── prisma/            # Prisma スキーマ・マイグレーション
├── auth.ts            # JWT認証・パスワードハッシュ
├── db.ts              # Prisma Client + DB操作関数
├── handler.ts         # Lambda ハンドラー
├── api-server.ts      # ローカル開発用 API サーバー（port 3456）
├── mcp-server.ts      # MCP サーバー（Claude Code から操作）
└── migrate.ts         # マイグレーション + シード
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
| MCP サーバー | @modelcontextprotocol/sdk |
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
```

1Password を使っている場合は以下で取得できる:

```bash
op run --env-file=.env.tpl -- env | grep DATABASE_URL
```

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

## MCP サーバー（Claude Code 連携）

`~/.claude/mcp.json` に以下を追加:

```json
{
  "mcpServers": {
    "task-app": {
      "command": "npx",
      "args": ["tsx", "/path/to/task-manager/mcp-server.ts"]
    }
  }
}
```

Claude Code から `/mcp` で接続状態を確認できる。

### MCP ツール一覧

| ツール | 説明 |
|--------|------|
| `list_tasks` | タスク一覧を取得。`status` / `category` でフィルタ可能 |
| `create_task` | 新しいタスクを作成 |
| `update_task` | ステータス・優先度・タイトル・メモ・期限を更新 |
| `delete_task` | タスクを削除 |

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
