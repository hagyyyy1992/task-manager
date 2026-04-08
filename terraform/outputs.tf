output "cloudfront_url" {
  description = "アクセスURL"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront Distribution ID (GitHub Actions CI/CD で使用)"
  value       = aws_cloudfront_distribution.main.id
}

output "s3_bucket_name" {
  description = "フロントエンド用S3バケット名 (GitHub Actions CI/CD で使用)"
  value       = aws_s3_bucket.frontend.bucket
}

output "lambda_function_name" {
  description = "Lambda関数名 (GitHub Actions CI/CD で使用)"
  value       = aws_lambda_function.api.function_name
}
