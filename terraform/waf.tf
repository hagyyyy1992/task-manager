# ─── AWS WAFv2 (CloudFront 用) ──────────────────────────────────────────────
# 認証エンドポイント (/api/auth/*) を IP 単位で rate limit する。
# CloudFront に attach する WAF は必ず us-east-1 に作成する必要があるため
# provider alias を使う。
# (issue #38)

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

resource "aws_wafv2_web_acl" "cloudfront" {
  provider = aws.us_east_1
  name     = "${var.project_name}-cloudfront-acl"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # /api/auth/* に対する IP 単位 rate limit。
  # WAFv2 の rate-based rule は 5 分間ウィンドウ固定。
  # しきい値は 5 分あたりのリクエスト数で、最小値 100。
  # 「5 req / 5min」のような厳しい値は WAF だけでは表現できないので
  # 100 req / 5min で運用しつつ CloudWatch Insights 側で emailFp 集計検知と組み合わせる。
  rule {
    name     = "auth-rate-limit"
    priority = 0

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 100
        aggregate_key_type = "IP"

        scope_down_statement {
          byte_match_statement {
            field_to_match {
              uri_path {}
            }
            positional_constraint = "STARTS_WITH"
            search_string         = "/api/auth/"
            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-auth-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # 全体の DDoS 緩衝として、全パスに対して緩めの rate limit を被せておく。
  # しきい値は IP あたり 2000 req / 5min。通常ユーザーは到達しない値で
  # ボット系の異常アクセスのみ落とす狙い。
  rule {
    name     = "global-rate-limit"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-global-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-cloudfront-acl"
    sampled_requests_enabled   = true
  }
}
