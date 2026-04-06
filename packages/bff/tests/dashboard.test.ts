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
  totalTargets: 5,
  totalScans: 42,
  criticalCves: 3,
  highCves: 10,
  severityDistribution: {
    CRITICAL: 3,
    HIGH: 10,
    MEDIUM: 25,
    LOW: 40,
    UNKNOWN: 0,
  },
  recentCriticalFindings: [
    {
      targetName: 'my-app',
      cveId: 'CVE-2024-1234',
      packageName: 'lodash',
      fixedVersion: '4.17.21',
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/dashboard', () => {
  it('returns dashboard stats', async () => {
    mockRepo.getDashboardStats.mockResolvedValue(sampleStats);

    const res = await request(app).get('/api/dashboard/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      totalTargets: 5,
      totalScans: 42,
      criticalCves: 3,
      highCves: 10,
    });
    expect(Array.isArray(res.body.data.recentCriticalFindings)).toBe(true);
  });

  it('returns empty stats when no data', async () => {
    mockRepo.getDashboardStats.mockResolvedValue({
      totalTargets: 0,
      totalScans: 0,
      criticalCves: 0,
      highCves: 0,
      severityDistribution: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      recentCriticalFindings: [],
    });

    const res = await request(app).get('/api/dashboard/stats');

    expect(res.status).toBe(200);
    expect(res.body.data.totalTargets).toBe(0);
    expect(res.body.data.recentCriticalFindings).toHaveLength(0);
  });

  it('returns 500 when repository throws', async () => {
    mockRepo.getDashboardStats.mockRejectedValue(new Error('DB down'));

    const res = await request(app).get('/api/dashboard/stats');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
