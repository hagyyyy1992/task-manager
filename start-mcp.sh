#!/bin/zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export DATABASE_URL=$(op read "op://Personal/task-app/password" --account my.1password.com)
exec npx tsx /Users/kh/work/task-app/mcp-server.ts
