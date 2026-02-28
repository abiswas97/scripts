#!/bin/bash
set -uo pipefail

# =============================================================================
# Package Manager Registry
#
# Format: name|detect_files|install_cmd|workspace_spec|ecosystem
#
# - detect_files:    comma-separated filenames or globs (first match wins)
# - install_cmd:     shell command to run (word-split, no eval)
# - workspace_spec:  "file" (existence) or "file:pattern" (grep), or empty
# - ecosystem:       grouping key — managers in the same ecosystem share
#                    workspace coverage (e.g. pnpm workspace covers npm subdirs)
#
# ORDER MATTERS: first matching entry wins. Put lock files before manifests.
# To add a new language, add one line here. Nothing else needs to change.
# =============================================================================

MANAGERS=(
    "pnpm|pnpm-lock.yaml|pnpm install|pnpm-workspace.yaml|js"
    "bun|bun.lockb,bun.lock|bun install|package.json:workspaces|js"
    "yarn|yarn.lock|yarn install|package.json:workspaces|js"
    "npm|package-lock.json|npm install|package.json:workspaces|js"

    "cargo|Cargo.toml|cargo fetch|Cargo.toml:\\[workspace\\]|cargo"
    "go|go.mod|go mod download|go.work|go"

    "uv|uv.lock|uv sync||python"
    "poetry|poetry.lock|poetry install||python"
    "pipenv|Pipfile|pipenv install||python"
    "pip|requirements.txt|pip install -r requirements.txt||python"
    "pip-pyproject|pyproject.toml|pip install -e .||python"

    "bundler|Gemfile|bundle install||ruby"
    "composer|composer.json|composer install||php"
    "dotnet|*.csproj,*.sln|dotnet restore|*.sln|dotnet"
    "mix|mix.exs|mix deps.get||elixir"
    "swift|Package.swift|swift package resolve||swift"
    "dart|pubspec.yaml|dart pub get||dart"
    "deno|deno.json,deno.jsonc|deno install||deno"

    "npm-fallback|package.json|npm install|package.json:workspaces|js"
)

PRUNE_DIRS=(
    node_modules .git target vendor dist build .bare
    .next .cache __pycache__ .venv .tox .mypy_cache
    .dart_tool .pub-cache _build deps
    .build .swiftpm Packages .zig-cache
)

# =============================================================================
# Output Helpers
# =============================================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
NC='\033[0m'

info()    { echo -e "${GREEN}✓${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠️  ${NC}$1"; }
step()    { echo -e "${BLUE}→${NC} $1"; }
detail()  { echo -e "  ${DIM}$1${NC}"; }

# =============================================================================
# Registry Helpers
# =============================================================================

registry_parse() {
    IFS='|' read -r R_NAME R_DETECT R_INSTALL R_WORKSPACE R_ECOSYSTEM <<< "$1"
}

file_exists_in_dir() {
    local dir="$1" pattern="$2"
    if [[ "$pattern" == *"*"* ]]; then
        compgen -G "$dir/$pattern" >/dev/null 2>&1
    else
        [[ -f "$dir/$pattern" ]]
    fi
}

# =============================================================================
# Package Manager Functions
# =============================================================================

get_manager_for_dir() {
    local dir="$1"
    for entry in "${MANAGERS[@]}"; do
        registry_parse "$entry"
        IFS=',' read -ra detect_files <<< "$R_DETECT"
        for file in "${detect_files[@]}"; do
            if file_exists_in_dir "$dir" "$file"; then
                echo "$R_NAME"
                return 0
            fi
        done
    done
}

get_ecosystem_for_manager() {
    local manager_name="$1"
    for entry in "${MANAGERS[@]}"; do
        registry_parse "$entry"
        if [[ "$R_NAME" == "$manager_name" ]]; then
            echo "$R_ECOSYSTEM"
            return 0
        fi
    done
}

run_install_for_manager() {
    local manager_name="$1"
    local dir="$2"
    for entry in "${MANAGERS[@]}"; do
        registry_parse "$entry"
        if [[ "$R_NAME" == "$manager_name" ]]; then
            # shellcheck disable=SC2086
            (cd "$dir" && $R_INSTALL) >/dev/null 2>&1
            return $?
        fi
    done
    return 1
}

detect_workspace_roots() {
    local base_dir="$1"
    local roots=""
    local seen_ecosystems=""

    for entry in "${MANAGERS[@]}"; do
        registry_parse "$entry"
        [[ -z "$R_WORKSPACE" ]] && continue
        [[ "$seen_ecosystems" == *"|${R_ECOSYSTEM}|"* ]] && continue

        local matched=false

        if [[ "$R_WORKSPACE" == *":"* ]]; then
            local ws_file="${R_WORKSPACE%%:*}"
            local ws_pattern="${R_WORKSPACE#*:}"
            if file_exists_in_dir "$base_dir" "$ws_file"; then
                local matched_file
                if [[ "$ws_file" == *"*"* ]]; then
                    matched_file=$(compgen -G "$base_dir/$ws_file" | head -1)
                else
                    matched_file="$base_dir/$ws_file"
                fi
                if grep -q "$ws_pattern" "$matched_file" 2>/dev/null; then
                    matched=true
                fi
            fi
        else
            if file_exists_in_dir "$base_dir" "$R_WORKSPACE"; then
                matched=true
            fi
        fi

        if $matched; then
            roots+="${R_ECOSYSTEM}:$base_dir"$'\n'
            seen_ecosystems+="|${R_ECOSYSTEM}|"
        fi
    done

    printf '%s' "$roots"
}

is_covered_by_workspace() {
    local dir="$1"
    local ecosystem="$2"
    local workspace_roots="$3"

    while IFS= read -r root_entry; do
        [[ -z "$root_entry" ]] && continue
        local ws_eco="${root_entry%%:*}"
        local ws_path="${root_entry#*:}"
        [[ "$dir" == "$ws_path" ]] && continue
        if [[ "$ecosystem" == "$ws_eco" ]] && [[ "$dir" == "$ws_path"/* ]]; then
            return 0
        fi
    done <<< "$workspace_roots"
    return 1
}

install_dependencies() {
    local base_dir="$1"
    local workspace_roots
    workspace_roots=$(detect_workspace_roots "$base_dir")

    local prune_args=()
    for pdir in "${PRUNE_DIRS[@]}"; do
        prune_args+=(-name "$pdir" -prune -o)
    done

    local install_dirs=()
    local install_managers=()

    while IFS= read -r dir; do
        [[ -z "$dir" ]] && continue

        local manager
        manager=$(get_manager_for_dir "$dir")
        [[ -z "$manager" ]] && continue

        local ecosystem
        ecosystem=$(get_ecosystem_for_manager "$manager")

        if [[ "$dir" != "$base_dir" ]] && is_covered_by_workspace "$dir" "$ecosystem" "$workspace_roots"; then
            continue
        fi

        if [[ "$dir" != "$base_dir" ]]; then
            local nested_ws
            nested_ws=$(detect_workspace_roots "$dir")
            if [[ -n "$nested_ws" ]]; then
                workspace_roots="${workspace_roots}${nested_ws}"
            fi
        fi

        install_dirs+=("$dir")
        install_managers+=("$manager")
    done < <(find "$base_dir" "${prune_args[@]}" -type d -print | sort)

    if [[ ${#install_dirs[@]} -eq 0 ]]; then
        return
    fi

    if [[ ${#install_dirs[@]} -eq 1 ]]; then
        local rel_path="${install_dirs[0]#$base_dir/}"
        [[ "${install_dirs[0]}" == "$base_dir" ]] && rel_path="."
        step "Installing dependencies (${install_managers[0]}) in $rel_path..."
        run_install_for_manager "${install_managers[0]}" "${install_dirs[0]}" || warn "${install_managers[0]} install failed in $rel_path"
    else
        step "Installing dependencies in ${#install_dirs[@]} directories..."
        local pids=()
        local pid_info=()

        for i in "${!install_dirs[@]}"; do
            local dir="${install_dirs[$i]}"
            local manager="${install_managers[$i]}"
            local rel_path="${dir#$base_dir/}"
            [[ "$dir" == "$base_dir" ]] && rel_path="."

            detail "$manager in $rel_path"
            run_install_for_manager "$manager" "$dir" &
            pids+=($!)
            pid_info+=("$manager|$rel_path")
        done

        local failed=0
        for i in "${!pids[@]}"; do
            if ! wait "${pids[$i]}"; then
                IFS='|' read -r mgr rpath <<< "${pid_info[$i]}"
                warn "$mgr install failed in $rpath"
                ((failed++))
            fi
        done

        if [[ "$failed" -eq 0 ]]; then
            info "All ${#install_dirs[@]} installs completed"
        else
            warn "$failed of ${#install_dirs[@]} installs failed"
        fi
    fi
}

# =============================================================================
# Git Helpers
# =============================================================================

get_default_branch() {
    local default_branch
    default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')

    if [[ -z "$default_branch" ]]; then
        git remote set-head origin --auto >/dev/null 2>&1 || true
        default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
    fi

    if [[ -z "$default_branch" ]]; then
        if git show-ref --verify --quiet refs/remotes/origin/main 2>/dev/null; then
            default_branch="main"
        elif git show-ref --verify --quiet refs/remotes/origin/master 2>/dev/null; then
            default_branch="master"
        fi
    fi

    echo "${default_branch:-main}"
}

# =============================================================================
# Worktree Source Resolution
# =============================================================================

read_config() {
    local config_file="$1"
    local key="$2"

    if [[ ! -f "$config_file" ]]; then
        return 1
    fi

    if command -v jq >/dev/null 2>&1; then
        jq -r ".${key} // empty" "$config_file" 2>/dev/null
    else
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

            if [[ "$wt_path" == *".bare" ]] || \
               [[ "$(basename "$wt_path")" == "$new_worktree_dir" ]] || \
               [[ ! -d "$wt_path" ]]; then
                continue
            fi

            local mod_time=0
            if [[ -d "$wt_path" ]]; then
                mod_time=$(stat -f %m "$wt_path" 2>/dev/null || stat -c %Y "$wt_path" 2>/dev/null || echo 0)
                for check_file in "$wt_path/.git/index" "$wt_path/package.json" "$wt_path/.env"; do
                    if [[ -f "$check_file" ]]; then
                        local file_time
                        file_time=$(stat -f %m "$check_file" 2>/dev/null || stat -c %Y "$check_file" 2>/dev/null || echo 0)
                        if [[ "$file_time" -gt "$mod_time" ]]; then
                            mod_time="$file_time"
                        fi
                    fi
                done
            fi

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

    while IFS= read -r line; do
        if [[ "$line" =~ ^worktree[[:space:]](.+)$ ]]; then
            local wt_path="${BASH_REMATCH[1]}"
            if [[ "$wt_path" != *".bare" ]] && [[ -d "$wt_path" ]]; then
                if git -C "$wt_path" branch --show-current 2>/dev/null | grep -q "^${branch_name}$"; then
                    echo "$wt_path"
                    return 0
                fi
            fi
        fi
    done < <(git worktree list --porcelain)
}

find_source_worktree() {
    local bare_repo_root="$1"
    local new_worktree_dir="$2"
    local config_file="$bare_repo_root/.gitworktree"

    local source_pref
    source_pref=$(read_config "$config_file" "source") || true

    if [[ -n "${source_pref:-}" ]]; then
        if [[ "$source_pref" == "latest" ]]; then
            find_latest_worktree "$bare_repo_root" "$new_worktree_dir"
        else
            find_worktree_by_branch "$source_pref"
        fi
    else
        local main_worktree
        main_worktree=$(find_worktree_by_branch "main")
        if [[ -n "$main_worktree" ]]; then
            echo "$main_worktree"
        else
            find_latest_worktree "$bare_repo_root" "$new_worktree_dir"
        fi
    fi
}

# =============================================================================
# File Copying
# =============================================================================

copy_env_files() {
    local source_wt="$1"
    local dest_wt="$2"

    if [[ -z "$source_wt" ]] || [[ ! -d "$source_wt" ]]; then
        return
    fi

    local copied=0
    while IFS= read -r env_file; do
        if [[ -f "$env_file" ]]; then
            cp -p "$env_file" "$dest_wt/$(basename "$env_file")" 2>/dev/null && ((copied++))
        fi
    done < <(find "$source_wt" -maxdepth 1 -name ".env*" -type f 2>/dev/null)

    if [[ "$copied" -gt 0 ]]; then
        info "Copied $copied .env file(s)"
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

    if command -v jq >/dev/null 2>&1; then
        patterns=$(jq -r '.include[]? // empty' "$config_file" 2>/dev/null)
    else
        patterns=$(grep -A 10 '"include"' "$config_file" | grep '"' | sed 's/.*"\([^"]*\)".*/\1/' | grep -v include)
    fi

    if [[ -z "$patterns" ]]; then
        return
    fi

    while IFS= read -r pattern; do
        [[ -z "$pattern" ]] && continue

        if [[ "$pattern" =~ [\^\$\.\*\[\]\{\}\(\)\?\+\\\|] ]]; then
            while IFS= read -r matched_file; do
                if [[ -f "$matched_file" ]]; then
                    local filename
                    filename="$(basename "$matched_file")"
                    if [[ "$filename" =~ $pattern ]]; then
                        local rel_path="${matched_file#$source_wt/}"
                        [[ "$rel_path" == "$matched_file" ]] && rel_path="$filename"
                        local dest_path="$dest_wt/$rel_path"
                        mkdir -p "$(dirname "$dest_path")" 2>/dev/null
                        cp -p "$matched_file" "$dest_path" 2>/dev/null && ((copied++))
                    fi
                fi
            done < <(find "$source_wt" -type f 2>/dev/null)
        else
            while IFS= read -r matched_file; do
                if [[ -f "$matched_file" ]]; then
                    local rel_path="${matched_file#$source_wt/}"
                    [[ "$rel_path" == "$matched_file" ]] && rel_path="$(basename "$matched_file")"
                    local dest_path="$dest_wt/$rel_path"
                    mkdir -p "$(dirname "$dest_path")" 2>/dev/null
                    cp -p "$matched_file" "$dest_path" 2>/dev/null && ((copied++))
                fi
            done < <(find "$source_wt" -type f -name "$pattern" 2>/dev/null)
        fi
    done <<< "$patterns"

    if [[ "$copied" -gt 0 ]]; then
        info "Copied $copied additional file(s) from config"
    fi
}

# =============================================================================
# Main
# =============================================================================

usage() {
    echo "Usage: $0 [options] <branch-name>"
    echo ""
    echo "Options:"
    echo "  --no-install    Skip dependency installation"
    echo "  --no-merge      Skip merging the default branch"
    echo "  -h, --help      Show this help message"
}

main() {
    local skip_install=false
    local skip_merge=false
    local branch_arg=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --no-install) skip_install=true; shift ;;
            --no-merge)   skip_merge=true; shift ;;
            -h|--help)    usage; exit 0 ;;
            -*)           echo "Unknown option: $1"; usage; exit 1 ;;
            *)
                if [[ -n "$branch_arg" ]]; then
                    echo "Too many arguments"; usage; exit 1
                fi
                branch_arg="$1"; shift ;;
        esac
    done

    if [[ -z "$branch_arg" ]]; then
        usage
        exit 1
    fi

    git fetch --prune origin >/dev/null 2>&1

    local branch="${branch_arg#origin/}"
    local dir
    dir=$(echo "$branch" | sed "s/[^a-zA-Z0-9._-]/-/g")

    step "Setting up worktree: $dir"

    if git worktree list --porcelain | grep -q "worktree.*/$dir$"; then
        if ! git worktree remove "$dir" 2>/dev/null; then
            warn "Worktree has uncommitted changes"
            echo "Run: git worktree remove -f $dir"
            exit 1
        fi
    fi

    local bare_repo_root
    bare_repo_root=$(dirname "$(git rev-parse --git-common-dir)")
    local worktree_path="$bare_repo_root/$dir"

    if git ls-remote --exit-code origin "$branch" >/dev/null 2>&1; then
        git worktree add --track -b "$branch" "$worktree_path" "origin/$branch" 2>/dev/null || \
        git worktree add "$worktree_path" "$branch" >/dev/null 2>&1
    else
        git worktree add -b "$branch" "$worktree_path" >/dev/null 2>&1
    fi

    git -C "$worktree_path" branch --set-upstream-to="origin/$branch" "$branch" >/dev/null 2>&1 || true

    if [[ "$skip_merge" == false ]]; then
        local default_branch
        default_branch=$(get_default_branch)
        cd "$worktree_path" && {
            if git merge "origin/$default_branch" --no-edit >/dev/null 2>&1; then
                info "Merged origin/$default_branch"
            else
                git merge --abort 2>/dev/null
                warn "Merge conflicts with origin/$default_branch — resolve manually"
            fi
            cd - >/dev/null
        }
    fi

    if [[ "$skip_install" == false ]]; then
        install_dependencies "$worktree_path"
    fi

    local source_worktree
    source_worktree=$(find_source_worktree "$bare_repo_root" "$dir")

    if [[ -n "$source_worktree" ]]; then
        step "Copying files from $(basename "$source_worktree")"
        copy_env_files "$source_worktree" "$worktree_path"
        copy_included_files "$source_worktree" "$worktree_path" "$bare_repo_root/.gitworktree"
    fi

    if [[ -f "$worktree_path/.envrc" ]]; then
        if command -v direnv >/dev/null 2>&1; then
            direnv allow "$worktree_path" >/dev/null 2>&1 && info "Allowed direnv"
        fi
    fi

    echo ""
    info "Worktree ready: $dir"
}

main "$@"
