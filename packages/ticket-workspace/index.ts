#!/usr/bin/env node

import { Command } from 'commander';
import { createWorkspace } from './lib/commands/new.js';
import { updateWorkspace } from './lib/commands/update.js';
import { removeFromWorkspace } from './lib/commands/remove.js';
import { listWorkspaces } from './lib/commands/list.js';
import { openWorkspace } from './lib/commands/open.js';

const program = new Command();

program
  .name('ticket-workspace')
  .description('Manage VS Code workspaces based on tickets')
  .version('1.0.0');

program
  .command('new <ticketId>')
  .description('Create a new workspace for a ticket')
  .option('-d, --directory <path>', 'Root directory containing repos (defaults to current directory)', process.env['APP_DIR'] || process.cwd())
  .option('-v, --verbose', 'Show detailed output')
  .action(createWorkspace);

program
  .command('update <ticketId>')
  .description('Update an existing workspace')
  .option('-d, --directory <path>', 'Root directory containing repos (defaults to current directory)', process.env['APP_DIR'] || process.cwd())
  .option('-v, --verbose', 'Show detailed output')
  .action(updateWorkspace);

program
  .command('remove <ticketId>')
  .description('Remove folders from a workspace')
  .option('-d, --directory <path>', 'Root directory containing repos (defaults to current directory)', process.env['APP_DIR'] || process.cwd())
  .option('-v, --verbose', 'Show detailed output')
  .action(removeFromWorkspace);

program
  .command('list')
  .description('List all ticket workspaces')
  .option('-d, --directory <path>', 'Root directory containing repos (defaults to current directory)', process.env['APP_DIR'] || process.cwd())
  .option('-v, --verbose', 'Show detailed output')
  .action(listWorkspaces);

program
  .command('open <ticketId>')
  .alias('launch')
  .alias('load')
  .description('Open workspace in VS Code')
  .option('-d, --directory <path>', 'Root directory containing repos (defaults to current directory)', process.env['APP_DIR'] || process.cwd())
  .option('-v, --verbose', 'Show detailed output')
  .action(openWorkspace);

program.parse();