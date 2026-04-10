import { neon, types } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Neon's default DATE parser uses `new Date(y, m, d)` (local time),
// which shifts dates depending on the runtime timezone. Keep as strings.
types.setTypeParser(1082, (val: string) => val);

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = join(__dirname, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0 && !line.startsWith("#")) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const sql = neon(process.env.DATABASE_URL!);

export interface Task {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: "high" | "medium" | "low";
  category: string;
  dueDate: string | null;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

interface DbRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  due_date: string | null;
  memo: string;
  created_at: string;
  updated_at: string;
}

function rowToTask(row: DbRow): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    category: row.category,
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null,
    memo: row.memo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadTasks(filters?: {
  status?: string;
  category?: string;
}): Promise<Task[]> {
  let rows: DbRow[];
  if (filters?.status && filters?.category) {
    rows = (await sql`SELECT * FROM tasks WHERE status = ${filters.status} AND category = ${filters.category} ORDER BY created_at DESC`) as DbRow[];
  } else if (filters?.status) {
    rows = (await sql`SELECT * FROM tasks WHERE status = ${filters.status} ORDER BY created_at DESC`) as DbRow[];
  } else if (filters?.category) {
    rows = (await sql`SELECT * FROM tasks WHERE category = ${filters.category} ORDER BY created_at DESC`) as DbRow[];
  } else {
    rows = (await sql`SELECT * FROM tasks ORDER BY created_at DESC`) as DbRow[];
  }
  return rows.map(rowToTask);
}

export async function createTask(task: Task): Promise<void> {
  await sql`
    INSERT INTO tasks (id, title, status, priority, category, due_date, memo, created_at, updated_at)
    VALUES (${task.id}, ${task.title}, ${task.status}, ${task.priority}, ${task.category}, ${task.dueDate}, ${task.memo}, ${task.createdAt}, ${task.updatedAt})
  `;
}

export async function updateTask(
  id: string,
  updates: Partial<Pick<Task, "status" | "priority" | "title" | "memo" | "dueDate">>
): Promise<Task | null> {
  const rows = (await sql`SELECT * FROM tasks WHERE id = ${id}`) as DbRow[];
  if (rows.length === 0) return null;

  const current = rowToTask(rows[0]);
  const now = new Date().toISOString();
  const newTitle = updates.title ?? current.title;
  const newStatus = updates.status ?? current.status;
  const newPriority = updates.priority ?? current.priority;
  const newMemo = updates.memo ?? current.memo;
  const newDueDate = updates.dueDate !== undefined ? (updates.dueDate || null) : current.dueDate;

  await sql`
    UPDATE tasks SET
      title = ${newTitle},
      status = ${newStatus},
      priority = ${newPriority},
      memo = ${newMemo},
      due_date = ${newDueDate},
      updated_at = ${now}
    WHERE id = ${id}
  `;

  return { ...current, title: newTitle, status: newStatus as Task["status"], priority: newPriority as Task["priority"], memo: newMemo, dueDate: newDueDate, updatedAt: now };
}

export async function deleteTask(id: string): Promise<Task | null> {
  const rows = (await sql`SELECT * FROM tasks WHERE id = ${id}`) as DbRow[];
  if (rows.length === 0) return null;
  const task = rowToTask(rows[0]);
  await sql`DELETE FROM tasks WHERE id = ${id}`;
  return task;
}

