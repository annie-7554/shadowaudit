import client from './client';
import type { Target, ScanResult } from '../types';

const MOCK_TARGETS: Target[] = [
  { id: '1', name: 'my-api', type: 'docker', value: 'my-api:latest', createdAt: new Date().toISOString(), lastScannedAt: new Date().toISOString(), status: 'vulnerable' },
  { id: '2', name: 'frontend', type: 'docker', value: 'nginx:1.24', createdAt: new Date().toISOString(), lastScannedAt: new Date().toISOString(), status: 'vulnerable' },
  { id: '3', name: 'express app', type: 'npm', value: 'express@4.18.0', createdAt: new Date().toISOString(), lastScannedAt: new Date().toISOString(), status: 'clean' },
  { id: '4', name: 'worker', type: 'filesystem', value: './packages/scanner', createdAt: new Date().toISOString(), lastScannedAt: null, status: 'never_scanned' },
];

export async function getTargets(): Promise<Target[]> {
  try {
    const { data } = await client.get<Target[]>('/targets');
    return data;
  } catch {
    return MOCK_TARGETS;
  }
}

export async function getTarget(id: string): Promise<Target> {
  const { data } = await client.get<Target>(`/targets/${id}`);
  return data;
}

export async function createTarget(payload: {
  name: string;
  type: string;
  value: string;
}): Promise<Target> {
  const { data } = await client.post<Target>('/targets', payload);
  return data;
}

export async function deleteTarget(id: string): Promise<void> {
  await client.delete(`/targets/${id}`);
}

export async function getScanHistory(id: string): Promise<ScanResult[]> {
  try {
    const { data } = await client.get<ScanResult[]>(`/targets/${id}/scans`);
    return data;
  } catch {
    return [];
  }
}
