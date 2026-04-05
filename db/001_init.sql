CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('npm', 'image', 'filesystem')),
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_scanned_at TIMESTAMPTZ
);

CREATE TABLE scan_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  scan_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  vulnerability_count INTEGER DEFAULT 0,
  critical_count INTEGER DEFAULT 0,
  high_count INTEGER DEFAULT 0,
  medium_count INTEGER DEFAULT 0,
  low_count INTEGER DEFAULT 0,
  vulnerabilities JSONB DEFAULT '[]',
  raw_output JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  scan_result_id UUID REFERENCES scan_results(id),
  cve_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  package_name TEXT NOT NULL,
  fixed_version TEXT,
  webhook_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scan_results_target_id ON scan_results(target_id);
CREATE INDEX idx_scan_results_created_at ON scan_results(created_at DESC);
CREATE INDEX idx_alerts_target_id ON alerts(target_id);
CREATE INDEX idx_alerts_cve_id ON alerts(cve_id);
