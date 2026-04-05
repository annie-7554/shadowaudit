// Types shared from the scanner domain, duplicated here to keep services decoupled.

export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

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
