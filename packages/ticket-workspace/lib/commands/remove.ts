import { BaseCommand } from '../core/BaseCommand.js';
import { OutputService } from '../services/OutputService.js';
import type { CommandOptions } from '../types/index.js';

export async function removeFromWorkspace(ticketId: string, options: CommandOptions) {
  const command = new RemoveCommand(ticketId, options);
  await command.execute();
}

class RemoveCommand extends BaseCommand {
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
    
    // Direct removal without any prompts or confirmations
    const spinner = OutputService.progress('Removing workspace...');
    await this.context.workspaceManager.removeWorkspace(this.ticketId);
    spinner.succeed(`Workspace ${this.ticketId} removed`);
  }
}