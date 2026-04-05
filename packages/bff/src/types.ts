export type TargetType = 'npm' | 'image' | 'filesystem';

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Target {
  id: string;
  name: string;
  type: TargetType;
  value: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTargetDTO {
  name: string;
  type: TargetType;
  value: string;
}

export interface ScanResult {
  id: string;
  target_id: string;
  target_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: Date | null;
  completed_at: Date | null;
  cve_critical: number;
  cve_high: number;
  cve_medium: number;
  cve_low: number;
  cve_info: number;
  error_message: string | null;
  created_at: Date;
}

export interface DashboardStats {
  total_targets: number;
  total_scans: number;
  cve_critical: number;
  cve_high: number;
  cve_medium: number;
  cve_low: number;
  cve_info: number;
  recent_alerts: RecentAlert[];
  last_scan_at: Date | null;
}

export interface RecentAlert {
  target_id: string;
  target_name: string;
  scan_id: string;
  severity: SeverityLevel;
  count: number;
  scanned_at: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationQuery {
  limit: number;
  offset: number;
}
