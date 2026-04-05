# Agent: DevOps & Kubernetes — ShadowAudit

> **Use this agent for:** GitHub Actions workflow changes, Kubernetes manifest
> updates, Docker image modifications, CI/CD pipeline work, and infrastructure
> scaling tasks in the ShadowAudit platform.

---

## 1. When to Activate This Agent

Activate the devops-agent when the task involves:

- Updating a Kubernetes manifest (Deployment, Service, HPA, ConfigMap, Secret, Ingress)
- Modifying a GitHub Actions workflow file (`.github/workflows/*.yml`)
- Updating a `Dockerfile` for any service
- Updating image tags after a new build
- Adding or modifying environment variables in ConfigMaps or Secrets
- Scaling a service (HPA, replica count)
- Debugging a failed deployment or rollout
- Adding a new service to the Kubernetes stack
- Setting up or modifying ingress rules
- Managing PersistentVolumeClaims for PostgreSQL or Redis

**Do NOT use this agent for:**
- TypeScript/Node.js application code → use `software-agent`
- CVE fixes or `.trivyignore` updates → use `security-agent`
- Writing tests → use `software-agent`

---

## 2. Mandatory Pre-Task Reading

Before making any infrastructure change, read:

```
.github/skills/devops-kubernetes.md
```

This file contains the authoritative patterns for GitHub Actions workflows,
GHCR image naming, Docker multi-stage builds, Kubernetes manifests, resource
limits, HPA configuration, Ingress routing, ConfigMap/Secret patterns, and
deployment verification.

---

## 3. Namespace & Project Conventions

| Convention | Value |
|-----------|-------|
| Kubernetes namespace | `vulnwatch` |
| GHCR image prefix | `ghcr.io/OWNER/shadowaudit/SERVICE` |
| Image tag format | Full 40-char git SHA (`${{ github.sha }}`) |
| Services | `bff`, `scanner`, `notifier`, `frontend` |
| Health endpoint | `/health` (liveness) |
| Readiness endpoint | `/ready` (readiness) |

All `kubectl` commands **must** include `-n vulnwatch` unless operating on
cluster-scoped resources.

---

## 4. Updating Image Tags

### Via CI/CD (automated — preferred)

The CI pipeline calls `kubectl set image` after a successful build:

```bash
kubectl set image deployment/bff \
  bff=ghcr.io/OWNER/shadowaudit/bff:${GITHUB_SHA} \
  -n vulnwatch

kubectl rollout status deployment/bff -n vulnwatch --timeout=300s
```

### Manual hotfix image update

If you need to update a single service outside of the normal CI flow:

```bash
# 1. Find the new image digest or tag
NEW_TAG="ghcr.io/OWNER/shadowaudit/scanner:abc1234def5678"

# 2. Update the deployment
kubectl set image deployment/scanner scanner="${NEW_TAG}" -n vulnwatch

# 3. Watch the rollout
kubectl rollout status deployment/scanner -n vulnwatch --timeout=300s

# 4. Verify the running pods use the new image
kubectl get pods -l app=scanner -n vulnwatch \
  -o jsonpath='{.items[*].spec.containers[0].image}'
```

---

## 5. Verifying a Deployment

After any `kubectl apply` or `kubectl set image`, always verify:

```bash
# Wait for the rollout to complete (blocks; exits non-zero on failure)
kubectl rollout status deployment/<service> -n vulnwatch --timeout=300s

# Check pod health
kubectl get pods -l app=<service> -n vulnwatch

# Check recent events (look for ImagePullBackOff, OOMKilled, CrashLoopBackOff)
kubectl describe deployment/<service> -n vulnwatch

# Tail logs to confirm the service is healthy
kubectl logs -l app=<service> -n vulnwatch --tail=50

# Hit the health endpoint (requires port-forward if no public ingress)
kubectl port-forward deployment/<service> 8080:3000 -n vulnwatch &
curl -s http://localhost:8080/health
kill %1
```

### Rollback on failure

```bash
# Roll back to the previous revision
kubectl rollout undo deployment/<service> -n vulnwatch

# Verify the rollback completed
kubectl rollout status deployment/<service> -n vulnwatch
```

---

## 6. Modifying Kubernetes Manifests

### Workflow for any manifest change

1. **Edit** the manifest in `k8s/<service>/<manifest>.yaml`.
2. **Dry-run validate** before applying:
   ```bash
   kubectl apply --dry-run=client -f k8s/<service>/<manifest>.yaml
   ```
3. **Apply** to the cluster:
   ```bash
   kubectl apply -f k8s/<service>/<manifest>.yaml
   ```
4. **Verify** as described in section 5.
5. **Commit** the manifest change to git:
   ```bash
   git add k8s/<service>/<manifest>.yaml
   git commit -m "chore(k8s): <describe the change>"
   ```

### Validate all manifests at once

```bash
kubectl apply --dry-run=client -f k8s/
```

Run this in CI on every PR that touches `k8s/**`.

---

## 7. Adding a New Environment Variable

### Non-secret variable (ConfigMap)

1. Add the key/value pair to `k8s/<service>/configmap.yaml`:
   ```yaml
   data:
     EXISTING_VAR: "existing-value"
     NEW_VAR:      "new-value"       # ← add here
   ```
2. Apply and restart:
   ```bash
   kubectl apply -f k8s/<service>/configmap.yaml
   kubectl rollout restart deployment/<service> -n vulnwatch
   kubectl rollout status deployment/<service> -n vulnwatch
   ```
3. Add the variable to `packages/<service>/src/config.ts` Zod schema.

### Secret variable

1. Encode the value:
   ```bash
   echo -n "the-actual-secret-value" | base64
   # Outputs e.g.: dGhlLWFjdHVhbC1zZWNyZXQtdmFsdWU=
   ```
2. Add to `k8s/<service>/secrets.yaml`:
   ```yaml
   data:
     EXISTING_SECRET: "base64encodedvalue"
     NEW_SECRET:      "dGhlLWFjdHVhbC1zZWNyZXQtdmFsdWU="   # ← add here
   ```
3. Apply and restart:
   ```bash
   kubectl apply -f k8s/<service>/secrets.yaml
   kubectl rollout restart deployment/<service> -n vulnwatch
   ```
4. Add the variable to `packages/<service>/src/config.ts` Zod schema.

> ⚠️ **Never hardcode actual secret values in manifests committed to git.**
> In production, store the real values in a secrets manager (e.g. AWS Secrets
> Manager, HashiCorp Vault) and use External Secrets Operator to sync them.
> The base64 in `secrets.yaml` in this repo uses placeholder values only.

---

## 8. Scaling Services

### Scale via HPA (recommended — persists across restarts)

Edit `k8s/<service>/hpa.yaml` and change `minReplicas` or `maxReplicas`:

```yaml
spec:
  minReplicas: 2   # was 1 — increase floor for higher availability
  maxReplicas: 8   # was 5 — increase ceiling for peak load
```

Then apply:
```bash
kubectl apply -f k8s/scanner/hpa.yaml
kubectl get hpa scanner -n vulnwatch   # verify the change took effect
```

### Scale manually (temporary — overridden by HPA on next scaling event)

```bash
kubectl scale deployment scanner --replicas=3 -n vulnwatch
```

Use this only for emergency capacity during an incident. Always follow up
by updating the HPA manifest if the higher replica count should be permanent.

### Check current HPA status

```bash
kubectl get hpa -n vulnwatch
kubectl describe hpa scanner -n vulnwatch
```

---

## 9. Adding a New Service

When a fifth microservice is added to ShadowAudit:

1. Create the directory: `k8s/<new-service>/`
2. Add these files (copy from an existing service and customise):
   - `deployment.yaml` — Deployment spec
   - `service.yaml` — ClusterIP Service
   - `configmap.yaml` — Non-secret env vars
   - `secrets.yaml` — Secret env vars (placeholder base64 values)
   - `hpa.yaml` — HorizontalPodAutoscaler (if the service needs scaling)
3. Update `k8s/ingress.yaml` if the service needs to be reachable externally.
4. Add the service to the CI/CD build matrix in `.github/workflows/ci.yml`:
   ```yaml
   matrix:
     service: [bff, scanner, notifier, frontend, new-service]   # ← add here
   ```
5. Add the `kubectl set image` and `kubectl rollout status` commands to the deploy job.
6. Validate all manifests: `kubectl apply --dry-run=client -f k8s/`

---

## 10. GitHub Actions — Modifying Workflows

### Workflow file locations

```
.github/workflows/
├── ci.yml              # Main CI/CD pipeline (test → security → build → deploy)
├── nightly-scan.yml    # Scheduled Trivy image scans
├── copilot-setup-steps.yml   # Copilot agent environment setup
└── pr-checks.yml       # PR-only checks (lint, type-check, unit tests)
```

### Rules for workflow changes

- **Never remove** the `security` job or make it non-blocking.
- **Never** hard-code secrets in workflow YAML — always use `${{ secrets.NAME }}`.
- When adding a new job that runs after `build`, add it to the `needs:` array.
- Test workflow syntax before committing:
  ```bash
  # Install act (local GitHub Actions runner) for local testing
  # Or use the GitHub Actions linter:
  npx @github/actionlint
  ```
- After pushing a workflow change, verify it runs correctly in the GitHub Actions UI
  before considering the task done.

---

## 11. Docker Image — Best Practices

When modifying a `Dockerfile`:

- **Always use multi-stage builds.** Stage 1 builds; Stage 2 is the runtime image.
- **Always use a non-root user** in the runtime stage.
- **Pin base image versions** (`node:20-alpine`, not `node:alpine`).
- **Never include** `.env` files, `node_modules` from the build host, or test files in the image.
- Use `.dockerignore` to exclude unnecessary files:
  ```
  node_modules
  dist
  .git
  *.test.ts
  coverage
  ```
- After modifying a Dockerfile, scan the resulting image:
  ```bash
  docker build -t shadowaudit/bff:test packages/bff
  trivy image --ignore-unfixed --severity HIGH,CRITICAL shadowaudit/bff:test
  ```

---

## 12. Validation Checklist

Before marking any DevOps task as done:

- [ ] `kubectl apply --dry-run=client -f k8s/` — zero errors
- [ ] `kubectl rollout status deployment/<service> -n vulnwatch` — completed successfully
- [ ] `kubectl get pods -n vulnwatch` — all pods in Running state, no restarts
- [ ] Health endpoint responding: `curl http://localhost:<port>/health` → `{"status":"ok"}`
- [ ] If Dockerfile changed: re-ran Trivy image scan, no new HIGH/CRITICAL CVEs
- [ ] If workflow changed: GitHub Actions run completed successfully
- [ ] No secrets hardcoded in any manifest or workflow file
- [ ] Manifest changes committed to git so the cluster state is reproducible
- [ ] If new env var added: service's `src/config.ts` Zod schema updated too
