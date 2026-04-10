import { createServer } from "http";
import { loadTasks, createTask, updateTask, deleteTask } from "./db.js";
import type { Task } from "./db.js";

function readBody(req: import("http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url ?? "";

  try {
    // GET /api/tasks
    if (url === "/api/tasks" && req.method === "GET") {
      const tasks = await loadTasks();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tasks));
      return;
    }

    // POST /api/tasks
    if (url === "/api/tasks" && req.method === "POST") {
      const body = await readBody(req);
      const task = JSON.parse(body) as Task;
      await createTask(task);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(task));
      return;
    }

    // PATCH /api/tasks/:id
    const patchMatch = url.match(/^\/api\/tasks\/(.+)$/);
    if (patchMatch && req.method === "PATCH") {
      const body = await readBody(req);
      const updates = JSON.parse(body);
      const updated = await updateTask(patchMatch[1], updates);
      if (!updated) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(updated));
      return;
    }

    // DELETE /api/tasks/:id
    const deleteMatch = url.match(/^\/api\/tasks\/(.+)$/);
    if (deleteMatch && req.method === "DELETE") {
      const deleted = await deleteTask(deleteMatch[1]);
      if (!deleted) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(deleted));
      return;
    }

    res.writeHead(404);
    res.end();
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(e) }));
  }
});

server.listen(3456, () => {
  console.log("API server running at http://localhost:3456");
});
