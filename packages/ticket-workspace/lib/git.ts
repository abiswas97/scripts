import { exec } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { OutputService } from './services/OutputService.js';
import fs from 'fs/promises';

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeBranchName(branchName: string): string {
  return branchName.replace(/[^a-zA-Z0-9._-]/g, '-');
}

async function findGitWorktreeScript(): Promise<string | null> {
  if (process.env['GIT_WORKTREE_SCRIPT']) {
    try {
      await fs.access(process.env['GIT_WORKTREE_SCRIPT']);
      return process.env['GIT_WORKTREE_SCRIPT'];
    } catch {
      OutputService.debug('GIT_WORKTREE_SCRIPT env variable points to non-existent file');
    }
  }
  
  try {
    const scriptsPath = path.dirname(require.resolve('@personal/scripts/package.json'));
    const scriptPath = path.join(scriptsPath, 'git', 'git-worktree.sh');
    await fs.access(scriptPath);
    return scriptPath;
  } catch {}
  
  try {
    const relativePath = path.join(__dirname, '../../../scripts/git/git-worktree.sh');
    await fs.access(relativePath);
    return relativePath;
  } catch {}
  
  return null;
}

export async function createWorktree(repoPath: string, branchName: string, remoteRef: string): Promise<string> {
  const sanitizedName = sanitizeBranchName(branchName);
  const worktreePath = path.join(repoPath, sanitizedName);
  
  try {
    const scriptPath = await findGitWorktreeScript();
    
    if (!scriptPath) {
      OutputService.error('git-worktree.sh script not found');
      if (OutputService.isVerbose()) {
        OutputService.info('Set GIT_WORKTREE_SCRIPT env variable or install package with pnpm');
      }
      throw new Error('git-worktree.sh script not found');
    }
    
    let command = `cd "${repoPath}" && "${scriptPath}" "${branchName}"`;
    if (remoteRef) {
      command += ` "${remoteRef}"`;
    }
    
    OutputService.info(`Creating worktree: ${branchName}...`);
    OutputService.debug(`Using script: ${scriptPath}`);
    
    const { stdout, stderr } = await execAsync(command, {
      shell: '/bin/bash',
      env: { ...process.env }
    });
    
    if (stdout && OutputService.isVerbose()) {
      console.log(stdout);
    }
    
    if (stderr && !stderr.includes('Preparing worktree')) {
      OutputService.debug(`Warning: ${stderr}`);
    }
    
    return worktreePath;
  } catch (error) {
    OutputService.error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
    if ((error as any).stderr && OutputService.isVerbose()) {
      OutputService.error(`stderr: ${(error as any).stderr}`);
    }
    throw error;
  }
}

export async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: dirPath });
    return true;
  } catch {
    return false;
  }
}

export async function getCurrentBranch(dirPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd: dirPath });
    return stdout.trim();
  } catch {
    return null;
  }
}