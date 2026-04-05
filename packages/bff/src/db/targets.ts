import { query } from './client';
import type {
  Target,
  CreateTargetDTO,
  ScanResult,
  DashboardStats,
  RecentAlert,
} from '../types';

interface RawDashboardRow {
  total_targets: string;
  total_scans: string;
  cve_critical: string;
  cve_high: string;
  cve_medium: string;
  cve_low: string;
  cve_info: string;
  last_scan_at: Date | null;
}

export class TargetsRepository {
  async create(dto: CreateTargetDTO): Promise<Target> {
    const result = await query<Target>(
      `INSERT INTO targets (name, type, value)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [dto.name, dto.type, dto.value],
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<Target | null> {
    const result = await query<Target>(
      'SELECT * FROM targets WHERE id = $1',
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findAll(): Promise<Target[]> {
    const result = await query<Target>(
      'SELECT * FROM targets ORDER BY created_at DESC',
    );
    return result.rows;
  }

  async getScanHistory(targetId: string, limit = 20): Promise<ScanResult[]> {
    const result = await query<ScanResult>(
      `SELECT sr.*, t.name AS target_name
       FROM scan_results sr
       JOIN targets t ON t.id = sr.target_id
       WHERE sr.target_id = $1
       ORDER BY sr.created_at DESC
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
    const statsResult = await query<RawDashboardRow>(
      `SELECT
         (SELECT COUNT(*) FROM targets)::text AS total_targets,
         (SELECT COUNT(*) FROM scan_results)::text AS total_scans,
         COALESCE(SUM(sr.cve_critical), 0)::text AS cve_critical,
         COALESCE(SUM(sr.cve_high), 0)::text AS cve_high,
         COALESCE(SUM(sr.cve_medium), 0)::text AS cve_medium,
         COALESCE(SUM(sr.cve_low), 0)::text AS cve_low,
         COALESCE(SUM(sr.cve_info), 0)::text AS cve_info,
         MAX(sr.completed_at) AS last_scan_at
       FROM scan_results sr
       WHERE sr.status = 'completed'`,
    );

    const alertsResult = await query<RecentAlert>(
      `SELECT
         t.id AS target_id,
         t.name AS target_name,
         sr.id AS scan_id,
         CASE
           WHEN sr.cve_critical > 0 THEN 'critical'
           WHEN sr.cve_high > 0     THEN 'high'
           WHEN sr.cve_medium > 0   THEN 'medium'
           WHEN sr.cve_low > 0      THEN 'low'
           ELSE 'info'
         END AS severity,
         GREATEST(sr.cve_critical, sr.cve_high, sr.cve_medium, sr.cve_low, sr.cve_info) AS count,
         sr.completed_at AS scanned_at
       FROM scan_results sr
       JOIN targets t ON t.id = sr.target_id
       WHERE sr.status = 'completed'
         AND (sr.cve_critical > 0 OR sr.cve_high > 0)
       ORDER BY sr.completed_at DESC
       LIMIT 10`,
    );

    const raw = statsResult.rows[0];
    return {
      total_targets: parseInt(raw?.total_targets ?? '0', 10),
      total_scans: parseInt(raw?.total_scans ?? '0', 10),
      cve_critical: parseInt(raw?.cve_critical ?? '0', 10),
      cve_high: parseInt(raw?.cve_high ?? '0', 10),
      cve_medium: parseInt(raw?.cve_medium ?? '0', 10),
      cve_low: parseInt(raw?.cve_low ?? '0', 10),
      cve_info: parseInt(raw?.cve_info ?? '0', 10),
      recent_alerts: alertsResult.rows,
      last_scan_at: raw?.last_scan_at ?? null,
    };
  }
}

export const targetsRepository = new TargetsRepository();
