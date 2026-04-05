import { v4 as uuidv4 } from 'uuid';
import { pool } from './client';
import type { ParsedVulnerability, ScanResult } from '../types';

export class ResultsStore {
  async save(targetId: string, vulnerabilities: ParsedVulnerability[]): Promise<void> {
    const scanId = uuidv4();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO scan_results (id, target_id, scan_id, vulnerabilities, scanned_at)
         VALUES ($1, $2, $3, $4::jsonb, NOW())
         ON CONFLICT (target_id, scan_id)
         DO UPDATE SET vulnerabilities = EXCLUDED.vulnerabilities, scanned_at = EXCLUDED.scanned_at`,
        [uuidv4(), targetId, scanId, JSON.stringify(vulnerabilities)],
      );
      await client.query('COMMIT');
      console.log(`[ResultsStore] Saved ${vulnerabilities.length} vulns for target ${targetId}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getLatest(targetId: string): Promise<ScanResult | null> {
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

  async getHistory(targetId: string, limit: number): Promise<ScanResult[]> {
    const result = await pool.query<ScanResult>(
      `SELECT id, target_id AS "targetId", scan_id AS "scanId",
              vulnerabilities, scanned_at AS "scannedAt", created_at AS "createdAt"
       FROM scan_results
       WHERE target_id = $1
       ORDER BY scanned_at DESC
       LIMIT $2`,
      [targetId, limit],
    );
    return result.rows;
  }
}
