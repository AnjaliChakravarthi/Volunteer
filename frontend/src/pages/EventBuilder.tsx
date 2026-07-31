/**
 * EventBuilder — Event Manager / System Admin only (master_plan §7.5).
 * Real POST /api/v1/events call. Redesigned with Option 3 aesthetic.
 */

import { useState } from 'react';
import { Plus, Save, Trash2, ShieldAlert, Loader2, Calendar } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

interface RoleField {
  id: number;
  name: string;
  minAge: string;
  reqCreds: string;
}

export default function EventBuilder() {
  const { showToast } = useToast();

  const [programId, setProgramId] = useState('');
  const [eventName, setEventName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [description, setDescription] = useState('');
  const [roles, setRoles] = useState<RoleField[]>([{ id: 1, name: '', minAge: '', reqCreds: '' }]);
  const [saving, setSaving] = useState(false);

  const addRole = () => setRoles([...roles, { id: Date.now(), name: '', minAge: '', reqCreds: '' }]);
  const removeRole = (id: number) => setRoles(roles.filter(r => r.id !== id));
  const updateRole = (id: number, field: string, value: string) =>
    setRoles(roles.map(r => r.id === id ? { ...r, [field]: value } : r));

  const handleSave = async () => {
    if (!programId.trim()) { showToast('Program ID is required.', 'error'); return; }
    if (!eventName.trim()) { showToast('Event name is required.', 'error'); return; }
    if (!startsAt || !endsAt) { showToast('Start and end dates are required.', 'error'); return; }
    if (new Date(endsAt) <= new Date(startsAt)) { showToast('End time must be after start time.', 'error'); return; }

    setSaving(true);
    try {
      const result = await api.post<{ data: { id: string; name: string } }>('/events', {
        programId: programId.trim(),
        name: eventName.trim(),
        description: description.trim() || undefined,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });

      showToast(`Event "${result.data.name}" published! ID: ${result.data.id}`, 'success');
      setEventName(''); setProgramId(''); setStartsAt(''); setEndsAt(''); setDescription('');
      setRoles([{ id: Date.now(), name: '', minAge: '', reqCreds: '' }]);
    } catch (err: unknown) {
      showToast(`Failed to save event: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-up" style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(8,145,178,0.12), rgba(244,63,94,0.08))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Calendar size={22} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h1 className="page-header__title" style={{ fontSize: '1.5rem' }}>Event Builder</h1>
              <p className="page-header__subtitle" style={{ fontSize: '0.875rem' }}>
                Create events and configure volunteer roles.
              </p>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
            id="publish-event-btn"
          >
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {saving ? 'Publishing…' : 'Publish Event'}
          </button>
        </div>
      </div>

      {/* Event Details card */}
      <div className="card-flat mb-6">
        <p className="section-title mb-6">Event Details</p>

        <div className="form-group">
          <label className="form-label" htmlFor="program-id">
            Program ID <span className="req">*</span>
          </label>
          <input
            id="program-id"
            type="text"
            className="form-input"
            value={programId}
            onChange={e => setProgramId(e.target.value)}
            placeholder="UUID of the parent Program"
          />
          <p className="form-hint">
            Seed a program via <code>npx ts-node prisma/seed.ts</code> and paste the UUID here.
          </p>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="event-name">
            Event Name <span className="req">*</span>
          </label>
          <input
            id="event-name"
            type="text"
            className="form-input"
            value={eventName}
            onChange={e => setEventName(e.target.value)}
            placeholder="e.g. Annual River Cleanup"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="event-description">Description</label>
          <textarea
            id="event-description"
            className="form-input"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional — describe the event purpose, location context, etc."
          />
        </div>

        <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="event-starts-at">
              Starts At <span className="req">*</span>
            </label>
            <input
              id="event-starts-at"
              type="datetime-local"
              className="form-input"
              value={startsAt}
              onChange={e => setStartsAt(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="event-ends-at">
              Ends At <span className="req">*</span>
            </label>
            <input
              id="event-ends-at"
              type="datetime-local"
              className="form-input"
              value={endsAt}
              onChange={e => setEndsAt(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Roles section */}
      <div className="section-header">
        <div>
          <p className="section-title">Roles &amp; Shifts</p>
          <p className="form-hint" style={{ marginTop: 'var(--space-1)' }}>
            Roles are attached to opportunities via <code>POST /api/v1/opportunities/:id/roles</code> after publish.
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={addRole} id="add-role-btn">
          <Plus size={15} /> Add Role
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {roles.map((role, idx) => (
          <div key={role.id} className="role-card animate-fade-up" style={{ animationDelay: `${idx * 50}ms` }}>
            <div className="role-card__header">
              <span className="role-card__index">Role #{idx + 1}</span>
              {roles.length > 1 && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--error)', padding: 'var(--space-1)' }}
                  onClick={() => removeRole(role.id)}
                  aria-label={`Remove role ${idx + 1}`}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label">Role Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={role.name}
                  onChange={e => updateRole(role.id, 'name', e.target.value)}
                  placeholder="e.g. Heavy Lifter"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Minimum Age</label>
                <input
                  type="number"
                  className="form-input"
                  value={role.minAge}
                  onChange={e => updateRole(role.id, 'minAge', e.target.value)}
                  placeholder="18"
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                <ShieldAlert size={14} style={{ color: 'var(--warning)' }} />
                Required Credentials
              </label>
              <input
                type="text"
                className="form-input"
                value={role.reqCreds}
                onChange={e => updateRole(role.id, 'reqCreds', e.target.value)}
                placeholder="e.g. BACKGROUND_CHECK, TRAINING"
              />
              <p className="form-hint">
                Volunteers without these approved credentials will be blocked at registration.
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
