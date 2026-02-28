import { BaseCommand } from '../core/BaseCommand.js';
import { OutputService } from '../services/OutputService.js';
import * as prompts from '../prompts.js';
import { createWorktree } from '../git.js';
import type { CommandOptions, Repository, WorkspaceFolder } from '../types/index.js';

export async function createWorkspace(ticketId: string, options: CommandOptions) {
  const command = new NewCommand(ticketId, options);
  await command.execute();
}

class NewCommand extends BaseCommand {
  protected ticketId: string;

  constructor(ticketId: string, options: CommandOptions) {
    super(options);
    this.ticketId = ticketId;
  }
  
  async run() {
    if (await this.context.workspaceManager.workspaceExists(this.ticketId)) {
      OutputService.warning(`Workspace ${this.ticketId} already exists.`);
      const overwrite = await prompts.confirmAction('Overwrite?');
      if (!overwrite) {
        OutputService.info('Cancelled.');
        return;
      }
    }
  
    const spinner = OutputService.progress('Discovering repositories...');
    const repos = await this.context.workspaceManager.getRepos();
    spinner.succeed(`Found ${repos.length} repositories`);
    
    if (repos.length === 0) {
      OutputService.error('No repositories found');
      return;
    }
    
    const selectedRepos = await prompts.selectRepos(repos);
    
    if (selectedRepos.length === 0) {
      OutputService.info('Cancelled.');
      return;
    }
    
    const folders = await this.processRepos(selectedRepos);
    
    if (folders.length === 0) {
      OutputService.info('No folders selected.');
      return;
    }

    await this.createShadowWorkspace(folders);
  }

  async processRepos(selectedRepos: Repository[]): Promise<WorkspaceFolder[]> {
    const folders = [];
    
    for (const repo of selectedRepos) {
      OutputService.section(`Configuring ${repo.name}`);
      
      const action = await prompts.selectWorktreeAction(repo.name);
      
      if (action === 'existing') {
        const worktrees = await this.context.workspaceManager.getWorktrees(repo.path);
        const selected = await prompts.selectWorktree(worktrees, repo.name);
        
        if (selected) {
          folders.push({
            path: selected.path,
            name: `${repo.name}: ${selected.name}`
          });
        }
      } else {
        const { branchName, remoteRef } = await prompts.getNewWorktreeDetails(repo.name, this.ticketId);
        
        try {
          const worktreePath = await createWorktree(repo.path, branchName, remoteRef);
          folders.push({
            path: worktreePath,
            name: `${repo.name}: ${branchName}`
          });
          OutputService.success(`Created worktree: ${branchName}`);
        } catch (error) {
          OutputService.error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
          const continueAnyway = await prompts.confirmAction('Continue without this worktree?');
          if (!continueAnyway) {
            OutputService.info('Cancelled.');
            return [];
          }
        }
      }
    }
    return folders;
  }
  async createShadowWorkspace(folders: WorkspaceFolder[]) {
    const config = await this.context.loadConfig();
    const shadowConfig = await this.context.getShadowConfig();
    let launchConfig = null;
    
    if (config) {
      launchConfig = this.context.configManager.generateLaunchConfigs(config, folders);
      if (launchConfig && OutputService.isVerbose()) {
        OutputService.debug('Generated launch configurations');
      }
    }
    
    if (!shadowConfig.enabled) {
      OutputService.warning('Shadow workspaces disabled.');
      return;
    }

    const spinner = OutputService.progress('Creating workspace...');
    await this.context.workspaceManager.createWorkspace(
      this.ticketId, folders, shadowConfig.syncPatterns, shadowConfig.alwaysInclude
    );
    
    if (launchConfig) {
      await this.context.workspaceManager.writeLaunchConfiguration(this.ticketId, launchConfig, folders);
    }
    
    spinner.succeed('Workspace created');
    this.context.showWorkspacePath(this.ticketId);
  }
}