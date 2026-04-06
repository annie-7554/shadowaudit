import axios from 'axios';

const BASE_URL = process.env.SHADOWAUDIT_API ?? 'http://localhost:3000';

const http = axios.create({ baseURL: BASE_URL, timeout: 30_000 });

export interface Target {
  id: string;
  name: string;
  type: 'npm' | 'docker' | 'filesystem';
  value: string;
  status: 'clean' | 'vulnerable' | 'scanning' | 'never_scanned';
  createdAt: string;
  lastScannedAt: string | null;
}

export interface Vulnerability {
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
  scannedAt: string;
  status: string;
  summary: { critical: number; high: number; medium: number; low: number };
  vulnerabilities: Vulnerability[];
}

export async function listTargets(): Promise<Target[]> {
  const { data } = await http.get('/api/targets');
  return data.data ?? [];
}

export async function createTarget(name: string, type: string, value: string): Promise<Target> {
  const { data } = await http.post('/api/targets', { name, type, value });
  return data.data;
}

export async function deleteTarget(id: string): Promise<void> {
  await http.delete(`/api/targets/${id}`);
}

export async function getScanHistory(targetId: string): Promise<ScanResult[]> {
  const { data } = await http.get(`/api/targets/${targetId}/scans`);
  return data.data ?? [];
}
