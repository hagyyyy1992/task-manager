// Category 用の重複エラー判定ヘルパー。
// Category 唯一の unique 制約は (userId, name) のため、name に絡む P2002 を duplicate として扱う。
// create / update のどちらでも同じ判定が必要なので共有化している。
export function isPrismaUniqueViolationOnName(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as { code?: unknown; meta?: { target?: unknown } }
  if (err.code !== 'P2002') return false
  const target = err.meta?.target
  if (Array.isArray(target)) return target.includes('name')
  if (typeof target === 'string') return target.includes('name')
  // target が無いケースは安全側で true
  return target === undefined
}

export const CATEGORY_DUPLICATE_MESSAGE = '同じ名前のカテゴリが既に存在します'
