import { pool } from './db/client';
import type { ParsedVulnerability, ScanResult } from './types';

type HighSeverity = 'HIGH' | 'CRITICAL';
const HIGH_SEVERITY_SET = new Set<HighSeverity>(['HIGH', 'CRITICAL']);

export class CVEDiff {
  async findNew(
    targetId: string,
    newVulns: ParsedVulnerability[],
  ): Promise<ParsedVulnerability[]> {
    const previous = await this.fetchPreviousScan(targetId);

    const previousIds = new Set<string>(
      (previous?.vulnerabilities ?? []).map((v: ParsedVulnerability) => v.cveId),
    );

    return newVulns.filter(
      (v) =>
        !previousIds.has(v.cveId) &&
        HIGH_SEVERITY_SET.has(v.severity as HighSeverity),
    );
  }

  private async fetchPreviousScan(targetId: string): Promise<ScanResult | null> {
    const result = await pool.query<ScanResult>(
      `SELECT id, target_id AS "targetId", scan_id AS "scanId",
              vulnerabilities, scanned_at AS "scannedAt", created_at AS "createdAt"
       FROM scan_results
       WHERE target_id = $1
       ORDER BY scanned_at DESC
       LIMIT 1`,
      [targetId],
    );
    return result.rows[0] ?? null;
  }
}
