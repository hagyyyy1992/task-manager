import type { Task } from '../../../domain/entities/Task.js'

export type CreateTaskOutput =
  | { ok: true; task: Task }
  | { ok: false; reason: 'invalid_input'; message: string }
