#!/bin/bash

# Git Worktree Helper Script
# Usage: git-worktree.sh <branch-name>

# Ensure we have the latest refs
git fetch --prune origin >/dev/null 2>&1 || echo "Warning: fetch failed, continuing anyway..."

# Validate input
if [ $# -ne 1 ] || [ -z "$1" ]; then
    echo "Usage: $0 <branch-name>"
    exit 1
fi

# Parse branch name (handle "origin/branch" format)
branch="${1#origin/}"

# Create safe directory name
dir=$(echo "$branch" | sed "s/[^a-zA-Z0-9._-]/-/g")

echo "Setting up worktree for '$branch' in '$dir'..."

# Handle existing worktree
if git worktree list --porcelain | grep -q "worktree.*/$dir$"; then
    # Try graceful removal first
    if ! git worktree remove "$dir" 2>/dev/null; then
        echo "⚠️  Worktree '$dir' has uncommitted changes"
        echo "    Options:"
        echo "    1. Commit or stash your changes"
        echo "    2. Force remove: git worktree remove -f $dir"
        exit 1
    fi
fi

# Create worktree with appropriate tracking
if git ls-remote --exit-code origin "$branch" >/dev/null 2>&1; then
    # Remote exists - create local branch with tracking
    git worktree add --track -b "$branch" "$dir" "origin/$branch" 2>/dev/null || \
    git worktree add "$dir" "$branch"  # Fallback if local branch exists
else
    # No remote - create new local branch
    echo "Creating new local branch '$branch'"
    git worktree add -b "$branch" "$dir"
fi

# Install dependencies
echo "Checking for dependencies..."
cd "$dir" && {
    git branch --set-upstream-to="origin/$branch" "$branch" >/dev/null 2>&1 || true

    if [ -f "pnpm-lock.yaml" ]; then
        echo "Installing with pnpm..."
        pnpm install || echo "Warning: pnpm install failed"
    elif [ -f "yarn.lock" ]; then
        echo "Installing with yarn..."
        yarn install || echo "Warning: yarn install failed"
    elif [ -f "package-lock.json" ] || [ -f "package.json" ]; then
        echo "Installing with npm..."
        npm install || echo "Warning: npm install failed"
    fi
    cd - >/dev/null
}

echo "Worktree ready at: $dir"