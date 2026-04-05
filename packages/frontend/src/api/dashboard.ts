import client from './client';
import type { DashboardStats } from '../types';

const MOCK_STATS: DashboardStats = {
  totalTargets: 12,
  totalScans: 47,
  criticalCves: 3,
  highCves: 11,
  severityDistribution: { CRITICAL: 3, HIGH: 11, MEDIUM: 24, LOW: 9 },
  recentCriticalFindings: [
    { targetName: 'my-api:latest', cveId: 'CVE-2024-21538', packageName: 'cross-spawn', fixedVersion: '7.0.5' },
    { targetName: 'nginx:1.24', cveId: 'CVE-2024-7347', packageName: 'nginx', fixedVersion: '1.27.1' },
    { targetName: 'express@4.18.0', cveId: 'CVE-2024-43796', packageName: 'send', fixedVersion: '0.19.0' },
  ],
};

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const { data } = await client.get<DashboardStats>('/dashboard/stats');
    return data;
  } catch {
    // Backend not running — return mock data for UI preview
    return MOCK_STATS;
  }
}
