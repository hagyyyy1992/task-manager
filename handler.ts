import { loadTasks, createTask, updateTask, deleteTask } from "./db.js";
import type { Task } from "./db.js";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface LambdaEvent {
  requestContext: { http: { method: string } };
  rawPath: string;
  body?: string;
  isBase64Encoded?: boolean;
}

function parseBody(event: LambdaEvent): unknown {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString()
    : (event.body ?? "");
  return raw ? JSON.parse(raw) : {};
}

export const handler = async (event: LambdaEvent) => {
  const method = event.requestContext.http.method;

  if (method === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    // GET /api/tasks — list all tasks
    if (event.rawPath === "/api/tasks" && method === "GET") {
      const tasks = await loadTasks();
      return { statusCode: 200, headers, body: JSON.stringify(tasks) };
    }

    // POST /api/tasks — create a task
    if (event.rawPath === "/api/tasks" && method === "POST") {
      const task = parseBody(event) as Task;
      await createTask(task);
      return { statusCode: 201, headers, body: JSON.stringify(task) };
    }

    // PATCH /api/tasks/:id — update a task
    const patchMatch = event.rawPath.match(/^\/api\/tasks\/(.+)$/);
    if (patchMatch && method === "PATCH") {
      const id = patchMatch[1];
      const updates = parseBody(event) as Partial<Pick<Task, "status" | "priority" | "title" | "memo" | "dueDate">>;
      const updated = await updateTask(id, updates);
      if (!updated) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "not found" }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify(updated) };
    }

    // DELETE /api/tasks/:id — delete a task
    const deleteMatch = event.rawPath.match(/^\/api\/tasks\/(.+)$/);
    if (deleteMatch && method === "DELETE") {
      const id = deleteMatch[1];
      const deleted = await deleteTask(id);
      if (!deleted) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "not found" }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify(deleted) };
    }

    return { statusCode: 404, headers, body: "" };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String(e) }),
    };
  }
};
