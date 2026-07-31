/**
 * OnboardingChecklist — Volunteer role (master_plan §7.5).
 * Redesigned with Option 3: Vibrant premium aesthetic.
 */

import { useState, useEffect } from 'react';
import {
  UploadCloud, CheckCircle, Clock, AlertTriangle, ShieldCheck, Loader2, Info,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

type CredType   = 'TRAINING' | 'BACKGROUND_CHECK' | 'LICENSE' | 'CERTIFICATION';
type CredStatus = 'NOT_STARTED' | 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'WAIVED';

interface Credential {
  id: string;
  type: CredType;
  status: CredStatus;
  providerReference?: string | null;
  issuedAt?: string | null;
}

const DEMO_DATA: Credential[] = [
  { id: 'req-1', type: 'TRAINING',          status: 'NOT_STARTED' },
  { id: 'req-2', type: 'BACKGROUND_CHECK',  status: 'PENDING',  providerReference: 'BC-992384' },
  { id: 'req-3', type: 'TRAINING',          status: 'APPROVED',  issuedAt: '2026-05-10' },
];

const TYPE_LABELS: Record<CredType, string> = {
  TRAINING:         'Orientation Training',
  BACKGROUND_CHECK: 'Background Check',
  LICENSE:          'License',
  CERTIFICATION:    'Certification',
};

const TYPE_DESC: Record<CredType, string> = {
  TRAINING:         'Complete required orientation modules before your first shift.',
  BACKGROUND_CHECK: 'Cleared by our partner provider — typically takes 3–5 days.',
  LICENSE:          'Upload a valid professional license document.',
  CERTIFICATION:    'Submit certification issued within the last 3 years.',
};

function getItemClass(status: CredStatus) {
  if (status === 'APPROVED') return 'cred-item cred-item--approved';
  if (status === 'PENDING' || status === 'SUBMITTED') return 'cred-item cred-item--pending';
  return 'cred-item cred-item--missing';
}

function StatusIcon({ status }: { status: CredStatus }) {
  if (status === 'APPROVED')
    return <div className="cred-item__icon cred-item__icon--approved"><CheckCircle size={18} /></div>;
  if (status === 'PENDING' || status === 'SUBMITTED')
    return <div className="cred-item__icon cred-item__icon--pending"><Clock size={18} /></div>;
  if (status === 'REJECTED')
    return <div className="cred-item__icon cred-item__icon--error"><AlertTriangle size={18} /></div>;
  return <div className="cred-item__icon cred-item__icon--missing"><AlertTriangle size={18} /></div>;
}

export default function OnboardingChecklist() {
  const { user }         = useAuth();
  const { showToast }    = useToast();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading]         = useState(true);
  const [uploading, setUploading]     = useState<string | null>(null);
  const [usingDemo, setUsingDemo]     = useState(false);

  useEffect(() => {
    if (!user) {
      setCredentials(DEMO_DATA);
      setUsingDemo(true);
      setLoading(false);
      return;
    }

    api
      .get<{ data: Credential[] } | Credential[]>('/onboarding/credentials')
      .then(res => {
        const items = Array.isArray(res) ? res : (res as { data: Credential[] }).data ?? [];
        setCredentials(items.length > 0 ? items : DEMO_DATA);
        if (items.length === 0) setUsingDemo(true);
      })
      .catch(() => { setCredentials(DEMO_DATA); setUsingDemo(true); })
      .finally(() => setLoading(false));
  }, [user]);

  const handleUpload = async (cred: Credential) => {
    if (!user) {
      setCredentials(p => p.map(c => c.id === cred.id ? { ...c, status: 'SUBMITTED' as CredStatus } : c));
      showToast('Demo mode: status updated locally. Sign in to persist.', 'warning');
      return;
    }

    setUploading(cred.id);
    try {
      await api.post('/onboarding/credentials', { type: cred.type, notes: 'Submitted via checklist' });
      setCredentials(p => p.map(c => c.id === cred.id ? { ...c, status: 'SUBMITTED' as CredStatus } : c));
      showToast(`${TYPE_LABELS[cred.type]} submitted for review.`, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(null);
    }
  };

  const approvedCount = credentials.filter(c => c.status === 'APPROVED').length;
  const totalCount    = credentials.length;

  if (loading) {
    return (
      <div className="loading-state animate-fade-in">
        <Loader2 size={32} className="spin" style={{ color: 'var(--primary)' }} />
        <span>Loading credentials…</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-up" style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="page-header__title">Onboarding Checklist</h1>
            <p className="page-header__subtitle">
              Complete all requirements to be eligible for restricted roles.
            </p>
          </div>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: approvedCount === totalCount ? 'var(--success-bg)' : 'rgba(8,145,178,0.08)',
            border: `1.5px solid ${approvedCount === totalCount ? 'rgba(16,185,129,0.3)' : 'rgba(8,145,178,0.2)'}`,
            borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-6)',
          }}>
            <ShieldCheck size={28} style={{ color: approvedCount === totalCount ? 'var(--success)' : 'var(--primary)' }} />
            <span style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1, color: 'var(--text)', marginTop: 4 }}>
              {approvedCount}/{totalCount}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Complete</span>
          </div>
        </div>
      </div>

      {/* Demo banner */}
      {usingDemo && (
        <div className="alert alert-warning mb-6" role="status">
          <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Demo data shown — {user ? 'no credentials on record yet.' : 'sign in to load your real credentials.'}
          </span>
        </div>
      )}

      {/* Credential list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {credentials.map((cred, i) => (
          <div
            key={cred.id}
            className={`${getItemClass(cred.status)} animate-fade-up`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            {/* Left: icon + info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flex: 1, minWidth: 0 }}>
              <StatusIcon status={cred.status} />
              <div style={{ minWidth: 0 }}>
                <p className="cred-item__name">{TYPE_LABELS[cred.type] ?? cred.type}</p>
                <p className="cred-item__sub">{TYPE_DESC[cred.type]}</p>
                {(cred.issuedAt || cred.providerReference) && (
                  <p className="cred-item__sub" style={{ marginTop: 2 }}>
                    {cred.issuedAt && `Completed ${cred.issuedAt.slice(0, 10)}`}
                    {cred.issuedAt && cred.providerReference && ' · '}
                    {cred.providerReference && `Ref: ${cred.providerReference}`}
                  </p>
                )}
              </div>
            </div>

            {/* Right: action */}
            <div style={{ flexShrink: 0 }}>
              {cred.status === 'NOT_STARTED' && (
                <button
                  id={`upload-btn-${cred.id}`}
                  className="btn btn-primary btn-sm"
                  onClick={() => handleUpload(cred)}
                  disabled={uploading === cred.id}
                >
                  {uploading === cred.id
                    ? <><Loader2 size={14} className="spin" /> Uploading…</>
                    : <><UploadCloud size={14} /> Upload</>}
                </button>
              )}
              {cred.status === 'SUBMITTED' && (
                <span className="badge badge-warning">Under Review</span>
              )}
              {cred.status === 'PENDING' && (
                <span className="badge badge-warning">Pending</span>
              )}
              {cred.status === 'APPROVED' && (
                <span className="badge badge-success">✓ Verified</span>
              )}
              {cred.status === 'REJECTED' && (
                <span className="badge badge-error">Rejected</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
