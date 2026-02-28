import { promises as fs } from 'fs';
import path from 'path';
import { OutputService } from './OutputService.js';

export class FileSyncService {
  private patterns: RegExp[];

  constructor(patterns: string[] = []) {
    this.patterns = [];
    this.setPatterns(patterns);
  }

  setPatterns(patterns: string[]): void {
    this.patterns = patterns
      .map((p) => {
        try {
          return new RegExp(p);
        } catch (e) {
          OutputService.warning(`Invalid pattern: ${p}`);
          return null;
        }
      })
      .filter((p): p is RegExp => p !== null);
  }

  async syncFiles(sourceDir: string, targetDir: string, recursive = false): Promise<number> {
    const matchingFiles = await this.findMatchingFiles(sourceDir, recursive);
    let syncedCount = 0;

    for (const file of matchingFiles) {
      const relativePath = path.relative(sourceDir, file);
      const targetPath = path.join(targetDir, relativePath);

      try {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(file, targetPath);
        syncedCount++;

        if (OutputService['verbose']) {
          OutputService.debug(`Copied: ${relativePath}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        OutputService.debug(`Failed to copy ${relativePath}: ${errorMessage}`);
      }
    }

    if (syncedCount > 0 && !OutputService['verbose']) {
      OutputService.debug(`Synced ${syncedCount} file(s)`);
    }

    return syncedCount;
  }

  async findMatchingFiles(
    dir: string,
    recursive = false,
    depth = 0,
    maxDepth = 10
  ): Promise<string[]> {
    const matchingFiles: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isFile()) {
          if (this.matchesPattern(entry.name)) {
            matchingFiles.push(fullPath);
          }
        } else if (entry.isDirectory() && recursive && depth < maxDepth) {
          // Skip node_modules and .git directories
          if (entry.name !== 'node_modules' && entry.name !== '.git') {
            const subFiles = await this.findMatchingFiles(fullPath, recursive, depth + 1, maxDepth);
            matchingFiles.push(...subFiles);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      OutputService.debug(`Failed to read directory ${dir}: ${errorMessage}`);
    }

    return matchingFiles;
  }

  matchesPattern(filename: string): boolean {
    if (this.patterns.length === 0) {
      return false;
    }
    return this.patterns.some((pattern) => pattern.test(filename));
  }

  async syncRootFiles(sourceDir: string, targetDir: string): Promise<number> {
    const files = await this.findMatchingFiles(sourceDir, false);
    let syncedCount = 0;

    for (const file of files) {
      const basename = path.basename(file);
      const targetPath = path.join(targetDir, basename);

      try {
        await fs.copyFile(file, targetPath);
        syncedCount++;

        if (OutputService['verbose']) {
          OutputService.debug(`Copied: ${basename}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        OutputService.debug(`Failed to copy ${basename}: ${errorMessage}`);
      }
    }

    return syncedCount;
  }

  async syncNestedFiles(sourceDir: string, targetDir: string, repoName: string): Promise<number> {
    const files = await this.findMatchingFiles(sourceDir, true);
    let syncedCount = 0;

    for (const file of files) {
      const relativePath = path.relative(sourceDir, file);
      const targetPath = path.join(targetDir, relativePath);

      try {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(file, targetPath);
        syncedCount++;

        if (OutputService['verbose']) {
          OutputService.debug(`Copied: ${repoName}/${relativePath}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        OutputService.debug(`Failed to copy ${repoName}/${relativePath}: ${errorMessage}`);
      }
    }

    if (syncedCount > 0 && !OutputService['verbose']) {
      OutputService.debug(`Synced ${syncedCount} file(s) from ${repoName}`);
    }

    return syncedCount;
  }
}