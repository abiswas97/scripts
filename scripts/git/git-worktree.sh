#!/bin/bash

# Ensure we have the latest refs
git fetch --prune origin >/dev/null 2>&1

# Validate input
if [ $# -ne 1 ] || [ -z "$1" ]; then
    echo "Usage: $0 <branch-name>"
    exit 1
fi

get_manager_for_dir() {
    local dir="$1"
    if [[ -f "$dir/pnpm-lock.yaml" ]]; then
        echo "pnpm"
    elif [[ -f "$dir/bun.lockb" ]] || [[ -f "$dir/bun.lock" ]]; then
        echo "bun"
    elif [[ -f "$dir/yarn.lock" ]]; then
        echo "yarn"
    elif [[ -f "$dir/package-lock.json" ]]; then
        echo "npm"
    elif [[ -f "$dir/Cargo.toml" ]]; then
        echo "cargo"
    elif [[ -f "$dir/go.mod" ]]; then
        echo "go"
    elif [[ -f "$dir/Pipfile" ]]; then
        echo "pipenv"
    elif [[ -f "$dir/requirements.txt" ]]; then
        echo "pip"
    elif [[ -f "$dir/pyproject.toml" ]]; then
        echo "pip"
    elif [[ -f "$dir/package.json" ]]; then
        echo "npm"
    fi
}

run_install_for_manager() {
    local manager="$1"
    local dir="$2"
    case "$manager" in
        pnpm)   pnpm install >/dev/null 2>&1 ;;
        yarn)   yarn install >/dev/null 2>&1 ;;
        npm)    npm install >/dev/null 2>&1 ;;
        bun)    bun install >/dev/null 2>&1 ;;
        cargo)  cargo fetch >/dev/null 2>&1 ;;
        go)     go mod download >/dev/null 2>&1 ;;
        pipenv) pipenv install >/dev/null 2>&1 ;;
        pip)
            if [[ -f "$dir/requirements.txt" ]]; then
                pip install -r requirements.txt >/dev/null 2>&1
            elif [[ -f "$dir/pyproject.toml" ]]; then
                pip install -e . >/dev/null 2>&1
            fi
            ;;
        *) return 1 ;;
    esac
}

detect_workspace_roots() {
    local base_dir="$1"
    local roots=""

    if [[ -f "$base_dir/pnpm-workspace.yaml" ]] && [[ -f "$base_dir/pnpm-lock.yaml" ]]; then
        roots="pnpm:$base_dir"$'\n'
    fi

    if [[ -f "$base_dir/yarn.lock" ]] && [[ -f "$base_dir/package.json" ]]; then
        if grep -q '"workspaces"' "$base_dir/package.json" 2>/dev/null; then
            roots="${roots}yarn:$base_dir"$'\n'
        fi
    fi

    if [[ -f "$base_dir/package-lock.json" ]] && [[ -f "$base_dir/package.json" ]]; then
        if grep -q '"workspaces"' "$base_dir/package.json" 2>/dev/null; then
            roots="${roots}npm:$base_dir"$'\n'
        fi
    fi

    if { [[ -f "$base_dir/bun.lockb" ]] || [[ -f "$base_dir/bun.lock" ]]; } && [[ -f "$base_dir/package.json" ]]; then
        if grep -q '"workspaces"' "$base_dir/package.json" 2>/dev/null; then
            roots="${roots}bun:$base_dir"$'\n'
        fi
    fi

    if [[ -f "$base_dir/Cargo.toml" ]]; then
        if grep -q '^\[workspace\]' "$base_dir/Cargo.toml" 2>/dev/null; then
            roots="${roots}cargo:$base_dir"$'\n'
        fi
    fi

    if [[ -f "$base_dir/go.work" ]]; then
        roots="${roots}go:$base_dir"$'\n'
    fi

    printf '%s' "$roots"
}

is_covered_by_workspace() {
    local dir="$1"
    local manager="$2"
    local workspace_roots="$3"
    local js_managers="pnpm yarn npm bun"

    while IFS= read -r entry; do
        [[ -z "$entry" ]] && continue
        local ws_manager="${entry%%:*}"
        local ws_path="${entry#*:}"
        [[ "$dir" == "$ws_path" ]] && continue

        if [[ " $js_managers " == *" $manager "* ]] && [[ " $js_managers " == *" $ws_manager "* ]]; then
            [[ "$dir" == "$ws_path"/* ]] && return 0
        fi

        if [[ "$manager" == "$ws_manager" ]] && [[ "$dir" == "$ws_path"/* ]]; then
            return 0
        fi
    done <<< "$workspace_roots"
    return 1
}

install_dependencies() {
    local base_dir="$1"
    local workspace_roots
    workspace_roots=$(detect_workspace_roots "$base_dir")
    local installed=0

    while IFS= read -r dir; do
        [[ -z "$dir" ]] && continue

        local manager
        manager=$(get_manager_for_dir "$dir")
        [[ -z "$manager" ]] && continue

        if [[ "$dir" != "$base_dir" ]] && is_covered_by_workspace "$dir" "$manager" "$workspace_roots"; then
            continue
        fi

        if [[ "$dir" != "$base_dir" ]]; then
            local nested_ws
            nested_ws=$(detect_workspace_roots "$dir")
            if [[ -n "$nested_ws" ]]; then
                workspace_roots="${workspace_roots}${nested_ws}"
            fi
        fi

        local rel_path="${dir#$base_dir/}"
        [[ "$dir" == "$base_dir" ]] && rel_path="."

        echo "Installing dependencies ($manager) in $rel_path..."
        (cd "$dir" && run_install_for_manager "$manager" "$dir") || echo "  ⚠️  $manager install failed in $rel_path"
        ((installed++))
    done < <(find "$base_dir" \
        -name node_modules -prune -o \
        -name .git -prune -o \
        -name target -prune -o \
        -name vendor -prune -o \
        -name dist -prune -o \
        -name build -prune -o \
        -name .bare -prune -o \
        -name .next -prune -o \
        -name .cache -prune -o \
        -name __pycache__ -prune -o \
        -name .venv -prune -o \
        -name .tox -prune -o \
        -name .mypy_cache -prune -o \
        -type d -print | sort)
}

# Parse branch name (handle "origin/branch" format)
branch="${1#origin/}"

# Create safe directory name
dir=$(echo "$branch" | sed "s/[^a-zA-Z0-9._-]/-/g")

echo "Setting up worktree: $dir"

# Handle existing worktree
if git worktree list --porcelain | grep -q "worktree.*/$dir$"; then
    if ! git worktree remove "$dir" 2>/dev/null; then
        echo "⚠️  Worktree has uncommitted changes"
        echo "Run: git worktree remove -f $dir"
        exit 1
    fi
fi

# Determine bare repo root for worktree creation
bare_repo_root=$(dirname "$(git rev-parse --git-common-dir)")
worktree_path="$bare_repo_root/$dir"

# Create worktree with appropriate tracking
if git ls-remote --exit-code origin "$branch" >/dev/null 2>&1; then
    git worktree add --track -b "$branch" "$worktree_path" "origin/$branch" 2>/dev/null || \
    git worktree add "$worktree_path" "$branch" >/dev/null 2>&1
else
    git worktree add -b "$branch" "$worktree_path" >/dev/null 2>&1
fi

# Set upstream tracking
git -C "$worktree_path" branch --set-upstream-to="origin/$branch" "$branch" >/dev/null 2>&1 || true

# Merge latest main
cd "$worktree_path" && {
    if git merge origin/main --no-edit >/dev/null 2>&1; then
        echo "Merged origin/main"
    else
        git merge --abort 2>/dev/null
        echo "⚠️  Merge conflicts with origin/main — resolve manually"
    fi
    cd - >/dev/null
}

# Install dependencies recursively
install_dependencies "$worktree_path"

read_config() {
    local config_file="$1"
    local key="$2"
    
    if [[ ! -f "$config_file" ]]; then
        return 1
    fi
    
    # Try jq first, fallback to basic parsing
    if command -v jq >/dev/null 2>&1; then
        jq -r ".${key} // empty" "$config_file" 2>/dev/null
    else
        # Basic JSON parsing for simple cases
        grep "\"${key}\"" "$config_file" | sed 's/.*"[^"]*"[^"]*"\([^"]*\)".*/\1/' | head -1
    fi
}

find_latest_worktree() {
    local bare_repo_root="$1"
    local new_worktree_dir="$2"
    local latest_worktree=""
    local latest_time=0
    
    while IFS= read -r line; do
        if [[ "$line" =~ ^worktree[[:space:]](.+)$ ]]; then
            local wt_path="${BASH_REMATCH[1]}"
            
            # Skip: bare repo, new worktree being created, and non-existent directories
            if [[ "$wt_path" == *".bare" ]] || \
               [[ "$(basename "$wt_path")" == "$new_worktree_dir" ]] || \
               [[ ! -d "$wt_path" ]]; then
                continue
            fi
            
            # Get the most recent modification time
            local mod_time=0
            
            # Check directory modification time
            if [[ -d "$wt_path" ]]; then
                mod_time=$(stat -f %m "$wt_path" 2>/dev/null || stat -c %Y "$wt_path" 2>/dev/null || echo 0)
                
                # Also check key files that indicate recent activity
                for check_file in "$wt_path/.git/index" "$wt_path/package.json" "$wt_path/.env"; do
                    if [[ -f "$check_file" ]]; then
                        local file_time=$(stat -f %m "$check_file" 2>/dev/null || stat -c %Y "$check_file" 2>/dev/null || echo 0)
                        if [[ "$file_time" -gt "$mod_time" ]]; then
                            mod_time="$file_time"
                        fi
                    fi
                done
            fi
            
            # Track the worktree with the most recent modification
            if [[ "$mod_time" -gt "$latest_time" ]]; then
                latest_time="$mod_time"
                latest_worktree="$wt_path"
            fi
        fi
    done < <(git worktree list --porcelain)
    
    echo "$latest_worktree"
}

find_worktree_by_branch() {
    local branch_name="$1"
    local target_worktree=""
    
    while IFS= read -r line; do
        if [[ "$line" =~ ^worktree[[:space:]](.+)$ ]]; then
            local wt_path="${BASH_REMATCH[1]}"
            if [[ "$wt_path" != *".bare" ]] && [[ -d "$wt_path" ]]; then
                if git -C "$wt_path" branch --show-current 2>/dev/null | grep -q "^${branch_name}$"; then
                    target_worktree="$wt_path"
                    break
                fi
            fi
        fi
    done < <(git worktree list --porcelain)
    
    echo "$target_worktree"
}

find_source_worktree() {
    local bare_repo_root="$1"
    local new_worktree_dir="$2"
    local config_file="$bare_repo_root/.gitworktree"
    
    # Check if config exists and get source preference
    local source_pref
    source_pref=$(read_config "$config_file" "source")
    
    if [[ -n "$source_pref" ]]; then
        if [[ "$source_pref" == "latest" ]]; then
            # Find worktree with most recent modification
            find_latest_worktree "$bare_repo_root" "$new_worktree_dir"
        else
            # Find specific worktree by branch name
            find_worktree_by_branch "$source_pref"
        fi
    else
        # Fallback to existing behavior: prefer main, then latest
        local main_worktree
        main_worktree=$(find_worktree_by_branch "main")
        if [[ -n "$main_worktree" ]]; then
            echo "$main_worktree"
        else
            find_latest_worktree "$bare_repo_root" "$new_worktree_dir"
        fi
    fi
}

copy_env_files() {
    local source_wt="$1"
    local dest_wt="$2"
    
    if [[ -z "$source_wt" ]] || [[ ! -d "$source_wt" ]]; then
        return
    fi
    
    local copied=0
    while IFS= read -r env_file; do
        if [[ -f "$env_file" ]]; then
            local basename=$(basename "$env_file")
            cp -p "$env_file" "$dest_wt/$basename" 2>/dev/null && ((copied++))
        fi
    done < <(find "$source_wt" -maxdepth 1 -name ".env*" -type f 2>/dev/null)
    
    if [[ "$copied" -gt 0 ]]; then
        echo "Copied $copied .env file(s)"
    fi
}

copy_included_files() {
    local source_wt="$1"
    local dest_wt="$2"
    local config_file="$3"
    
    if [[ -z "$source_wt" ]] || [[ ! -d "$source_wt" ]] || [[ ! -f "$config_file" ]]; then
        return
    fi
    
    local copied=0
    local patterns
    
    # Get include patterns from config
    if command -v jq >/dev/null 2>&1; then
        patterns=$(jq -r '.include[]? // empty' "$config_file" 2>/dev/null)
    else
        # Basic parsing - extract patterns from include array
        patterns=$(grep -A 10 '"include"' "$config_file" | grep '"' | sed 's/.*"\([^"]*\)".*/\1/' | grep -v include)
    fi
    
    if [[ -z "$patterns" ]]; then
        return
    fi
    
    # Process patterns in a way that preserves the copied counter
    while IFS= read -r pattern; do
        if [[ -z "$pattern" ]]; then
            continue
        fi
        
        # Determine if pattern is regex or simple filename
        if [[ "$pattern" =~ [\^\$\.\*\[\]\{\}\(\)\?\+\\\|] ]]; then
            # Regex pattern - search whole tree and match against basename
            while IFS= read -r matched_file; do
                if [[ -f "$matched_file" ]]; then
                    local filename="$(basename "$matched_file")"
                    if [[ "$filename" =~ $pattern ]]; then
                        local rel_path="${matched_file#$source_wt/}"
                        if [[ "$rel_path" == "$matched_file" ]]; then
                            rel_path="$filename"
                        fi
                        local dest_path="$dest_wt/$rel_path"
                        mkdir -p "$(dirname "$dest_path")" 2>/dev/null
                        if cp -p "$matched_file" "$dest_path" 2>/dev/null; then
                            echo "  Copied: ${rel_path:-$filename} (regex: $pattern)"
                            ((copied++))
                        fi
                    fi
                fi
            done < <(find "$source_wt" -type f 2>/dev/null)
        else
            # Simple filename or glob pattern
            while IFS= read -r matched_file; do
                if [[ -f "$matched_file" ]]; then
                    local rel_path="${matched_file#$source_wt/}"
                    if [[ "$rel_path" == "$matched_file" ]]; then
                        rel_path="$(basename "$matched_file")"
                    fi
                    local dest_path="$dest_wt/$rel_path"
                    mkdir -p "$(dirname "$dest_path")" 2>/dev/null
                    if cp -p "$matched_file" "$dest_path" 2>/dev/null; then
                        echo "  Copied: ${rel_path:-$(basename "$matched_file")} (pattern: $pattern)"
                        ((copied++))
                    fi
                fi
            done < <(find "$source_wt" -type f -name "$pattern" 2>/dev/null)
        fi
    done <<< "$patterns"
    
    if [[ "$copied" -gt 0 ]]; then
        echo "Copied $copied additional file(s) from config"
    fi
}

# Find source worktree and copy files
source_worktree=$(find_source_worktree "$bare_repo_root" "$dir")

if [[ -n "$source_worktree" ]]; then
    echo "Using source worktree: $(basename "$source_worktree")"
    copy_env_files "$source_worktree" "$worktree_path"
    copy_included_files "$source_worktree" "$worktree_path" "$bare_repo_root/.gitworktree"
fi

# Allow direnv if .envrc exists
if [[ -f "$worktree_path/.envrc" ]]; then
    if command -v direnv >/dev/null 2>&1; then
        direnv allow "$worktree_path" >/dev/null 2>&1 && echo "Allowed direnv"
    fi
fi

echo "✓ Worktree ready: $dir"
