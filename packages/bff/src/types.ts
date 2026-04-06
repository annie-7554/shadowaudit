export type TargetType = 'npm' | 'docker' | 'filesystem';

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type ScanStatus = 'clean' | 'vulnerable' | 'scanning' | 'never_scanned';

export interface Target {
  id: string;
  name: string;
  type: TargetType;
  value: string;
  status: ScanStatus;
  createdAt: string;
  lastScannedAt: string | null;
}

export interface CreateTargetDTO {
  name: string;
  type: TargetType;
  value: string;
}

export interface Vulnerability {
  id: string;
  cveId: string;
  packageName: string;
  installedVersion: string;
  fixedVersion: string | null;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  cvssScore: number | null;
  description: string;
  cweIds: string[];
}

export interface ScanResult {
  id: string;
  targetId: string;
  status: 'running' | 'completed' | 'failed';
  scannedAt: string;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
  };
  vulnerabilities: Vulnerability[];
}

export interface DashboardStats {
  totalTargets: number;
  totalScans: number;
  criticalCves: number;
  highCves: number;
  severityDistribution: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
    UNKNOWN: number;
  };
  recentCriticalFindings: Array<{
    targetName: string;
    cveId: string;
    packageName: string;
    fixedVersion: string | null;
  }>;
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
