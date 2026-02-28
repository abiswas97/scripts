import { promises as fs } from 'fs';
import path from 'path';
import type {
  TWConfig,
  ShadowConfig,
  LaunchConfiguration,
  WorkspaceFolder,
  LaunchConfigTemplate,
} from './types/index.js';
import { isTWConfig } from './types/index.js';

interface PlaceholderReplacements {
  [key: string]: string;
}

export class ConfigManager {
  private readonly configPath: string;

  constructor(rootDir: string) {
    this.configPath = path.join(rootDir, 'tw.config.json');
  }

  async loadConfig(): Promise<TWConfig | null> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const parsed: unknown = JSON.parse(content);
      
      // Basic validation - could be enhanced with full schema validation
      if (isTWConfig(parsed)) {
        return parsed;
      }
      return null;
    } catch (error) {
      // Config file doesn't exist or is invalid - that's OK
      return null;
    }
  }

  generateLaunchConfigs(
    config: TWConfig | null,
    workspaceFolders: WorkspaceFolder[]
  ): LaunchConfiguration | null {
    if (!config?.launchConfigs) {
      return null;
    }

    const { repositories, compounds } = config.launchConfigs;
    const launchConfig: LaunchConfiguration = {
      version: '0.2.0',
      configurations: [],
      compounds: [],
    };

    // Map repo names to their workspace folder names
    const repoToFolderMap: Record<string, string> = {};
    const presentRepos = new Set<string>();

    workspaceFolders.forEach((folder) => {
      // Extract repo name from folder name (format: "repo-name: branch-name")
      const repoName = folder.name.split(':')[0]?.trim() ?? '';
      repoToFolderMap[repoName] = folder.name;
      presentRepos.add(repoName);
    });

    // Add configurations for each present repository
    for (const [repoName, repoConfig] of Object.entries(repositories ?? {})) {
      if (presentRepos.has(repoName)) {
        const folderName = repoToFolderMap[repoName];

        // Process each config for this repository
        repoConfig.configs?.forEach((configTemplate) => {
          // Deep clone the config template
          const processedConfig = JSON.parse(
            JSON.stringify(configTemplate)
          ) as LaunchConfigTemplate;

          // Replace {{folderName}} placeholder with actual folder name
          if (folderName) {
            this.replacePlaceholders(processedConfig, { folderName });
          }

          launchConfig.configurations.push(processedConfig);
        });
      }
    }

    // Add compound configurations if all required repos are present
    compounds?.forEach((compound) => {
      const requiredRepos = compound.requires || [];
      const allReposPresent = requiredRepos.every((repo) => presentRepos.has(repo));

      if (allReposPresent) {
        const { requires, ...compoundConfig } = compound;
        launchConfig.compounds?.push(compoundConfig);
      }
    });

    // Return null if no configurations were generated
    if (launchConfig.configurations.length === 0 && launchConfig.compounds?.length === 0) {
      return null;
    }

    // Remove compounds array if empty
    if (launchConfig.compounds?.length === 0) {
      delete launchConfig.compounds;
    }

    return launchConfig;
  }

  private replacePlaceholders(
    obj: Record<string, unknown>,
    replacements: PlaceholderReplacements
  ): void {
    for (const key in obj) {
      const value = obj[key];
      if (typeof value === 'string') {
        // Replace all occurrences of placeholders
        for (const [placeholder, replacementValue] of Object.entries(replacements)) {
          const regex = new RegExp(`{{${placeholder}}}`, 'g');
          obj[key] = value.replace(regex, replacementValue);
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively process nested objects and arrays
        this.replacePlaceholders(value as Record<string, unknown>, replacements);
      }
    }
  }

  getShadowConfig(): ShadowConfig {
    // This method should be removed as it's synchronous and can't properly load config
    // Using default config for backward compatibility
    return this.getDefaultShadowConfig();
  }

  async getShadowConfigAsync(): Promise<ShadowConfig> {
    const config = await this.loadConfig();
    if (!config?.shadow) {
      return this.getDefaultShadowConfig();
    }

    // Merge with defaults
    return {
      enabled: config.shadow.enabled !== false,
      syncPatterns: config.shadow.syncPatterns || this.getDefaultShadowConfig().syncPatterns,
      location: config.shadow.location || '.ticket-workspaces',
      defaultToShadow: config.shadow.defaultToShadow !== false,
      alwaysInclude: config.shadow.alwaysInclude || this.getDefaultAlwaysInclude(),
    };
  }

  private getDefaultShadowConfig(): ShadowConfig {
    return {
      enabled: true,
      syncPatterns: ['^\.env.*', '^\.nvmrc$', '^\.ruby-version$'],
      location: '.ticket-workspaces',
      defaultToShadow: true,
      alwaysInclude: this.getDefaultAlwaysInclude(),
    };
  }

  private getDefaultAlwaysInclude() {
    // Default to including common AI assistant context files if they exist
    return {
      folders: [],  // Empty by default, let users opt-in
      files: [],    // Empty by default, let users opt-in
    };
  }
}