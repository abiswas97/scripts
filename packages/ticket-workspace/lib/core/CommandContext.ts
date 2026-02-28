import { WorkspaceManager } from '../workspace.js';
import { ConfigManager } from '../config.js';
import { OutputService } from '../services/OutputService.js';
import type { CommandOptions, TWConfig, ShadowConfig } from '../types/index.js';

export class CommandContext {
  public readonly rootDir: string;
  public readonly verbose: boolean;
  public readonly workspaceManager: WorkspaceManager;
  public readonly configManager: ConfigManager;

  constructor(options: CommandOptions = {}) {
    this.rootDir = options.directory ?? process.env['APP_DIR'] ?? process.cwd();
    this.verbose = options.verbose ?? false;
    OutputService.setVerbose(this.verbose);

    this.workspaceManager = new WorkspaceManager(this.rootDir);
    this.configManager = new ConfigManager(this.rootDir);
  }

  async validateWorkspaceExists(ticketId: string): Promise<boolean> {
    if (!(await this.workspaceManager.workspaceExists(ticketId))) {
      OutputService.error(`Workspace for ${ticketId} does not exist.`);
      OutputService.info(`Use 'tw new ${ticketId}' to create it.`);
      return false;
    }
    return true;
  }

  async validateWorkspaceNotExists(ticketId: string): Promise<boolean> {
    if (await this.workspaceManager.workspaceExists(ticketId)) {
      OutputService.error(`Workspace for ${ticketId} already exists.`);
      OutputService.info(`Use 'tw update ${ticketId}' to modify it.`);
      return false;
    }
    return true;
  }

  async loadConfig(): Promise<TWConfig | null> {
    return await this.configManager.loadConfig();
  }

  async getShadowConfig(): Promise<ShadowConfig> {
    return await this.configManager.getShadowConfigAsync();
  }

  handleError(error: unknown, action: string): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    OutputService.error(`Error ${action}:`, errorMessage);
    process.exit(1);
  }

  showWorkspacePath(ticketId: string): void {
    const workspacePath = this.workspaceManager.getWorkspacePath(ticketId);
    OutputService.nl();
    OutputService.info('Open workspace:');
    OutputService.command(`  tw open ${ticketId}`);
    if (OutputService['verbose']) {
      OutputService.debug(`Workspace path: ${workspacePath}`);
    }
  }
}