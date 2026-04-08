#!/usr/bin/env bash
# 初回デプロイ / インフラ変更時に手動実行するスクリプト
# CI/CD (GitHub Actions) はこのスクリプトを使わず Lambda/S3 のみ更新する
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== 1. フロントエンドビルド ==="
npm run build

echo "=== 2. Lambdaバンドル ==="
mkdir -p terraform/.lambda-build

npx esbuild handler.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=terraform/.lambda-build/index.js \
  --define:'import.meta.url="file:///var/task/index.js"' \
  --log-level=info

# Lambda ランタイムに type:module の影響が出ないよう独立した package.json を配置
echo '{"name":"task-app-lambda"}' > terraform/.lambda-build/package.json

cd terraform/.lambda-build
zip -r function.zip index.js package.json
cd "$SCRIPT_DIR"

echo "=== 3. Terraform apply ==="
cd terraform
terraform init -upgrade

# op run でシークレットを環境変数に展開 (ファイルに書き出さない)
# sh -c で囲むことで $DATABASE_URL を op run の子プロセス内で展開させる
op run --env-file=../.env.tpl -- \
  sh -c 'terraform apply -var="database_url=$DATABASE_URL" -auto-approve'

echo ""
echo "=== デプロイ完了 ==="
echo ""
echo "アクセスURL:"
terraform output -raw cloudfront_url
echo ""
echo "─────────────────────────────────────────────"
echo "GitHub Actions 用に以下をリポジトリの Variables に設定してください:"
echo "  S3_BUCKET_NAME          = $(terraform output -raw s3_bucket_name)"
echo "  CLOUDFRONT_DISTRIBUTION_ID = $(terraform output -raw cloudfront_distribution_id)"
echo "  LAMBDA_FUNCTION_NAME    = $(terraform output -raw lambda_function_name)"
echo "─────────────────────────────────────────────"
