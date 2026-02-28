// Configuration Types
export interface TWConfig {
  shadow: ShadowConfig;
  launchConfigs?: LaunchConfigs;
}

export interface AlwaysIncludeConfig {
  folders?: string[];  // Folders to always symlink (e.g., ".claude", ".gemini")
  files?: string[];    // Files to always symlink (e.g., "CLAUDE.md", "AGENTS.md")
}

export interface ShadowConfig {
  enabled: boolean;
  syncPatterns: string[];
  location: string;
  defaultToShadow: boolean;
  alwaysInclude?: AlwaysIncludeConfig;  // Files and folders to include in every workspace
}

export interface LaunchConfigs {
  repositories: Record<string, RepositoryLaunchConfig>;
  compounds?: CompoundConfig[];
}

export interface RepositoryLaunchConfig {
  name: string;
  configs: LaunchConfigTemplate[];
}

export interface LaunchConfigTemplate {
  name: string;
  type: string;
  request: string;
  cwd?: string;
  runtimeExecutable?: string;
  runtimeArgs?: string[];
  console?: string;
  internalConsoleOptions?: string;
  [key: string]: unknown; // Allow additional properties for flexibility
}

export interface CompoundConfig {
  name: string;
  requires: string[];
  configurations: string[];
  stopAll?: boolean;
}

// Repository and Worktree Types
export interface Repository {
  name: string;
  path: string;
  hasWorktreeStructure?: boolean;
}

export interface Worktree {
  name: string;
  path: string;
  branch?: string;
  head?: string;
  bare?: boolean;
  isCurrent?: boolean;
}

export interface WorkspaceFolder {
  path: string;
  name: string;
}

// VS Code Workspace Types
export interface VSCodeWorkspace {
  folders: Array<{
    path: string;
    name: string;
  }>;
  settings?: Record<string, unknown>;
  launch?: LaunchConfiguration;
}

export interface LaunchConfiguration {
  version: string;
  configurations: LaunchConfigTemplate[];
  compounds?: Array<Omit<CompoundConfig, 'requires'>>;
}

// Command Types
export interface CommandOptions {
  directory?: string;
  verbose?: boolean;
}

export interface WorkspaceInfo {
  path: string;
  symlinks: SymlinkInfo[];
  files: string[];
}

export interface SymlinkInfo {
  name: string;
  target: string;
  broken?: boolean;
}

// Prompt Response Types
export interface RepoSelectionResponse {
  selectedRepos: Repository[];
}

export type WorktreeAction = 'existing' | 'new';

export interface WorktreeActionResponse {
  action: WorktreeAction;
}

export interface WorktreeSelectionResponse {
  selected: Worktree | null;
}

export interface NewWorktreeDetails {
  branchName: string;
  remoteRef: string;
}

export interface FolderRemovalResponse {
  foldersToRemove: Array<{ name: string }>;
}

export interface ConfirmationResponse {
  confirmed: boolean;
}

// Service Result Types
export interface RepositoryValidation {
  valid: boolean;
  hasUncommittedChanges?: boolean;
  error?: string;
}

export interface SyncResult {
  syncedCount: number;
}

// Git Operation Types
export interface GitWorktreeResult {
  path: string;
  success: boolean;
  error?: string;
}

export interface GitBranchInfo {
  current: string | null;
  remote: string[];
}

// Shadow Workspace Types
export interface ShadowWorkspaceMarker {
  type: 'shadow-workspace';
  ticketId: string;
  created: string;
  description: string;
}

// Spinner interface for ora
export interface Spinner {
  succeed(text?: string): Spinner;
  fail(text?: string): Spinner;
  stop(): void;
  text: string;
}

// Error Types
export class WorkspaceError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class GitOperationError extends Error {
  constructor(message: string, public stderr?: string) {
    super(message);
    this.name = 'GitOperationError';
  }
}

// Type Guards
export function isRepository(obj: unknown): obj is Repository {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    'path' in obj &&
    typeof (obj as Repository).name === 'string' &&
    typeof (obj as Repository).path === 'string'
  );
}

export function isWorktree(obj: unknown): obj is Worktree {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    'path' in obj &&
    typeof (obj as Worktree).name === 'string' &&
    typeof (obj as Worktree).path === 'string'
  );
}

export function isTWConfig(obj: unknown): obj is TWConfig {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'shadow' in obj &&
    typeof (obj as TWConfig).shadow === 'object'
  );
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type AsyncResult<T> = Promise<T>;
export type MaybeAsync<T> = T | Promise<T>;