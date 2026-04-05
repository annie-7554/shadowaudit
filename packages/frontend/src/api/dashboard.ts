import client from './client';
import type { DashboardStats } from '../types';

const EMPTY_STATS: DashboardStats = {
  totalTargets: 0,
  totalScans: 0,
  criticalCves: 0,
  highCves: 0,
  severityDistribution: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
  recentCriticalFindings: [],
};

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const { data } = await client.get<DashboardStats>('/dashboard/stats');
    return data;
  } catch {
    return EMPTY_STATS;
  }
}
