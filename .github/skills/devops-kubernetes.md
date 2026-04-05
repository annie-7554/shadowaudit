# Skill: DevOps & Kubernetes — ShadowAudit

> Read this file for any task involving GitHub Actions workflows, Docker images,
> Kubernetes manifests, deployments, scaling, secrets, or CI/CD configuration.

---

## 1. GitHub Actions Workflow Structure

### Standard CI/CD workflow

```yaml
# .github/workflows/ci.yml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ghcr.io/${{ github.repository_owner }}/shadowaudit

jobs:
  # ── 1. Lint + type-check + test ─────────────────────────────────────────
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci --workspaces --include-workspace-root
      - run: npm run lint
      - run: npm run typecheck        # tsc --noEmit across all packages
      - run: npm test

  # ── 2. Security scan ────────────────────────────────────────────────────
  security:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - name: Install Trivy
        run: curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
      - name: Trivy filesystem scan
        run: trivy fs --ignore-unfixed --severity HIGH,CRITICAL --exit-code 1 --format table .
      - name: Trivy secret scan
        run: trivy fs --scanners secret --exit-code 1 --format table .
      - name: npm audit
        run: npm audit --audit-level=high

  # ── 3. Build & push images ───────────────────────────────────────────────
  build:
    runs-on: ubuntu-latest
    needs: security
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: read
      packages: write
    strategy:
      matrix:
        service: [bff, scanner, notifier, frontend]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push ${{ matrix.service }}
        uses: docker/build-push-action@v5
        with:
          context: packages/${{ matrix.service }}
          push: true
          tags: ${{ env.IMAGE_PREFIX }}/${{ matrix.service }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ── 4. Deploy to Kubernetes ──────────────────────────────────────────────
  deploy:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Set up kubectl
        uses: azure/setup-kubectl@v4
      - name: Configure kubeconfig
        run: |
          mkdir -p ~/.kube
          echo "${{ secrets.KUBECONFIG }}" | base64 -d > ~/.kube/config
          chmod 600 ~/.kube/config
      - name: Update image tags
        run: |
          for svc in bff scanner notifier frontend; do
            kubectl set image deployment/${svc} \
              ${svc}=${{ env.IMAGE_PREFIX }}/${svc}:${{ github.sha }} \
              -n vulnwatch
          done
      - name: Wait for rollouts
        run: |
          for svc in bff scanner notifier frontend; do
            kubectl rollout status deployment/${svc} -n vulnwatch --timeout=300s
          done
```

### Trigger reference

| Trigger | Use case |
|---------|---------|
| `push: branches: [main]` | Build + deploy on merge to main |
| `pull_request: branches: [main]` | Test + security scan on every PR |
| `schedule: cron: '0 2 * * *'` | Nightly Trivy image scans |
| `workflow_dispatch` | Manual trigger (setup steps, hotfixes) |

### Environment secrets (configure in GitHub repo Settings → Secrets)

| Secret | Description |
|--------|-------------|
| `KUBECONFIG` | Base64-encoded kubeconfig for the production cluster |
| `GITHUB_TOKEN` | Auto-provided; used for GHCR push |
| `SLACK_WEBHOOK_URL` | Slack webhook for deployment notifications |
| `DATABASE_URL` | PostgreSQL connection string for migrations |

---

## 2. GHCR Image Naming Convention

```
ghcr.io/OWNER/shadowaudit/SERVICE:TAG
```

| Component | Value |
|-----------|-------|
| `OWNER` | GitHub organisation or user (lowercase) |
| `shadowaudit` | Project name prefix |
| `SERVICE` | `bff`, `scanner`, `notifier`, or `frontend` |
| `TAG` | Full 40-char git SHA (`${{ github.sha }}`) — **always use SHA, never `latest`** |

**Examples:**
```
ghcr.io/acme/shadowaudit/bff:a3f1c2d4e5b6...
ghcr.io/acme/shadowaudit/scanner:a3f1c2d4e5b6...
```

---

## 3. Docker Multi-Stage Build for Node.js

```dockerfile
# packages/bff/Dockerfile

# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /build

# Copy package files first to leverage layer caching
COPY package*.json ./
COPY packages/bff/package.json ./packages/bff/
# If bff depends on @shadowaudit/shared:
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspace=packages/bff --include-workspace-root

# Copy source and compile
COPY packages/bff/src ./packages/bff/src
COPY packages/bff/tsconfig.json ./packages/bff/
COPY tsconfig.base.json ./

RUN npm run build --workspace=packages/bff

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Only install production dependencies
COPY package*.json ./
COPY packages/bff/package.json ./packages/bff/
RUN npm ci --workspace=packages/bff --omit=dev --include-workspace-root

# Copy compiled output from build stage
COPY --from=builder /build/packages/bff/dist ./packages/bff/dist

# Drop to non-root user
RUN addgroup -S shadowaudit && adduser -S -G shadowaudit shadowaudit
USER shadowaudit

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "packages/bff/dist/index.js"]
```

---

## 4. Kubernetes Manifest Patterns

### Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: vulnwatch
  labels:
    app.kubernetes.io/managed-by: kubectl
    project: shadowaudit
```

### Deployment

```yaml
# k8s/bff/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bff
  namespace: vulnwatch
  labels:
    app: bff
    project: shadowaudit
spec:
  replicas: 2
  selector:
    matchLabels:
      app: bff
  template:
    metadata:
      labels:
        app: bff
        project: shadowaudit
    spec:
      containers:
        - name: bff
          # Tag is updated by CI/CD: kubectl set image
          image: ghcr.io/OWNER/shadowaudit/bff:PLACEHOLDER
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: bff-config
            - secretRef:
                name: bff-secrets
          resources:
            requests:
              cpu:    "250m"
              memory: "256Mi"
            limits:
              cpu:    "500m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds:       20
            failureThreshold:    3
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds:       10
            failureThreshold:    3
      securityContext:
        runAsNonRoot: true
        runAsUser:    1000
```

### Service

```yaml
# k8s/bff/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: bff
  namespace: vulnwatch
spec:
  selector:
    app: bff
  ports:
    - protocol: TCP
      port:       80
      targetPort: 3000
```

### HorizontalPodAutoscaler (scanner)

```yaml
# k8s/scanner/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: scanner
  namespace: vulnwatch
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind:       Deployment
    name:       scanner
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type:               Utilization
          averageUtilization: 70
```

### Ingress

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shadowaudit-ingress
  namespace: vulnwatch
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  ingressClassName: nginx
  rules:
    - host: shadowaudit.example.com
      http:
        paths:
          - path: /api(/|$)(.*)
            pathType: Prefix
            backend:
              service:
                name: bff
                port:
                  number: 80
          - path: /(/|$)(.*)
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
```

---

## 5. Resource Limits Reference

All services use these standard resource limits unless justified otherwise:

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 250m | 500m |
| Memory | 256Mi | 512Mi |

**Scanner** may need higher limits during heavy Trivy runs:

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 500m | 1000m |
| Memory | 512Mi | 1Gi |

---

## 6. StatefulSet — PostgreSQL

```yaml
# k8s/postgres/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: vulnwatch
spec:
  serviceName: "postgres"
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              valueFrom:
                configMapKeyRef:
                  name: postgres-config
                  key: POSTGRES_DB
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: postgres-secrets
                  key: POSTGRES_USER
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secrets
                  key: POSTGRES_PASSWORD
          resources:
            requests: { cpu: "250m", memory: "256Mi" }
            limits:   { cpu: "500m", memory: "512Mi" }
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: postgres-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
```

---

## 7. ConfigMap and Secret Patterns

### ConfigMap (non-secret env vars)

```yaml
# k8s/bff/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: bff-config
  namespace: vulnwatch
data:
  PORT:      "3000"
  NODE_ENV:  "production"
  LOG_LEVEL: "info"
  REDIS_URL: "redis://redis:6379"
```

### Secret (sensitive values — base64 encoded)

```yaml
# k8s/bff/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: bff-secrets
  namespace: vulnwatch
type: Opaque
data:
  # Encode: echo -n "your-value" | base64
  DATABASE_URL: cG9zdGdyZXNxbDovL3VzZXI6cGFzc0Bob3N0OjU0MzIvZGI=
  JWT_SECRET:   c3VwZXJzZWNyZXRqd3RrZXl0aGF0aXN2ZXJ5bG9uZw==
```

**To encode a new secret value:**
```bash
echo -n "my-secret-value" | base64
```

**To decode and verify:**
```bash
echo "Y29waWxvdA==" | base64 -d
```

> ⚠️ Never commit real credentials. In production, use [External Secrets Operator](https://external-secrets.io/)
> or [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) to inject
> secrets from a vault rather than storing base64 in git.

---

## 8. Updating Image Tags in CI/CD

The CI pipeline uses `kubectl set image` to update the running deployment
in-place without modifying the YAML file in git:

```bash
# In CI step after docker push:
kubectl set image deployment/bff \
  bff=ghcr.io/OWNER/shadowaudit/bff:${GITHUB_SHA} \
  -n vulnwatch

kubectl set image deployment/scanner \
  scanner=ghcr.io/OWNER/shadowaudit/scanner:${GITHUB_SHA} \
  -n vulnwatch
```

**Alternative: yq-based manifest update (if you prefer GitOps):**
```bash
yq e -i '.spec.template.spec.containers[0].image = "ghcr.io/OWNER/shadowaudit/bff:'"${GITHUB_SHA}"'"' \
  k8s/bff/deployment.yaml
git commit -am "chore: deploy bff ${GITHUB_SHA}"
git push
```

---

## 9. Verifying Deployments

```bash
# Watch rollout progress (blocks until complete or times out)
kubectl rollout status deployment/bff -n vulnwatch --timeout=300s
kubectl rollout status deployment/scanner -n vulnwatch --timeout=300s

# Check current image tag on running pods
kubectl get deployment bff -n vulnwatch \
  -o jsonpath='{.spec.template.spec.containers[0].image}'

# View recent events (useful for diagnosing ImagePullBackOff etc.)
kubectl describe deployment bff -n vulnwatch

# Tail logs from all bff pods
kubectl logs -l app=bff -n vulnwatch --tail=100 -f

# Rollback if a deployment is broken
kubectl rollout undo deployment/bff -n vulnwatch
```

---

## 10. Scaling

### Manual scale (temporary — does not persist across HPA adjustments)

```bash
kubectl scale deployment scanner --replicas=3 -n vulnwatch
```

### Update HPA min/max (permanent)

Edit `k8s/scanner/hpa.yaml`:
```yaml
spec:
  minReplicas: 2   # increased from 1
  maxReplicas: 8   # increased from 5
```

Then apply:
```bash
kubectl apply -f k8s/scanner/hpa.yaml
kubectl get hpa scanner -n vulnwatch
```

---

## 11. Adding a New Environment Variable

### Non-secret variable

1. Add to `k8s/<service>/configmap.yaml` under `data:`.
2. Apply: `kubectl apply -f k8s/<service>/configmap.yaml`
3. Restart the deployment to pick up the change:
   ```bash
   kubectl rollout restart deployment/<service> -n vulnwatch
   ```
4. Add the variable to the service's `src/config.ts` Zod schema.

### Secret variable

1. Encode the value: `echo -n "value" | base64`
2. Add to `k8s/<service>/secrets.yaml` under `data:`.
3. Apply: `kubectl apply -f k8s/<service>/secrets.yaml`
4. Restart: `kubectl rollout restart deployment/<service> -n vulnwatch`
5. Add to `src/config.ts` Zod schema.

---

## 12. Dry-Run Validation

Always validate manifests before applying:

```bash
# Validate a single file
kubectl apply --dry-run=client -f k8s/bff/deployment.yaml

# Validate an entire directory
kubectl apply --dry-run=client -f k8s/

# Validate with server-side dry run (catches more errors, requires cluster access)
kubectl apply --dry-run=server -f k8s/bff/deployment.yaml
```

**In CI, run dry-run validation on every PR that modifies `k8s/**`:**
```yaml
- name: Validate Kubernetes manifests
  run: kubectl apply --dry-run=client -f k8s/
```
