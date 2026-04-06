import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import type { Vulnerability } from './api';

export async function fixVulnerabilities(
  vulns: Vulnerability[],
  pkgJsonPath: string,
): Promise<{ fixed: number; skipped: number }> {
  const fixable = vulns.filter((v) => v.fixedVersion && v.fixedVersion.trim() !== '');

  if (fixable.length === 0) return { fixed: 0, skipped: vulns.length };

  const absPath = path.resolve(pkgJsonPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`package.json not found at: ${absPath}`);
  }

  const raw = fs.readFileSync(absPath, 'utf8');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pkg = JSON.parse(raw) as any;

  let fixed = 0;

  for (const v of fixable) {
    const pkgName = v.packageName;
    const fixedVer = v.fixedVersion!;

    for (const depSection of ['dependencies', 'devDependencies', 'peerDependencies']) {
      if (pkg[depSection]?.[pkgName] !== undefined) {
        const oldVer = pkg[depSection][pkgName];
        pkg[depSection][pkgName] = `^${fixedVer}`;
        console.log(
          `  ${chalk.green('✔')} ${chalk.bold(pkgName)}: ${chalk.red(oldVer)} → ${chalk.green('^' + fixedVer)}`,
        );
        fixed++;
        break;
      }
    }
  }

  if (fixed > 0) {
    fs.writeFileSync(absPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(chalk.gray(`\n  Wrote updated package.json → ${absPath}`));

    console.log(chalk.gray('  Running npm install...\n'));
    execSync('npm install', { cwd: path.dirname(absPath), stdio: 'inherit' });
  }

  return { fixed, skipped: vulns.length - fixed };
}
