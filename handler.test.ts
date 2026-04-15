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
  updateUserPassword: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("./auth.js", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed"),
  verifyPassword: vi.fn().mockResolvedValue(true),
  createToken: vi.fn().mockResolvedValue("test-token"),
  verifyToken: vi.fn().mockResolvedValue("user123"),
}));

import { loadTasks, createTask, updateTask, deleteTask, findUserByEmail, findUserById, createUser, updateUserPassword, deleteUser } from "./db.js";
import { verifyPassword, verifyToken } from "./auth.js";
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

const mockUser = {
  id: "user123",
  email: "test@example.com",
  name: "Test User",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const mockUserRow = {
  ...mockUser,
  password_hash: "salt:hash",
  created_at: mockUser.createdAt,
  updated_at: mockUser.updatedAt,
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
  // デフォルトのモック挙動をリセット
  vi.mocked(verifyToken).mockResolvedValue("user123");
  vi.mocked(verifyPassword).mockResolvedValue(true);
});

// ─── 既存タスクAPIテスト ──────────────────────────────────────────

describe("task endpoints", () => {
  it("OPTIONS returns 204", async () => {
    const res = await handler(event("OPTIONS", "/api/tasks"));
    expect(res.statusCode).toBe(204);
  });

  it("GET /api/tasks returns task list with userId filter", async () => {
    vi.mocked(loadTasks).mockResolvedValue([mockTask]);
    const res = await handler(event("GET", "/api/tasks"));
    expect(res.statusCode).toBe(200);
    expect(loadTasks).toHaveBeenCalledWith({ userId: "user123" });
    expect(JSON.parse(res.body)).toEqual([mockTask]);
  });

  it("POST /api/tasks creates a task with userId", async () => {
    vi.mocked(createTask).mockResolvedValue();
    const res = await handler(event("POST", "/api/tasks", mockTask));
    expect(res.statusCode).toBe(201);
    expect(createTask).toHaveBeenCalledWith(mockTask, "user123");
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
    expect(createTask).toHaveBeenCalledWith(mockTask, "user123");
  });

  it("returns 500 on db error", async () => {
    vi.mocked(loadTasks).mockRejectedValue(new Error("db down"));
    const res = await handler(event("GET", "/api/tasks"));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain("db down");
  });
});

// ─── 認証ミドルウェアテスト ──────────────────────────────────────

describe("auth middleware", () => {
  it("returns 401 when no token is provided", async () => {
    const res = await handler(event("GET", "/api/tasks", undefined, false));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("authentication required");
  });

  it("returns 401 when token is invalid", async () => {
    vi.mocked(verifyToken).mockResolvedValue(null);
    const res = await handler(event("GET", "/api/tasks"));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("invalid or expired token");
  });
});

// ─── アカウント登録テスト ────────────────────────────────────────

describe("POST /api/auth/register", () => {
  it("registers a new user", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(createUser).mockResolvedValue(mockUser);

    const res = await handler(event("POST", "/api/auth/register", {
      email: "test@example.com",
      password: "password1234",
      name: "Test User",
    }, false));

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe("test@example.com");
    expect(body.token).toBe("test-token");
    expect(createUser).toHaveBeenCalled();
  });

  it("returns 400 when fields are missing", async () => {
    const res = await handler(event("POST", "/api/auth/register", {
      email: "test@example.com",
    }, false));
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when password is too short", async () => {
    const res = await handler(event("POST", "/api/auth/register", {
      email: "test@example.com",
      password: "short",
      name: "Test",
    }, false));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("8 characters");
  });

  it("returns 409 when email is already registered", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow);

    const res = await handler(event("POST", "/api/auth/register", {
      email: "test@example.com",
      password: "password1234",
      name: "Test User",
    }, false));

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toContain("already registered");
  });
});

// ─── ログインテスト ──────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("logs in with valid credentials", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow);

    const res = await handler(event("POST", "/api/auth/login", {
      email: "test@example.com",
      password: "password1234",
    }, false));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe("test@example.com");
    expect(body.token).toBe("test-token");
  });

  it("returns 400 when fields are missing", async () => {
    const res = await handler(event("POST", "/api/auth/login", {
      email: "test@example.com",
    }, false));
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when user is not found", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);

    const res = await handler(event("POST", "/api/auth/login", {
      email: "unknown@example.com",
      password: "password1234",
    }, false));

    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when password is wrong", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow);
    vi.mocked(verifyPassword).mockResolvedValue(false);

    const res = await handler(event("POST", "/api/auth/login", {
      email: "test@example.com",
      password: "wrongpassword",
    }, false));

    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /api/auth/me テスト ─────────────────────────────────────

describe("GET /api/auth/me", () => {
  it("returns current user", async () => {
    vi.mocked(findUserById).mockResolvedValue(mockUser);

    const res = await handler(event("GET", "/api/auth/me"));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).email).toBe("test@example.com");
  });

  it("returns 404 when user not found", async () => {
    vi.mocked(findUserById).mockResolvedValue(null);

    const res = await handler(event("GET", "/api/auth/me"));
    expect(res.statusCode).toBe(404);
  });
});

// ─── パスワード変更テスト ────────────────────────────────────────

describe("PATCH /api/auth/password", () => {
  it("changes password with valid current password", async () => {
    vi.mocked(findUserById).mockResolvedValue(mockUser);
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow);
    vi.mocked(updateUserPassword).mockResolvedValue(true);

    const res = await handler(event("PATCH", "/api/auth/password", {
      currentPassword: "password1234",
      newPassword: "newpassword5678",
    }));

    expect(res.statusCode).toBe(200);
    expect(updateUserPassword).toHaveBeenCalledWith("user123", "hashed");
  });

  it("returns 400 when fields are missing", async () => {
    const res = await handler(event("PATCH", "/api/auth/password", {
      currentPassword: "password1234",
    }));
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when new password is too short", async () => {
    const res = await handler(event("PATCH", "/api/auth/password", {
      currentPassword: "password1234",
      newPassword: "short",
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("8 characters");
  });

  it("returns 401 when current password is wrong", async () => {
    vi.mocked(findUserById).mockResolvedValue(mockUser);
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow);
    vi.mocked(verifyPassword).mockResolvedValue(false);

    const res = await handler(event("PATCH", "/api/auth/password", {
      currentPassword: "wrongpassword",
      newPassword: "newpassword5678",
    }));

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toContain("current password");
  });
});

// ─── アカウント削除テスト ────────────────────────────────────────

describe("DELETE /api/auth/account", () => {
  it("deletes account", async () => {
    vi.mocked(deleteUser).mockResolvedValue(true);

    const res = await handler(event("DELETE", "/api/auth/account"));
    expect(res.statusCode).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith("user123");
  });

  it("returns 404 when user not found", async () => {
    vi.mocked(deleteUser).mockResolvedValue(false);

    const res = await handler(event("DELETE", "/api/auth/account"));
    expect(res.statusCode).toBe(404);
  });
});
