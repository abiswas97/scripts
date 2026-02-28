# Ticket Workspace Manager

A Node.js CLI tool for managing VS Code workspaces based on tickets. Creates isolated workspace directories that provide clean, focused context for AI agents and development work.

## Installation

```bash
npm install -g ticket-workspace
# or use the alias
npm install -g tw
```

## Quick Start

```bash
# Navigate to your project root containing repos
cd /path/to/your-projects

# Create a workspace for ticket ABC-123
tw new ABC-123

# Open the workspace (clean, isolated view)
tw open ABC-123
```

## How It Works

The tool creates **shadow workspaces** - isolated directories that contain:
- **Symlinks** to your actual worktree directories 
- **Copied files** that match sync patterns (like `.env` files)
- **VS Code workspace configuration** optimized for the ticket

This gives you a clean, ticket-focused view that's perfect for AI agents like Claude Code, while keeping your actual code in the original worktree locations.

### Directory Structure

```
your-project-root/
├── frontend/
│   ├── main/              # worktree for main branch  
│   ├── ticket-123-branch/ # worktree for feature branch
│   └── .bare/             # bare git repository
├── backend/
│   ├── main/
│   ├── ticket-123-branch/
│   └── .bare/
└── .ticket-workspaces/    # Shadow workspaces
    └── TICKET-123/         # Isolated ticket context
        ├── frontend/       # → symlink to ../../frontend/ticket-123-branch
        │   ├── .env        # Copied from source
        │   ├── .env.local  # Copied from source (nested)
        │   └── [symlinked content]
        ├── backend/        # → symlink to ../../backend/ticket-123-branch  
        │   ├── .env        # Copied from source
        │   └── [symlinked content]
        └── .vscode/
            └── workspace.code-workspace
```

## Commands

### `tw new <ticket-id>`
Create a new workspace for a ticket with interactive repo/worktree selection.

```bash
tw new PROJ-123
```

### `tw update <ticket-id>`
Add repositories or worktrees to an existing workspace.

```bash
tw update PROJ-123
```

### `tw remove <ticket-id>`
Remove the entire workspace. 

```bash
tw remove PROJ-123
```

### `tw list`
List all ticket workspaces with detailed information.

```bash
tw list
```

### `tw open <ticket-id>`
Open a workspace in VS Code.

```bash
tw open PROJ-123
```

## Configuration

Create a `tw.config.json` file in your project root to customize behavior:

```json
{
  "shadow": {
    "enabled": true,
    "syncPatterns": [
      "^\\.env.*",           // All .env files (.env, .env.local, etc.)
      "^\\.nvmrc$",          // Node version file
      "^\\.ruby-version$",   // Ruby version file
      "^config.*\\.json$",   // Config JSON files
      "^\\.gitignore$"       // Git ignore files
    ],
    "location": ".ticket-workspaces",
    "defaultToShadow": true
  },
  "launchConfigs": {
    "repositories": {
      "frontend": {
        "name": "Frontend",
        "configs": [
          {
            "name": "Start Dev Server",
            "type": "node",
            "request": "launch",
            "cwd": "${workspaceFolder:{{folderName}}}",
            "runtimeExecutable": "npm",
            "runtimeArgs": ["run", "dev"]
          }
        ]
      },
      "backend": {
        "name": "Backend", 
        "configs": [
          {
            "name": "Start API Server",
            "type": "node",
            "request": "launch",
            "cwd": "${workspaceFolder:{{folderName}}}",
            "runtimeExecutable": "npm",
            "runtimeArgs": ["run", "start"]
          }
        ]
      }
    },
    "compounds": [
      {
        "name": "Full Stack",
        "requires": ["frontend", "backend"],
        "configurations": ["Start Dev Server", "Start API Server"],
        "stopAll": true
      }
    ]
  }
}
```

### Configuration Options

#### Shadow Settings
- `enabled`: Enable/disable shadow workspaces (default: true)
- `syncPatterns`: Regex patterns for files to copy (not symlink)
- `location`: Directory name for shadow workspaces (default: ".ticket-workspaces")

#### Sync Patterns
Files matching these regex patterns are **copied** to the shadow workspace instead of being symlinked. This ensures they work properly with all tools:

- `"^\\.env.*"` - Matches `.env`, `.env.local`, `.env.production`, etc.
- `"^\\.nvmrc$"` - Exact match for `.nvmrc`
- `"^config.*\\.json$"` - Matches `config.json`, `config.dev.json`, etc.

#### Environment Variables
- `APP_DIR`: Override the default directory (current working directory)

## Perfect for AI Agents

Shadow workspaces are designed to provide the optimal context for AI coding assistants:

### ✅ Benefits
- **Clean context**: Only see files relevant to your ticket
- **No confusion**: Single branch per repo, clear file references  
- **Proper .env handling**: Environment files are copied and work correctly
- **Fast navigation**: Small, focused directory structure
- **Isolation**: Each ticket has its own clean view

### 🎯 Ideal Workflow with Claude Code
```bash
# Create ticket workspace
tw new FEATURE-456

# Open in VS Code  
tw open FEATURE-456

# Open Claude Code from within the shadow workspace
# Claude will only see the relevant context for this ticket
claude
```

## Integration with Git Worktree

This tool integrates with git-worktree.sh for creating new worktrees:
1. First tries to use `../../git/git-worktree.sh` (relative to this tool)
2. Falls back to `git-wt` command if available in PATH

## Examples

### Basic ticket workflow:
```bash
# Navigate to your projects
cd /path/to/my-projects

# Create workspace for new feature
tw new FEAT-123

# Work on the feature...
tw open FEAT-123

# Add another repo to the workspace
tw update FEAT-123

# When done, clean up
tw remove FEAT-123
```

### Working with different projects:
```bash
# Use with custom directory
tw new PROJ-456 --directory /different/path

# Or set environment variable
export APP_DIR=/different/path
tw new PROJ-456
```

## Requirements

- Node.js 16+
- Git with worktree support
- VS Code (for opening workspaces)
- Bash/Zsh shell (for worktree script execution)

## Why Shadow Workspaces?

Traditional multi-repo workspaces show ALL worktrees for each repository. This creates confusion for AI agents and developers about which specific branch/worktree is being worked on.

Shadow workspaces solve this by creating a clean, isolated view that contains only the specific worktrees needed for a ticket, with proper environment file handling.