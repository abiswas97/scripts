# Always Include Feature

The ticket-workspace tool now supports automatically including specific folders and files in every workspace, regardless of the ticket. This is useful for:
- AI assistant context files (`.claude/`, `.gemini/`, `CLAUDE.md`, `AGENTS.md`)
- Shared configuration files
- Common development tools

## Configuration

Add an `alwaysInclude` section to your `tw.config.json`:

```json
{
  "shadow": {
    "enabled": true,
    "syncPatterns": ["^\\.env.*", "^\\.nvmrc$"],
    "location": ".ticket-workspaces",
    "defaultToShadow": true,
    "alwaysInclude": {
      "folders": [
        ".claude",      // AI assistant context
        ".gemini",      // AI assistant context
        "shared-tools"  // Custom tools directory
      ],
      "files": [
        "CLAUDE.md",    // Project instructions for Claude
        "AGENTS.md",    // Agent definitions
        ".prettierrc"   // Shared formatter config
      ]
    }
  }
}
```

## How It Works

1. **Automatic Symlinking**: When creating or updating a workspace, the specified folders and files are automatically symlinked
2. **Path Resolution**: Paths can be:
   - Relative to the root directory (e.g., `.claude`, `CLAUDE.md`)
   - Absolute paths (e.g., `/Users/name/shared-configs/.prettierrc`)
3. **Graceful Handling**: If a folder or file doesn't exist, a warning is shown but workspace creation continues
4. **No Duplicates**: If an item already exists in the workspace, it's skipped

## Example Workflow

1. Create `tw.config.json` with always-include configuration
2. Run `tw new TICKET-123` to create a workspace
3. The workspace will automatically include:
   - All selected repository worktrees
   - All folders from `alwaysInclude.folders`
   - All files from `alwaysInclude.files`

## Benefits

- **Consistent Context**: AI assistants always have access to project-specific instructions
- **Shared Resources**: Common tools and configs available in every workspace
- **Zero Overhead**: Automatic inclusion means no manual steps
- **Clean Workspaces**: Shadow workspaces remain isolated while including necessary shared resources