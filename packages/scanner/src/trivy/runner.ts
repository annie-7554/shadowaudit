import { execFile } from 'child_process';
import { promisify } from 'util';
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
    const args =
      type === 'docker'
        ? ['image', '--ignore-unfixed', '--severity', 'HIGH,CRITICAL,MEDIUM,LOW', '--format', 'json', '--quiet', value]
        : ['fs', '--ignore-unfixed', '--severity', 'HIGH,CRITICAL,MEDIUM,LOW', '--format', 'json', '--quiet', value];

    return TrivyRunner.execute(args);
  }

  private static async runConfigScan(): Promise<TrivyRawOutput> {
    // Only run if k8s directory exists
    const fs = await import('fs');
    if (!fs.existsSync('./k8s')) return { Results: [] };
    return TrivyRunner.execute(['config', '--format', 'json', '--quiet', './k8s']);
  }

  private static async runSecretScan(): Promise<TrivyRawOutput> {
    // Only run if current directory exists and has files
    const fs = await import('fs');
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
