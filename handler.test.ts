import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Task } from "./db.js";

vi.mock("./db.js", () => ({
  loadTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("./auth.js", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed"),
  verifyPassword: vi.fn().mockResolvedValue(true),
  createToken: vi.fn().mockResolvedValue("test-token"),
  verifyToken: vi.fn().mockResolvedValue("user123"),
}));

import { loadTasks, createTask, updateTask, deleteTask } from "./db.js";
import { handler } from "./handler.js";

const mockTask: Task = {
  id: "test123",
  title: "テストタスク",
  status: "todo",
  priority: "medium",
  category: "その他",
  dueDate: null,
  memo: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function event(method: string, path: string, body?: unknown, authenticated = true): Parameters<typeof handler>[0] {
  return {
    requestContext: { http: { method } },
    rawPath: path,
    headers: authenticated ? { authorization: "Bearer test-token" } : {},
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handler", () => {
  it("OPTIONS returns 204", async () => {
    const res = await handler(event("OPTIONS", "/api/tasks"));
    expect(res.statusCode).toBe(204);
  });

  it("GET /api/tasks returns task list", async () => {
    vi.mocked(loadTasks).mockResolvedValue([mockTask]);
    const res = await handler(event("GET", "/api/tasks"));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([mockTask]);
  });

  it("POST /api/tasks creates a task", async () => {
    vi.mocked(createTask).mockResolvedValue();
    const res = await handler(event("POST", "/api/tasks", mockTask));
    expect(res.statusCode).toBe(201);
    expect(createTask).toHaveBeenCalledWith(mockTask);
  });

  it("PATCH /api/tasks/:id updates a task", async () => {
    const updated = { ...mockTask, status: "done" as const };
    vi.mocked(updateTask).mockResolvedValue(updated);
    const res = await handler(event("PATCH", "/api/tasks/test123", { status: "done" }));
    expect(res.statusCode).toBe(200);
    expect(updateTask).toHaveBeenCalledWith("test123", { status: "done" });
    expect(JSON.parse(res.body).status).toBe("done");
  });

  it("PATCH /api/tasks/:id returns 404 for unknown id", async () => {
    vi.mocked(updateTask).mockResolvedValue(null);
    const res = await handler(event("PATCH", "/api/tasks/unknown", { status: "done" }));
    expect(res.statusCode).toBe(404);
  });

  it("DELETE /api/tasks/:id deletes a task", async () => {
    vi.mocked(deleteTask).mockResolvedValue(mockTask);
    const res = await handler(event("DELETE", "/api/tasks/test123"));
    expect(res.statusCode).toBe(200);
    expect(deleteTask).toHaveBeenCalledWith("test123");
  });

  it("DELETE /api/tasks/:id returns 404 for unknown id", async () => {
    vi.mocked(deleteTask).mockResolvedValue(null);
    const res = await handler(event("DELETE", "/api/tasks/unknown"));
    expect(res.statusCode).toBe(404);
  });

  it("unknown route returns 404", async () => {
    const res = await handler(event("GET", "/api/unknown"));
    expect(res.statusCode).toBe(404);
  });

  it("handles base64 encoded body", async () => {
    vi.mocked(createTask).mockResolvedValue();
    const body = Buffer.from(JSON.stringify(mockTask)).toString("base64");
    const res = await handler({
      requestContext: { http: { method: "POST" } },
      rawPath: "/api/tasks",
      headers: { authorization: "Bearer test-token" },
      body,
      isBase64Encoded: true,
    });
    expect(res.statusCode).toBe(201);
    expect(createTask).toHaveBeenCalledWith(mockTask);
  });

  it("returns 500 on db error", async () => {
    vi.mocked(loadTasks).mockRejectedValue(new Error("db down"));
    const res = await handler(event("GET", "/api/tasks"));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain("db down");
  });
});
