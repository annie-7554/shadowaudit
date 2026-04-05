import { CVEDiff } from '../src/diff';
import type { ParsedVulnerability, ScanResult } from '../src/types';

jest.mock('../src/db/client', () => ({
  pool: {
    query: jest.fn(),
    on: jest.fn(),
  },
}));

import { pool } from '../src/db/client';

const mockPool = pool as jest.Mocked<typeof pool>;

function makeVuln(overrides: Partial<ParsedVulnerability> = {}): ParsedVulnerability {
  return {
    cveId: 'CVE-2024-0001',
    packageName: 'lodash',
    installedVersion: '4.17.20',
    fixedVersion: '4.17.21',
    severity: 'HIGH',
    title: 'Prototype Pollution',
    description: 'A prototype pollution issue.',
    cvssScore: 7.4,
    ...overrides,
  };
}

function makeScanResult(vulns: ParsedVulnerability[]): ScanResult {
  return {
    id: 'scan-uuid-1',
    targetId: 'target-1',
    scanId: 'scan-1',
    vulnerabilities: vulns,
    scannedAt: new Date(),
    createdAt: new Date(),
  };
}

describe('CVEDiff', () => {
  let diff: CVEDiff;

  beforeEach(() => {
    diff = new CVEDiff();
    jest.clearAllMocks();
  });

  it('returns empty array when all new vulns were in the previous scan', async () => {
    const existing = makeVuln({ cveId: 'CVE-2024-0001', severity: 'HIGH' });
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [makeScanResult([existing])] });

    const result = await diff.findNew('target-1', [existing]);

    expect(result).toHaveLength(0);
  });

  it('returns CVEs not present in the previous scan', async () => {
    const oldVuln = makeVuln({ cveId: 'CVE-2024-0001', severity: 'HIGH' });
    const newVuln = makeVuln({ cveId: 'CVE-2024-0002', severity: 'CRITICAL' });
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [makeScanResult([oldVuln])] });

    const result = await diff.findNew('target-1', [oldVuln, newVuln]);

    expect(result).toHaveLength(1);
    expect(result[0].cveId).toBe('CVE-2024-0002');
  });

  it('filters out MEDIUM and LOW severity vulns even when they are new', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [makeScanResult([])] });

    const mediumVuln = makeVuln({ cveId: 'CVE-2024-0003', severity: 'MEDIUM' });
    const lowVuln = makeVuln({ cveId: 'CVE-2024-0004', severity: 'LOW' });
    const highVuln = makeVuln({ cveId: 'CVE-2024-0005', severity: 'HIGH' });

    const result = await diff.findNew('target-1', [mediumVuln, lowVuln, highVuln]);

    expect(result).toHaveLength(1);
    expect(result[0].cveId).toBe('CVE-2024-0005');
  });

  it('treats all vulns as new when there is no previous scan', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

    const vuln1 = makeVuln({ cveId: 'CVE-2024-0001', severity: 'HIGH' });
    const vuln2 = makeVuln({ cveId: 'CVE-2024-0002', severity: 'CRITICAL' });
    const vuln3 = makeVuln({ cveId: 'CVE-2024-0003', severity: 'MEDIUM' });

    const result = await diff.findNew('target-1', [vuln1, vuln2, vuln3]);

    // MEDIUM is filtered; HIGH and CRITICAL are returned
    expect(result).toHaveLength(2);
    expect(result.map((v) => v.cveId)).toEqual(
      expect.arrayContaining(['CVE-2024-0001', 'CVE-2024-0002']),
    );
  });
});
