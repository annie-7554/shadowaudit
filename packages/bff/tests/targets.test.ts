import request from 'supertest';
import app from '../src/app';

jest.mock('../src/db/targets', () => ({
  targetsRepository: {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    getScanHistory: jest.fn(),
    deleteById: jest.fn(),
    getDashboardStats: jest.fn(),
  },
}));

jest.mock('../src/queue/producer', () => ({
  addScanJob: jest.fn().mockResolvedValue(undefined),
}));

import { targetsRepository } from '../src/db/targets';

const mockRepo = targetsRepository as jest.Mocked<typeof targetsRepository>;

const sampleTarget = {
  id: 'uuid-1',
  name: 'my-app',
  type: 'npm' as const,
  value: 'my-app@1.0.0',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/targets', () => {
  it('returns 201 with valid body', async () => {
    mockRepo.create.mockResolvedValue(sampleTarget);

    const res = await request(app)
      .post('/api/targets')
      .send({ name: 'my-app', type: 'npm', value: 'my-app@1.0.0' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ name: 'my-app', type: 'npm' });
  });

  it('returns 400 with missing name', async () => {
    const res = await request(app)
      .post('/api/targets')
      .send({ type: 'npm', value: 'my-app@1.0.0' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 with invalid type', async () => {
    const res = await request(app)
      .post('/api/targets')
      .send({ name: 'my-app', type: 'unknown', value: 'my-app@1.0.0' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 with empty value', async () => {
    const res = await request(app)
      .post('/api/targets')
      .send({ name: 'my-app', type: 'npm', value: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/targets', () => {
  it('returns array of targets', async () => {
    mockRepo.findAll.mockResolvedValue([sampleTarget]);

    const res = await request(app).get('/api/targets');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns empty array when no targets', async () => {
    mockRepo.findAll.mockResolvedValue([]);

    const res = await request(app).get('/api/targets');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('GET /api/targets/:id', () => {
  it('returns target for valid id', async () => {
    mockRepo.findById.mockResolvedValue(sampleTarget);

    const res = await request(app).get('/api/targets/uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('uuid-1');
  });

  it('returns 404 for unknown id', async () => {
    mockRepo.findById.mockResolvedValue(null);

    const res = await request(app).get('/api/targets/not-a-real-id');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/targets/:id/scans', () => {
  it('returns scan history for known target', async () => {
    mockRepo.findById.mockResolvedValue(sampleTarget);
    mockRepo.getScanHistory.mockResolvedValue([]);

    const res = await request(app).get('/api/targets/uuid-1/scans');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 404 when target not found', async () => {
    mockRepo.findById.mockResolvedValue(null);

    const res = await request(app).get('/api/targets/missing/scans');

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/targets/:id', () => {
  it('returns success for known target', async () => {
    mockRepo.deleteById.mockResolvedValue(true);

    const res = await request(app).delete('/api/targets/uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 for unknown target', async () => {
    mockRepo.deleteById.mockResolvedValue(false);

    const res = await request(app).delete('/api/targets/no-such-id');

    expect(res.status).toBe(404);
  });
});
