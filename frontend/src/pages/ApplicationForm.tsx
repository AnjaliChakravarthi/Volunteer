/**
 * ApplicationForm — Volunteer role (master_plan §7.5).
 * Real POST /api/v1/applications call. Redesigned with Option 3 aesthetic.
 */

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, AlertCircle, Loader2, ChevronLeft, ClipboardList } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

export default function ApplicationForm() {
  const { opportunityId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [motivation, setMotivation] = useState('');
  const [experience, setExperience] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opportunityId) { setError('No opportunity ID found in URL.'); return; }

    setSubmitting(true);
    setError(null);

    try {
      await api.post('/applications', {
        opportunityId,
        formAnswersJson: {
          motivation,
          experience,
          emergencyContact: { name: emergencyName, phone: emergencyPhone },
        },
      });

      showToast('Application submitted successfully!', 'success');
      navigate('/onboarding', { state: { message: 'Application submitted! Complete your onboarding.' } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed. Please try again.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-up" style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Back link */}
      <button
        className="btn btn-ghost btn-sm mb-6"
        onClick={() => navigate(-1)}
        style={{ gap: 'var(--space-1)', color: 'var(--text-secondary)' }}
      >
        <ChevronLeft size={16} /> Back to Opportunities
      </button>

      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div style={{
            width: 44, height: 44, borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, rgba(8,145,178,0.12), rgba(244,63,94,0.08))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ClipboardList size={22} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h1 className="page-header__title" style={{ fontSize: '1.5rem' }}>Volunteer Application</h1>
            <p className="page-header__subtitle" style={{ fontSize: '0.875rem' }}>
              Opportunity ID: <code style={{ fontSize: '0.8rem', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{opportunityId}</code>
            </p>
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="card-flat">
        {error && (
          <div className="alert alert-error mb-6" role="alert">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="motivation">
              Why do you want to volunteer? <span className="req">*</span>
            </label>
            <textarea
              id="motivation"
              className="form-input"
              rows={4}
              required
              placeholder="Briefly describe your motivation…"
              value={motivation}
              onChange={e => setMotivation(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="experience">
              Relevant experience or skills
            </label>
            <textarea
              id="experience"
              className="form-input"
              rows={3}
              placeholder="Languages spoken, certifications, prior volunteer work…"
              value={experience}
              onChange={e => setExperience(e.target.value)}
            />
          </div>

          <div className="divider" />

          <p style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
            Emergency Contact
          </p>

          <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="emergency-name">
                Full Name <span className="req">*</span>
              </label>
              <input
                id="emergency-name"
                type="text"
                className="form-input"
                required
                value={emergencyName}
                onChange={e => setEmergencyName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="emergency-phone">
                Phone <span className="req">*</span>
              </label>
              <input
                id="emergency-phone"
                type="tel"
                className="form-input"
                required
                value={emergencyPhone}
                onChange={e => setEmergencyPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => navigate(-1)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              id="submit-application-btn"
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting
                ? <><Loader2 size={16} className="spin" /> Submitting…</>
                : <><Send size={16} /> Submit Application</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
