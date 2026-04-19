variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}

variable "database_url" {
  description = "Neon PostgreSQL connection string"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT署名用のシークレット（32バイト以上の乱数推奨）"
  type        = string
  sensitive   = true
}

variable "project_name" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "task-app"
}

variable "allow_registration" {
  description = "新規ユーザー登録を許可するか（文字列 'true' で有効、デフォルト無効）"
  type        = string
  default     = "false"
}
