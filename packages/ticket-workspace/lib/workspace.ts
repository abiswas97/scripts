import fs from 'fs/promises';
import path from 'path';
import { ShadowManager } from './shadow.js';
import type { Repository, Worktree, WorkspaceFolder, VSCodeWorkspace, LaunchConfiguration, AlwaysIncludeConfig } from './types/index.js';

export class WorkspaceManager {
  public readonly rootDir: string;
  public readonly workspacesDir: string;
  private shadowManager: ShadowManager;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.workspacesDir = path.join(rootDir, '.ticket-workspaces');
    this.shadowManager = new ShadowManager(rootDir);
  }

  async listWorkspaces(): Promise<string[]> {
    return this.shadowManager.listShadowWorkspaces();
  }

  async createWorkspace(ticketId: string, folders: WorkspaceFolder[], syncPatterns: string[] | null = null, alwaysInclude?: AlwaysIncludeConfig): Promise<string> {
    const shadowPath = await this.shadowManager.createShadowWorkspace(ticketId, folders, syncPatterns, alwaysInclude);
    
    // Create and write the VS Code workspace file
    const workspace = this.shadowManager.createShadowWorkspaceObject(folders, ticketId);
    await this.shadowManager.writeShadowWorkspaceFile(ticketId, workspace);
    
    return shadowPath;
  }

  async updateWorkspace(ticketId: string, folders: WorkspaceFolder[], syncPatterns: string[] | null = null, alwaysInclude?: AlwaysIncludeConfig): Promise<string> {
    const shadowPath = await this.shadowManager.updateShadowWorkspace(ticketId, folders, syncPatterns, alwaysInclude);
    
    // Regenerate the VS Code workspace file with updated folders
    const workspace = this.shadowManager.createShadowWorkspaceObject(folders, ticketId);
    await this.shadowManager.writeShadowWorkspaceFile(ticketId, workspace);
    
    return shadowPath;
  }

  async workspaceExists(ticketId: string): Promise<boolean> {
    return this.shadowManager.shadowWorkspaceExists(ticketId);
  }

  async removeWorkspace(ticketId: string): Promise<boolean> {
    return this.shadowManager.removeShadowWorkspace(ticketId);
  }

  async getWorkspaceInfo(ticketId: string) {
    return this.shadowManager.getShadowWorkspaceInfo(ticketId);
  }

  getWorkspacePath(ticketId: string): string {
    return this.shadowManager.getShadowWorkspacePath(ticketId);
  }

  async readWorkspace(ticketId: string): Promise<VSCodeWorkspace> {
    const workspacePath = this.getWorkspacePath(ticketId);
    const workspaceFile = path.join(workspacePath, `${ticketId}.code-workspace`);
    const content = await fs.readFile(workspaceFile, 'utf-8');
    return JSON.parse(content) as VSCodeWorkspace;
  }

  async writeWorkspaceFile(ticketId: string, workspace: VSCodeWorkspace): Promise<string> {
    return this.shadowManager.writeShadowWorkspaceFile(ticketId, workspace);
  }
  
  async writeLaunchConfiguration(ticketId: string, launchConfig: LaunchConfiguration, folders: WorkspaceFolder[]): Promise<string | undefined> {
    return this.shadowManager.writeLaunchConfiguration(ticketId, launchConfig, folders);
  }

  createWorkspaceObject(folders: WorkspaceFolder[], ticketId: string, launchConfig: LaunchConfiguration | null = null): VSCodeWorkspace {
    return this.shadowManager.createShadowWorkspaceObject(folders, ticketId, launchConfig);
  }

  async getRepos(): Promise<Repository[]> {
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    const repos = [];
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const repoPath = path.join(this.rootDir, entry.name);
        
        try {
          const subEntries = await fs.readdir(repoPath, { withFileTypes: true });
          const hasWorktrees = subEntries.some(sub => 
            sub.isDirectory() && !sub.name.startsWith('.')
          );
          
          if (hasWorktrees) {
            repos.push({
              name: entry.name,
              path: repoPath
            });
          }
        } catch (err) {}
      }
    }
    
    return repos;
  }

  async getWorktrees(repoPath: string): Promise<Worktree[]> {
    const entries = await fs.readdir(repoPath, { withFileTypes: true });
    const worktrees = [];
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const worktreePath = path.join(repoPath, entry.name);
        
        try {
          await fs.access(path.join(worktreePath, '.git'));
          worktrees.push({
            name: entry.name,
            path: worktreePath
          });
        } catch {
          // Not a git directory, skip
        }
      }
    }
    
    return worktrees.sort((a, b) => {
      // Sort with 'main' first, then alphabetically
      if (a.name === 'main') return -1;
      if (b.name === 'main') return 1;
      return a.name.localeCompare(b.name);
    });
  }
}