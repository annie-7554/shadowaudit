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
                        padding: '2px 10px', borderRadius: '0', fontSize: '0.68rem', fontWeight: 700,
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
  const [uploadFile, setUploadFile] = useState<File | null>(null);
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
    if (!uploadFile) { setUploadError('Please select a file.'); return; }
    const name = uploadName.trim() || uploadFile.name.replace('.json', '');
    setUploading(true);
    setUploadError(null);
    try {
      await uploadPackageFile(name, uploadFile);
      setUploadName('');
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchTargets();
    } catch {
      setUploadError('Upload failed. Is the backend running?');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h1 className="sa-page-title">Targets</h1>

      {/* Register form */}
      <div className="sa-card" style={{ marginBottom: '24px' }}>
        <h2 className="sa-section-title">Register New Target</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 180px' }}>
            <label className="sa-label">Name</label>
            <input
              className="sa-input"
              type="text"
              placeholder="my-service"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '0 0 160px' }}>
            <label className="sa-label">Type</label>
            <select
              className="sa-input"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TargetType }))}
            >
              {TARGET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '2 1 240px' }}>
            <label className="sa-label">Value</label>
            <input
              className="sa-input"
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
            style={{ flex: '0 0 auto' }}
          >
            {submitting ? 'Registering…' : '+ Register'}
          </button>
        </form>
        {formError && <p style={{ color: '#ef4444', marginTop: '8px', fontSize: '0.85rem' }}>⚠️ {formError}</p>}
      </div>

      {/* Upload your own package.json */}
      <div className="sa-card" style={{ marginBottom: '24px', borderColor: '#d4ff0033' }}>
        <h2 className="sa-section-title">📂 Scan Your Own Project</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '12px' }}>
          Upload your <code style={{ color: '#d4ff00' }}>package.json</code> or <code style={{ color: '#d4ff00' }}>package-lock.json</code> to scan your own project's dependencies for CVEs.
        </p>
        <form onSubmit={handleUpload} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 180px' }}>
            <label className="sa-label">Project Name</label>
            <input
              className="sa-input"
              type="text"
              placeholder="my-project"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '2 1 240px' }}>
            <label className="sa-label">package.json / package-lock.json</label>
            <input
              ref={fileInputRef}
              className="sa-input"
              type="file"
              accept=".json,.lock"
              style={{ paddingTop: '6px' }}
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button
            type="submit"
            className="sa-btn-primary"
            disabled={uploading || !uploadFile}
            style={{ flex: '0 0 auto' }}
          >
            {uploading ? 'Scanning…' : '⬆ Upload & Scan'}
          </button>
        </form>
        {uploadError && <p style={{ color: '#ef4444', marginTop: '8px', fontSize: '0.85rem' }}>⚠️ {uploadError}</p>}
      </div>

      {/* Targets table */}
      <div className="sa-card">
        <h2 className="sa-section-title">Registered Targets</h2>
        {loading && <p style={{ color: '#94a3b8' }}>Loading targets…</p>}
        {error && <p style={{ color: '#ef4444' }}>⚠️ {error}</p>}
        {!loading && !error && targets.length === 0 && (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>
            No targets registered yet. Add one above.
          </p>
        )}
        {targets.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Value</th>
                  <th>Last Scan</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((target) => (
                  <tr
                    key={target.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedTarget(target)}
                  >
                    <td style={{ fontWeight: 600 }}>{target.name}</td>
                    <td>
                    <span style={{
                        padding: '2px 7px', borderRadius: '0', fontSize: '0.65rem',
                        background: '#1a1a1a', color: '#666', border: '1px solid #2a2a2a',
                        textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700,
                      }}>
                        {target.type}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#94a3b8' }}>
                      {target.value}
                    </td>
                    <td style={{ fontSize: '0.82rem', color: '#999' }}>
                      {target.lastScannedAt ? new Date(target.lastScannedAt).toLocaleString() : '—'}
                    </td>
                    <td>
                      <span title="Click row to view CVE details">
                        <ScanStatus status={target.status} />
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: '#d4ff00' }} onClick={(e) => e.stopPropagation()}>
                      <span
                        style={{ cursor: 'pointer', textDecoration: 'underline', marginRight: '10px' }}
                        onClick={() => setSelectedTarget(target)}
                      >
                        View CVEs
                      </span>
                      <button
                        className="sa-btn-danger"
                        onClick={() => handleDelete(target)}
                      >
                        Delete
                      </button>
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
