const API = '/api/auth'

export interface User {
  id: string
  email: string
  name: string
  createdAt: string
  updatedAt: string
}

interface AuthResponse {
  user: User
  token: string
}

function getToken(): string | null {
  return localStorage.getItem('token')
}

function setToken(token: string): void {
  localStorage.setItem('token', token)
}

function clearToken(): void {
  localStorage.removeItem('token')
}

export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function register(
  email: string,
  password: string,
  name: string,
  termsAgreed: boolean,
): Promise<User> {
  const res = await fetch(`${API}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, termsAgreed }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Registration failed')
  }
  const data: AuthResponse = await res.json()
  setToken(data.token)
  return data.user
}

export async function login(email: string, password: string): Promise<User> {
  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Login failed')
  }
  const data: AuthResponse = await res.json()
  setToken(data.token)
  return data.user
}

export function logout(): void {
  clearToken()
}

export async function fetchMe(): Promise<User | null> {
  const token = getToken()
  if (!token) return null
  const res = await fetch(`${API}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    clearToken()
    return null
  }
  return await res.json()
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const token = localStorage.getItem('token')
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(`${API}/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to change password')
  }
}

export async function deleteAccount(currentPassword: string): Promise<void> {
  const token = getToken()
  if (!token) return
  const res = await fetch(`${API}/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to delete account')
  }
  clearToken()
}

// ─── MCP token 管理 (issue #37) ────────────────────────────────

export interface McpToken {
  id: string
  label: string
  createdAt: string
  lastUsedAt: string | null
}

export async function listMcpTokens(): Promise<McpToken[]> {
  const res = await fetch(`${API}/mcp-tokens`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Failed to load MCP tokens: ${res.status}`)
  const body = (await res.json()) as { tokens: McpToken[] }
  return body.tokens
}

// 生成された JWT は **このレスポンスでしか取得できない**。UI はその場で表示してコピーさせる。
export async function issueMcpToken(label: string): Promise<{ token: string; tokenId: string }> {
  const res = await fetch(`${API}/mcp-tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ label }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `Failed to issue MCP token: ${res.status}`)
  }
  return await res.json()
}

export async function revokeMcpToken(id: string): Promise<void> {
  const res = await fetch(`${API}/mcp-tokens/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to revoke MCP token: ${res.status}`)
}

// ─── パスワードリセット (issue #66) ────────────────────────────────

export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch(`${API}/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'リクエストに失敗しました')
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'パスワードのリセットに失敗しました')
  }
}
