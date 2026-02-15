#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const ProcessSnapshot = require('./lib/processes');
const logger = require('./utils/logger');
const { formatSize } = require('./utils/helpers');

const program = new Command();
const processSnap = new ProcessSnapshot();

async function main() {
  program
    .name('process-snapshot')
    .description('Capture and monitor running process states')
    .version('1.0.0');

  program
    .command('save')
    .description('Capture current process state')
    .argument('[name]', 'Snapshot name')
    .action(async (name) => {
      try {
        logger.header('Saving Process Snapshot');
        const result = await processSnap.saveSnapshot(name);
        logger.success(`Snapshot saved: ${result.name}`);
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });

  program
    .command('restore')
    .description('View process snapshot')
    .argument('<name>', 'Snapshot name')
    .action(async (name) => {
      try {
        logger.header('Restoring Process Snapshot');
        await processSnap.restoreSnapshot(name);
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });

  program
    .command('list')
    .description('List saved snapshots')
    .action(async () => {
      try {
        const snapshots = await processSnap.listSnapshots();
        if (snapshots.length === 0) {
          logger.info('No snapshots found');
          return;
        }
        logger.header('Process Snapshots');
        console.log(chalk.bold('  Name') + ' '.repeat(40) + chalk.bold('Procs') + ' '.repeat(8) + chalk.bold('Ports') + ' '.repeat(8) + chalk.bold('Size'));
        console.log(chalk.gray('─'.repeat(80)));
        for (const s of snapshots) {
          console.log(`  ${s.name}${' '.repeat(50 - s.name.length)}${s.processes}${' '.repeat(12 - String(s.processes).length)}${s.ports}${' '.repeat(12 - String(s.ports).length)}${formatSize(s.size)}`);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });

  program
    .command('delete')
    .description('Delete a snapshot')
    .argument('<name>', 'Snapshot name')
    .action(async (name) => {
      try {
        await processSnap.deleteSnapshot(name);
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });

  if (process.argv.length === 2) {
    program.parse(['node', 'process-snapshot', '--help']);
  } else {
    program.parse(process.argv);
  }
}

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error.message);
  process.exit(1);
});
