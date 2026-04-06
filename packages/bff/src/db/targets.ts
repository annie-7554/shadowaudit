import { query } from './client';
import type {
  Target,
  CreateTargetDTO,
  ScanResult,
  DashboardStats,
} from '../types';

export class TargetsRepository {
  async create(dto: CreateTargetDTO): Promise<Target> {
    const result = await query<Target>(
      `INSERT INTO targets (name, type, value)
       VALUES ($1, $2, $3)
       RETURNING id, name, type, value,
         created_at AS "createdAt",
         last_scanned_at AS "lastScannedAt",
         'never_scanned' AS status`,
      [dto.name, dto.type, dto.value],
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<Target | null> {
    const result = await query<Target>(
      `SELECT t.id, t.name, t.type, t.value,
         t.created_at AS "createdAt",
         t.last_scanned_at AS "lastScannedAt",
         CASE
           WHEN t.last_scanned_at IS NULL THEN 'never_scanned'
           WHEN EXISTS (SELECT 1 FROM scan_results sr WHERE sr.target_id = t.id AND sr.critical_count > 0 ORDER BY sr.created_at DESC LIMIT 1) THEN 'vulnerable'
           ELSE 'clean'
         END AS status
       FROM targets t WHERE t.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findAll(): Promise<Target[]> {
    const result = await query<Target>(
      `SELECT t.id, t.name, t.type, t.value,
         t.created_at AS "createdAt",
         t.last_scanned_at AS "lastScannedAt",
         CASE
           WHEN t.last_scanned_at IS NULL THEN 'never_scanned'
           WHEN COALESCE(latest.critical_count, 0) + COALESCE(latest.high_count, 0) > 0 THEN 'vulnerable'
           WHEN t.last_scanned_at IS NOT NULL THEN 'clean'
           ELSE 'never_scanned'
         END AS status
       FROM targets t
       LEFT JOIN LATERAL (
         SELECT critical_count, high_count FROM scan_results
         WHERE target_id = t.id ORDER BY created_at DESC LIMIT 1
       ) latest ON true
       ORDER BY t.created_at DESC`,
    );
    return result.rows;
  }

  async getScanHistory(targetId: string, limit = 20): Promise<ScanResult[]> {
    const result = await query<ScanResult>(
      `SELECT id, target_id AS "targetId", status,
         critical_count AS "criticalCount", high_count AS "highCount",
         medium_count AS "mediumCount", low_count AS "lowCount",
         created_at AS "createdAt"
       FROM scan_results
       WHERE target_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [targetId, limit],
    );
    return result.rows;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM targets WHERE id = $1',
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const statsResult = await query<{
      total_targets: string;
      total_scans: string;
      critical: string;
      high: string;
      medium: string;
      low: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM targets)::text AS total_targets,
         (SELECT COUNT(*) FROM scan_results WHERE status = 'completed')::text AS total_scans,
         COALESCE(SUM(critical_count), 0)::text AS critical,
         COALESCE(SUM(high_count), 0)::text AS high,
         COALESCE(SUM(medium_count), 0)::text AS medium,
         COALESCE(SUM(low_count), 0)::text AS low
       FROM scan_results WHERE status = 'completed'`,
    );

    const alertsResult = await query<{
      target_name: string;
      cve_id: string;
      package_name: string;
      fixed_version: string | null;
    }>(
      `SELECT t.name AS target_name, a.cve_id, a.package_name, a.fixed_version
       FROM alerts a
       JOIN targets t ON t.id = a.target_id
       WHERE a.severity IN ('critical', 'high')
       ORDER BY a.created_at DESC
       LIMIT 10`,
    );

    const raw = statsResult.rows[0];
    return {
      totalTargets: parseInt(raw?.total_targets ?? '0', 10),
      totalScans: parseInt(raw?.total_scans ?? '0', 10),
      criticalCves: parseInt(raw?.critical ?? '0', 10),
      highCves: parseInt(raw?.high ?? '0', 10),
      severityDistribution: {
        CRITICAL: parseInt(raw?.critical ?? '0', 10),
        HIGH: parseInt(raw?.high ?? '0', 10),
        MEDIUM: parseInt(raw?.medium ?? '0', 10),
        LOW: parseInt(raw?.low ?? '0', 10),
        UNKNOWN: 0,
      },
      recentCriticalFindings: alertsResult.rows.map((r) => ({
        targetName: r.target_name,
        cveId: r.cve_id,
        packageName: r.package_name,
        fixedVersion: r.fixed_version,
      })),
    };
  }
}

export const targetsRepository = new TargetsRepository();
