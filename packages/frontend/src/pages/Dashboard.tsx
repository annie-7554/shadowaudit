import React, { useState, useEffect, useCallback } from 'react';
import { getDashboardStats } from '../api/dashboard';
import { CveSeverityChart } from '../components/CveSeverityChart';
import { usePolling } from '../hooks/usePolling';
import type { DashboardStats } from '../types';

const SKELETON_STYLE: React.CSSProperties = {
  background: '#334155',
  borderRadius: '6px',
  animation: 'pulse 1.5s ease-in-out infinite',
};

const StatCard: React.FC<{ label: string; value: number | string; accent?: string }> = ({
  label,
  value,
  accent = '#d4ff00',
}) => (
  <div className="sa-card" style={{ flex: '1 1 160px', minWidth: '140px', borderTop: `2px solid ${accent}` }}>
    <p style={{ fontSize: '0.65rem', color: '#666', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
      {label}
    </p>
    <p style={{ fontSize: '2.2rem', fontWeight: 700, color: accent, fontFamily: 'inherit', letterSpacing: '-0.02em' }}>{value}</p>
  </div>
);

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getDashboardStats();
      setStats(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  usePolling(fetchStats, 30000);

  if (loading) {
    return (
      <div>
        <h1 className="sa-page-title">Dashboard</h1>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="sa-card" style={{ flex: '1 1 160px', height: '90px', ...SKELETON_STYLE }} />
          ))}
        </div>
        <div className="sa-card" style={{ height: '280px', ...SKELETON_STYLE }} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="sa-page-title">Dashboard</h1>
        <div className="sa-card" style={{ color: '#ef4444', textAlign: 'center' }}>
          ⚠️ Failed to load dashboard: {error}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div>
      <h1 className="sa-page-title">Dashboard</h1>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <StatCard label="Total Targets" value={stats.totalTargets} accent="#d4ff00" />
        <StatCard label="Total Scans" value={stats.totalScans} accent="#e8e8e8" />
        <StatCard label="Critical CVEs" value={stats.criticalCves} accent="#ff3333" />
        <StatCard label="High CVEs" value={stats.highCves} accent="#ff8c00" />
      </div>

      {/* CVE Severity Chart */}
      <div className="sa-card" style={{ marginBottom: '24px' }}>
        <h2 className="sa-section-title">CVE Severity Distribution</h2>
        <CveSeverityChart data={stats.severityDistribution} />
      </div>

      {/* Recent Critical Findings */}
      <div className="sa-card">
        <h2 className="sa-section-title">Recent Critical Findings</h2>
        {stats.recentCriticalFindings.length === 0 ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>
            ✅ No critical findings — looking good!
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Target</th>
                  <th>CVE ID</th>
                  <th>Package</th>
                  <th>Fix Version</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentCriticalFindings.map((finding, i) => (
                  <tr key={i}>
                    <td>{finding.targetName}</td>
                    <td>
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${finding.cveId}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#d4ff00' }}
                      >
                        {finding.cveId}
                      </a>
                    </td>
                    <td>{finding.packageName}</td>
                    <td style={{ color: finding.fixedVersion ? '#22c55e' : '#94a3b8', fontFamily: 'monospace' }}>
                      {finding.fixedVersion ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
