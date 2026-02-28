import { BaseCommand } from '../core/BaseCommand.js';
import { OutputService } from '../services/OutputService.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { access } from 'fs/promises';
import type { CommandOptions } from '../types/index.js';

const execAsync = promisify(exec);

export async function openWorkspace(ticketId: string, options: CommandOptions) {
  const command = new OpenCommand(ticketId, options);
  await command.execute();
}

class OpenCommand extends BaseCommand {
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

    const workspacePath = this.context.workspaceManager.getWorkspacePath(this.ticketId);
    const workspaceFile = `${workspacePath}/${this.ticketId}.code-workspace`;
    
    // Check if workspace file exists, if not fall back to folder
    try {
      await access(workspaceFile);
      OutputService.info(`Opening workspace ${this.ticketId}...`);
      OutputService.debug(`Path: ${workspaceFile}`);
      await execAsync(`code "${workspaceFile}"`);
      OutputService.success('Workspace opened');
    } catch (accessError) {
      try {
        OutputService.warning(`Workspace file not found, opening folder instead: ${workspacePath}`);
        OutputService.debug(`Path: ${workspacePath}`);
        await execAsync(`code "${workspacePath}"`);
        OutputService.success('Workspace opened');
      } catch (error) {
        OutputService.error('Failed to open VS Code', error instanceof Error ? error : undefined);
        if (!OutputService.isVerbose()) {
          OutputService.info('Ensure VS Code is installed with "code" command in PATH');
        }
        throw error;
      }
    }
  }
}