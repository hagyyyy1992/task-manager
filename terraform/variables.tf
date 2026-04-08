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

variable "project_name" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "task-app"
}
