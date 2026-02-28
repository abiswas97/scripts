# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **pnpm workspace monorepo** containing personal utility packages and scripts. It uses pnpm workspaces to manage dependencies and enable package interaction while maintaining synchronization between shared resources.

## Structure

```
personal-tools/
├── package.json           # Root workspace configuration
├── pnpm-workspace.yaml    # pnpm workspace definition
├── scripts/               # Standalone shell scripts (as a package)
│   ├── package.json       # Makes scripts referenceable by packages
│   └── git/               # Git utility scripts
│       ├── git-worktree.sh
│       ├── migrate-to-worktree.sh
│       └── setup-git-worktree.sh
├── packages/              # Node.js packages
│   └── ticket-workspace/  # VS Code workspace management tool
└── CLAUDE.md             # This file
```

## Key Components

### Scripts Package (`@personal/scripts`)

Standalone shell scripts packaged to be referenceable by other packages in the workspace.

#### git/git-worktree.sh
Creates new worktrees with automatic dependency installation and environment file copying.
- Usage: `./scripts/git/git-worktree.sh <branch-name> [remote-ref]`
- Handles pnpm/yarn/npm dependency installation
- Copies .env files from main branch or latest worktree

#### git/migrate-to-worktree.sh
Converts existing Git repositories to bare repository + worktree structure.
- Creates backup before migration
- Preserves remotes and untracked files
- Usage: `./scripts/git/migrate-to-worktree.sh`

#### git/setup-git-worktree.sh
Initial setup for new repositories using worktree pattern.
- Usage: `./scripts/git/setup-git-worktree.sh <repo-url> [target-directory]`
- Auto-detects default branch
- Creates initial worktree

### Packages

#### ticket-workspace (`@personal/ticket-workspace`)

A Node.js CLI tool for managing ticket-based VS Code workspaces with shadow directories for clean, isolated development contexts.

**Commands**:
- `tw new <ticket-id>` - Create new workspace with interactive repo/worktree selection
- `tw update <ticket-id>` - Add repos or worktrees to existing workspace
- `tw remove <ticket-id>` - Remove folders from workspace
- `tw list` - List all ticket workspaces
- `tw open <ticket-id>` - Open workspace in VS Code

**Features**:
- **Shadow Workspaces**: Creates isolated directories in `.ticket-workspaces/` with symlinks and synced files
- **Works from current directory by default** - no configuration required
- **Nested file sync**: Copies matching files (e.g., `.env*`) from within symlinked directories
- **Interactive prompts** for repo and worktree selection
- **Integration with git-worktree.sh** for creating new worktrees
- **Auto-generated VS Code launch configurations** from `tw.config.json`
- **Regex pattern matching** for flexible file synchronization

## Development

### Setup
```bash
# Install dependencies for all packages
pnpm install

# Link ticket-workspace globally for development
cd packages/ticket-workspace
pnpm link --global
```

### Adding New Packages
1. Create new directory under `packages/`
2. Add package.json with `@personal/` scope
3. Run `pnpm install` from root to link

### Using Scripts from Packages
Packages can reference scripts through the `@personal/scripts` workspace dependency:
```javascript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const scriptsPath = path.dirname(require.resolve('@personal/scripts/package.json'));
const scriptPath = path.join(scriptsPath, 'git', 'git-worktree.sh');
```

## Architecture Patterns

1. **pnpm Workspace**: Enables package interdependencies without publishing
2. **Shadow Workspaces**: Isolated ticket contexts with symlinks and file syncing
3. **Script Resolution**: Multiple strategies to find scripts (env var, workspace, relative path)
4. **Bare Repository Pattern**: Git worktree workflow for parallel branch development
5. **Error Handling**: Colored output with clear error messages and troubleshooting tips

## Important Implementation Details

- **File Sync**: Uses regex patterns to identify and copy sensitive files (`.env*`, `.nvmrc`, etc.)
- **Nested Sync**: Recursively syncs matching files from within symlinked directories
- **Script Finding**: Tries environment variable, then workspace package, then relative path
- **Cross-platform**: Handles macOS/Linux differences appropriately
- **Clean Context**: Shadow workspaces provide isolated views perfect for AI coding assistants

## Configuration

### Environment Variables
- `GIT_WORKTREE_SCRIPT`: Override path to git-worktree.sh script
- `APP_DIR`: Override default directory for ticket-workspace (defaults to cwd)

### Config Files
- `tw.config.json`: Ticket workspace configuration (launch configs, sync patterns)
- `pnpm-workspace.yaml`: Defines workspace packages

## Future Expansion

This monorepo structure allows easy addition of new utilities:
- New shell scripts in `scripts/`
- New Node.js packages in `packages/`
- Shared dependencies managed by pnpm
- Automatic linking between workspace packages