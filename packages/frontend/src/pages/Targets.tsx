import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getTargets, createTarget, deleteTarget, getScanHistory, uploadPackageFile } from '../api/targets';
import { ScanStatus } from '../components/ScanStatus';
import { VulnerabilityTable } from '../components/VulnerabilityTable';
import type { Target, ScanResult, TargetType } from '../types';

const TARGET_TYPES: { value: TargetType; label: string }[] = [
  { value: 'npm', label: 'npm Package' },
  { value: 'docker', label: 'Docker Image' },
  { value: 'filesystem', label: 'Filesystem' },
];

interface ScanHistoryModalProps {
  target: Target;
  onClose: () => void;
}

const ScanHistoryModal: React.FC<ScanHistoryModalProps> = ({ target, onClose }) => {
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScan, setSelectedScan] = useState<ScanResult | null>(null);

  useEffect(() => {
    getScanHistory(target.id)
      .then((data) => { setHistory(data); if (data[0]) setSelectedScan(data[0]); })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [target.id]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: '#00000099', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="sa-card"
        style={{ width: '100%', maxWidth: '860px', maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 className="sa-section-title" style={{ margin: 0 }}>Scan History — {target.name}</h2>
          <button className="sa-btn-ghost" onClick={onClose}>✕ Close</button>
        </div>

        {loading && <p style={{ color: '#94a3b8' }}>Loading scan history…</p>}
        {error && <p style={{ color: '#ef4444' }}>⚠️ {error}</p>}
        {!loading && !error && history.length === 0 && (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>No scans recorded yet.</p>
        )}

        {history.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {history.map((scan) => (
                <button
                  key={scan.id}
                  onClick={() => setSelectedScan(scan)}
                  style={{
                    padding: '4px 10px', borderRadius: '0', fontSize: '0.68rem', cursor: 'pointer',
                    background: selectedScan?.id === scan.id ? '#d4ff00' : '#1a1a1a',
                    color: selectedScan?.id === scan.id ? '#000' : '#666',
                    border: '1px solid #2a2a2a', fontFamily: 'monospace', letterSpacing: '0.05em',
                  }}
                >
                  {new Date(scan.scannedAt).toLocaleString()}
                </button>
              ))}
            </div>
            {selectedScan && (
              <>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {(['critical', 'high', 'medium', 'low'] as const).map((s) => (
                    <span
                      key={s}
                      style={{
                        padding: '2px 10px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700,
                        background: { critical: '#ff333315', high: '#ff8c0015', medium: '#ffcc0015', low: '#39ff1415' }[s],
                        color: { critical: '#ff3333', high: '#ff8c00', medium: '#ffcc00', low: '#39ff14' }[s],
                        border: `1px solid ${{ critical: '#ff333333', high: '#ff8c0033', medium: '#ffcc0033', low: '#39ff1433' }[s]}`,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                      }}
                    >
                      {s.toUpperCase()}: {selectedScan.summary[s]}
                    </span>
                  ))}
                </div>

                {/* CLI fix hint */}
                {selectedScan.vulnerabilities.some((v) => v.fixedVersion) && (
                  <div style={{
                    background: '#0e1a0e', border: '1px solid #30d15830', borderRadius: '8px',
                    padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '10px',
                  }}>
                    <span style={{ fontSize: '1rem' }}>💡</span>
                    <div>
                      <p style={{ color: '#30d158', fontWeight: 600, fontSize: '0.82rem', margin: '0 0 4px' }}>
                        {selectedScan.vulnerabilities.filter((v) => v.fixedVersion).length} vulnerabilit{selectedScan.vulnerabilities.filter((v) => v.fixedVersion).length > 1 ? 'ies have' : 'y has'} a fix available
                      </p>
                      <p style={{ color: '#666', fontSize: '0.75rem', margin: 0 }}>
                        Auto-fix with the ShadowAudit CLI:{' '}
                        <code style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem',
                          color: '#d4ff00', background: '#d4ff0010', padding: '1px 6px', borderRadius: '4px',
                        }}>
                          shadowaudit fix {target.name} --pkg ./package.json
                        </code>
                      </p>
                    </div>
                  </div>
                )}

                <VulnerabilityTable vulnerabilities={selectedScan.vulnerabilities} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const Targets: React.FC = () => {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null);

  const [form, setForm] = useState({ name: '', type: 'npm' as TargetType, value: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [uploadName, setUploadName] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTargets = useCallback(async () => {
    try {
      const data = await getTargets();
      setTargets(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTargets(); }, [fetchTargets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.value.trim()) {
      setFormError('Name and value are required.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createTarget(form);
      setForm({ name: '', type: 'npm', value: '' });
      await fetchTargets();
    } catch {
      setFormError('Failed to register target. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (target: Target) => {
    if (!window.confirm(`Delete target "${target.name}"? This cannot be undone.`)) return;
    try {
      await deleteTarget(target.id);
      setTargets((prev) => prev.filter((t) => t.id !== target.id));
    } catch {
      alert('Failed to delete target. Is the backend running?');
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadFiles.length === 0) { setUploadError('Please select a file.'); return; }
    const name = uploadName.trim() || uploadFiles[0].name.replace(/\.[^.]+$/, '');
    setUploading(true);
    setUploadError(null);
    try {
      await uploadPackageFile(name, uploadFiles);
      setUploadName('');
      setUploadFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchTargets();
    } catch {
      setUploadError('Upload failed. Is the backend running?');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}>
      <h1 className="sa-page-title">Targets</h1>

      {/* Register form */}
      <div style={{
        background: '#111', border: '1px solid #222', borderRadius: '12px',
        padding: '24px', marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <span style={{ fontSize: '1rem' }}>🎯</span>
          <h2 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
            Register New Target
          </h2>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 180px' }}>
            <label style={{ fontSize: '0.68rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Name</label>
            <input
              className="sa-input"
              style={{ borderRadius: '8px', fontSize: '0.88rem' }}
              type="text"
              placeholder="my-service"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '0 0 160px' }}>
            <label style={{ fontSize: '0.68rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Type</label>
            <select
              className="sa-input"
              style={{ borderRadius: '8px', fontSize: '0.88rem' }}
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TargetType }))}
            >
              {TARGET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '2 1 240px' }}>
            <label style={{ fontSize: '0.68rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Value</label>
            <input
              className="sa-input"
              style={{ borderRadius: '8px', fontSize: '0.88rem', fontFamily: "'JetBrains Mono', monospace" }}
              type="text"
              placeholder="lodash@4.17.20 or nginx:latest"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            />
          </div>
          <button
            type="submit"
            className="sa-btn-primary"
            disabled={submitting}
            style={{ flex: '0 0 auto', borderRadius: '8px', padding: '10px 22px' }}
          >
            {submitting ? 'Registering…' : '+ Register'}
          </button>
        </form>
        {formError && <p style={{ color: '#ff4d4d', marginTop: '10px', fontSize: '0.82rem' }}>⚠️ {formError}</p>}
      </div>

      {/* Upload your own package.json */}
      <div style={{
        background: '#111', border: '1px solid #d4ff0022', borderRadius: '12px',
        padding: '24px', marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <span style={{ fontSize: '1rem' }}>📂</span>
          <h2 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
            Scan Your Own Project
          </h2>
        </div>
        <p style={{ color: '#666', fontSize: '0.82rem', marginBottom: '10px' }}>
          Upload a dependency file to scan for CVEs. Supports:
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
          {[
            { label: 'package.json', color: '#30d158' },
            { label: 'requirements.txt', color: '#60a5fa' },
            { label: 'go.sum', color: '#34d399' },
            { label: 'pom.xml', color: '#f97316' },
            { label: 'Gemfile.lock', color: '#f43f5e' },
            { label: 'Cargo.lock', color: '#fb923c' },
            { label: 'composer.lock', color: '#a78bfa' },
            { label: 'yarn.lock', color: '#30d158' },
          ].map(({ label, color }) => (
            <code key={label} style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem',
              color, background: `${color}14`, border: `1px solid ${color}30`,
              padding: '2px 8px', borderRadius: '5px',
            }}>{label}</code>
          ))}
        </div>
        <form onSubmit={handleUpload} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 180px' }}>
            <label style={{ fontSize: '0.68rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Project Name</label>
            <input
              className="sa-input"
              style={{ borderRadius: '8px', fontSize: '0.88rem' }}
              type="text"
              placeholder="my-project"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '2 1 240px' }}>
            <label style={{ fontSize: '0.68rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Dependency File(s) <span style={{ color: '#555', fontWeight: 400, textTransform: 'none' }}>(select multiple for Go: go.sum + go.mod)</span>
            </label>
            <input
              ref={fileInputRef}
              className="sa-input"
              style={{ borderRadius: '8px', paddingTop: '7px', fontSize: '0.82rem' }}
              type="file"
              accept=".json,.lock,.txt,.xml,.gradle,.toml,.sum,.mod"
              multiple
              onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
            />
            {uploadFiles.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {uploadFiles.map(f => (
                  <span key={f.name} style={{ fontSize: '0.7rem', color: '#30d158', background: '#30d15815', border: '1px solid #30d15830', padding: '1px 7px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
                    {f.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            className="sa-btn-primary"
            disabled={uploading || uploadFiles.length === 0}
            style={{ flex: '0 0 auto', borderRadius: '8px', padding: '10px 22px' }}
          >
            {uploading ? 'Scanning…' : '⬆ Upload & Scan'}
          </button>
        </form>
        {uploadError && <p style={{ color: '#ff4d4d', marginTop: '10px', fontSize: '0.82rem' }}>⚠️ {uploadError}</p>}
      </div>

      {/* Targets table */}
      <div style={{ background: '#111', border: '1px solid #222', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1rem' }}>🛡</span>
            <h2 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Registered Targets
            </h2>
          </div>
          <span style={{ fontSize: '0.72rem', color: '#555', fontWeight: 500 }}>
            {targets.length} target{targets.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading && <p style={{ color: '#555', padding: '32px 24px', textAlign: 'center', fontSize: '0.85rem' }}>Loading targets…</p>}
        {error && <p style={{ color: '#ff4d4d', padding: '20px 24px', fontSize: '0.85rem' }}>⚠️ {error}</p>}
        {!loading && !error && targets.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#444' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🎯</div>
            <p style={{ fontSize: '0.88rem', fontWeight: 500 }}>No targets yet</p>
            <p style={{ fontSize: '0.78rem', marginTop: '4px', color: '#333' }}>Register a package or upload a project above</p>
          </div>
        )}
        {targets.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ background: '#0e0e0e' }}>
                  {['Name', 'Type', 'Value', 'Last Scan', 'Status', 'Actions'].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '11px 20px',
                      fontSize: '0.65rem', fontWeight: 700, color: '#555',
                      textTransform: 'uppercase', letterSpacing: '0.1em',
                      borderBottom: '1px solid #1e1e1e', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {targets.map((target, i) => (
                  <tr
                    key={target.id}
                    style={{
                      borderBottom: i < targets.length - 1 ? '1px solid #1a1a1a' : 'none',
                      cursor: 'pointer', transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#151515')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => setSelectedTarget(target)}
                  >
                    <td style={{ padding: '14px 20px', fontWeight: 600, color: '#e5e5e5' }}>
                      {target.name}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: '6px', fontSize: '0.65rem',
                        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                        background: target.type === 'npm' ? '#d4ff0012' : target.type === 'docker' ? '#60a5fa12' : '#a78bfa12',
                        color: target.type === 'npm' ? '#d4ff00' : target.type === 'docker' ? '#60a5fa' : '#a78bfa',
                        border: `1px solid ${target.type === 'npm' ? '#d4ff0030' : target.type === 'docker' ? '#60a5fa30' : '#a78bfa30'}`,
                      }}>
                        {target.type}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem', color: '#888', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {target.value}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: '0.78rem', color: '#666', whiteSpace: 'nowrap' }}>
                      {target.lastScannedAt ? new Date(target.lastScannedAt).toLocaleString() : <span style={{ color: '#444' }}>Never</span>}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <ScanStatus status={target.status} />
                    </td>
                    <td style={{ padding: '14px 20px' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          onClick={() => setSelectedTarget(target)}
                          style={{
                            padding: '5px 12px', borderRadius: '6px', fontSize: '0.72rem',
                            fontWeight: 600, cursor: 'pointer', border: '1px solid #60a5fa40',
                            background: '#60a5fa10', color: '#60a5fa',
                            transition: 'background 0.15s', fontFamily: 'Inter, sans-serif',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#60a5fa20')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#60a5fa10')}
                        >
                          View CVEs
                        </button>
                        <button
                          onClick={() => handleDelete(target)}
                          style={{
                            padding: '5px 10px', borderRadius: '6px', fontSize: '0.72rem',
                            fontWeight: 600, cursor: 'pointer', border: '1px solid #ff4d4d30',
                            background: 'transparent', color: '#ff4d4d',
                            transition: 'background 0.15s', fontFamily: 'Inter, sans-serif',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#ff4d4d15')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedTarget && (
        <ScanHistoryModal target={selectedTarget} onClose={() => setSelectedTarget(null)} />
      )}
    </div>
  );
};
