/**
 * OpportunityDetail — Shows full detail for a single opportunity.
 * Fetches GET /api/v1/opportunities/:id (public endpoint).
 * DRAFT opportunities are visible for browsing but Apply action is disabled.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Calendar as CalIcon, Users, Clock,
  AlertCircle, Loader2, Tag, ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';

interface Shift {
  id: string;
  startsAt?: string;
  endsAt?: string;
  capacityMin?: number;
  capacityMax?: number;
}

interface Role {
  id: string;
  name: string;
  description?: string;
  shifts?: Shift[];
}

interface OpportunityDetail {
  id: string;
  name: string;
  description?: string;
  location?: string;
  siteId?: string;
  status: string;
  event?: { id?: string; name: string; startsAt?: string; endsAt?: string };
  roles?: Role[];
  createdAt?: string;
  updatedAt?: string;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'OPEN' ? 'badge badge-success' :
    status === 'DRAFT' ? 'badge badge-warning' :
    'badge badge-error';
  return <span className={cls}>{status}</span>;
}

function fmt(dt?: string, opts?: Intl.DateTimeFormatOptions) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString(undefined, opts ?? {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [opp, setOpp] = useState<OpportunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<{ data: OpportunityDetail } | OpportunityDetail>(`/opportunities/${id}`)
      .then(res => {
        const item = 'data' in res && res.data && typeof res.data === 'object'
          ? (res as { data: OpportunityDetail }).data
          : (res as OpportunityDetail);
        setOpp(item);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load opportunity');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="loading-state animate-fade-in">
        <Loader2 size={32} className="spin" style={{ color: 'var(--primary)' }} />
        <span>Loading opportunity…</span>
      </div>
    );
  }

  if (error || !opp) {
    return (
      <div className="animate-fade-up" style={{ maxWidth: 480, margin: '4rem auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
          <div className="empty-state__icon" style={{ background: 'var(--error-bg)' }}>
            <AlertCircle size={28} style={{ color: 'var(--error)' }} />
          </div>
          <p className="empty-state__title">Opportunity not found</p>
          <p className="empty-state__text">{error ?? 'This opportunity may have been removed.'}</p>
          <button className="btn btn-primary mt-6" onClick={() => navigate('/')}>
            Back to Opportunities
          </button>
        </div>
      </div>
    );
  }

  const isDraft = opp.status === 'DRAFT';
  const isOpen = opp.status === 'OPEN';
  const location = opp.location ?? opp.siteId;

  return (
    <div className="animate-fade-up" style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Back nav */}
      <button
        id="back-to-opportunities"
        className="btn btn-ghost btn-sm"
        onClick={() => navigate(-1)}
        style={{ marginBottom: 'var(--space-6)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <ArrowLeft size={16} />
        Back to Opportunities
      </button>

      {/* Header card */}
      <div className="card animate-fade-up" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-8) var(--space-10)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            {opp.event?.name && (
              <span className="opp-card__event-tag" style={{ marginBottom: '0.5rem', display: 'inline-block' }}>
                {opp.event.name}
              </span>
            )}
            <h1 className="page-header__title" style={{ marginTop: '0.4rem', marginBottom: 0 }}>
              {opp.name}
            </h1>
          </div>
          <StatusBadge status={opp.status} />
        </div>

        {/* Draft notice */}
        {isDraft && (
          <div
            style={{
              marginTop: 'var(--space-6)',
              padding: 'var(--space-4) var(--space-6)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--warning-bg, rgba(251,191,36,0.1))',
              border: '1px solid var(--warning, #f59e0b)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <Clock size={18} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0 }} />
            <div>
              <strong style={{ color: 'var(--warning, #f59e0b)', fontSize: '0.9rem' }}>Draft — Not yet open for applications</strong>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                This opportunity is still being configured. Check back once it's published.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Detail grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        {/* Meta */}
        <div className="card" style={{ padding: 'var(--space-6) var(--space-8)' }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
            Event Details
          </h2>

          <div className="opp-card__meta" style={{ gap: 'var(--space-4)' }}>
            {location && (
              <div className="opp-card__meta-row">
                <MapPin size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <span>{location}</span>
              </div>
            )}
            {opp.event?.startsAt && (
              <div className="opp-card__meta-row">
                <CalIcon size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <span>Starts: {fmt(opp.event.startsAt)}</span>
              </div>
            )}
            {opp.event?.endsAt && (
              <div className="opp-card__meta-row">
                <CalIcon size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <span>Ends: {fmt(opp.event.endsAt)}</span>
              </div>
            )}
            <div className="opp-card__meta-row">
              <Tag size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <StatusBadge status={opp.status} />
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="card" style={{ padding: 'var(--space-6) var(--space-8)' }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
            About This Opportunity
          </h2>
          {opp.description ? (
            <p style={{ color: 'var(--text-body)', lineHeight: 1.7, fontSize: '0.9rem' }}>{opp.description}</p>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
              No description provided yet.
            </p>
          )}
        </div>
      </div>

      {/* Roles */}
      {opp.roles && opp.roles.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-6) var(--space-8)' }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
            Available Roles ({opp.roles.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {opp.roles.map(role => (
              <div
                key={role.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-4)',
                  padding: 'var(--space-4) var(--space-5)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-2, rgba(255,255,255,0.04))',
                  border: '1px solid var(--border)',
                }}
              >
                <Users size={16} style={{ color: 'var(--primary)', marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '0.95rem', color: 'var(--text-heading)' }}>{role.name}</strong>
                  {role.description && (
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {role.description}
                    </p>
                  )}
                  {role.shifts && role.shifts.length > 0 && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {role.shifts.map(shift => (
                        <div key={shift.id} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Clock size={11} />
                          {fmt(shift.startsAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {shift.endsAt && <> — {fmt(shift.endsAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}
                          {shift.capacityMax != null && (
                            <span style={{ marginLeft: '0.5rem' }}>· {shift.capacityMax} spots</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRight size={14} style={{ color: 'var(--text-muted)', marginTop: 2 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="card" style={{ padding: 'var(--space-6) var(--space-8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <p style={{ fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>
            {isOpen ? 'Ready to join?' : isDraft ? 'Not yet accepting applications' : 'Applications are closed'}
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
            {isOpen
              ? 'Submit your application to volunteer for this opportunity.'
              : isDraft
              ? 'This opportunity is still being set up. It will open soon.'
              : 'This opportunity is no longer accepting new volunteers.'}
          </p>
        </div>

        {isOpen ? (
          <Link
            to={`/apply/${opp.id}`}
            id={`detail-apply-btn-${opp.id}`}
            className="btn btn-primary"
          >
            Apply to Volunteer
          </Link>
        ) : (
          <button
            id={`detail-status-btn-${opp.id}`}
            className="btn btn-ghost"
            disabled
            title={isDraft ? 'This opportunity has not opened yet' : 'Applications are closed'}
          >
            {isDraft ? 'Not Yet Open' : 'Closed'}
          </button>
        )}
      </div>
    </div>
  );
}
