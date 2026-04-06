import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { listTargets, createTarget, deleteTarget, getScanHistory } from './api';
import { statusLabel, printVulnTable } from './display';
import { fixVulnerabilities } from './fix';

export const program = new Command();

program
  .name('shadowaudit')
  .description(chalk.bold.cyan('ShadowAudit') + ' — CVE vulnerability scanner & fixer')
  .version('1.0.0');

// ── list ──────────────────────────────────────────────────────────────
program
  .command('list')
  .alias('ls')
  .description('List all registered scan targets')
  .action(async () => {
    const spinner = ora('Fetching targets…').start();
    try {
      const targets = await listTargets();
      spinner.stop();

      if (targets.length === 0) {
        console.log(chalk.gray('\n  No targets registered yet. Use: shadowaudit scan <package>\n'));
        return;
      }

      console.log();
      const header = [
        chalk.bold.gray('Name'.padEnd(22)),
        chalk.bold.gray('Type'.padEnd(12)),
        chalk.bold.gray('Value'.padEnd(30)),
        chalk.bold.gray('Status'),
      ].join('  ');
      console.log(header);
      console.log(chalk.gray('─'.repeat(90)));

      for (const t of targets) {
        const name  = chalk.white.bold(t.name.padEnd(22));
        const type  = chalk.cyan(t.type.padEnd(12));
        const value = chalk.gray(t.value.substring(0, 28).padEnd(30));
        const stat  = statusLabel(t.status);
        console.log(`  ${name}  ${type}  ${value}  ${stat}`);
      }
      console.log();
    } catch (err) {
      spinner.fail(chalk.red('Failed to fetch targets — is the BFF running?'));
      process.exit(1);
    }
  });

// ── scan ──────────────────────────────────────────────────────────────
program
  .command('scan <package>')
  .description('Register & scan an npm package, docker image, or filesystem path')
  .option('-t, --type <type>', 'Target type: npm | docker | filesystem', 'npm')
  .option('-n, --name <name>', 'Custom name for this target')
  .action(async (pkg: string, opts: { type: string; name?: string }) => {
    const name = opts.name ?? pkg;
    const spinner = ora(`Registering ${chalk.cyan(pkg)} for scanning…`).start();
    try {
      const target = await createTarget(name, opts.type, pkg);
      spinner.succeed(`Registered ${chalk.cyan(pkg)} — scan queued (id: ${chalk.gray(target.id)})`);
      console.log(chalk.gray('\n  Scan is running in the background.'));
      console.log(chalk.gray(`  Run: ${chalk.white('shadowaudit status ' + name)} to see results.\n`));
    } catch (err) {
      spinner.fail(chalk.red('Failed to register target.'));
      process.exit(1);
    }
  });

// ── status ────────────────────────────────────────────────────────────
program
  .command('status <name>')
  .description('Show CVE scan results for a target by name')
  .action(async (name: string) => {
    const spinner = ora(`Fetching results for ${chalk.cyan(name)}…`).start();
    try {
      const targets = await listTargets();
      const target = targets.find((t) => t.name === name || t.value === name);

      if (!target) {
        spinner.fail(chalk.red(`No target found with name "${name}"`));
        console.log(chalk.gray(`  Run ${chalk.white('shadowaudit list')} to see all targets.\n`));
        process.exit(1);
      }

      const history = await getScanHistory(target.id);
      spinner.stop();

      console.log();
      console.log(chalk.bold(`  Target: ${chalk.cyan(target.name)}  (${target.type}: ${chalk.gray(target.value)})`));
      console.log(`  Status: ${statusLabel(target.status)}`);
      console.log(`  Last scan: ${chalk.gray(target.lastScannedAt ? new Date(target.lastScannedAt).toLocaleString() : 'Never')}`);

      if (history.length === 0) {
        console.log(chalk.gray('\n  No scan results yet — scan may still be running.\n'));
        return;
      }

      const latest = history[0];
      const s = latest.summary;
      console.log();
      console.log(
        `  Summary: ` +
        chalk.red.bold(`${s.critical} CRITICAL  `) +
        chalk.yellow(`${s.high} HIGH  `) +
        chalk.yellowBright(`${s.medium} MEDIUM  `) +
        chalk.green(`${s.low} LOW`),
      );

      printVulnTable(latest.vulnerabilities);

      const fixable = latest.vulnerabilities.filter((v) => v.fixedVersion);
      if (fixable.length > 0) {
        console.log(chalk.cyan.bold(`  💡 ${fixable.length} vulnerabilit${fixable.length > 1 ? 'ies have' : 'y has'} a fix available.`));
        console.log(chalk.gray(`     Run: ${chalk.white('shadowaudit fix ' + target.name + ' --pkg ./package.json')} to auto-fix.\n`));
      }
    } catch (err) {
      spinner.fail(chalk.red('Failed to fetch scan results.'));
      process.exit(1);
    }
  });

// ── fix ───────────────────────────────────────────────────────────────
program
  .command('fix <name>')
  .description('Auto-fix vulnerabilities by bumping versions in package.json')
  .option('--pkg <path>', 'Path to your package.json', './package.json')
  .action(async (name: string, opts: { pkg: string }) => {
    const spinner = ora(`Fetching vulnerabilities for ${chalk.cyan(name)}…`).start();
    try {
      const targets = await listTargets();
      const target = targets.find((t) => t.name === name || t.value === name);

      if (!target) {
        spinner.fail(chalk.red(`No target found with name "${name}"`));
        process.exit(1);
      }

      const history = await getScanHistory(target.id);
      if (history.length === 0) {
        spinner.fail(chalk.yellow('No scan results found. Run a scan first.'));
        process.exit(1);
      }

      const latest = history[0];
      const fixable = latest.vulnerabilities.filter((v) => v.fixedVersion);

      if (fixable.length === 0) {
        spinner.succeed(chalk.green('No fixable vulnerabilities — nothing to do!'));
        return;
      }

      spinner.succeed(`Found ${chalk.yellow(fixable.length)} fixable vulnerabilit${fixable.length > 1 ? 'ies' : 'y'}:`);
      console.log();

      const { fixed, skipped } = await fixVulnerabilities(latest.vulnerabilities, opts.pkg);

      console.log();
      if (fixed > 0) {
        console.log(chalk.green.bold(`  ✔ Fixed ${fixed} package${fixed > 1 ? 's' : ''} in ${opts.pkg}`));
      }
      if (skipped > 0) {
        console.log(chalk.gray(`  ⚠ ${skipped} vulnerabilit${skipped > 1 ? 'ies' : 'y'} skipped (not found in package.json or no fix available)`));
      }
      console.log();
      console.log(chalk.gray(`  Re-scan to confirm: ${chalk.white('shadowaudit scan ' + target.value)}\n`));
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── delete ────────────────────────────────────────────────────────────
program
  .command('delete <name>')
  .alias('rm')
  .description('Delete a target by name')
  .action(async (name: string) => {
    const spinner = ora(`Deleting ${chalk.cyan(name)}…`).start();
    try {
      const targets = await listTargets();
      const target = targets.find((t) => t.name === name);

      if (!target) {
        spinner.fail(chalk.red(`No target found with name "${name}"`));
        process.exit(1);
      }

      await deleteTarget(target.id);
      spinner.succeed(`Deleted ${chalk.cyan(name)}`);
    } catch (err) {
      spinner.fail(chalk.red('Delete failed.'));
      process.exit(1);
    }
  });
