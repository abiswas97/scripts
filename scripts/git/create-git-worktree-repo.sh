#!/bin/bash

# Create Git Worktree Repository Script
# Creates a new repository using the bare repository pattern with worktrees
# and sets up the corresponding GitHub repository
# Usage: ./create-git-worktree-repo.sh <repo-name> [--public]

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

# Check if repo name argument is provided
if [ $# -eq 0 ]; then
    print_error "Usage: $0 <repo-name> [--public]"
    echo "Example: $0 my-project"
    echo "         $0 my-project --public"
    exit 1
fi

REPO_NAME="$1"
VISIBILITY="--private"

# Check for --public flag
if [ $# -ge 2 ] && [ "$2" == "--public" ]; then
    VISIBILITY="--public"
fi

# Validate repo name (basic validation)
if [[ ! "$REPO_NAME" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
    print_error "Invalid repository name. Use only letters, numbers, dots, hyphens, and underscores."
    exit 1
fi

# Check if directory already exists
if [ -d "$REPO_NAME" ]; then
    print_error "Directory '$REPO_NAME' already exists"
    echo "Please choose a different name or remove the existing directory"
    exit 1
fi

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
    print_error "GitHub CLI (gh) is not installed"
    echo "Install it with: brew install gh"
    exit 1
fi

# Check if user is authenticated with gh
if ! gh auth status &> /dev/null; then
    print_error "Not authenticated with GitHub CLI"
    echo "Run: gh auth login"
    exit 1
fi

print_info "Creating new Git worktree repository"
echo "  Repository name: $REPO_NAME"
echo "  Visibility: ${VISIBILITY#--}"
echo

# Create directory structure
print_step "Creating directory structure..."
mkdir -p "$REPO_NAME"
cd "$REPO_NAME"

# Initialize bare repository
print_step "Initializing bare repository..."
git init --bare .bare

# Create .git pointer file
print_step "Setting up .git pointer..."
echo "gitdir: ./.bare" > .git

# Configure the bare repo with standard fetch refspec
print_step "Configuring repository..."
cd .bare
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
cd ..

# Create worktree for main branch
print_step "Creating main worktree..."
git worktree add -b main main

# Create initial commit
print_step "Creating initial commit..."
cd main
echo "# $REPO_NAME" > README.md
git add README.md
git commit -m "Initial commit"
cd ..

# Create GitHub repository
print_step "Creating GitHub repository..."
GH_REPO_URL=$(gh repo create "$REPO_NAME" $VISIBILITY --description "$REPO_NAME repository" 2>&1)

if [ $? -ne 0 ]; then
    print_error "Failed to create GitHub repository"
    echo "$GH_REPO_URL"
    cd ..
    rm -rf "$REPO_NAME"
    exit 1
fi

# Extract GitHub username
GH_USER=$(gh api user --jq '.login')

# Set remote URL
print_step "Setting up remote..."
git remote set-url origin "git@github.com:${GH_USER}/${REPO_NAME}.git"

# Push to GitHub
print_step "Pushing to GitHub..."
cd main
git push -u origin main
cd ..

# Set remote HEAD to main
git remote set-head origin main

# Get current absolute path
FULL_PATH=$(pwd)

echo
print_info "Setup complete! 🎉"
echo
echo "Repository structure:"
echo "  $REPO_NAME/"
echo "  ├── .bare/          # Bare repository (contains Git data)"
echo "  ├── .git            # Pointer to .bare"
echo "  └── main/           # Working directory for main branch"
echo
echo "GitHub repository:"
echo "  https://github.com/${GH_USER}/${REPO_NAME}"
echo
echo "Next steps:"
echo
echo "1. Navigate to your working directory:"
echo "   cd $FULL_PATH/main"
echo
echo "2. Create worktrees for other branches:"
echo "   cd $FULL_PATH"
echo "   git wt <branch-name>"
echo
echo "   Or manually:"
echo "   git worktree add <folder-name> <branch-name>"
echo
echo "3. List existing worktrees:"
echo "   git worktree list"
echo
echo "4. Remove a worktree when done:"
echo "   git worktree remove <folder-name>"
echo

print_info "Repository created successfully!"
