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

export async function uploadPackageFile(name: string, files: File | File[]): Promise<Target> {
  const form = new FormData();
  form.append('name', name);
  const fileList = Array.isArray(files) ? files : [files];
  for (const file of fileList) {
    form.append('packageFile', file);
  }
  // Use relative URL so it works both in dev (Vite proxy) and Docker (nginx proxy)
  const uploadUrl = window.location.hostname === 'localhost' && window.location.port === '5173'
    ? 'http://localhost:3000/api/targets/upload'   // Vite dev: proxy doesn't handle multipart
    : '/api/targets/upload';                        // Docker/prod: nginx proxies /api → bff
  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export async function getScanHistory(id: string): Promise<ScanResult[]> {
  try {
    const { data } = await client.get<ScanResult[]>(`/targets/${id}/scans`);
    return data;
  } catch {
    return [];
  }
}
