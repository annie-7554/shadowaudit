import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { TrivyRawOutput, ScanJobData } from '../types';
import { TrivyParser } from './parser';
import type { ParsedVulnerability } from '../types';

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface TrivyScanOutput {
  mainScan: ParsedVulnerability[];
  configScan: ParsedVulnerability[];
  secretScan: ParsedVulnerability[];
}

export class TrivyRunner {
  static async scan(
    type: ScanJobData['type'],
    value: string,
  ): Promise<TrivyScanOutput> {
    const parser = new TrivyParser();

    const [mainRaw, configRaw, secretRaw] = await Promise.all([
      TrivyRunner.runMainScan(type, value),
      TrivyRunner.runConfigScan(),
      TrivyRunner.runSecretScan(),
    ]);

    return {
      mainScan: parser.parse(mainRaw),
      configScan: parser.parse(configRaw),
      secretScan: parser.parse(secretRaw),
    };
  }

  private static async runMainScan(
    type: ScanJobData['type'],
    value: string,
  ): Promise<TrivyRawOutput> {
    if (type === 'docker') {
      const args = ['image', '--ignore-unfixed', '--severity', 'HIGH,CRITICAL,MEDIUM,LOW', '--format', 'json', '--quiet', value];
      return TrivyRunner.execute(args);
    }

    if (type === 'npm') {
      return TrivyRunner.runNpmScan(value);
    }

    // filesystem scan — if it has package.json but no lock file, generate one first
    const pkgJson = path.join(value, 'package.json');
    const lockFile = path.join(value, 'package-lock.json');
    if (fs.existsSync(pkgJson) && !fs.existsSync(lockFile)) {
      try {
        await execFileAsync('npm', ['install', '--package-lock-only', '--no-audit'], {
          cwd: value, timeout: 60_000,
        });
      } catch {
        // scan anyway
      }
    }

    const args = ['fs', '--ignore-unfixed', '--severity', 'HIGH,CRITICAL,MEDIUM,LOW', '--format', 'json', '--quiet', value];
    return TrivyRunner.execute(args);
  }

  // For npm packages: create a temp dir with package.json, npm install, then scan
  private static async runNpmScan(packageSpec: string): Promise<TrivyRawOutput> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadowaudit-npm-'));
    try {
      // Parse "name@version" or just "name"
      const atIdx = packageSpec.lastIndexOf('@');
      const pkgName = atIdx > 0 ? packageSpec.slice(0, atIdx) : packageSpec;
      const pkgVersion = atIdx > 0 ? packageSpec.slice(atIdx + 1) : 'latest';

      const packageJson = {
        name: 'shadowaudit-scan-target',
        version: '1.0.0',
        dependencies: { [pkgName]: pkgVersion },
      };
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      // npm install --package-lock-only is faster (no actual download, just resolves)
      await execFileAsync('npm', ['install', '--package-lock-only', '--no-audit'], {
        cwd: tmpDir,
        timeout: 60_000,
      });

      const args = ['fs', '--ignore-unfixed', '--severity', 'HIGH,CRITICAL,MEDIUM,LOW', '--format', 'json', '--quiet', tmpDir];
      const result = await TrivyRunner.execute(args);
      return result;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  private static async runConfigScan(): Promise<TrivyRawOutput> {
    if (!fs.existsSync('./k8s')) return { Results: [] };
    return TrivyRunner.execute(['config', '--format', 'json', '--quiet', './k8s']);
  }

  private static async runSecretScan(): Promise<TrivyRawOutput> {
    if (!fs.existsSync('.')) return { Results: [] };
    return TrivyRunner.execute(['fs', '--scanners', 'secret', '--format', 'json', '--quiet', '.']);
  }

  private static async execute(args: string[]): Promise<TrivyRawOutput> {
    try {
      const { stdout } = await execFileAsync('trivy', args, {
        timeout: TIMEOUT_MS,
        maxBuffer: 50 * 1024 * 1024, // 50 MB
      });

      if (!stdout.trim()) return { Results: [] };

      return JSON.parse(stdout) as TrivyRawOutput;
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException & { code?: string; killed?: boolean; stdout?: string };

      if (error.code === 'ENOENT') {
        throw new Error(
          'Trivy is not installed or not found in PATH. Install it from https://github.com/aquasecurity/trivy',
        );
      }

      if (error.killed) {
        throw new Error(`Trivy scan timed out after ${TIMEOUT_MS / 1000}s`);
      }

      // Trivy exits with code 1 when vulnerabilities are found but still outputs valid JSON
      if (error.stdout) {
        try {
          return JSON.parse(error.stdout) as TrivyRawOutput;
        } catch {
          // fall through to rethrow original error
        }
      }

      throw new Error(`Trivy execution failed: ${error.message}`);
    }
  }
}
