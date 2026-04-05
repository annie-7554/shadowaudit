import request from 'supertest';
import app from '../src/app';

jest.mock('../src/db/targets', () => ({
  targetsRepository: {
    getDashboardStats: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    getScanHistory: jest.fn(),
    deleteById: jest.fn(),
  },
}));

jest.mock('../src/queue/producer', () => ({
  addScanJob: jest.fn().mockResolvedValue(undefined),
}));

import { targetsRepository } from '../src/db/targets';

const mockRepo = targetsRepository as jest.Mocked<typeof targetsRepository>;

const sampleStats = {
  total_targets: 5,
  total_scans: 42,
  cve_critical: 3,
  cve_high: 10,
  cve_medium: 25,
  cve_low: 40,
  cve_info: 8,
  recent_alerts: [
    {
      target_id: 'uuid-1',
      target_name: 'my-app',
      scan_id: 'scan-uuid-1',
      severity: 'critical' as const,
      count: 3,
      scanned_at: new Date('2024-06-01'),
    },
  ],
  last_scan_at: new Date('2024-06-01'),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/dashboard', () => {
  it('returns dashboard stats', async () => {
    mockRepo.getDashboardStats.mockResolvedValue(sampleStats);

    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      total_targets: 5,
      total_scans: 42,
      cve_critical: 3,
      cve_high: 10,
    });
    expect(Array.isArray(res.body.data.recent_alerts)).toBe(true);
  });

  it('returns empty stats when no data', async () => {
    mockRepo.getDashboardStats.mockResolvedValue({
      total_targets: 0,
      total_scans: 0,
      cve_critical: 0,
      cve_high: 0,
      cve_medium: 0,
      cve_low: 0,
      cve_info: 0,
      recent_alerts: [],
      last_scan_at: null,
    });

    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.data.total_targets).toBe(0);
    expect(res.body.data.recent_alerts).toHaveLength(0);
    expect(res.body.data.last_scan_at).toBeNull();
  });

  it('returns 500 when repository throws', async () => {
    mockRepo.getDashboardStats.mockRejectedValue(new Error('DB down'));

    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
