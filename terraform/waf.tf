# ─── AWS WAFv2 (CloudFront 用) ──────────────────────────────────────────────
# 認証エンドポイント (/api/auth/login, /api/auth/register) を IP 単位で rate limit する。
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

  # /api/auth/login と /api/auth/register に対する IP 単位 rate limit。
  # WAFv2 の rate-based rule は 5 分間ウィンドウ固定。
  # しきい値は 5 分あたりのリクエスト数で、最小値 100。
  # 「5 req / 5min」のような厳しい値は WAF だけでは表現できないので
  # 100 req / 5min で運用しつつ CloudWatch Insights 側で emailFp 集計検知と組み合わせる。
  #
  # 認証後 API (/api/auth/me, /api/auth/password, /api/auth/account) を含めると
  # 共有 IP 配下で複数ユーザーの通常セッションが合算されて誤遮断する恐れがあるため、
  # ここでは公開系の login / register に絞る (codex review コメント対応)。
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
          or_statement {
            statement {
              byte_match_statement {
                field_to_match {
                  uri_path {}
                }
                positional_constraint = "EXACTLY"
                search_string         = "/api/auth/login"
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
            statement {
              byte_match_statement {
                field_to_match {
                  uri_path {}
                }
                positional_constraint = "EXACTLY"
                search_string         = "/api/auth/register"
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
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

  # /api/auth/password (PATCH) と /api/auth/account (DELETE) は認証通過後の
  # 操作だが currentPassword を要求するため、トークン窃取後のブルートフォース
  # 経路になる。login/register より頻度が低い (通常 1 ユーザー数回) ので
  # 50 req / 5min / IP で絞る (issue #59)。
  rule {
    name     = "auth-mutating-rate-limit"
    priority = 2

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 50
        aggregate_key_type = "IP"

        scope_down_statement {
          or_statement {
            statement {
              byte_match_statement {
                field_to_match {
                  uri_path {}
                }
                positional_constraint = "EXACTLY"
                search_string         = "/api/auth/password"
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
            statement {
              byte_match_statement {
                field_to_match {
                  uri_path {}
                }
                positional_constraint = "EXACTLY"
                search_string         = "/api/auth/account"
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-auth-mutating-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # /api/* 全体の DDoS 緩衝。SPA の静的アセット (CloudFront S3 origin) は対象外。
  # しきい値は IP あたり 2000 req / 5min。共有 NAT/企業プロキシ配下で SPA を見るだけの
  # 通常利用は対象から外し、API レイヤの異常アクセスのみ落とす (codex review コメント対応)。
  rule {
    name     = "api-global-rate-limit"
    priority = 3

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"

        scope_down_statement {
          byte_match_statement {
            field_to_match {
              uri_path {}
            }
            positional_constraint = "STARTS_WITH"
            search_string         = "/api/"
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
      metric_name                = "${var.project_name}-api-global-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-cloudfront-acl"
    sampled_requests_enabled   = true
  }
}

# ─── WAF logging configuration ───────────────────────────────────────────────
# block 発生時の詳細を CloudWatch Logs に残し、調査・閾値見直しに使う。
# Log group 名は WAFv2 の制約で "aws-waf-logs-" prefix が必須。
resource "aws_cloudwatch_log_group" "waf" {
  provider          = aws.us_east_1
  name              = "aws-waf-logs-${var.project_name}-cloudfront"
  retention_in_days = 30
}

resource "aws_wafv2_web_acl_logging_configuration" "cloudfront" {
  provider                = aws.us_east_1
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
  resource_arn            = aws_wafv2_web_acl.cloudfront.arn

  redacted_fields {
    single_header {
      name = "authorization"
    }
  }
}

# ─── CloudWatch Alarm: block 急増を通知 ──────────────────────────────────────
# auth-rate-limit による block が 5 分で 10 件を超えたらアラート。
# まずはアラームのみ作成し、SNS 通知先 (Slack 連携等) は別途 var で注入する想定。
resource "aws_cloudwatch_metric_alarm" "waf_auth_blocks" {
  provider            = aws.us_east_1
  alarm_name          = "${var.project_name}-waf-auth-blocks"
  alarm_description   = "WAF auth-rate-limit による block が短時間で急増"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BlockedRequests"
  namespace           = "AWS/WAFV2"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"

  dimensions = {
    WebACL = aws_wafv2_web_acl.cloudfront.name
    Region = "CloudFront"
    Rule   = "auth-rate-limit"
  }
}

# auth-mutating-rate-limit による block アラート (issue #59)。
# password/account は通常頻度が低いので、5 分で 5 件超えたら異常。
resource "aws_cloudwatch_metric_alarm" "waf_auth_mutating_blocks" {
  provider            = aws.us_east_1
  alarm_name          = "${var.project_name}-waf-auth-mutating-blocks"
  alarm_description   = "WAF auth-mutating-rate-limit (password/account) による block が急増"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BlockedRequests"
  namespace           = "AWS/WAFV2"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"

  dimensions = {
    WebACL = aws_wafv2_web_acl.cloudfront.name
    Region = "CloudFront"
    Rule   = "auth-mutating-rate-limit"
  }
}
