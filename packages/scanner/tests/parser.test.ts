import { TrivyParser } from '../src/trivy/parser';
import type { TrivyRawOutput, ParsedVulnerability } from '../src/types';

const mockRawOutput: TrivyRawOutput = {
  SchemaVersion: 2,
  ArtifactName: 'test-app',
  ArtifactType: 'filesystem',
  Results: [
    {
      Target: 'package-lock.json',
      Class: 'lang-pkgs',
      Type: 'npm',
      Vulnerabilities: [
        {
          VulnerabilityID: 'CVE-2024-0001',
          PkgName: 'lodash',
          InstalledVersion: '4.17.20',
          FixedVersion: '4.17.21',
          Severity: 'HIGH',
          Title: 'Prototype Pollution in lodash',
          Description: 'Lodash versions prior to 4.17.21 have a prototype pollution flaw.',
          CVSS: { nvd: { V3Score: 7.4 } },
        },
        {
          VulnerabilityID: 'CVE-2024-0002',
          PkgName: 'axios',
          InstalledVersion: '0.21.0',
          FixedVersion: '0.21.2',
          Severity: 'CRITICAL',
          Title: 'SSRF in axios',
          Description: 'Server-side request forgery in axios.',
          CVSS: { nvd: { V3Score: 9.1 } },
        },
      ],
    },
  ],
};

describe('TrivyParser', () => {
  let parser: TrivyParser;

  beforeEach(() => {
    parser = new TrivyParser();
  });

  describe('parse()', () => {
    it('parses mock Trivy JSON output with 2 vulnerabilities', () => {
      const result = parser.parse(mockRawOutput);

      expect(result).toHaveLength(2);

      const critical = result.find((v) => v.cveId === 'CVE-2024-0002');
      expect(critical).toBeDefined();
      expect(critical?.packageName).toBe('axios');
      expect(critical?.severity).toBe('CRITICAL');
      expect(critical?.cvssScore).toBe(9.1);
      expect(critical?.fixedVersion).toBe('0.21.2');

      const high = result.find((v) => v.cveId === 'CVE-2024-0001');
      expect(high).toBeDefined();
      expect(high?.packageName).toBe('lodash');
      expect(high?.severity).toBe('HIGH');
      expect(high?.cvssScore).toBe(7.4);
    });

    it('sorts vulnerabilities CRITICAL first', () => {
      const result = parser.parse(mockRawOutput);
      expect(result[0].severity).toBe('CRITICAL');
      expect(result[1].severity).toBe('HIGH');
    });

    it('deduplicates vulnerabilities by cveId + packageName', () => {
      const duplicateOutput: TrivyRawOutput = {
        Results: [
          {
            Target: 'package-lock.json',
            Class: 'lang-pkgs',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2024-0001',
                PkgName: 'lodash',
                InstalledVersion: '4.17.20',
                Severity: 'HIGH',
              },
            ],
          },
          {
            Target: 'yarn.lock',
            Class: 'lang-pkgs',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2024-0001',
                PkgName: 'lodash',
                InstalledVersion: '4.17.20',
                Severity: 'HIGH',
              },
            ],
          },
        ],
      };

      const result = parser.parse(duplicateOutput);
      expect(result).toHaveLength(1);
    });

    it('does not deduplicate same CVE in different packages', () => {
      const output: TrivyRawOutput = {
        Results: [
          {
            Target: 'package-lock.json',
            Class: 'lang-pkgs',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2024-0001',
                PkgName: 'lodash',
                InstalledVersion: '4.17.20',
                Severity: 'HIGH',
              },
              {
                VulnerabilityID: 'CVE-2024-0001',
                PkgName: 'lodash-fp',
                InstalledVersion: '0.10.4',
                Severity: 'HIGH',
              },
            ],
          },
        ],
      };

      const result = parser.parse(output);
      expect(result).toHaveLength(2);
    });

    it('returns empty array for empty results', () => {
      expect(parser.parse({})).toEqual([]);
      expect(parser.parse({ Results: [] })).toEqual([]);
      expect(parser.parse({ Results: [{ Target: 'x', Class: 'lang-pkgs' }] })).toEqual([]);
    });

    it('uses VulnerabilityID as title when Title is absent', () => {
      const output: TrivyRawOutput = {
        Results: [
          {
            Target: 'package-lock.json',
            Class: 'lang-pkgs',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2024-9999',
                PkgName: 'some-pkg',
                InstalledVersion: '1.0.0',
                Severity: 'MEDIUM',
              },
            ],
          },
        ],
      };
      const result = parser.parse(output);
      expect(result[0].title).toBe('CVE-2024-9999');
      expect(result[0].fixedVersion).toBe('');
      expect(result[0].cvssScore).toBeNull();
    });

    it('extracts V2Score when V3Score is absent', () => {
      const output: TrivyRawOutput = {
        Results: [
          {
            Target: 'package-lock.json',
            Class: 'lang-pkgs',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2024-0010',
                PkgName: 'old-pkg',
                InstalledVersion: '1.0.0',
                Severity: 'LOW',
                CVSS: { nvd: { V2Score: 4.3 } },
              },
            ],
          },
        ],
      };
      const result = parser.parse(output);
      expect(result[0].cvssScore).toBe(4.3);
    });
  });
});
