import type { Task } from '../../../domain/entities/Task.js'

export type UpdateTaskOutput = { ok: true; task: Task } | { ok: false; reason: 'not_found' }
