import { BaseCommand } from '../core/BaseCommand.js';
import { OutputService } from '../services/OutputService.js';
import * as prompts from '../prompts.js';
import { createWorktree } from '../git.js';
import path from 'path';
import type { CommandOptions, Repository, WorkspaceFolder } from '../types/index.js';

export async function updateWorkspace(ticketId: string, options: CommandOptions) {
  const command = new UpdateCommand(ticketId, options);
  await command.execute();
}

class UpdateCommand extends BaseCommand {
  protected ticketId: string;

  constructor(ticketId: string, options: CommandOptions) {
    super(options);
    this.ticketId = ticketId;
  }

  async run() {
    if (!await this.context.workspaceManager.workspaceExists(this.ticketId)) {
      OutputService.error(`Workspace ${this.ticketId} does not exist`);
      return;
    }

    const workspace = await this.context.workspaceManager.readWorkspace(this.ticketId);
    const existingFolders = workspace.folders || [];
    
    OutputService.info('Current folders:');
    OutputService.list(existingFolders.map((f: any) => f.name));
    OutputService.nl();
    
    const spinner = OutputService.progress('Discovering repositories...');
    const allRepos = await this.context.workspaceManager.getRepos();
    spinner.succeed(`Found ${allRepos.length} repositories`);
    
    const existingRepoPaths = existingFolders.map((f: any) => {
      const absolutePath = path.resolve(this.context.workspaceManager.workspacesDir, f.path);
      return path.dirname(absolutePath);
    });
    
    const existingRepoNames = allRepos
      .filter((repo: Repository) => existingRepoPaths.includes(repo.path))
      .map((repo: Repository) => repo.name);
    
    OutputService.section('What would you like to do?');
    const action = await prompts.selectWorktreeAction('Choose action');
    
    let newFolders = [];
    
    if (action === 'existing') {
      newFolders = await this.addNewRepos(allRepos, existingRepoNames);
    } else {
      newFolders = await this.addWorktreeToExistingRepo(allRepos, existingRepoNames);
    }
    
    if (newFolders.length === 0) {
      OutputService.info('No changes made.');
      return;
    }
    
    const allFolders = [
      ...existingFolders.map((f: any) => ({
        path: path.resolve(this.context.workspaceManager.workspacesDir, f.path),
        name: f.name
      })),
      ...newFolders
    ];
    
    await this.updateShadowWorkspace(allFolders);
    OutputService.success('Workspace updated');
  }

  async addNewRepos(allRepos: Repository[], existingRepoNames: string[]): Promise<WorkspaceFolder[]> {
    const availableRepos = allRepos.filter((repo: Repository) => !existingRepoNames.includes(repo.name));
    
    if (availableRepos.length === 0) {
      OutputService.warning('All repositories are already in the workspace.');
      return [];
    }
    
    const selectedRepos = await prompts.selectRepos(availableRepos);
    
    if (selectedRepos.length === 0) {
      return [];
    }
    
    const newFolders = [];
    
    for (const repo of selectedRepos) {
      OutputService.section(`Configuring ${repo.name}`);
      
      const action = await prompts.selectWorktreeAction(repo.name);
      
      if (action === 'existing') {
        const worktrees = await this.context.workspaceManager.getWorktrees(repo.path);
        const selected = await prompts.selectWorktree(worktrees, repo.name);
        
        if (selected) {
          newFolders.push({
            path: selected.path,
            name: `${repo.name}: ${selected.name}`
          });
        }
      } else {
        const folder = await this.createNewWorktree(repo);
        if (folder) newFolders.push(folder);
      }
    }
    
    return newFolders;
  }

  async addWorktreeToExistingRepo(allRepos: Repository[], existingRepoNames: string[]): Promise<WorkspaceFolder[]> {
    const reposInWorkspace = allRepos.filter((repo: Repository) => existingRepoNames.includes(repo.name));
    
    if (reposInWorkspace.length === 0) {
      OutputService.warning('No repositories in workspace.');
      return [];
    }
    
    const repo = await prompts.selectWorktree(
      reposInWorkspace.map((r: Repository) => ({ name: r.name, path: r.path })),
      'Select repository to add worktree to'
    );
    
    if (!repo) return [];
    
    OutputService.section(`Adding worktree to ${repo.name}`);
    
    const folder = await this.createNewWorktree(repo);
    return folder ? [folder] : [];
  }

  async createNewWorktree(repo: Repository): Promise<WorkspaceFolder | null> {
    const { branchName, remoteRef } = await prompts.getNewWorktreeDetails(repo.name, this.ticketId);
    
    try {
      const worktreePath = await createWorktree(repo.path, branchName, remoteRef);
      OutputService.success(`Created worktree: ${branchName}`);
      return {
        path: worktreePath,
        name: `${repo.name}: ${branchName}`
      };
    } catch (error) {
      OutputService.error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async updateShadowWorkspace(allFolders: WorkspaceFolder[]) {
    const config = await this.context.loadConfig();
    const shadowConfig = await this.context.getShadowConfig();
    let launchConfig = null;
    
    if (config) {
      launchConfig = this.configManager.generateLaunchConfigs(config, allFolders);
      if (launchConfig && OutputService.isVerbose()) {
        OutputService.debug('Generated launch configurations');
      }
    }
    
    if (!shadowConfig.enabled) {
      OutputService.warning('Shadow workspaces disabled.');
      return;
    }
    
    const spinner = OutputService.progress('Updating workspace...');
    
    await this.context.workspaceManager.updateWorkspace(this.ticketId, allFolders, shadowConfig.syncPatterns, shadowConfig.alwaysInclude);
    
    const updatedWorkspace = this.context.workspaceManager.createWorkspaceObject(allFolders, this.ticketId, launchConfig);
    await this.context.workspaceManager.writeWorkspaceFile(this.ticketId, updatedWorkspace);
    
    spinner.succeed('Workspace updated');
  }
}