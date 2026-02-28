import { BaseCommand } from '../core/BaseCommand.js';
import { OutputService } from '../services/OutputService.js';
import type { CommandOptions } from '../types/index.js';

export async function listWorkspaces(options: CommandOptions) {
  const command = new ListCommand(options);
  await command.execute();
}

class ListCommand extends BaseCommand {
  async run() {
    OutputService.section('Ticket Workspaces');
    
    const workspaces = await this.context.workspaceManager.listWorkspaces();
    
    if (workspaces.length === 0) {
      OutputService.info('No workspaces found.');
      OutputService.info(`Create a new workspace with: tw new <ticket-id>`);
      return;
    }

    for (const ticketId of workspaces) {
      OutputService.highlight(ticketId);
      
      try {
        const info = await this.context.workspaceManager.getWorkspaceInfo(ticketId);
        if (info) {
          OutputService.debug(`Location: ${info.path}`);
          
          if (info.symlinks && info.symlinks.length > 0) {
            const repos = info.symlinks.map((s: any) => 
              s.name + (s.broken ? ' (broken)' : '')
            );
            OutputService.list(repos);
          }
          
          if (info.files && info.files.length > 0 && OutputService.isVerbose()) {
            OutputService.debug(`Synced files: ${info.files.join(', ')}`);
          }
        }
      } catch (error) {
        OutputService.warning(`  Could not read workspace info`);
      }
      
      OutputService.nl();
    }
  }
}