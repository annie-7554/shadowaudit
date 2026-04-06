export type TargetType = 'npm' | 'docker' | 'filesystem';

export type ScanStatus = 'clean' | 'vulnerable' | 'scanning' | 'never_scanned';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface Vulnerability {
  id: string;
  cveId: string;
  packageName: string;
  installedVersion: string;
  fixedVersion: string | null;
  severity: Severity;
  cvssScore: number | null;
  description: string;
  cweIds: string[];
}

export interface Target {
  id: string;
  name: string;
  type: TargetType;
  value: string;
  status: ScanStatus;
  lastScannedAt: string | null;
  createdAt: string;
}

export interface ScanResult {
  id: string;
  targetId: string;
  scannedAt: string;
  status: ScanStatus;
  vulnerabilities: Vulnerability[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
  };
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
