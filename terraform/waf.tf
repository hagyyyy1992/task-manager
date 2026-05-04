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

  # CloudFront scope のデフォルト body inspection は 16 KB。api-body-size-limit ルールで
  # 64 KB 超を検知するには KB_64 まで拡張が必要 (WCU 追加課金: ~25 WCU 増)。
  association_config {
    request_body {
      cloudfront {
        default_size_inspection_limit = "KB_64"
      }
    }
  }

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
                # 大文字 bypass (例: /API/auth/...) を塞ぐため LOWERCASE に統一。
                # trailing slash や query string は WAF uri_path には含まれないため
                # 別途対策不要 (RFC 3986; AWS WAF の uri_path は path のみ) (issue #59)
                text_transformation {
                  priority = 0
                  type     = "LOWERCASE"
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
                # 大文字 bypass (例: /API/auth/...) を塞ぐため LOWERCASE に統一。
                # trailing slash や query string は WAF uri_path には含まれないため
                # 別途対策不要 (RFC 3986; AWS WAF の uri_path は path のみ) (issue #59)
                text_transformation {
                  priority = 0
                  type     = "LOWERCASE"
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
  # HTTP method は不問 (GET/HEAD 等を含めて IP 単位で抑制)。method-aware に
  # するには and_statement で byte_match_statement (HTTP method = PATCH/DELETE)
  # を追加するが、過剰検証で誤検知リスクが上がるため意図的に不問とする。
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
                # 大文字 bypass (例: /API/auth/...) を塞ぐため LOWERCASE に統一。
                # trailing slash や query string は WAF uri_path には含まれないため
                # 別途対策不要 (RFC 3986; AWS WAF の uri_path は path のみ) (issue #59)
                text_transformation {
                  priority = 0
                  type     = "LOWERCASE"
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
                # 大文字 bypass (例: /API/auth/...) を塞ぐため LOWERCASE に統一。
                # trailing slash や query string は WAF uri_path には含まれないため
                # 別途対策不要 (RFC 3986; AWS WAF の uri_path は path のみ) (issue #59)
                text_transformation {
                  priority = 0
                  type     = "LOWERCASE"
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

  # /api/* 配下で request body が 64 KB を超えるリクエストを edge で block (issue #63)。
  # アプリ層 (api/src/framework/middleware/body-size.middleware.ts) と同じ閾値で
  # 多層防御を構成する。CloudFront → WAF で先に弾くことで、巨大 body が API GW /
  # Lambda に到達して受信・パース時間を消費するのを防ぐ。
  #
  # 注:
  #   - CloudFront scope の WAF はデフォルトで body の最初の 16 KB のみ検査する。
  #     64 KB まで検査するには association_config.request_body.cloudfront.
  #     default_size_inspection_limit = "KB_64" が必要 (WCU 追加課金あり)。
  #     さらに field_to_match.body.oversize_handling = "MATCH" を指定しないと
  #     検査範囲外の body は CONTINUE (スキップ) となり本ルールが意図通りに発火しない。
  #   - size 比較対象は body のみ。HTTP method 不問 (GET 等で body 付きの異常も block)。
  #   - text_transformation は size 比較には影響しないが API 必須なので NONE を 1 つ。
  rule {
    name     = "api-body-size-limit"
    priority = 4

    action {
      block {}
    }

    statement {
      and_statement {
        statement {
          byte_match_statement {
            field_to_match {
              uri_path {}
            }
            positional_constraint = "STARTS_WITH"
            search_string         = "/api/"
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
        statement {
          size_constraint_statement {
            field_to_match {
              body {
                # MATCH: 検査範囲(64 KB)を超えた body はそのまま本ルールにマッチさせて block。
                # CONTINUE (default) では oversize 分がスキップされ 64 KB 超が素通りする。
                oversize_handling = "MATCH"
              }
            }
            comparison_operator = "GT"
            size                = 65536
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
      metric_name                = "${var.project_name}-api-body-size-limit"
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

# ─── CloudWatch Dashboard: 誤検知監視 (issue #71) ────────────────────────────
# 全 rule の BlockedRequests を可視化し、observation 期間 (2-4w) での誤検知率測定と
# 閾値見直しに使う。runbook (docs/runbook/waf.md) からこの dashboard を参照する。
#
# CloudFront scope の WAF メトリクスは us-east-1 リージョンに publish されるため、
# widget 内の properties.region = "us-east-1" が必須。dashboard リソース自体の
# リージョンは表示には関係ないが、provider alias を us_east_1 に揃える。
#
# Region 次元値は CloudFront scope では "CloudFront" を使う (既存アラームと同値)。
locals {
  waf_rule_names = [
    "auth-rate-limit",
    "auth-mutating-rate-limit",
    "api-body-size-limit",
    "api-global-rate-limit",
  ]
}

resource "aws_cloudwatch_dashboard" "waf" {
  provider       = aws.us_east_1
  dashboard_name = "${var.project_name}-waf-monitoring"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 24
        height = 8
        properties = {
          title   = "WAF BlockedRequests by Rule (last 24h, 5min sum)"
          view    = "timeSeries"
          stacked = false
          region  = "us-east-1"
          stat    = "Sum"
          period  = 300
          metrics = [
            for rule in local.waf_rule_names : [
              "AWS/WAFV2",
              "BlockedRequests",
              "WebACL", aws_wafv2_web_acl.cloudfront.name,
              "Rule", rule,
              "Region", "CloudFront",
            ]
          ]
          yAxis = { left = { min = 0 } }
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 8
        width  = 24
        height = 6
        properties = {
          title   = "WAF AllowedRequests by Rule (last 24h, 5min sum) — false-positive 検出用"
          view    = "timeSeries"
          stacked = false
          region  = "us-east-1"
          stat    = "Sum"
          period  = 300
          metrics = [
            for rule in local.waf_rule_names : [
              "AWS/WAFV2",
              "AllowedRequests",
              "WebACL", aws_wafv2_web_acl.cloudfront.name,
              "Rule", rule,
              "Region", "CloudFront",
            ]
          ]
          yAxis = { left = { min = 0 } }
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 14
        width  = 24
        height = 6
        properties = {
          title  = "WAF BlockedRequests by Rule (last 30d, 1h sum) — 閾値見直し用"
          view   = "timeSeries"
          region = "us-east-1"
          stat   = "Sum"
          period = 3600
          metrics = [
            for rule in local.waf_rule_names : [
              "AWS/WAFV2",
              "BlockedRequests",
              "WebACL", aws_wafv2_web_acl.cloudfront.name,
              "Rule", rule,
              "Region", "CloudFront",
            ]
          ]
          yAxis = { left = { min = 0 } }
        }
      },
    ]
  })
}
