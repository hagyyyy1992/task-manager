export interface Category {
  id: string
  userId: string
  name: string
  sortOrder: number
  createdAt: string
}

export interface CategoryWithCount extends Category {
  taskCount: number
}

export const FALLBACK_CATEGORY_NAME = 'その他'

export const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; sortOrder: number }> = [
  { name: '決算・税務', sortOrder: 0 },
  { name: '案件・営業', sortOrder: 1 },
  { name: 'プロダクト開発', sortOrder: 2 },
  { name: '事務・手続き', sortOrder: 3 },
  { name: FALLBACK_CATEGORY_NAME, sortOrder: 4 },
]
