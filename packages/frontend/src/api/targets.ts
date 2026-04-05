import client from './client';
import type { Target, ScanResult } from '../types';

export async function getTargets(): Promise<Target[]> {
  try {
    const { data } = await client.get<Target[]>('/targets');
    return data;
  } catch {
    return [];
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
