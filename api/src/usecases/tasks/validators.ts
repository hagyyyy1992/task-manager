import { z } from 'zod'

const TITLE_MAX = 200
const MEMO_MAX = 5000
const CATEGORY_MAX = 100

export const TaskCreateSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(TITLE_MAX),
  status: z.enum(['todo', 'in_progress', 'done']),
  priority: z.enum(['high', 'medium', 'low']),
  category: z.string().trim().min(1, 'category is required').max(CATEGORY_MAX),
  // ISO date (YYYY-MM-DD) or null
  dueDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD'), z.null()])
    .optional()
    .transform((v) => v ?? null),
  memo: z
    .string()
    .max(MEMO_MAX)
    .optional()
    .transform((v) => v ?? ''),
  pinned: z
    .boolean()
    .optional()
    .transform((v) => v ?? false),
})

export type TaskCreateDto = z.infer<typeof TaskCreateSchema>

export const TaskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX),
    status: z.enum(['todo', 'in_progress', 'done']),
    priority: z.enum(['high', 'medium', 'low']),
    category: z.string().trim().min(1).max(CATEGORY_MAX),
    dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]),
    memo: z.string().max(MEMO_MAX),
    pinned: z.boolean(),
  })
  .partial()

export type TaskUpdateDto = z.infer<typeof TaskUpdateSchema>
