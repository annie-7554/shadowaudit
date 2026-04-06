import { v4 as uuidv4 } from 'uuid';
import { pool } from './client';
import type { ParsedVulnerability, ScanResult } from '../types';

export class ResultsStore {
  async save(targetId: string, vulnerabilities: ParsedVulnerability[]): Promise<void> {
    const scanId = uuidv4();
    const critical = vulnerabilities.filter((v) => v.severity === 'CRITICAL').length;
    const high = vulnerabilities.filter((v) => v.severity === 'HIGH').length;
    const medium = vulnerabilities.filter((v) => v.severity === 'MEDIUM').length;
    const low = vulnerabilities.filter((v) => v.severity === 'LOW').length;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO scan_results
           (id, target_id, scan_type, status, vulnerability_count,
            critical_count, high_count, medium_count, low_count, vulnerabilities)
         VALUES ($1, $2, 'trivy', 'completed', $3, $4, $5, $6, $7, $8::jsonb)`,
        [scanId, targetId, vulnerabilities.length, critical, high, medium, low,
          JSON.stringify(vulnerabilities)],
      );

      // Update last_scanned_at on the target
      await client.query(
        `UPDATE targets SET last_scanned_at = NOW() WHERE id = $1`,
        [targetId],
      );

      // Insert individual CVEs into alerts table
      for (const vuln of vulnerabilities.filter((v) => v.severity === 'CRITICAL' || v.severity === 'HIGH')) {
        await client.query(
          `INSERT INTO alerts (target_id, scan_result_id, cve_id, severity, package_name, fixed_version)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [targetId, scanId, vuln.cveId, vuln.severity.toLowerCase(),
            vuln.packageName, vuln.fixedVersion ?? null],
        );
      }

      await client.query('COMMIT');
      console.log(`[ResultsStore] Saved ${vulnerabilities.length} vulns (${critical} critical, ${high} high) for target ${targetId}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getLatest(targetId: string): Promise<ScanResult | null> {
    const result = await pool.query<ScanResult>(
      `SELECT id, target_id AS "targetId",
              critical_count AS "criticalCount", high_count AS "highCount",
              medium_count AS "mediumCount", low_count AS "lowCount",
              vulnerabilities, created_at AS "createdAt"
       FROM scan_results
       WHERE target_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [targetId],
    );
    return result.rows[0] ?? null;
  }

  async getHistory(targetId: string, limit: number): Promise<ScanResult[]> {
    const result = await pool.query<ScanResult>(
      `SELECT id, target_id AS "targetId",
              critical_count AS "criticalCount", high_count AS "highCount",
              medium_count AS "mediumCount", low_count AS "lowCount",
              vulnerabilities, created_at AS "createdAt"
       FROM scan_results
       WHERE target_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [targetId, limit],
    );
    return result.rows;
  }
}
