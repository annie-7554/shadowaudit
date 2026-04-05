# Agent: Security / CVE — ShadowAudit

> **Use this agent for:** triaging CVEs found in Trivy or npm audit scans,
> updating vulnerable dependencies, adding `.trivyignore` suppressions, and
> managing the overall security posture of the ShadowAudit codebase.

---

## 1. When to Activate This Agent

Activate the security-agent when the task involves:

- A Trivy scan returned HIGH or CRITICAL findings
- An npm audit reported vulnerable advisories
- A dependency needs to be updated to resolve a CVE
- A `.trivyignore` entry needs to be added, reviewed, or removed
- A false positive needs to be documented and suppressed
- A CRITICAL CVE with a known exploit needs to be escalated
- Generating or reviewing an SBOM (Software Bill of Materials)
- Reviewing expired `.trivyignore` suppressions (past their `Review-by` date)

**Do NOT use this agent for:**
- General dependency updates unrelated to CVEs → use `software-agent`
- Kubernetes security misconfigurations (Trivy config scan results) → use `devops-agent`
- Writing application-level auth or access control code → use `software-agent`

---

## 2. Mandatory Pre-Task Reading

Before triaging any CVE or modifying security configuration, read:

```
.github/skills/vulnerability-scanning.md
```

This file contains the authoritative trivy command reference, JSON output
structure, severity thresholds, `.trivyignore` format, and the CVE response
workflow.

---

## 3. Running Scans

Always run the correct scan mode for the context:

### Full filesystem scan (use first for any dependency CVE)
```bash
trivy fs \
  --ignore-unfixed \
  --severity HIGH,CRITICAL \
  --format json \
  --output trivy-fs-results.json \
  .
```

### Container image scan (use after building an image)
```bash
# Replace OWNER and SHA with actual values
trivy image \
  --ignore-unfixed \
  --severity HIGH,CRITICAL \
  --format json \
  --output trivy-image-results.json \
  ghcr.io/OWNER/shadowaudit/scanner:SHA
```

### Kubernetes config scan (use after any k8s manifest change)
```bash
trivy config \
  --format json \
  --output trivy-config-results.json \
  ./k8s
```

### Secret scan (use before every commit or PR)
```bash
trivy fs \
  --scanners secret \
  --format json \
  --output trivy-secret-results.json \
  .
```

### npm audit (use alongside Trivy for npm packages)
```bash
npm audit --json > npm-audit-results.json
npm audit --audit-level=high   # CI gate: exits 1 if HIGH+ found
```

---

## 4. Interpreting Scan Results

### Severity decision table

| Severity | CVSS | Action | Deadline |
|----------|------|--------|---------|
| **CRITICAL** | 9.0–10.0 | Fix immediately. Block all merges. Escalate if exploit is known. | Same day |
| **HIGH** | 7.0–8.9 | Fix before PR merges. Can suppress with written justification if truly unfixable. | 24 hours |
| **MEDIUM** | 4.0–6.9 | Create tracking issue with "security" label. Fix in next sprint. | 2 weeks |
| **LOW** | 0.1–3.9 | Fix opportunistically. Acceptable to suppress with justification. | Next quarter |
| **UNKNOWN** | N/A | Investigate manually. Treat as MEDIUM until classified. | 48 hours |

### Reading Trivy JSON to find critical fields

```bash
# Show all CVE IDs, packages, severities, and fix versions from a results file
jq '.Results[].Vulnerabilities[] | {id: .VulnerabilityID, pkg: .PkgName, installed: .InstalledVersion, fixed: .FixedVersion, severity: .Severity}' trivy-fs-results.json

# Count by severity
jq '[.Results[].Vulnerabilities[] | .Severity] | group_by(.) | map({severity: .[0], count: length})' trivy-fs-results.json
```

---

## 5. Fixing a CVE

### Step 1: Identify the fix version

From Trivy JSON output, find `FixedVersion` for the affected package.
If `FixedVersion` is empty — no patch exists yet. See suppression workflow below.

### Step 2: Update the dependency

```bash
# Update a specific package in a specific workspace
npm install <package>@<fix-version> --workspace=packages/<service>

# Example:
npm install axios@1.6.0 --workspace=packages/bff

# Commit both the package.json and package-lock.json
git add packages/bff/package.json package-lock.json
git commit -m "fix(security): upgrade axios to 1.6.0 (CVE-2023-45857)"
```

### Step 3: Re-scan to verify the CVE is gone

```bash
trivy fs \
  --ignore-unfixed \
  --severity HIGH,CRITICAL \
  --format json \
  --output trivy-fs-results.json \
  packages/bff

# The CVE should no longer appear in the output
jq '.Results[].Vulnerabilities[] | select(.VulnerabilityID == "CVE-2023-45857")' trivy-fs-results.json
# Expected: no output (empty)
```

### Step 4: Run tests to confirm nothing broke

```bash
npm test --workspace=packages/<service>
```

If tests fail after the dependency upgrade, you must fix the compatibility
issues. Do not revert to the vulnerable version — find a fix-forward approach.

---

## 6. Suppressing a False Positive

Only suppress a CVE after confirming it is a genuine false positive or is
truly unfixable. Every suppression requires a written justification.

### When suppression is acceptable

- The vulnerable code path is **not reachable** in production (e.g. dev-only tool)
- The CVE is in a **transitive dependency** that cannot be updated without breaking direct dependencies, and the vulnerable function is not called
- `FixedVersion` is empty — no patch exists upstream
- The Trivy detection is a **known false positive** for this package/version

### When suppression is NOT acceptable

- CRITICAL CVE (CVSS ≥ 9.0) with a **known exploit in the wild**
- The vulnerable function is **called in the production code path**
- The CVE affects a **security-critical library** (TLS, auth, crypto)

### Adding a `.trivyignore` entry

Edit the `.trivyignore` file at the repository root:

```
# <CVE-ID>: <Brief description of what the CVE is>
# Reason for suppression: <Why this does not affect us>
# Scope: <Which package/image is affected>
# Reviewed by: @<github-username> on <YYYY-MM-DD>
# Review-by: <YYYY-MM-DD>   ← max 6 months from today
<CVE-ID>
```

**Example:**
```
# CVE-2023-45857: Axios CSRF vulnerability via XSRF-TOKEN header
# Reason for suppression: This CVE affects axios in browser environments where
# an attacker can read cookies. Our scanner service uses axios only for server-
# to-server HTTP calls where no cookies are set. Not exploitable in this context.
# Fix is available in axios@1.6.0 but upgrading requires Node 18+ refactoring.
# Tracked in: https://github.com/OWNER/shadowaudit/issues/42
# Reviewed by: @alice on 2024-05-01
# Review-by: 2024-11-01
CVE-2023-45857
```

After adding the entry, re-run the scan to confirm the CVE is suppressed:

```bash
trivy fs --ignore-unfixed --severity HIGH,CRITICAL --format table .
```

---

## 7. Escalation — CRITICAL CVEs with Known Exploits

Trigger escalation when **all three conditions** are met:
1. Severity is **CRITICAL** (CVSS ≥ 9.0)
2. A **public exploit** exists (check NVD, Exploit-DB, or CISA KEV)
3. The vulnerable package is **present in production** images

### Escalation steps

1. **Immediately block all merges to `main`** — set a branch protection rule or
   notify the team to pause PRs.
2. **Create a P0 GitHub issue** with label `security:critical`:
   - CVE ID and description
   - Affected service(s) and package version
   - CVSS score and exploit reference
   - Timeline: when discovered, when escalated
3. **Notify the security team** via the Slack webhook:
   ```bash
   curl -X POST $SLACK_WEBHOOK_URL \
     -H 'Content-Type: application/json' \
     -d '{"text": "🚨 P0 SECURITY: CVE-XXXX-XXXX found in shadowaudit/scanner. CRITICAL CVSS 9.8. Exploit known. Fix required immediately."}'
   ```
4. **Fix the dependency** following the workflow in section 5.
5. **Re-scan all images** (not just filesystem) after the fix.
6. **Update the P0 issue** with remediation timeline and close it when resolved.

---

## 8. SBOM Generation

Generate SBOMs for compliance and supply-chain transparency:

```bash
# Full repo SBOM
trivy fs --format cyclonedx --output sbom-repo.json .

# Per-service image SBOMs (run after building images)
trivy image --format cyclonedx --output sbom-bff.json ghcr.io/OWNER/shadowaudit/bff:SHA
trivy image --format cyclonedx --output sbom-scanner.json ghcr.io/OWNER/shadowaudit/scanner:SHA
```

Upload SBOMs as GitHub Actions artifacts:

```yaml
- name: Upload SBOM
  uses: actions/upload-artifact@v4
  with:
    name: sbom-${{ github.sha }}
    path: sbom-*.json
```

---

## 9. Reviewing Expired Suppressions

`.trivyignore` entries with a `Review-by` date in the past must be reviewed:

```bash
# Find all Review-by dates in .trivyignore
grep "Review-by:" .trivyignore

# For each expired entry:
# 1. Re-run the scan to see if the CVE still appears
# 2. Check if a fix version is now available
# 3. Either fix the dep, update the suppression with a new Review-by date, or remove the entry
```

---

## 10. Validation Checklist

Before marking any security task as done:

- [ ] Re-ran the relevant Trivy scan and confirmed the CVE is resolved or suppressed
- [ ] If suppressed: `.trivyignore` entry has a full justification comment and `Review-by` date
- [ ] If fixed: `package-lock.json` is committed with the updated version
- [ ] Tests pass after any dependency update: `npm test`
- [ ] No CRITICAL CVEs with known exploits are suppressed (they must be fixed)
- [ ] GitHub issue created for any MEDIUM/LOW CVEs that are deferred
- [ ] SBOM regenerated if dependencies changed
