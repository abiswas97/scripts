import inquirer from 'inquirer';
import chalk from 'chalk';
import type {
  Repository,
  Worktree,
  WorktreeAction,
  NewWorktreeDetails,
} from './types/index.js';

export async function selectRepos(repos: Repository[]): Promise<Repository[]> {
  const { selectedRepos } = await inquirer.prompt<{ selectedRepos: Repository[] }>([
    {
      type: 'checkbox',
      name: 'selectedRepos',
      message: 'Select repositories to include in workspace:',
      choices: repos.map((repo) => ({
        name: repo.name,
        value: repo,
        checked: false,
      })),
    },
  ]);

  return selectedRepos;
}

export async function selectWorktreeAction(repoName: string): Promise<WorktreeAction> {
  const { action } = await inquirer.prompt<{ action: WorktreeAction }>([
    {
      type: 'list',
      name: 'action',
      message: `How do you want to add ${chalk.cyan(repoName)}?`,
      choices: [
        { name: 'Use existing worktree', value: 'existing' },
        { name: 'Create new worktree', value: 'new' },
      ],
    },
  ]);

  return action;
}

export async function selectWorktree(
  worktrees: Worktree[],
  repoName: string
): Promise<Worktree | null> {
  if (worktrees.length === 0) {
    console.log(chalk.yellow(`No worktrees found for ${repoName}`));
    return null;
  }

  const { selected } = await inquirer.prompt<{ selected: Worktree }>([
    {
      type: 'list',
      name: 'selected',
      message: `Select worktree from ${chalk.cyan(repoName)}:`,
      choices: worktrees.map((wt) => ({
        name: `${wt.name} ${wt.isCurrent ? chalk.green('(current)') : ''}`,
        value: wt,
      })),
    },
  ]);

  return selected;
}

export async function getNewWorktreeDetails(
  repoName: string,
  ticketId: string
): Promise<NewWorktreeDetails> {
  const { branchName } = await inquirer.prompt<{ branchName: string }>([
    {
      type: 'input',
      name: 'branchName',
      message: `Enter branch name for ${chalk.cyan(repoName)}:`,
      default: `feature/${ticketId.toLowerCase()}`,
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Branch name is required';
        }
        return true;
      },
    },
  ]);

  const { remoteRef } = await inquirer.prompt<{ remoteRef: string }>([
    {
      type: 'input',
      name: 'remoteRef',
      message: 'Base on remote branch (optional, e.g., origin/main):',
      default: '',
    },
  ]);

  return { branchName, remoteRef };
}

export async function confirmAction(message: string): Promise<boolean> {
  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: false,
    },
  ]);

  return confirmed;
}

export async function selectFoldersToRemove(
  folders: Array<{ name: string }>
): Promise<Array<{ name: string }>> {
  const { foldersToRemove } = await inquirer.prompt<{
    foldersToRemove: Array<{ name: string }>;
  }>([
    {
      type: 'checkbox',
      name: 'foldersToRemove',
      message: 'Select folders to remove:',
      choices: folders.map((folder) => ({
        name: folder.name,
        value: folder,
      })),
    },
  ]);

  return foldersToRemove;
}