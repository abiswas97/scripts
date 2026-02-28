import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { OutputService } from './OutputService.js';
import type {
  Repository,
  Worktree,
  RepositoryValidation,
} from '../types/index.js';

const execAsync = promisify(exec);

interface WorktreeData {
  path?: string;
  branch?: string;
  head?: string;
  bare?: boolean;
}

export class RepositoryService {
  constructor(private readonly rootDir: string) {}

  async discoverRepositories(): Promise<Repository[]> {
    const repos: Repository[] = [];

    try {
      const entries = await fs.readdir(this.rootDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const repoPath = path.join(this.rootDir, entry.name);

          if (await this.isGitRepository(repoPath)) {
            const hasWorktreeStructure = await this.checkWorktreeStructure(repoPath);
            repos.push({
              name: entry.name,
              path: repoPath,
              hasWorktreeStructure,
            });
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      OutputService.error(`Failed to read directory ${this.rootDir}: ${errorMessage}`);
    }

    return repos;
  }

  async isGitRepository(repoPath: string): Promise<boolean> {
    try {
      const gitPath = path.join(repoPath, '.git');
      const stats = await fs.stat(gitPath);
      return stats.isDirectory() || stats.isFile();
    } catch {
      return false;
    }
  }

  async checkWorktreeStructure(repoPath: string): Promise<boolean> {
    try {
      const gitPath = path.join(repoPath, '.git');
      const stats = await fs.stat(gitPath);

      if (stats.isFile()) {
        const content = await fs.readFile(gitPath, 'utf8');
        return content.includes('gitdir:');
      }

      const barePath = path.join(repoPath, '.bare');
      try {
        await fs.access(barePath);
        return true;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  async getWorktrees(repoPath: string): Promise<Worktree[]> {
    const worktrees: Worktree[] = [];

    try {
      const hasWorktreeStructure = await this.checkWorktreeStructure(repoPath);

      if (hasWorktreeStructure) {
        const { stdout } = await execAsync('git worktree list --porcelain', { cwd: repoPath });

        let currentWorktree: WorktreeData = {};
        for (const line of stdout.split('\n')) {
          if (line.startsWith('worktree ')) {
            if (currentWorktree.path) {
              worktrees.push(this.processWorktree(currentWorktree, repoPath));
            }
            currentWorktree = { path: line.substring(9) };
          } else if (line.startsWith('branch ')) {
            currentWorktree.branch = line.substring(7);
          } else if (line.startsWith('HEAD ')) {
            currentWorktree.head = line.substring(5);
          } else if (line === 'bare') {
            currentWorktree.bare = true;
          }
        }

        if (currentWorktree.path) {
          worktrees.push(this.processWorktree(currentWorktree, repoPath));
        }
      } else {
        // Traditional repo structure
        const { stdout } = await execAsync('git branch --show-current', { cwd: repoPath });
        const currentBranch = stdout.trim();

        worktrees.push({
          name: currentBranch || 'main',
          path: repoPath,
          isCurrent: true,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      OutputService.debug(`Failed to get worktrees for ${repoPath}: ${errorMessage}`);
    }

    return worktrees.filter((w) => !w.bare);
  }

  private processWorktree(worktree: WorktreeData, repoPath: string): Worktree {
    const worktreePath = worktree.path ?? '';
    const name = worktree.branch ?? path.basename(worktreePath);
    const result: Worktree = {
      name,
      path: worktreePath,
      isCurrent: worktreePath === repoPath,
    };
    
    // Only add optional properties if they have values
    if (worktree.branch) result.branch = worktree.branch;
    if (worktree.head) result.head = worktree.head;
    if (worktree.bare !== undefined) result.bare = worktree.bare;
    
    return result;
  }

  async validateRepository(repoPath: string): Promise<RepositoryValidation> {
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: repoPath });
      return {
        valid: true,
        hasUncommittedChanges: stdout.trim().length > 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        error: errorMessage,
      };
    }
  }

  async getCurrentBranch(repoPath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd: repoPath });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  async getRemoteBranches(repoPath: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git branch -r', { cwd: repoPath });
      return stdout
        .split('\n')
        .map((b) => b.trim())
        .filter((b) => b && !b.includes('->'))
        .map((b) => b.replace('origin/', ''));
    } catch {
      return [];
    }
  }
}