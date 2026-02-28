#!/bin/bash
set -e

MONOREPO_ROOT="${1:-$(pwd)}"

if [[ ! -f "$MONOREPO_ROOT/.mcp.json" ]]; then
  echo "Error: No .mcp.json found in $MONOREPO_ROOT"
  echo "Usage: setup-env-mcp [worktree-path]"
  echo "  Run from a saaf-monorepo worktree, or pass the path as an argument."
  exit 1
fi

if ! command -v op &>/dev/null; then
  echo "Error: 1Password CLI (op) not installed."
  exit 1
fi

echo "Fetching secrets from 1Password..."

POSTHOG_KEY=$(op item get "Posthog Personal API Key" \
  --vault Private \
  --account my.1password.com \
  --fields credential \
  --reveal)

DB_PASSWORD=$(op item get "dev-postgres-db-password" \
  --vault Dev \
  --account saaffinanceinc.1password.com \
  --fields password \
  --reveal)

cat > "$MONOREPO_ROOT/.env.mcp" <<EOF
DB_HOST=localhost
DB_PORT=5432
DB_USER=root
DB_PASSWORD=${DB_PASSWORD}

POSTHOG_AUTH_HEADER=Bearer ${POSTHOG_KEY}
EOF

echo "Created $MONOREPO_ROOT/.env.mcp"
