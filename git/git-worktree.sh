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

find_source_worktree() {
    local main_worktree=""
    local latest_worktree=""
    local latest_time=0
    
    while IFS= read -r line; do
        if [[ "$line" =~ ^worktree[[:space:]](.+)$ ]]; then
            local wt_path="${BASH_REMATCH[1]}"
            # Skip bare repo and the current new worktree
            if [[ "$wt_path" != *".bare" ]] && [[ "$wt_path" != *"/$dir" ]]; then
                if git -C "$wt_path" branch --show-current 2>/dev/null | grep -q "^main$"; then
                    main_worktree="$wt_path"
                fi
                
                if [[ -d "$wt_path" ]]; then
                    local mod_time=$(stat -f %m "$wt_path" 2>/dev/null || stat -c %Y "$wt_path" 2>/dev/null || echo 0)
                    if [[ "$mod_time" -gt "$latest_time" ]]; then
                        latest_time="$mod_time"
                        latest_worktree="$wt_path"
                    fi
                fi
            fi
        fi
    done < <(git worktree list --porcelain)
    
    if [[ -n "$main_worktree" ]]; then
        echo "$main_worktree"
    else
        echo "$latest_worktree"
    fi
}

copy_env_files() {
    local source_wt="$1"
    local dest_wt="$2"
    
    if [[ -z "$source_wt" ]] || [[ ! -d "$source_wt" ]]; then
        echo "No source worktree found for copying .env files"
        return
    fi
    
    echo "Copying .env files from: $source_wt"
    
    local copied=0
    while IFS= read -r env_file; do
        if [[ -f "$env_file" ]]; then
            local basename=$(basename "$env_file")
            cp -p "$env_file" "$dest_wt/$basename" 2>/dev/null && {
                echo "  Copied: $basename"
                ((copied++))
            }
        fi
    done < <(find "$source_wt" -maxdepth 1 -name ".env*" -type f 2>/dev/null)
    
    if [[ "$copied" -eq 0 ]]; then
        echo "  No .env files found to copy"
    else
        echo "  Total files copied: $copied"
    fi
}

source_worktree=$(find_source_worktree)
if [[ -n "$source_worktree" ]]; then
    copy_env_files "$source_worktree" "$dir"
fi

echo "Worktree ready at: $dir"