import type { Task } from '../../../domain/entities/Task.js'

export type DeleteTaskOutput = { ok: true; task: Task } | { ok: false; reason: 'not_found' }
