export type DeleteCategoryOutput =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'protected'; message: string }
