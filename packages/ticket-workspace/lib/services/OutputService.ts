import chalk from 'chalk';
import ora from 'ora';
import type { Spinner } from '../types/index.js';

interface MockSpinner {
  succeed(msg?: string): void;
  fail(msg?: string): void;
  stop(): void;
  text: string;
}

export class OutputService {
  private static verbose = false;

  static setVerbose(verbose: boolean): void {
    OutputService.verbose = verbose;
  }

  static isVerbose(): boolean {
    return OutputService.verbose;
  }

  static info(message: string): void {
    console.log(chalk.gray(message));
  }

  static success(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  }

  static error(message: string, error?: Error | string | null): void {
    console.error(chalk.red(message));
    if (error && OutputService.verbose) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`  Details: ${errorMessage}`));
    }
  }

  static warning(message: string): void {
    console.log(chalk.yellow(message));
  }

  static highlight(message: string): void {
    console.log(chalk.cyan(message));
  }

  static command(cmd: string): void {
    console.log(chalk.white(cmd));
  }

  static debug(message: string): void {
    if (OutputService.verbose) {
      console.log(chalk.gray(`[DEBUG] ${message}`));
    }
  }

  static progress(message: string): Spinner | MockSpinner {
    if (OutputService.verbose) {
      return ora(message).start() as Spinner;
    }
    console.log(chalk.gray(message));
    return {
      succeed: (msg?: string): void => {
        if (msg) {
          OutputService.success(msg);
        }
      },
      fail: (msg?: string): void => {
        if (msg) {
          OutputService.error(msg);
        }
      },
      stop: (): void => {
        // No-op for mock spinner
      },
      text: '',
    };
  }

  static list(items: string[], indent = '  '): void {
    items.forEach((item) => {
      console.log(chalk.gray(`${indent}• ${item}`));
    });
  }

  static section(title: string): void {
    console.log(chalk.bold(`\n${title}`));
  }

  static table(data: string[]): void {
    data.forEach((row) => {
      console.log(row);
    });
  }

  static clear(): void {
    console.clear();
  }

  static nl(): void {
    console.log();
  }
}