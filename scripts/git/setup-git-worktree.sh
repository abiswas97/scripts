#!/bin/bash

# Setup Git Worktree Script
# Clones a repository using the bare repository pattern with worktrees
# Usage: ./setup-git-worktree.sh <git-url> [target-directory]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if URL argument is provided
if [ $# -eq 0 ]; then
    print_error "Usage: $0 <git-url> [target-directory]"
    echo "Example: $0 git@github.com:user/repo.git"
    echo "         $0 https://github.com/user/repo.git my-project"
    exit 1
fi

GIT_URL="$1"

# Extract repository name from URL if target directory not specified
if [ $# -ge 2 ]; then
    TARGET_DIR="$2"
else
    # Extract repo name from URL (works for both SSH and HTTPS)
    REPO_NAME=$(basename "$GIT_URL" .git)
    TARGET_DIR="$REPO_NAME"
fi

# Check if target directory already exists
if [ -d "$TARGET_DIR" ]; then
    print_error "Directory '$TARGET_DIR' already exists"
    echo "Please choose a different directory or remove the existing one"
    exit 1
fi

print_info "Setting up Git worktree repository"
echo "  Repository URL: $GIT_URL"
echo "  Target directory: $TARGET_DIR"
echo

# Create target directory
print_step "Creating directory structure..."
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

# Clone as bare repository
print_step "Cloning repository as bare..."
git clone --bare "$GIT_URL" .bare

# Create .git file
print_step "Setting up .git pointer..."
echo "gitdir: ./.bare" > .git

# Configure the bare repo with standard fetch refspec
print_step "Configuring repository..."
cd .bare
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"

# Fetch all branches with the correct refspec
print_step "Fetching all remote branches..."
git fetch origin
cd ..

# Get the default branch name
print_step "Detecting default branch..."
DEFAULT_BRANCH=$(cd .bare && git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')

if [ -z "$DEFAULT_BRANCH" ]; then
    # Try to set the default branch
    (cd .bare && git remote set-head origin --auto 2>/dev/null)
    DEFAULT_BRANCH=$(cd .bare && git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
fi

if [ -z "$DEFAULT_BRANCH" ]; then
    # Fallback to common branch names if detection fails
    if git show-ref --verify --quiet refs/remotes/origin/main; then
        DEFAULT_BRANCH="main"
    elif git show-ref --verify --quiet refs/remotes/origin/master; then
        DEFAULT_BRANCH="master"
    else
        print_error "Could not determine default branch"
        echo "Available branches:"
        git branch -r | sed 's/origin\///'
        exit 1
    fi
fi

print_info "Default branch detected: $DEFAULT_BRANCH"

# Create worktree for default branch with proper tracking
print_step "Creating worktree for $DEFAULT_BRANCH branch..."
if git show-ref --verify --quiet "refs/heads/$DEFAULT_BRANCH"; then
    # Local branch already exists
    git worktree add "$DEFAULT_BRANCH" "$DEFAULT_BRANCH"
    # Set up tracking
    (cd "$DEFAULT_BRANCH" && git branch --set-upstream-to="origin/$DEFAULT_BRANCH" "$DEFAULT_BRANCH" 2>/dev/null || true)
else
    # Create new branch with tracking
    git worktree add --track -b "$DEFAULT_BRANCH" "$DEFAULT_BRANCH" "origin/$DEFAULT_BRANCH"
fi

# Show available branches
echo
print_info "Setup complete! 🎉"
echo
echo "Repository structure:"
echo "  $TARGET_DIR/"
echo "  ├── .bare/          # Bare repository (contains Git data)"
echo "  ├── .git            # Pointer to .bare"
echo "  └── $DEFAULT_BRANCH/      # Working directory for $DEFAULT_BRANCH branch"
echo

# Get current absolute path
FULL_PATH=$(pwd)

echo "Next steps:"
echo
echo "1. Navigate to your working directory:"
echo "   cd $FULL_PATH/$DEFAULT_BRANCH"
echo
echo "2. Create worktrees for other branches:"
echo "   cd $FULL_PATH"
echo "   git worktree add <folder-name> <branch-name>"
echo
echo "   Examples:"
echo "   git worktree add feature-auth feature/auth"
echo "   git worktree add bugfix-login bugfix/login"
echo
echo "3. For better experience, set up the git wt alias:"
echo "   Use the included helper script (if in same repo):"
echo "   git config --global alias.wt '!bash ./git-worktree.sh'"
echo
echo "   Then use: git wt feature/branch-name"
echo
echo "4. List all available remote branches:"
echo "   git branch -r"
echo
echo "5. List existing worktrees:"
echo "   git worktree list"
echo
echo "6. Remove a worktree when done:"
echo "   git worktree remove <folder-name>"
echo

# Show remote branches
print_info "Available remote branches:"
git branch -r | grep -v HEAD | sed 's/origin\///' | sed 's/^/  - /'

echo
print_info "Setup completed successfully!"
print_info "Note: Git worktrees use absolute paths. If you move this directory,"
print_info "you'll need to fix the paths with:"
echo "   find . -name .git -type f -exec sed -i '' 's|OLD_PATH|NEW_PATH|g' {} +"
echo "   find .bare/worktrees -name gitdir -exec sed -i '' 's|OLD_PATH|NEW_PATH|g' {} +"