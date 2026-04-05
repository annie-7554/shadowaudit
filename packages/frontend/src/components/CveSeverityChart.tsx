import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface CveSeverityChartProps {
  data: {
    CRITICAL?: number;
    HIGH?: number;
    MEDIUM?: number;
    LOW?: number;
    UNKNOWN?: number;
  };
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#ff3333',
  HIGH: '#ff8c00',
  MEDIUM: '#ffcc00',
  LOW: '#39ff14',
  UNKNOWN: '#444444',
};

export const CveSeverityChart: React.FC<CveSeverityChartProps> = ({ data }) => {
  const chartData = Object.entries(data).map(([severity, count]) => ({
    severity,
    count: count ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }} barSize={48}>
        <CartesianGrid strokeDasharray="1 4" stroke="#222" vertical={false} />
        <XAxis dataKey="severity" tick={{ fill: '#555', fontSize: 10, letterSpacing: 2, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: '#444', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#111', border: '1px solid #2a2a2a', color: '#e8e8e8', fontFamily: 'monospace', fontSize: '12px', borderRadius: 0 }}
          cursor={{ fill: '#ffffff06' }}
        />
        <Bar dataKey="count" radius={[0, 0, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity] ?? '#333'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};
