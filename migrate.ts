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

await sql`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

console.log("✅ users テーブルを作成しました");

// usersテーブルに同意日時カラム追加
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMPTZ`;
console.log("✅ users.terms_agreed_at カラムを追加しました");

// tasksテーブルにuser_idカラム追加
await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id)`;
console.log("✅ tasks.user_id カラムを追加しました");

// 既存タスクをkeiichi.hagiwara.1992@gmail.comユーザーに紐付け
const seedUser = await sql`SELECT id FROM users WHERE email = 'keiichi.hagiwara.1992@gmail.com'`;
if (seedUser.length > 0) {
  const result = await sql`UPDATE tasks SET user_id = ${seedUser[0].id} WHERE user_id IS NULL`;
  console.log(`✅ 既存タスクをユーザーに紐付けました（${result.length ?? 0}件）`);
} else {
  console.log("ℹ️ keiichi.hagiwara.1992@gmail.com ユーザーが未登録のため紐付けスキップ");
  console.log("   → アカウント登録後にもう一度 migrate.ts を実行してください");
}

// カテゴリテーブル作成
await sql`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
  )
`;
console.log("✅ categories テーブルを作成しました");

// 既存ユーザーにデフォルトカテゴリを挿入
const DEFAULT_CATEGORIES = [
  { name: "決算・税務", sortOrder: 0 },
  { name: "案件・営業", sortOrder: 1 },
  { name: "プロダクト開発", sortOrder: 2 },
  { name: "事務・手続き", sortOrder: 3 },
  { name: "その他", sortOrder: 4 },
];

const allUsers = await sql`SELECT id FROM users`;
for (const user of allUsers) {
  for (const cat of DEFAULT_CATEGORIES) {
    const catId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await sql`
      INSERT INTO categories (id, user_id, name, sort_order)
      VALUES (${catId}, ${user.id}, ${cat.name}, ${cat.sortOrder})
      ON CONFLICT (user_id, name) DO NOTHING
    `;
  }
}
console.log(`✅ ${allUsers.length}ユーザーにデフォルトカテゴリを挿入しました`);

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
