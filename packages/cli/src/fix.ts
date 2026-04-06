import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import type { Vulnerability } from './api';

/** Extract the single best semver string from Trivy's fixedVersion field.
 *  Trivy returns things like "1.2.6, 0.2.4" or "4.19.2, 5.0.0-beta.3".
 *  We pick the highest stable (non-prerelease) version. */
function pickBestVersion(fixedVersion: string): string | null {
  const candidates = fixedVersion
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+\.\d+/.test(s))           // must start with digits
    .filter((s) => !/(alpha|beta|rc|pre)/i.test(s)); // prefer stable

  if (candidates.length === 0) {
    // Fall back to including pre-releases
    const all = fixedVersion.split(',').map((s) => s.trim()).filter((s) => /^\d+\.\d+/.test(s));
    if (all.length === 0) return null;
    candidates.push(...all);
  }

  // Sort descending by semver parts
  candidates.sort((a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });

  return candidates[0];
}

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

  // Build a map: packageName → highest fix version across all CVEs
  const bestFix = new Map<string, string>();
  for (const v of fixable) {
    const best = pickBestVersion(v.fixedVersion!);
    if (!best) continue;
    const existing = bestFix.get(v.packageName);
    if (!existing) {
      bestFix.set(v.packageName, best);
    } else {
      // Keep whichever is higher
      const ea = existing.split('.').map(Number);
      const ba = best.split('.').map(Number);
      for (let i = 0; i < Math.max(ea.length, ba.length); i++) {
        const diff = (ba[i] ?? 0) - (ea[i] ?? 0);
        if (diff > 0) { bestFix.set(v.packageName, best); break; }
        if (diff < 0) break;
      }
    }
  }

  let fixed = 0;
  for (const [pkgName, fixVer] of bestFix.entries()) {
    for (const depSection of ['dependencies', 'devDependencies', 'peerDependencies']) {
      if (pkg[depSection]?.[pkgName] !== undefined) {
        const oldVer = pkg[depSection][pkgName];
        pkg[depSection][pkgName] = `^${fixVer}`;
        console.log(
          `  ${chalk.green('✔')} ${chalk.bold(pkgName)}: ${chalk.red(oldVer)} → ${chalk.green('^' + fixVer)}`,
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
