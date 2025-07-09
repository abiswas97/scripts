#!/bin/bash

# Git Worktree Migration Script
# Converts a regular Git repository to use the bare repository pattern with worktrees
# Usage: ./migrate-to-worktree.sh <path-to-repo>

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if path argument is provided
if [ $# -eq 0 ]; then
    print_error "Usage: $0 <path-to-repo>"
    exit 1
fi

# Check Git version for relative worktree path support (2.20+)
GIT_VERSION=$(git --version | sed 's/git version //')
GIT_MAJOR=$(echo "$GIT_VERSION" | cut -d. -f1)
GIT_MINOR=$(echo "$GIT_VERSION" | cut -d. -f2)

if [ "$GIT_MAJOR" -lt 2 ] || ([ "$GIT_MAJOR" -eq 2 ] && [ "$GIT_MINOR" -lt 20 ]); then
    print_error "This script requires Git 2.20 or later for relative worktree paths."
    print_error "Your Git version: $GIT_VERSION"
    print_error "Please upgrade Git before running this script."
    exit 1
fi

REPO_PATH="$1"

# Convert to absolute path
REPO_PATH=$(cd "$REPO_PATH" 2>/dev/null && pwd)

if [ ! -d "$REPO_PATH" ]; then
    print_error "Directory $REPO_PATH does not exist"
    exit 1
fi

if [ ! -d "$REPO_PATH/.git" ]; then
    print_error "$REPO_PATH is not a Git repository"
    exit 1
fi

# Get repository name and parent directory
REPO_NAME=$(basename "$REPO_PATH")
PARENT_DIR=$(dirname "$REPO_PATH")

print_info "Starting migration for repository: $REPO_NAME"

# Change to repository directory
cd "$REPO_PATH"

# Check for uncommitted changes
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    print_warning "You have uncommitted changes. Please commit or stash them before proceeding."
    echo "Uncommitted files:"
    git status --short
    read -p "Do you want to continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
if [ -z "$CURRENT_BRANCH" ]; then
    print_error "Could not determine current branch. Are you in detached HEAD state?"
    exit 1
fi

print_info "Current branch: $CURRENT_BRANCH"

# Get list of local branches
print_info "Local branches found:"
git branch | sed 's/^/  /'

# Get remote URL - CRITICAL: Get this BEFORE creating backup
REMOTE_URL=$(git config --get remote.origin.url || echo "")
if [ -z "$REMOTE_URL" ]; then
    print_warning "No remote origin found"
else
    print_info "Remote URL: $REMOTE_URL"
fi

# Create backup
BACKUP_PATH="${PARENT_DIR}/${REPO_NAME}-backup-$(date +%Y%m%d-%H%M%S)"
print_info "Creating backup at: $BACKUP_PATH"
cd "$PARENT_DIR"
cp -r "$REPO_NAME" "$BACKUP_PATH"

# Create new directory structure
NEW_REPO_PATH="${PARENT_DIR}/${REPO_NAME}-worktree"
print_info "Creating new repository structure at: $NEW_REPO_PATH"
mkdir -p "$NEW_REPO_PATH"
cd "$NEW_REPO_PATH"

# Clone as bare repository
print_info "Creating bare repository..."
git clone --bare "$BACKUP_PATH/.git" .bare

# Create .git file
echo "gitdir: ./.bare" > .git

# CRITICAL FIX: Configure the bare repo with standard fetch refspec
cd .bare
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"

# Enable relative worktree paths (Git 2.20+)
git config worktree.useRelativePaths true

# CRITICAL FIX: Update remote URL to the actual remote, not the backup
if [ -n "$REMOTE_URL" ]; then
    print_info "Setting remote URL to original: $REMOTE_URL"
    git remote set-url origin "$REMOTE_URL"
    
    # Fetch from the real remote
    print_info "Fetching from remote..."
    git fetch origin
fi
cd ..

# Create worktree for current branch
BRANCH_FOLDER=$(echo "$CURRENT_BRANCH" | sed 's/\//-/g')
print_info "Creating worktree for branch '$CURRENT_BRANCH' in folder '$BRANCH_FOLDER'"

# Check if we need to create with tracking
if git show-ref --verify --quiet "refs/remotes/origin/$CURRENT_BRANCH"; then
    # Remote branch exists, create with tracking
    git worktree add --track -b "$CURRENT_BRANCH" "$BRANCH_FOLDER" "origin/$CURRENT_BRANCH" 2>/dev/null || \
    git worktree add "$BRANCH_FOLDER" "$CURRENT_BRANCH"
else
    # No remote branch, just create from local
    git worktree add "$BRANCH_FOLDER" "$CURRENT_BRANCH"
fi

# Set up tracking if not already set
if [ -n "$REMOTE_URL" ] && git show-ref --verify --quiet "refs/remotes/origin/$CURRENT_BRANCH"; then
    (cd "$BRANCH_FOLDER" && git branch --set-upstream-to="origin/$CURRENT_BRANCH" "$CURRENT_BRANCH" 2>/dev/null || true)
fi

# Copy over common untracked files and directories
print_info "Copying untracked files and directories..."

# List of common files/directories to copy if they exist
COPY_ITEMS=(
    ".env"
    ".env.local"
    ".env.development"
    ".env.production"
    ".env.test"
    "node_modules"
    "vendor"
    "build"
    "dist"
    ".vscode"
    ".idea"
    "*.log"
)

for item in "${COPY_ITEMS[@]}"; do
    if [ -e "$BACKUP_PATH/$item" ]; then
        print_info "  Copying $item..."
        cp -r "$BACKUP_PATH/$item" "$BRANCH_FOLDER/" 2>/dev/null || true
    fi
done

# Show summary
echo
print_info "Migration completed successfully!"
echo
echo "Summary:"
echo "  - Original repository backed up to: $BACKUP_PATH"
echo "  - New worktree repository created at: $NEW_REPO_PATH"
echo "  - Current branch worktree: $NEW_REPO_PATH/$BRANCH_FOLDER"
echo
echo "Manual cleanup steps (after verification):"
echo "  1. Verify the new repository works correctly:"
echo "     cd $NEW_REPO_PATH/$BRANCH_FOLDER"
echo "     git pull  # Should work without issues"
echo
echo "  2. Remove the original repository:"
echo "     rm -rf $REPO_PATH"
echo
echo "  3. Rename the new repository to the original name:"
echo "     mv $NEW_REPO_PATH $REPO_PATH"
echo
echo "  4. Remove the backup:"
echo "     rm -rf $BACKUP_PATH"
echo
echo "Creating worktrees for other branches:"
echo "  cd $REPO_PATH"
echo "  git worktree add <folder-name> <branch-name>"
echo
print_warning "The original repository is still at: $REPO_PATH"
print_warning "The new repository is at: $NEW_REPO_PATH"

print_info "Done!"