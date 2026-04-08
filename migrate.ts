import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "data", "tasks.json");

const sql = neon(process.env.DATABASE_URL!);

// テーブル作成
await sql`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    category TEXT NOT NULL DEFAULT 'その他',
    due_date DATE,
    memo TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

console.log("✅ tasks テーブルを作成しました");

// 既存JSONデータの移行
if (existsSync(DATA_FILE)) {
  const tasks = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  if (tasks.length > 0) {
    for (const t of tasks) {
      await sql`
        INSERT INTO tasks (id, title, status, priority, category, due_date, memo, created_at, updated_at)
        VALUES (${t.id}, ${t.title}, ${t.status}, ${t.priority}, ${t.category}, ${t.dueDate}, ${t.memo}, ${t.createdAt}, ${t.updatedAt})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`✅ ${tasks.length}件のタスクを移行しました`);
  }
} else {
  console.log("ℹ️ 既存データなし、スキップ");
}
