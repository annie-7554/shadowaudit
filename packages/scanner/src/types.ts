export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface TrivyVulnerability {
  VulnerabilityID: string;
  PkgName: string;
  InstalledVersion: string;
  FixedVersion?: string;
  Severity: SeverityLevel;
  Title?: string;
  Description?: string;
  CVSS?: Record<string, { V3Score?: number; V2Score?: number }>;
}

export interface TrivyResult {
  Target: string;
  Class: string;
  Type?: string;
  Vulnerabilities?: TrivyVulnerability[];
  MisconfSummary?: {
    Successes: number;
    Failures: number;
    Exceptions: number;
  };
}

export interface TrivyRawOutput {
  SchemaVersion?: number;
  ArtifactName?: string;
  ArtifactType?: string;
  Results?: TrivyResult[];
}

export interface ParsedVulnerability {
  cveId: string;
  packageName: string;
  installedVersion: string;
  fixedVersion: string;
  severity: SeverityLevel;
  title: string;
  description: string;
  cvssScore: number | null;
}

export interface ScanJobData {
  targetId: string;
  type: 'npm' | 'image' | 'filesystem';
  value: string;
}

export interface ScanResult {
  id: string;
  targetId: string;
  scanId: string;
  vulnerabilities: ParsedVulnerability[];
  scannedAt: Date;
  createdAt: Date;
}

export interface ScanCompletedEvent {
  targetId: string;
  scanId: string;
  vulnerabilities: ParsedVulnerability[];
}
