import React from 'react';
import type { ScanStatus as ScanStatusValue } from '../types';

interface ScanStatusProps {
  status: ScanStatusValue;
}

const CONFIG: Record<ScanStatusValue, { icon: string; label: string; color: string }> = {
  clean: { icon: '✅', label: 'Clean', color: '#22c55e' },
  vulnerable: { icon: '🔴', label: 'Vulnerable', color: '#ef4444' },
  scanning: { icon: '🔵', label: 'Scanning', color: '#3b82f6' },
  never_scanned: { icon: '⚪', label: 'Never Scanned', color: '#94a3b8' },
};

export const ScanStatus: React.FC<ScanStatusProps> = ({ status }) => {
  const { icon, label, color } = CONFIG[status] ?? CONFIG.never_scanned;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 10px',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        whiteSpace: 'nowrap',
      }}
    >
      {icon} {label}
    </span>
  );
};
