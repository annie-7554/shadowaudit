import type {
  TrivyRawOutput,
  TrivyVulnerability,
  ParsedVulnerability,
  SeverityLevel,
} from '../types';

const SEVERITY_ORDER: Record<SeverityLevel, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  UNKNOWN: 4,
};

export class TrivyParser {
  parse(rawOutput: TrivyRawOutput): ParsedVulnerability[] {
    const seen = new Set<string>();
    const parsed: ParsedVulnerability[] = [];

    for (const result of rawOutput.Results ?? []) {
      for (const vuln of result.Vulnerabilities ?? []) {
        const key = `${vuln.VulnerabilityID}::${vuln.PkgName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        parsed.push(this.mapVuln(vuln));
      }
    }

    return parsed.sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );
  }

  private mapVuln(vuln: TrivyVulnerability): ParsedVulnerability {
    const cvssScore = this.extractCvssScore(vuln);
    return {
      cveId: vuln.VulnerabilityID,
      packageName: vuln.PkgName,
      installedVersion: vuln.InstalledVersion,
      fixedVersion: vuln.FixedVersion ?? '',
      severity: vuln.Severity,
      title: vuln.Title ?? vuln.VulnerabilityID,
      description: vuln.Description ?? '',
      cvssScore,
      cweIds: vuln.CweIDs ?? [],
    };
  }

  private extractCvssScore(vuln: TrivyVulnerability): number | null {
    if (!vuln.CVSS) return null;
    for (const source of Object.values(vuln.CVSS)) {
      if (source.V3Score !== undefined) return source.V3Score;
    }
    for (const source of Object.values(vuln.CVSS)) {
      if (source.V2Score !== undefined) return source.V2Score;
    }
    return null;
  }
}
