# WAF rate-limit runbook

CloudFront 前段の AWS WAFv2 rate-limit ルールに関する運用 runbook。

## 対象 rule 一覧

| rule name                  | 対象 path                                 | limit (5min/IP) | アラーム閾値   | 意図                                            |
| -------------------------- | ----------------------------------------- | --------------- | -------------- | ----------------------------------------------- |
| `auth-rate-limit`          | `/api/auth/login`, `/api/auth/register`   | 100             | 10 blocks/5min | login/register のブルートフォース・列挙攻撃緩和 |
| `auth-mutating-rate-limit` | `/api/auth/password`, `/api/auth/account` | 50              | 5 blocks/5min  | currentPassword 要求 API のブルートフォース緩和 |
| `api-body-size-limit`      | `/api/*` (body > 64 KB)                   | —               | —              | edge での大量 body 弾き (多層防御)              |
| `api-global-rate-limit`    | `/api/*` 全体                             | 2000            | —              | DDoS 緩衝                                       |

定義: `terraform/waf.tf`

## 監視ダッシュボード

CloudWatch dashboard: **`task-app-waf-monitoring`** (us-east-1)

- 過去 24h の BlockedRequests by Rule (5min sum)
- 過去 24h の AllowedRequests by Rule (5min sum) — 誤検知の有無を確認
- 過去 30d の BlockedRequests by Rule (1h sum) — 閾値見直し用

URL: AWS Console → CloudWatch → Dashboards → `task-app-waf-monitoring` (region は us-east-1 で開く)

## 誤検知発生時の対応手順

### 1. 検知トリガー

- ユーザーから「ログインできない」「`429` / `403` が返る」報告
- CloudWatch Alarm `task-app-waf-auth-blocks` または `task-app-waf-auth-mutating-blocks` 発火
- ダッシュボードで急激な BlockedRequests スパイクを発見

### 2. 状況確認 (3〜5分)

WAF logs で block 元 IP と path を特定する。CloudWatch Logs Insights で:

```
fields @timestamp, httpRequest.clientIp, httpRequest.uri, terminatingRuleId, action
| filter action = "BLOCK"
| filter @timestamp > now() - 1h
| stats count() by httpRequest.clientIp, terminatingRuleId
| sort count desc
| limit 50
```

Log group: `aws-waf-logs-task-app-cloudfront` (us-east-1)

判断基準:

- **同一 IP から連続 block** → 攻撃の可能性大。対応不要 (期待動作)
- **複数 IP から散発 block** → 共有 NAT/オフィス IP の誤検知の可能性。次へ進む
- **特定 IP が大量 block されているが正規ユーザー** → 緊急 allowlist 追加 (3 へ)

### 3. 緊急対応: 一時的な IP allowlist 追加

正規ユーザーが恒常的に block されており、即時解除が必要な場合のみ。

**前提**: `terraform-apply.yml` workflow が走るのでローカル apply は不要。

1. 対象 IP を確認 (ユーザーに `https://ipinfo.io` 等で確認してもらう)
2. `terraform/waf.tf` の WAF rule 先頭 (priority=0 より前 = priority=-1 はないので、既存 rule の priority を 1 つずつ後ろにずらす) に IP allowlist rule を追加:

   ```hcl
   resource "aws_wafv2_ip_set" "emergency_allowlist" {
     provider           = aws.us_east_1
     name               = "${var.project_name}-emergency-allowlist"
     scope              = "CLOUDFRONT"
     ip_address_version = "IPV4"
     addresses          = ["203.0.113.42/32"]  # ← 対象 IP/CIDR
   }

   # rule は priority を全 rule より小さく (= 先) して allow を最優先にする
   rule {
     name     = "emergency-ip-allowlist"
     priority = -10  # 既存 rule (0,2,3,4) より前
     action {
       allow {}
     }
     statement {
       ip_set_reference_statement {
         arn = aws_wafv2_ip_set.emergency_allowlist.arn
       }
     }
     visibility_config {
       cloudwatch_metrics_enabled = true
       metric_name                = "${var.project_name}-emergency-allowlist"
       sampled_requests_enabled   = true
     }
   }
   ```

   注: WAFv2 は priority の小さいものから評価される。allow が早く match すれば後続 rule はスキップ。

3. PR を作成して main にマージ → `terraform-apply.yml` を workflow_dispatch で実行
4. 反映後、対象ユーザーに動作確認依頼
5. **24〜72h 以内に allowlist を撤去**。緊急措置を恒久化しない (運用で必ず追跡)

### 4. 再発防止: 閾値見直し

誤検知が複数回発生した場合は閾値引き上げを検討。

判断基準:

- 同一 rule で 7 日以上にわたり週 1 回以上の正規ユーザー誤検知
- 観察期間 (2〜4 週) で BlockedRequests のうち AllowedRequests 比率が極端に高い

調整目安:
| 状況 | rule | 現値 | 引き上げ案 |
|---|---|---|---|
| login/register が日常で block | `auth-rate-limit` | limit=100, threshold=10 | limit=200, threshold=20 |
| password/account が法人 NAT で block | `auth-mutating-rate-limit` | limit=50, threshold=5 | limit=100, threshold=10 |
| `/api/*` 全体が共有 IP で block | `api-global-rate-limit` | limit=2000 | limit=4000 |

調整は `terraform/waf.tf` の `limit` と `terraform/waf.tf` 末尾の alarm `threshold` を同時に変更し、PR で履歴を残すこと。

## 観察期間 (post-deploy)

PR #70 (auth-mutating-rate-limit) と PR #79 (api-body-size-limit) のマージ後、**最低 4 週間** の観察を実施し以下を記録する:

- 各 rule の累計 BlockedRequests
- 誤検知由来の allowlist 追加回数
- 閾値調整の有無

観察結果は本 runbook の末尾 `## 観察ログ` セクション (任意追記) に残し、定期見直しの根拠とする。

## 関連リソース

- WebACL: `aws_wafv2_web_acl.cloudfront` (`terraform/waf.tf`)
- Log group: `aws-waf-logs-task-app-cloudfront` (retention 30d)
- アラーム: `task-app-waf-auth-blocks`, `task-app-waf-auth-mutating-blocks`
- Dashboard: `task-app-waf-monitoring`

## 関連 issue / PR

- #59 / PR #70: auth-mutating-rate-limit 追加
- #63 / PR #79: api-body-size-limit + association_config KB_64
- #71 (本 runbook 整備)
