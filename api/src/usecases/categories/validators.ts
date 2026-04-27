// カテゴリ名は task.category 文字列カラムを介して全タスクに伝播するため、
// 上限を usecase 層で enforce する（DB 容量・表示崩れ・伝播時の長時間ロック対策）
export const CATEGORY_NAME_MAX = 100
