import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import type { Vulnerability } from './api';

/** Extract the single best semver string from Trivy's fixedVersion field. */
function pickBestVersion(fixedVersion: string): string | null {
  const candidates = fixedVersion
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+\.\d+/.test(s))
    .filter((s) => !/(alpha|beta|rc|pre)/i.test(s));

  if (candidates.length === 0) {
    const all = fixedVersion.split(',').map((s) => s.trim()).filter((s) => /^\d+\.\d+/.test(s));
    if (all.length === 0) return null;
    candidates.push(...all);
  }

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

/** Build best-fix map: packageName → highest fix version across all CVEs */
function buildBestFixes(vulns: Vulnerability[]): Map<string, string> {
  const bestFix = new Map<string, string>();
  for (const v of vulns.filter((v) => v.fixedVersion?.trim())) {
    const best = pickBestVersion(v.fixedVersion!);
    if (!best) continue;
    const existing = bestFix.get(v.packageName);
    if (!existing) { bestFix.set(v.packageName, best); continue; }
    const ea = existing.split('.').map(Number);
    const ba = best.split('.').map(Number);
    for (let i = 0; i < Math.max(ea.length, ba.length); i++) {
      const diff = (ba[i] ?? 0) - (ea[i] ?? 0);
      if (diff > 0) { bestFix.set(v.packageName, best); break; }
      if (diff < 0) break;
    }
  }
  return bestFix;
}

// ── Node.js ──────────────────────────────────────────────────────────────
function fixNodeJs(vulns: Vulnerability[], filePath: string): { fixed: number; skipped: number } {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) throw new Error(`File not found: ${absPath}`);
  const pkg = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  const bestFix = buildBestFixes(vulns);
  let fixed = 0;
  for (const [pkgName, fixVer] of bestFix.entries()) {
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
      if (pkg[section]?.[pkgName] !== undefined) {
        console.log(`  ${chalk.green('✔')} ${chalk.bold(pkgName)}: ${chalk.red(pkg[section][pkgName])} → ${chalk.green('^' + fixVer)}`);
        pkg[section][pkgName] = `^${fixVer}`;
        fixed++; break;
      }
    }
  }
  if (fixed > 0) {
    fs.writeFileSync(absPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(chalk.gray(`\n  Wrote updated ${path.basename(absPath)} → ${absPath}`));
    console.log(chalk.gray('  Running npm install...\n'));
    execSync('npm install', { cwd: path.dirname(absPath), stdio: 'inherit' });
  }
  return { fixed, skipped: vulns.length - fixed };
}

// ── Python requirements.txt ───────────────────────────────────────────────
function fixPython(vulns: Vulnerability[], filePath: string): { fixed: number; skipped: number } {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) throw new Error(`File not found: ${absPath}`);
  let content = fs.readFileSync(absPath, 'utf8');
  const bestFix = buildBestFixes(vulns);
  let fixed = 0;
  for (const [pkgName, fixVer] of bestFix.entries()) {
    // Match case-insensitive: Django==2.2.0  or  requests>=1.0
    const regex = new RegExp(`^(${pkgName})([=><~!]+)([^\\s#]+)(.*)$`, 'im');
    if (regex.test(content)) {
      content = content.replace(regex, (_, name, _op, oldVer, rest) => {
        console.log(`  ${chalk.green('✔')} ${chalk.bold(name)}: ${chalk.red(oldVer)} → ${chalk.green('>=' + fixVer)}`);
        fixed++;
        return `${name}>=${fixVer}${rest}`;
      });
    }
  }
  if (fixed > 0) {
    fs.writeFileSync(absPath, content);
    console.log(chalk.gray(`\n  Wrote updated requirements.txt → ${absPath}`));
    console.log(chalk.gray('  Run: pip install -r requirements.txt  to apply\n'));
  }
  return { fixed, skipped: vulns.length - fixed };
}

// ── Go go.mod ─────────────────────────────────────────────────────────────
function fixGo(vulns: Vulnerability[], filePath: string): { fixed: number; skipped: number } {
  const gomod = filePath.endsWith('go.mod') ? filePath : path.join(path.dirname(filePath), 'go.mod');
  const absPath = path.resolve(gomod);
  if (!fs.existsSync(absPath)) throw new Error(`go.mod not found at: ${absPath}`);
  let content = fs.readFileSync(absPath, 'utf8');
  const bestFix = buildBestFixes(vulns);
  let fixed = 0;
  for (const [pkgName, fixVer] of bestFix.entries()) {
    const regex = new RegExp(`(${pkgName.replace('/', '\\/')}\\s+v)[^\\s]+`, 'g');
    if (regex.test(content)) {
      content = content.replace(regex, (match, prefix) => {
        const oldVer = match.replace(prefix, '');
        console.log(`  ${chalk.green('✔')} ${chalk.bold(pkgName)}: ${chalk.red(oldVer)} → ${chalk.green('v' + fixVer)}`);
        fixed++;
        return `${prefix}${fixVer}`;
      });
    }
  }
  if (fixed > 0) {
    fs.writeFileSync(absPath, content);
    console.log(chalk.gray(`\n  Wrote updated go.mod → ${absPath}`));
    console.log(chalk.gray('  Run: go mod tidy  to apply\n'));
  }
  return { fixed, skipped: vulns.length - fixed };
}

// ── Java pom.xml ──────────────────────────────────────────────────────────
function fixJava(vulns: Vulnerability[], filePath: string): { fixed: number; skipped: number } {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) throw new Error(`File not found: ${absPath}`);
  let content = fs.readFileSync(absPath, 'utf8');
  const bestFix = buildBestFixes(vulns);
  let fixed = 0;
  for (const [pkgName, fixVer] of bestFix.entries()) {
    const artifactId = pkgName.includes(':') ? pkgName.split(':')[1] : pkgName;
    const regex = new RegExp(`(<artifactId>${artifactId}<\\/artifactId>[\\s\\S]*?<version>)([^<]+)(<\\/version>)`, 'i');
    if (regex.test(content)) {
      content = content.replace(regex, (_, pre, oldVer, post) => {
        console.log(`  ${chalk.green('✔')} ${chalk.bold(artifactId)}: ${chalk.red(oldVer)} → ${chalk.green(fixVer)}`);
        fixed++;
        return `${pre}${fixVer}${post}`;
      });
    }
  }
  if (fixed > 0) {
    fs.writeFileSync(absPath, content);
    console.log(chalk.gray(`\n  Wrote updated pom.xml → ${absPath}`));
    console.log(chalk.gray('  Run: mvn install  to apply\n'));
  }
  return { fixed, skipped: vulns.length - fixed };
}

// ── Main entry ────────────────────────────────────────────────────────────
export async function fixVulnerabilities(
  vulns: Vulnerability[],
  filePath: string,
): Promise<{ fixed: number; skipped: number }> {
  const fixable = vulns.filter((v) => v.fixedVersion?.trim());
  if (fixable.length === 0) return { fixed: 0, skipped: vulns.length };

  const base = path.basename(filePath).toLowerCase();

  if (base === 'package.json' || base === 'package-lock.json') {
    return fixNodeJs(vulns, filePath);
  }
  if (base === 'requirements.txt' || base === 'pipfile.lock' || base.endsWith('.txt')) {
    return fixPython(vulns, filePath);
  }
  if (base === 'go.mod' || base === 'go.sum') {
    return fixGo(vulns, filePath);
  }
  if (base === 'pom.xml' || base.endsWith('.gradle')) {
    return fixJava(vulns, filePath);
  }

  throw new Error(
    `Unsupported file type: ${base}\nSupported: package.json, requirements.txt, go.mod, pom.xml`,
  );
}


