/**
 * OpportunityPortal — Public/Volunteer role (master_plan §7.5).
 * Fetches real data from GET /api/v1/opportunities.
 * Redesigned with Option 3: Vibrant premium aesthetic.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Calendar as CalIcon, Users, Search, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { api } from '../lib/api';

interface OpportunityRole { id?: string; name: string; capacity?: number; }
interface Opportunity {
  id: string;
  name: string;
  description?: string;
  location?: string;
  siteId?: string;
  status: string;
  event?: { name: string; startsAt?: string; };
  roles?: OpportunityRole[];
}

export default function OpportunityPortal() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api
      .get<{ data: Opportunity[] } | Opportunity[]>('/opportunities')
      .then(res => {
        const items = Array.isArray(res) ? res : (res as { data: Opportunity[] }).data ?? [];
        setOpportunities(items);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load opportunities';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return opportunities;
    const q = search.toLowerCase();
    return opportunities.filter(
      o =>
        o.name.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q) ||
        o.location?.toLowerCase().includes(q) ||
        o.event?.name.toLowerCase().includes(q),
    );
  }, [opportunities, search]);

  if (loading) {
    return (
      <div className="loading-state animate-fade-in">
        <Loader2 size={32} className="spin" style={{ color: 'var(--primary)' }} />
        <span>Loading opportunities…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-up" style={{ maxWidth: 480, margin: '4rem auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
          <div className="empty-state__icon" style={{ background: 'var(--error-bg)' }}>
            <AlertCircle size={28} style={{ color: 'var(--error)' }} />
          </div>
          <p className="empty-state__title">Could not load opportunities</p>
          <p className="empty-state__text">{error}</p>
          <p className="empty-state__text mt-2" style={{ fontSize: '0.8rem' }}>
            Make sure the backend is running at localhost:3000 and the database is seeded.
          </p>
          <button className="btn btn-primary mt-6" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      {/* Page header */}
      <div className="page-header flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="page-header__title">Discover Opportunities</h1>
          <p className="page-header__subtitle">
            {opportunities.length === 0
              ? 'No opportunities published yet.'
              : `${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'} available`}
          </p>
        </div>

        <div className="search-wrapper">
          <Search size={16} className="search-icon" />
          <input
            id="opportunity-search"
            type="search"
            placeholder="Search roles or locations…"
            className="search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search opportunities"
          />
        </div>
      </div>

      {/* Content */}
      {opportunities.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <Sparkles size={28} style={{ color: 'var(--primary)' }} />
          </div>
          <p className="empty-state__title">No opportunities yet</p>
          <p className="empty-state__text">
            An Event Manager must create and publish events with opportunities first.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <Search size={28} style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="empty-state__title">No results</p>
          <p className="empty-state__text">No opportunities match &ldquo;{search}&rdquo;. Try a different search.</p>
        </div>
      ) : (
        <div className="grid-auto">
          {filtered.map((opp, i) => (
            <div
              key={opp.id}
              className="opp-card animate-fade-up"
              style={{ animationDelay: `${i * 60}ms`, position: 'relative', display: 'flex', flexDirection: 'column' }}
            >
              {/* Entire card body is a clickable link to detail view */}
              <Link
                to={`/opportunities/${opp.id}`}
                id={`opp-card-link-${opp.id}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
                aria-label={`View details for ${opp.name}`}
              >
                {/* Top */}
                <div style={{ flex: 1 }}>
                  {opp.event?.name && (
                    <span className="opp-card__event-tag">{opp.event.name}</span>
                  )}
                  <h3 className="opp-card__title mt-2">{opp.name}</h3>
                  {opp.description && (
                    <p className="opp-card__desc mt-2">{opp.description}</p>
                  )}
                </div>

                {/* Meta */}
                <div className="opp-card__meta">
                  {(opp.location || opp.siteId) && (
                    <div className="opp-card__meta-row">
                      <MapPin size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                      {opp.location ?? opp.siteId}
                    </div>
                  )}
                  {opp.event?.startsAt && (
                    <div className="opp-card__meta-row">
                      <CalIcon size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                      {new Date(opp.event.startsAt).toLocaleString(undefined, {
                        weekday: 'short', year: 'numeric', month: 'short',
                        day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  )}
                  {opp.roles && opp.roles.length > 0 && (
                    <div className="opp-card__meta-row">
                      <Users size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                      {opp.roles.map(r => r.name).join(', ')}
                    </div>
                  )}
                </div>
              </Link>

              {/* Footer — lives outside Link so buttons don't trigger navigation */}
              <div className="opp-card__footer">
                <span className={`badge ${opp.status === 'OPEN' ? 'badge-success'
                    : opp.status === 'DRAFT' ? 'badge-warning'
                      : 'badge-error'
                  }`}>
                  {opp.status}
                </span>

                {opp.status === 'OPEN' ? (
                  <Link
                    to={`/apply/${opp.id}`}
                    id={`apply-btn-${opp.id}`}
                    className="btn btn-primary btn-sm"
                  >
                    Apply to Volunteer
                  </Link>
                ) : (
                  <Link
                    to={`/opportunities/${opp.id}`}
                    id={`view-details-btn-${opp.id}`}
                    className="btn btn-ghost btn-sm"
                  >
                    View Details
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
