import { promises as fs } from 'fs';
import path from 'path';
import { OutputService } from './services/OutputService.js';
import type { AlwaysIncludeConfig, WorkspaceFolder, VSCodeWorkspace, LaunchConfiguration, LaunchConfigTemplate } from './types/index.js';

export class ShadowManager {
  private readonly rootDir: string;
  private readonly shadowDir: string;
  private readonly defaultPatterns: string[];

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.shadowDir = path.join(rootDir, '.ticket-workspaces');
    this.defaultPatterns = ['^\.env.*', '^\.nvmrc$', '^\.ruby-version$'];
  }

  private parseRepoAndWorktree(folderName: string): { repoName: string; worktreeName: string } {
    // folder.name format is "repoName: worktreeName"
    const colonIndex = folderName.indexOf(': ');
    if (colonIndex === -1) {
      // Fallback for unexpected format
      return { repoName: 'unknown', worktreeName: folderName };
    }
    
    return {
      repoName: folderName.substring(0, colonIndex).trim(),
      worktreeName: folderName.substring(colonIndex + 2).trim()
    };
  }

  async ensureShadowDir() {
    await fs.mkdir(this.shadowDir, { recursive: true });
  }

  getShadowWorkspacePath(ticketId: string): string {
    return path.join(this.shadowDir, ticketId);
  }

  async shadowWorkspaceExists(ticketId: string): Promise<boolean> {
    try {
      await fs.access(this.getShadowWorkspacePath(ticketId));
      return true;
    } catch {
      return false;
    }
  }

  async createShadowWorkspace(
    ticketId: string,
    folders: WorkspaceFolder[],
    syncPatterns: string[] | null = null,
    alwaysInclude?: AlwaysIncludeConfig
  ): Promise<string> {
    const shadowPath = this.getShadowWorkspacePath(ticketId);
    const patterns = syncPatterns || this.defaultPatterns;

    // Ensure shadow directory exists
    await fs.mkdir(shadowPath, { recursive: true });
    
    // Create marker file to identify this as a shadow workspace
    const markerContent = {
      type: 'shadow-workspace',
      ticketId: ticketId,
      created: new Date().toISOString(),
      description: 'This is a shadow workspace for ticket-based development. Folders are symlinks to actual worktrees.'
    };
    await fs.writeFile(
      path.join(shadowPath, '.shadow-workspace'), 
      JSON.stringify(markerContent, null, 2)
    );
    
    // Create claude launcher script
    const claudeScript = `#!/bin/bash
cd "${shadowPath}"
claude "$@"
`;
    const scriptPath = path.join(shadowPath, 'claude-here');
    await fs.writeFile(scriptPath, claudeScript);
    await fs.chmod(scriptPath, 0o755);
    
    // Create zsh configuration for shadow workspace
    const zshrcContent = `# Shadow workspace configuration
if [[ -f ~/.zshrc ]]; then
  source ~/.zshrc
fi

cd "${shadowPath}" 2>/dev/null
export PS1="[${ticketId}] %1~ %# "
`;
    const zshrcPath = path.join(shadowPath, '.zshrc');
    await fs.writeFile(zshrcPath, zshrcContent);
    
    // Create VS Code settings for the shadow directory
    const vscodeDir = path.join(shadowPath, '.vscode');
    await fs.mkdir(vscodeDir, { recursive: true });
    
    const vscodeSettings = {
      "window.title": `${ticketId} Shadow Workspace: \${activeEditorShort}`,
      "terminal.integrated.cwd": "${workspaceFolder}",
      "terminal.integrated.env.osx": {
        "SHADOW_WORKSPACE": "true",
        "TICKET_ID": ticketId
      },
      "terminal.integrated.env.linux": {
        "SHADOW_WORKSPACE": "true", 
        "TICKET_ID": ticketId
      },
      "files.exclude": {
        "**/node_modules": true,
        "**/.bare": true,
        ".shadow-workspace": true,
        "claude-here": true,
        ".zshrc": true
      },
      "explorer.sortOrder": "type",
      // Explicit paths for git scanning
      "git.scanRepositories": [
        "saaf-monorepo/*",
        "saaf-react-app/*",
        "saaf-api-spec/*",
        "saaf-serverless-*/*"
      ],
      "git.repositoryScanMaxDepth": 2,
      "git.autoRepositoryDetection": true,
      "git.detectSubmodules": true,
      "git.followSymlinks": true
    };
    
    const settingsPath = path.join(vscodeDir, 'settings.json');
    await fs.writeFile(settingsPath, JSON.stringify(vscodeSettings, null, 2));

    // Create symlinks for each folder in repo subdirectories
    for (const folder of folders) {
      const { repoName, worktreeName } = this.parseRepoAndWorktree(folder.name);
      const repoDir = path.join(shadowPath, repoName);
      const linkPath = path.join(repoDir, worktreeName);
      const targetPath = path.relative(repoDir, folder.path);

      try {
        // Ensure repo directory exists
        await fs.mkdir(repoDir, { recursive: true });

        // Remove existing symlink if it exists
        try {
          await fs.unlink(linkPath);
        } catch {
          // Ignore if file doesn't exist
        }

        // Create symlink
        await fs.symlink(targetPath, linkPath, 'dir');
        if (OutputService.isVerbose()) {
          OutputService.debug(`Created symlink: ${repoName}/${worktreeName} -> ${folder.path}`);
        }

        // Sync matching files from source to repo directory
        await this.syncMatchingFiles(folder.path, repoDir, patterns);
      } catch (error) {
        OutputService.error(`Failed to create symlink for ${repoName}/${worktreeName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Create symlinks for always-included items
    if (alwaysInclude) {
      await this.createAlwaysIncludedSymlinks(shadowPath, alwaysInclude);
    }

    return shadowPath;
  }

  async createAlwaysIncludedSymlinks(
    shadowPath: string,
    alwaysInclude: AlwaysIncludeConfig
  ): Promise<void> {
    // Handle folders
    for (const folder of alwaysInclude.folders || []) {
      const sourcePath = path.isAbsolute(folder) 
        ? folder 
        : path.join(this.rootDir, folder);
      const linkName = path.basename(folder);
      const linkPath = path.join(shadowPath, linkName);
      
      try {
        // Check if source exists
        await fs.access(sourcePath);
        
        // Skip if link already exists
        try {
          await fs.access(linkPath);
          OutputService.debug(`Skipping ${linkName} - already exists in workspace`);
          continue;
        } catch {
          // Link doesn't exist, we can create it
        }
        
        // Create symlink
        const targetPath = path.relative(shadowPath, sourcePath);
        await fs.symlink(targetPath, linkPath, 'dir');
        OutputService.debug(`Added always-included folder: ${linkName}`);
      } catch (error) {
        OutputService.warning(`Cannot include folder '${folder}': ${error instanceof Error ? error.message : 'not found'}`);
      }
    }
    
    // Handle files
    for (const file of alwaysInclude.files || []) {
      const sourcePath = path.isAbsolute(file) 
        ? file 
        : path.join(this.rootDir, file);
      const linkName = path.basename(file);
      const linkPath = path.join(shadowPath, linkName);
      
      try {
        // Check if source exists
        await fs.access(sourcePath);
        
        // Skip if link already exists
        try {
          await fs.access(linkPath);
          OutputService.debug(`Skipping ${linkName} - already exists in workspace`);
          continue;
        } catch {
          // Link doesn't exist, we can create it
        }
        
        // Create symlink
        const targetPath = path.relative(shadowPath, sourcePath);
        await fs.symlink(targetPath, linkPath, 'file');
        OutputService.debug(`Added always-included file: ${linkName}`);
      } catch (error) {
        OutputService.warning(`Cannot include file '${file}': ${error instanceof Error ? error.message : 'not found'}`);
      }
    }
  }

  async syncMatchingFiles(sourceDir: string, targetDir: string, patterns: string[]): Promise<void> {
    try {
      // Only sync files WITHIN symlinked directories, not at the root
      // This prevents duplicate .env files at the shadow workspace root
      await this.syncNestedFilesInSymlinks(targetDir, patterns);
    } catch (error) {
      OutputService.debug(`Failed to sync files from ${sourceDir}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async syncRootFiles(sourceDir: string, targetDir: string, patterns: string[]): Promise<void> {
    try {
      // Convert string patterns to RegExp objects
      const regexPatterns = patterns.map((p: string) => new RegExp(p));
      
      // Read all files in source directory
      const files = await fs.readdir(sourceDir);
      
      // Filter files matching any pattern
      const matchingFiles = files.filter(file => 
        regexPatterns.some(regex => regex.test(file))
      );

      if (matchingFiles.length > 0) {
        if (OutputService.isVerbose()) {
          OutputService.debug(`Syncing ${matchingFiles.length} files from ${path.basename(sourceDir)}`);
        }
        
        // Copy matching files to target
        for (const file of matchingFiles) {
          const sourcePath = path.join(sourceDir, file);
          const targetPath = path.join(targetDir, file);
          
          try {
            // Check if source is a file (not directory)
            const stat = await fs.stat(sourcePath);
            if (stat.isFile()) {
              await fs.copyFile(sourcePath, targetPath);
              if (OutputService.isVerbose()) {
                OutputService.debug(`Copied: ${file}`);
              }
            }
          } catch (error) {
            OutputService.debug(`Failed to copy ${file}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    } catch (error) {
      OutputService.debug(`Failed to sync root files from ${sourceDir}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async syncNestedFilesInSymlinks(shadowDir: string, patterns: string[]): Promise<void> {
    try {
      // Get all symlinks in the shadow directory
      const entries = await fs.readdir(shadowDir, { withFileTypes: true });
      const symlinks = entries.filter(entry => entry.isSymbolicLink());

      for (const symlink of symlinks) {
        const linkPath = path.join(shadowDir, symlink.name);
        
        try {
          // Get the real path of the symlink
          const realPath = await fs.realpath(linkPath);
          
          // Sync nested files from the real directory into the symlink location
          await this.syncNestedFiles(realPath, linkPath, patterns, symlink.name);
        } catch (error) {
          OutputService.debug(`Failed to resolve symlink ${symlink.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      OutputService.debug(`Failed to sync nested files in symlinks: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async syncNestedFiles(sourceDir: string, targetLinkDir: string, patterns: string[], repoName: string): Promise<void> {
    try {
      const regexPatterns = patterns.map((p: string) => new RegExp(p));
      
      // Recursively find all matching files in the source directory
      const matchingFiles = await this.findMatchingFilesRecursively(sourceDir, regexPatterns);
      
      if (matchingFiles.length === 0) {
        return;
      }

      if (!OutputService.isVerbose()) {
        OutputService.debug(`Syncing ${matchingFiles.length} files from ${repoName}`);
      }
      
      // Create directory structure and copy files
      for (const relativePath of matchingFiles) {
        const sourceFilePath = path.join(sourceDir, relativePath);
        const targetFilePath = path.join(targetLinkDir, relativePath);
        
        try {
          // Ensure target directory exists
          await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
          
          // Copy the file
          await fs.copyFile(sourceFilePath, targetFilePath);
          if (OutputService.isVerbose()) {
            OutputService.debug(`Copied: ${repoName}/${relativePath}`);
          }
        } catch (error) {
          OutputService.debug(`Failed to copy ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      OutputService.debug(`Failed to sync nested files for ${repoName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async findMatchingFilesRecursively(dir: string, regexPatterns: RegExp[], relativePath: string = ''): Promise<string[]> {
    const matchingFiles: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const currentPath = path.join(dir, entry.name);
        const currentRelativePath = path.join(relativePath, entry.name);
        
        if (entry.isFile()) {
          // Check if file matches any pattern
          if (regexPatterns.some((regex: RegExp) => regex.test(entry.name))) {
            matchingFiles.push(currentRelativePath);
          }
        } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          // Recursively search subdirectories (but skip hidden dirs and node_modules)
          const nestedMatches: string[] = await this.findMatchingFilesRecursively(
            currentPath, 
            regexPatterns, 
            currentRelativePath
          );
          matchingFiles.push(...nestedMatches);
        }
      }
    } catch (error) {
      // Ignore errors (e.g., permission denied) and continue
    }
    
    return matchingFiles;
  }

  async updateShadowWorkspace(
    ticketId: string,
    folders: WorkspaceFolder[],
    syncPatterns: string[] | null = null,
    alwaysInclude?: AlwaysIncludeConfig
  ): Promise<string> {
    const shadowPath = this.getShadowWorkspacePath(ticketId);
    
    if (!await this.shadowWorkspaceExists(ticketId)) {
      OutputService.debug('Creating new shadow workspace...');
      return this.createShadowWorkspace(ticketId, folders, syncPatterns, alwaysInclude);
    }

    // Get existing repo directories and their symlinks
    const existingRepos = new Map<string, Set<string>>();
    try {
      const entries = await fs.readdir(shadowPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const repoPath = path.join(shadowPath, entry.name);
          try {
            const repoEntries = await fs.readdir(repoPath, { withFileTypes: true });
            const symlinks = repoEntries
              .filter(e => e.isSymbolicLink())
              .map(e => e.name);
            existingRepos.set(entry.name, new Set(symlinks));
          } catch {
            // Ignore if can't read repo directory
          }
        }
      }
    } catch {
      // Ignore if can't read shadow directory
    }

    // Build map of new folder structure
    const newRepoStructure = new Map<string, Set<string>>();
    for (const folder of folders) {
      const { repoName, worktreeName } = this.parseRepoAndWorktree(folder.name);
      if (!newRepoStructure.has(repoName)) {
        newRepoStructure.set(repoName, new Set());
      }
      newRepoStructure.get(repoName)!.add(worktreeName);
    }

    // Remove obsolete symlinks and empty repo directories
    for (const [repoName, existingWorktrees] of existingRepos) {
      const newWorktrees = newRepoStructure.get(repoName) || new Set();
      const repoDir = path.join(shadowPath, repoName);
      
      for (const worktreeName of existingWorktrees) {
        if (!newWorktrees.has(worktreeName)) {
          const linkPath = path.join(repoDir, worktreeName);
          await fs.unlink(linkPath);
          if (OutputService.isVerbose()) {
            OutputService.debug(`Removed symlink: ${repoName}/${worktreeName}`);
          }
        }
      }
      
      // Remove repo directory if empty
      if (newWorktrees.size === 0) {
        try {
          await fs.rmdir(repoDir);
          if (OutputService.isVerbose()) {
            OutputService.debug(`Removed empty repo directory: ${repoName}`);
          }
        } catch {
          // Ignore if directory not empty or other issues
        }
      }
    }

    // Add new symlinks and sync files
    const patterns = syncPatterns || this.defaultPatterns;
    for (const folder of folders) {
      const { repoName, worktreeName } = this.parseRepoAndWorktree(folder.name);
      const repoDir = path.join(shadowPath, repoName);
      const linkPath = path.join(repoDir, worktreeName);
      const targetPath = path.relative(repoDir, folder.path);

      const existingWorktrees = existingRepos.get(repoName) || new Set();
      if (!existingWorktrees.has(worktreeName)) {
        try {
          // Ensure repo directory exists
          await fs.mkdir(repoDir, { recursive: true });
          
          // Create symlink
          await fs.symlink(targetPath, linkPath, 'dir');
          if (OutputService.isVerbose()) {
            OutputService.debug(`Created symlink: ${repoName}/${worktreeName} -> ${folder.path}`);
          }
        } catch (error) {
          OutputService.error(`Failed to create symlink for ${repoName}/${worktreeName}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Always re-sync files (they might have changed)
      await this.syncMatchingFiles(folder.path, repoDir, patterns);
    }

    // Update always-included items
    if (alwaysInclude) {
      await this.createAlwaysIncludedSymlinks(shadowPath, alwaysInclude);
    }

    return shadowPath;
  }

  async removeShadowWorkspace(ticketId: string): Promise<boolean> {
    const shadowPath = this.getShadowWorkspacePath(ticketId);
    
    try {
      await fs.rm(shadowPath, { recursive: true, force: true });
      OutputService.debug(`Removed shadow workspace: ${ticketId}`);
      return true;
    } catch (error) {
      OutputService.debug(`Failed to remove shadow workspace: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async listShadowWorkspaces() {
    try {
      await this.ensureShadowDir();
      const entries = await fs.readdir(this.shadowDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      return [];
    }
  }

  async getShadowWorkspaceInfo(ticketId: string) {
    const shadowPath = this.getShadowWorkspacePath(ticketId);
    
    if (!await this.shadowWorkspaceExists(ticketId)) {
      return null;
    }

    try {
      const entries = await fs.readdir(shadowPath, { withFileTypes: true });
      const symlinks = [];
      const files = [];

      for (const entry of entries) {
        if (entry.isSymbolicLink()) {
          const linkPath = path.join(shadowPath, entry.name);
          try {
            const target = await fs.readlink(linkPath);
            symlinks.push({
              name: entry.name,
              target: target
            });
          } catch (error) {
            symlinks.push({
              name: entry.name,
              target: '<broken>',
              broken: true
            });
          }
        } else if (entry.isFile()) {
          files.push(entry.name);
        }
      }

      return {
        path: shadowPath,
        symlinks,
        files
      };
    } catch (error) {
      return null;
    }
  }

  createShadowWorkspaceObject(_folders: WorkspaceFolder[], ticketId: string, launchConfig: LaunchConfiguration | null = null): VSCodeWorkspace {
    // Create a workspace object for the shadow directory
    const workspace: VSCodeWorkspace = {
      folders: [
        {
          path: ".",
          name: ticketId  // ONLY the workspace root
        }
      ],
      settings: {
        "window.title": `${ticketId} (Shadow): \${rootName}`,
        "files.exclude": {
          "**/node_modules": true,
          "**/.bare": true
        },
        // Explicit paths for git scanning
        "git.scanRepositories": [
          "saaf-monorepo/*",
          "saaf-react-app/*",
          "saaf-api-spec/*",
          "saaf-serverless-*/*"
        ],
        "git.repositoryScanMaxDepth": 2,
        "git.autoRepositoryDetection": true,
        "git.detectSubmodules": true,
        "git.followSymlinks": true
      }
    };

    // Add launch configuration if provided
    if (launchConfig) {
      workspace.launch = launchConfig;
    }

    return workspace;
  }

  async writeShadowWorkspaceFile(ticketId: string, workspace: VSCodeWorkspace): Promise<string> {
    const shadowPath = this.getShadowWorkspacePath(ticketId);
    const workspaceFilePath = path.join(shadowPath, `${ticketId}.code-workspace`);
    
    const content = JSON.stringify(workspace, null, 2);
    await fs.writeFile(workspaceFilePath, content);
    
    return workspaceFilePath;
  }
  
  async writeLaunchConfiguration(ticketId: string, launchConfig: LaunchConfiguration, folders: WorkspaceFolder[]): Promise<string | undefined> {
    if (!launchConfig) return;
    
    const shadowPath = this.getShadowWorkspacePath(ticketId);
    const launchPath = path.join(shadowPath, '.vscode', 'launch.json');
    
    // Ensure .vscode directory exists
    await fs.mkdir(path.dirname(launchPath), { recursive: true });
    
    // Update launch configurations to use correct paths
    // Extract the folder name from the workspaceFolder reference and use it as subdirectory
    const updatedConfig = {
      ...launchConfig,
      configurations: launchConfig.configurations?.map((config: LaunchConfigTemplate) => {
        if (config.cwd?.includes('${workspaceFolder:')) {
          // Extract the folder name from ${workspaceFolder:folderName}
          const match = config.cwd.match(/\$\{workspaceFolder:([^}]+)\}/);
          if (match && match[1]) {
            // Find the matching folder from our folders list
            const matchedFolderName = match[1];
            const folder = folders?.find((f: WorkspaceFolder) => f.name.includes(matchedFolderName));
            if (folder) {
              // Use the sanitized folder path basename
              const folderName = path.basename(folder.path);
              return {
                ...config,
                cwd: `\${workspaceFolder}/${folderName}`
              };
            }
          }
        }
        return config;
      })
    };
    
    const content = JSON.stringify(updatedConfig, null, 2);
    await fs.writeFile(launchPath, content);
    
    return launchPath;
  }
}