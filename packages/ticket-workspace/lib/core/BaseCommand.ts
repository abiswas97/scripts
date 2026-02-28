import { CommandContext } from './CommandContext.js';
import { OutputService } from '../services/OutputService.js';
import type { CommandOptions } from '../types/index.js';

export abstract class BaseCommand<T extends CommandOptions = CommandOptions> {
  protected context: CommandContext;

  constructor(options: T) {
    this.context = new CommandContext(options);
  }

  async execute(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.handleError(error);
    }
  }

  protected abstract run(): Promise<void>;

  protected handleError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    OutputService.error(`Command failed: ${errorMessage}`);
    if (OutputService['verbose'] && error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }

  protected get workspaceManager() {
    return this.context.workspaceManager;
  }

  protected get configManager() {
    return this.context.configManager;
  }

  protected get rootDir(): string {
    return this.context.rootDir;
  }
}