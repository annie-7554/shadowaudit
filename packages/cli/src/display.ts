import chalk, { type ChalkInstance } from 'chalk';
import type { Vulnerability } from './api';

export const SEVERITY_COLOR: Record<string, ChalkInstance> = {
  CRITICAL: chalk.bgRed.white.bold,
  HIGH:     chalk.red.bold,
  MEDIUM:   chalk.yellow.bold,
  LOW:      chalk.green,
  UNKNOWN:  chalk.gray,
};

export function severityLabel(s: string): string {
  const fn = SEVERITY_COLOR[s] ?? chalk.gray;
  return fn(` ${s} `);
}

export function statusLabel(s: string): string {
  switch (s) {
    case 'vulnerable':    return chalk.red.bold('● Vulnerable');
    case 'clean':         return chalk.green.bold('✔ Clean');
    case 'scanning':      return chalk.yellow.bold('⟳ Scanning');
    case 'never_scanned': return chalk.gray('— Never scanned');
    default:              return chalk.gray(s);
  }
}

export function printVulnTable(vulns: Vulnerability[]): void {
  if (vulns.length === 0) {
    console.log(chalk.green('\n  ✔ No vulnerabilities found.\n'));
    return;
  }

  const header = [
    chalk.bold.gray('CVE ID'),
    chalk.bold.gray('Package'),
    chalk.bold.gray('Installed'),
    chalk.bold.gray('Fixed In'),
    chalk.bold.gray('Severity'),
    chalk.bold.gray('CVSS'),
    chalk.bold.gray('CWE'),
  ];

  console.log('\n' + header.join('  '));
  console.log(chalk.gray('─'.repeat(100)));

  for (const v of vulns) {
    const cve   = chalk.blueBright(v.cveId.padEnd(20));
    const pkg   = v.packageName.padEnd(16);
    const inst  = chalk.gray(v.installedVersion.padEnd(12));
    const fixed = v.fixedVersion ? chalk.green(('↑ ' + v.fixedVersion).padEnd(14)) : chalk.gray('—'.padEnd(14));
    const sev   = severityLabel(v.severity).padEnd(12);
    const cvss  = v.cvssScore != null ? chalk.yellow(v.cvssScore.toFixed(1)) : chalk.gray('—');
    const cwe   = v.cweIds?.length ? chalk.magenta(v.cweIds.join(', ')) : chalk.gray('—');

    console.log(`  ${cve}  ${pkg}  ${inst}  ${fixed}  ${sev}  ${cvss.padEnd(6)}  ${cwe}`);
  }
  console.log();
}
