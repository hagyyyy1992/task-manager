# task-manager

自分用のタスク管理アプリ。（Claude Codeのセッション記憶に任せるのが面倒がきっかけで自分用に作ったので本当に使ってる。）
React フロントエンド + Node.js API サーバー + MCP サーバーの3層構成。
Neon PostgreSQL をバックエンドに使用することで複数端末間でタスクを同期できる。

アプリURL: 
https://d3pi0juuilndgb.cloudfront.net

### デモアカウント

| メール | パスワード |
|--------|-----------|
| demo@example.com | password1234 |

## 構成

```
task-app/
├── src/               # React フロントエンド（Vite）
├── api-server.ts      # REST API サーバー（port 3456）
├── mcp-server.ts      # MCP サーバー（Claude Code から操作）
├── db.ts              # Neon PostgreSQL 接続・クエリ
└── migrate.ts         # 初回マイグレーション用スクリプト
```

## 技術スタック

| 役割 | 技術 |
|------|------|
| フロントエンド | React 19 + TypeScript + Vite + Tailwind CSS |
| API サーバー | Node.js (http モジュール) |
| MCP サーバー | @modelcontextprotocol/sdk |
| データベース | Neon PostgreSQL (@neondatabase/serverless) |
| ドラッグ&ドロップ | @dnd-kit |

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

### 3. DB マイグレーション（初回のみ）

```bash
npx tsx migrate.ts
```

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
      "args": ["tsx", "/Users/kh/work/task-app/mcp-server.ts"]
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

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/tasks` | 全タスク取得 |
| PUT | `/api/tasks` | 全タスクを一括保存 |

## タスクのデータ構造

```typescript
interface Task {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: "high" | "medium" | "low";
  category: "決算・税務" | "案件・営業" | "プロダクト開発" | "事務・手続き" | "その他";
  dueDate: string | null;  // YYYY-MM-DD
  memo: string;
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}
```

## DB スキーマ

```sql
CREATE TABLE tasks (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL,
  priority   TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'その他',
  due_date   DATE,
  memo       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```
