# Volunteer and Event Management Platform — Technical Master Plan

**Document type:** Implementation-ready technical master plan
**Source:** Volunteer_and_Event_Management.pdf (use.ai research brief)
**Prepared as:** Architecture + Backend + DevSecOps + Product/UX plan for a development team

---

## 0. How to Read This Document

- Every requirement, entity, and screen traces back to the source PDF. Nothing is invented beyond what the PDF implies as necessary to make those features implementable.
- Where the PDF is silent on a concrete technical choice (e.g., exact DB engine, exact framework), a **recommendation** is given with reasoning, not a generic tutorial — these are marked **DECISION REQUIRED (recommended default provided)**.
- Priorities: **P0** = MVP/required, **P1** = required but later, **P2** = future/optional. This maps directly to the PDF's FR-01…FR-24 priority framework.

---

## 1. REQUIREMENTS

### 1.1 Problem / Objective

Organizations currently run volunteer and event operations on disconnected spreadsheets, forms, messaging apps, paper attendance sheets, and manually edited certificate templates. This produces: duplicate/inconsistent volunteer records, slow onboarding, scheduling conflicts, inaccurate attendance/hours, delayed or fraudulent certificates, poor communications/high no-shows, low visibility into retention/impact, and privacy/security risk from uncontrolled data sharing.

**Objective:** Replace this with a single lifecycle platform built around **one authoritative, deduplicated volunteer profile**, connected to recruitment, onboarding, event/shift scheduling, attendance, an auditable participation ledger, rule-based certificate issuance, recognition, and governed reporting.

### 1.2 Users & Roles

| Category | Role | Core Responsibility |
|---|---|---|
| External | Prospective Volunteer | Discover opportunities, apply |
| External | Approved Volunteer | Register, select shifts, train, check in, track hours, download certificates |
| External | Group Leader | Register/coordinate groups (schools, companies, clubs) |
| External | Guardian | Provide consent for minors |
| External | Certificate Verifier | Public — confirms certificate authenticity (no account) |
| Internal | Volunteer Coordinator | Recruitment, screening, onboarding, deployment, recognition |
| Internal | Event Manager | Create events, capacities, roles, shifts, venues, attendance rules |
| Internal | Site Supervisor | Check-in, hour approval — **scoped to assigned site/shift only** |
| Internal | Communications Team | Campaigns, reminders, engagement messaging |
| Internal | Leadership | Read-only participation/impact/retention/performance views |
| Internal | System Administrator | Permissions, configuration, integrations, security |
| Internal | Auditor / Safeguarding Officer | Restricted read access to compliance records and audit logs |

**Key rule (PDF 3):** Permissions are **role + scope** based — e.g. a Site Supervisor sees only volunteers assigned to their site/shift, not the full org database.

### 1.3 Core Workflows (from PDF flowchart, Section 2)

```
Recruitment → Application → Screening/Onboarding → Approved Volunteer Profile
   → Opportunity Discovery → Registration & Shift Assignment → Check-in & Attendance
   → Hours & Participation Approval → Certificate & Recognition
   → Reporting & Re-engagement → (loops back to Opportunity Discovery)
```

### 1.4 Modules / Features (Functional Scope, PDF §4)

1. Volunteer recruitment (opportunity portal, configurable forms, duplicate detection)
2. Onboarding & compliance (waivers, background-check status, training, guardian consent, credential expiry)
3. Volunteer profile (single authoritative record, compartmentalized sensitive data)
4. Event & opportunity management (Event → Opportunity → Role → Shift → Assignment hierarchy)
5. Registration & scheduling (status pipeline, capacity/eligibility rule engine)
6. Communications & engagement (multi-channel, templated, consent-linked)
7. Attendance & check-in (roster, QR, kiosk, self-check-in, NFC/badge, offline mobile)
8. Participation & service-hour ledger (draft → submitted → approved → finalized → locked, with adjustment entries)
9. Certificate management (rule-based generation from approved data only, revoke/reissue model, public verification)
10. Recognition & retention (milestones, badges, nominations — equity-aware, not hours-only)
11. Reporting & analytics (operational + strategic metrics, demographic suppression)

### 1.5 Business Rules (critical, non-negotiable per PDF)

- **BR-01:** A single volunteer identity (internal immutable ID, not email) must be maintained across the whole lifecycle.
- **BR-02:** Registration ≠ Assignment. Status pipeline: `Interested → Applied → Eligible → Registered → Waitlisted → Assigned → Confirmed → Checked-in → Completed → Approved`.
- **BR-03:** A volunteer cannot be scheduled into a restricted role unless **all** mandatory onboarding requirements (training, waiver, credential, guardian consent) are satisfied.
- **BR-04:** Attendance ≠ Service hours. A volunteer may attend training without earning hours, or log approved remote hours without a check-in event.
- **BR-05:** Corrections to **finalized** participation records must create adjustment entries — never silently overwrite history (audit integrity + certificate validity depend on this).
- **BR-06:** Certificates may only be generated from **approved/finalized** participation data, never draft/pending data.
- **BR-07:** Certificate corrections use **revoke + reissue**, never silent replacement. Every certificate has a unique, unguessable serial and an immutable issued-version snapshot.
- **BR-08:** Public certificate verification pages disclose only minimal necessary fields (status, title, name, date, org — no unrelated PII).
- **BR-09:** Sensitive data is compartmentalized — e.g., a site supervisor may see "accommodation required = true" without seeing the underlying medical reason.
- **BR-10:** Recognition must weigh impact/reliability/leadership/learning, not hours alone (equity requirement — avoids disadvantaging volunteers with disabilities/caring duties/limited free time).
- **BR-11:** Scheduling engine must transactionally enforce capacity, prevent shift overlap for a single volunteer, and enforce age/credential/site eligibility at assignment time (not just at UI level).
- **BR-12:** All automated actions (reminders, certificate issuance, re-engagement campaigns) must be explainable, retryable, and human-reversible.

### 1.6 Data Requirements

Core entities (detailed in §4): Organization, Program, Event, Opportunity, Role, Shift, Volunteer, Application, Registration, Assignment, Attendance, Participation, Certificate, Recognition, Credential, Consent Record, Audit Log.

Sensitive categories requiring special handling: identity documents, guardian consent, health/accommodation notes, background-check status (not full reports), consent history.

### 1.7 Integrations (PDF §4.6, §11)

| Integration | Purpose | Priority |
|---|---|---|
| Email provider (transactional) | Confirmations, reminders, certificates | P0 |
| SMS provider | Shift reminders, urgent notices | P1 |
| Push notification service | Mobile/web alerts | P1 |
| SSO / Identity provider | Staff login, MFA | P1 |
| Calendar (ICS/Google/Outlook) | Shift export | P1 |
| CRM | Donor/volunteer sync for larger orgs | P1 |
| Background-check provider (external, status-only sync) | Screening | P1 |
| E-signature provider | Waivers | P1 |
| Payment processor | Only if paid events introduced | P2 — **DECISION REQUIRED**: PDF notes payment is optional for volunteer programs, unlike generic event tools |

### 1.8 Constraints

- Must support offline/low-connectivity attendance capture with later sync (rural/large outdoor events).
- Must support multi-site, multi-timezone, multi-language operation.
- Must meet WCAG 2.2 AA accessibility target (public + authenticated surfaces).
- Must avoid biometric attendance unless legal/necessity/proportionality is separately established — **default: do not build** biometric check-in in MVP.
- Data minimization and configurable retention are mandatory, not optional hardening.

### 1.9 Requirement Gaps (DECISION REQUIRED)

| Gap | Why it matters | Recommended default |
|---|---|---|
| Are payments needed at all (paid tickets, merchandise)? | Changes PCI scope entirely | Not in MVP; defer to P2, isolate via hosted payment page (Stripe Checkout) if ever needed |
| Which jurisdictions/regulations apply (GDPR, COPPA, state youth-protection laws)? | Drives consent, retention, minor-data rules | Assume multi-jurisdiction; build configurable retention + consent versioning from day one; legal review required before launch |
| Is a native mobile app required, or is mobile-web sufficient? | Affects frontend/offline architecture | Mobile-first responsive web + PWA for offline check-in in MVP; native app is P2 |
| Background-check provider identity | Vendor contract dependency | Out of scope for this plan; integrate via adapter interface, store status/date/reference only |
| Exact volunteer volume / peak concurrency (10s, 100s, 10,000s of check-ins/hour) | Drives DB/infra sizing | Design for a modular monolith scaling to ~50k volunteers / ~5k concurrent check-ins; revisit if scale is materially larger |
| Multi-tenancy: one organization only, or SaaS for many organizations? | Major architecture decision (schema-per-tenant vs shared schema) | Assume **single organization** deployment per instance for MVP (PDF frames one "Organization" per platform); note SaaS multi-tenant as a P2 future path with `organization_id` already present in the schema to keep the door open |

### 1.10 Requirement → Module → Priority Traceability

| Req ID | Requirement | Module | Priority |
|---|---|---|---|
| FR-01 | One deduplicated volunteer profile | Volunteer/Identity | P0 |
| FR-02 | Searchable opportunities/events | Event & Opportunity | P0 |
| FR-03 | Configurable forms + conditional questions | Recruitment | P0 |
| FR-04 | Application approval workflows | Recruitment | P0 |
| FR-05 | Waivers, training, credential expiry | Onboarding | P0 |
| FR-06 | Roles, shifts, capacity, eligibility | Event & Opportunity | P0 |
| FR-07 | Registration + waitlists | Scheduling | P0 |
| FR-08 | Assignment + conflict prevention | Scheduling | P0 |
| FR-09 | Confirmations/reminders/change notices | Communications | P0 |
| FR-10 | Attendance capture (roster/QR/kiosk) | Attendance | P0 |
| FR-11 | Participation & hour approval | Participation Ledger | P0 |
| FR-12 | Rule-based verifiable certificates | Certificates | P0 |
| FR-13 | Role-based dashboards | Reporting | P0 |
| FR-14 | Role + scope permissions | Auth/Security | P0 |
| FR-15 | Audit logs / record history | Security/Audit | P0 |
| FR-16 | Recurring events & templates | Event & Opportunity | P1 |
| FR-17 | Group/guest/youth/guardian consent | Recruitment/Onboarding | P1 |
| FR-18 | Feedback surveys, recognition rules | Recognition | P1 |
| FR-19 | Multi-site/multilingual | Platform-wide | P1 |
| FR-20 | CRM/identity/calendar/messaging integration | Integrations | P1 |
| FR-21 | Offline check-in + sync | Attendance | P1 |
| FR-22 | Transparent opportunity recommendations | Reporting/Matching | P2 |
| FR-23 | Shift demand forecasting | Reporting | P2 |
| FR-24 | Credential wallets / verification APIs | Certificates | P2 |

---

## 2. ARCHITECTURE

### 2.1 Architectural Style

**DECISION REQUIRED (recommended default): Modular monolith**, matching the PDF's own recommendation (§8) — simpler operations than microservices while preserving clean domain boundaries (Volunteer, Event, Participation, Certificate, Communication, Reporting modules), each behind its own service layer/interface so a high-load component (e.g., check-in, notifications) can be extracted later without a rewrite.

### 2.2 Component Diagram (ASCII)

```
                         ┌───────────────────────────────────────────┐
                         │            CLIENT SURFACES                 │
                         │                                             │
                         │  [Volunteer Web/PWA]   [Coordinator Admin]  │
                         │  [Supervisor Check-in]  [Public Cert Verify]│
                         └───────────────────┬─────────────────────────┘
                                             │ HTTPS/TLS 1.2+
                                             ▼
                         ┌───────────────────────────────────────────┐
                         │        API GATEWAY + IDENTITY LAYER         │
                         │  - AuthN (JWT/OIDC), AuthZ (RBAC+scope)     │
                         │  - Rate limiting, request validation        │
                         │  - API versioning (/api/v1/...)             │
                         └───────────────────┬─────────────────────────┘
             ┌──────────────┬────────────────┼─────────────────┬───────────────┐
             ▼              ▼                ▼                 ▼               ▼
     ┌───────────────┐┌───────────────┐┌───────────────┐┌──────────────┐┌───────────────┐
     │ Volunteer &   ││ Event &       ││ Participation ││ Recognition & ││ Communication │
     │ Onboarding    ││ Scheduling    ││ Ledger        ││ Certificate   ││ Module        │
     │ Module        ││ Module        ││ Module        ││ Module        ││               │
     └───────┬───────┘└───────┬───────┘└───────┬───────┘└───────┬───────┘└───────┬───────┘
             │                │                │                │                │
             └────────┬───────┴────────┬───────┴────────┬───────┴────────┬───────┘
                       ▼                ▼                ▼                ▼
              ┌─────────────────┐ ┌──────────────┐ ┌────────────────┐ ┌───────────────┐
              │ Relational DB    │ │ Object Store  │ │ Queue + Workers │ │ Search Index  │
              │ (Postgres)       │ │ (S3-compat.)  │ │ (async jobs)    │ │ (opportunities│
              │ transactional    │ │ waivers,      │ │ reminders,      │ │  + volunteers)│
              │ source of truth  │ │ certificates  │ │ cert-gen,       │ │               │
              └─────────────────┘ └──────────────┘ │ sync, retries    │ └───────────────┘
                                                    └────────┬────────┘
                                                             ▼
                                       ┌─────────────────────────────────┐
                                       │ External: Email/SMS/Push, SSO,   │
                                       │ Calendar, CRM, Background-check, │
                                       │ E-signature providers            │
                                       └─────────────────────────────────┘

              Cross-cutting (all modules): Audit Service · Observability
              (structured logs, metrics, traces) · Analytics Store (de-identified)
```

### 2.3 Component Interactions (summary)

- **Gateway** is the single entry point; every request is authenticated, scoped, versioned, and rate-limited before reaching a module.
- Modules communicate through well-defined internal service interfaces (in-process function calls in the monolith, not shared tables) — this is what keeps future extraction possible.
- Only the **Participation Ledger module** may write finalized participation records; only the **Certificate module** may issue/revoke certificates, and only from finalized ledger entries (enforces BR-06/BR-07 at the architecture level, not just business logic).
- **Queue + Workers** decouple slow/external operations (sending email/SMS, generating PDFs, syncing offline check-ins, calling third-party APIs) from user-facing request latency.
- **Audit Service** subscribes to domain events (approval, override, permission change, certificate issue/revoke) and writes append-only records independent of primary business tables.

### 2.4 Auth/Storage/Jobs/Notifications/Logging — see §5 (Auth+Security), §4 (Database), §9 (workflow automation table), §11 (DevOps).

---

## 3. BACKEND

### 3.1 Pattern

**DECISION REQUIRED (recommended default):** Layered architecture per module — **Controller → Service → Repository**, with a domain workflow engine (config-driven rule tables, not hardcoded per-event logic) sitting above Event/Onboarding/Participation/Certificate services, since the PDF explicitly calls for configurable eligibility/certificate/onboarding rules rather than fixed logic.

Stack recommendation (reasonable default, not from PDF, marked as decision):
- Backend: Node.js (NestJS) or Python (FastAPI/Django) — either satisfies the modular-monolith + workflow-engine pattern. **Pick one per team's existing skill set; this plan is framework-agnostic beyond this point.**
- DB: PostgreSQL (strong relational consistency needed per PDF §7).
- Queue: Redis + BullMQ, or RabbitMQ.
- Object storage: S3-compatible (AWS S3, MinIO for self-hosted).
- Search: PostgreSQL full-text initially; Elasticsearch/OpenSearch only if opportunity search volume justifies it (P1+).

### 3.2 Modules

`identity`, `volunteer-profile`, `recruitment`, `onboarding`, `event-scheduling`, `attendance`, `participation-ledger`, `certificate`, `recognition`, `communication`, `reporting`, `audit`, `admin-config`.

### 3.3 Middleware / Validation / Error Handling / Logging (cross-cutting, applies to every module)

- **Middleware chain:** request-id injection → auth (JWT verify) → scope resolution (org/site/role) → rate limit → schema validation → controller.
- **Validation:** schema-based (e.g., Zod/Pydantic) at the controller boundary; business-rule validation (capacity, eligibility, overlap) inside services, always inside a DB transaction for anything touching capacity/assignment.
- **Error handling:** standard error envelope (see below), no stack traces or internal identifiers leaked to clients; all 5xx logged with correlation ID.
- **Logging:** structured JSON logs, correlation ID per request, no PII in log bodies (reference IDs only).
- **API versioning:** URI-based (`/api/v1/...`); breaking changes require a new version, old version deprecated with a sunset header, not silently changed.

**Standard error response:**
```json
{
  "error": {
    "code": "CAPACITY_EXCEEDED",
    "message": "This shift has no remaining capacity.",
    "correlation_id": "8f1c...",
    "details": { "shift_id": "sh_123", "capacity": 20, "requested": 21 }
  }
}
```

**Pagination/filtering/sorting/search convention:**
`GET /api/v1/opportunities?page=1&page_size=20&sort=-start_date&status=open&site_id=...&q=text`
- Cursor-based pagination for high-write lists (attendance feeds); offset-based acceptable for admin lists.
- Rate limiting: token-bucket per user/IP, stricter on `/auth/*`, `/checkin/*`, and public `/certificates/verify/*`.

### 3.4 API Table (representative core set — not exhaustive; full CRUD implied per entity)

| Method | Endpoint | Purpose | Auth/Role | Request (key fields) | Response | Errors |
|---|---|---|---|---|---|---|
| POST | /api/v1/auth/register | Volunteer/staff signup | Public | email, password, name | 201 + user id | 409 duplicate |
| POST | /api/v1/auth/login | Login | Public | email, password / SSO token | 200 + access/refresh token | 401 |
| POST | /api/v1/auth/mfa/verify | MFA challenge | Authenticated (pending MFA) | code | 200 + token | 401 |
| GET | /api/v1/opportunities | Search/browse opportunities | Public/Volunteer | filters (skills, location, dates) | paginated list | 400 |
| POST | /api/v1/applications | Submit application | Volunteer | opportunity_id, form answers, docs | 201 | 400, 409 duplicate |
| PATCH | /api/v1/applications/{id}/review | Approve/reject/waitlist | Coordinator | decision, notes | 200 | 403 scope, 404 |
| POST | /api/v1/onboarding/{volunteerId}/requirements/{reqId}/submit | Submit waiver/training/doc | Volunteer | payload/doc ref | 200 | 400 |
| PATCH | /api/v1/onboarding/{volunteerId}/requirements/{reqId} | Approve/waive/reject requirement | Coordinator | status | 200 | 403 |
| POST | /api/v1/events | Create event | Event Manager | name, program, venues | 201 | 400 |
| POST | /api/v1/events/{id}/shifts | Create role/shift | Event Manager | role, capacity, eligibility rules | 201 | 400 |
| POST | /api/v1/registrations | Register for opportunity/shift | Volunteer | shift_id | 201 / 202 waitlisted | 409 conflict, 422 ineligible |
| POST | /api/v1/registrations/{id}/assign | Assign/confirm | Coordinator | shift_id | 200 | 409 capacity/overlap |
| POST | /api/v1/checkin | Check in (QR/kiosk/roster) | Supervisor/Volunteer | assignment_id, method, timestamp | 200 | 409 duplicate, 403 scope |
| POST | /api/v1/checkout | Check out | Supervisor/Volunteer | assignment_id, timestamp | 200 | 400 |
| GET | /api/v1/participation/{volunteerId} | View participation ledger | Volunteer(self)/Coordinator(scoped) | — | list | 403 |
| PATCH | /api/v1/participation/{id}/approve | Approve hours | Supervisor/Coordinator | approved_hours, notes | 200 | 403, 409 already finalized |
| POST | /api/v1/participation/{id}/adjust | Adjustment entry on finalized record | Coordinator (elevated) | reason, delta | 201 | 403 |
| POST | /api/v1/certificates/issue | Trigger certificate generation | System (auto) / Coordinator (manual) | participation_id | 201 | 422 rule not met |
| POST | /api/v1/certificates/{id}/revoke | Revoke certificate | Coordinator | reason | 200 | 404 |
| GET | /api/v1/certificates/verify/{serial} | Public verification | Public | — | minimal status payload | 404 |
| GET | /api/v1/reports/operational | Operational dashboard data | Coordinator/Leadership | filters | aggregated data | 403 |
| GET | /api/v1/reports/strategic | Strategic metrics | Leadership | filters, date range | aggregated data | 403 |
| GET | /api/v1/audit-logs | Query audit trail | Auditor/Admin | filters | paginated list | 403 |

---

## 4. DATABASE

### 4.1 ER-Style Relationship Description

```
ORGANIZATION 1───* PROGRAM 1───* EVENT 1───* OPPORTUNITY 1───* ROLE 1───* SHIFT
VOLUNTEER 1───* APPLICATION *───1 OPPORTUNITY
VOLUNTEER 1───* REGISTRATION *───1 SHIFT
VOLUNTEER 1───* ASSIGNMENT *───1 SHIFT           (Assignment = confirmed registration)
ASSIGNMENT 1───0..1 ATTENDANCE                   (one attendance record per assignment)
VOLUNTEER 1───* PARTICIPATION *───1 EVENT        (approved contribution ledger)
PARTICIPATION 1───0..* CERTIFICATE               (certificate derived from approved participation)
VOLUNTEER 1───* RECOGNITION
VOLUNTEER 1───* CREDENTIAL                       (training/background-check status/licenses)
VOLUNTEER 1───* CONSENT_RECORD
ANY_ENTITY 1───* AUDIT_LOG                       (append-only, polymorphic reference)
```

### 4.2 Core Tables (representative — key fields, types, constraints)

**volunteer**
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | immutable internal identity (BR-01) |
| org_id | UUID FK → organization | |
| email | citext UNIQUE | not the PK — supports email changes |
| full_name | text | |
| date_of_birth | date | drives age-eligibility rules |
| status | enum(active, inactive, suspended) | |
| created_at, updated_at | timestamptz | |
| deleted_at | timestamptz NULL | soft delete for retention workflows |

**contact_detail** (separate from volunteer per PDF data-design principle: "store contact details separately from program participation")
| id PK, volunteer_id FK, phone, address, emergency_contact_json, preferred_language |

**consent_record**
| id PK, volunteer_id FK, consent_type, version, wording_snapshot, channel, granted_at, withdrawn_at NULL |
Append-only; withdrawal is a new row, not an update (audit integrity).

**credential**
| id PK, volunteer_id FK, type(training/background_check/license), status(not_started/pending/submitted/approved/rejected/expired/waived), issued_at, expires_at, provider_reference — **note: full background-check reports are NOT stored, only status/date/reference per PDF §10 "Special protections"** |

**event** / **opportunity** / **role** / **shift**
Hierarchical as modeled in PDF §4.4/§7 table. `shift` holds: `capacity_min`, `capacity_max`, `starts_at`, `ends_at` (stored UTC + `timezone` context field), `site_id`, `eligibility_rules_json` (age, credential, role prerequisites — versioned per event so past assignments preserve rules active at the time, per PDF data-design principle).

**registration**
| id PK, volunteer_id FK, shift_id FK, status enum(interested,applied,eligible,registered,waitlisted,assigned,confirmed,checked_in,completed,approved,cancelled), created_at |
UNIQUE(volunteer_id, shift_id) WHERE status NOT IN (cancelled) — prevents duplicate active registration.

**assignment**
| id PK, registration_id FK, shift_id FK, volunteer_id FK, status |
Constraint (enforced in service transaction, not just DB): no overlapping `[starts_at, ends_at)` ranges for same volunteer across active assignments — implemented via exclusion constraint `EXCLUDE USING gist (volunteer_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status != 'cancelled')`.

**attendance**
| id PK, assignment_id FK UNIQUE (0..1 relationship), method enum(roster,qr,kiosk,self,nfc,offline), checked_in_at, checked_out_at, status enum(checked_in,checked_out,late,no_show,excused) |
Idempotency key on (assignment_id, method, checked_in_at truncated to minute) to prevent duplicate QR scans creating duplicate rows (critical acceptance case from PDF §14).

**participation**
| id PK, volunteer_id FK, event_id FK, assignment_id FK NULL (may be null for approved remote hours per BR-04), scheduled_hours, checkin_time, checkout_time, break_minutes, credited_hours, status enum(draft,submitted,supervisor_approved,finalized,locked), approved_by FK, evidence_ref, certifies_eligible boolean |

**participation_adjustment** (append-only, never overwrites `participation`)
| id PK, participation_id FK, reason, delta_hours, previous_snapshot_json, new_snapshot_json, actor_id FK, created_at |

**certificate**
| id PK, participation_id FK, serial UNIQUE (random, unguessable — not sequential), template_id, issued_snapshot_json (immutable), status enum(valid,revoked,superseded,expired), issued_at, verification_url |

**recognition**
| id PK, volunteer_id FK, type(milestone,badge,nomination,award), criteria_met_json, awarded_at |

**audit_log**
| id PK, entity_type, entity_id, actor_id, action, previous_value_json, new_value_json, reason, created_at |
Append-only, no UPDATE/DELETE grants at DB-role level — enforced via DB permissions, not just app logic.

### 4.3 Data Integrity, Transactions, Backup

- All capacity/assignment/attendance writes wrapped in DB transactions with row-level locking (`SELECT ... FOR UPDATE` on shift capacity) to prevent race conditions (PDF critical acceptance case: "two simultaneous registrations cannot exceed capacity").
- Soft deletion (`deleted_at`) on `volunteer` and any entity subject to retention/legal-hold workflows; hard deletion only via a governed retention job after legal-hold check.
- Backup: automated daily full + continuous WAL archiving (Postgres), point-in-time recovery tested quarterly (see §11).
- Indexes: on all FKs, `(volunteer_id, status)` on registration/participation, `shift.starts_at` for calendar queries, `certificate.serial` unique index for verification lookups.

---

## 5. AUTH + SECURITY

### 5.1 Auth Flows

- **Registration/login:** email+password (bcrypt/argon2 hashed) or SSO/OIDC for staff.
- **MFA:** mandatory for Coordinator/Admin/Auditor roles; optional-but-encouraged for volunteers.
- **Password reset:** time-boxed signed token (15 min expiry), single-use, invalidates all other reset tokens on use.
- **Sessions:** short-lived access token (JWT, 15 min) + rotating refresh token (httpOnly, secure cookie), revocation list for compromised sessions.
- **Account protection:** progressive lockout/backoff after repeated failed logins, alert on new-device login for privileged roles.

### 5.2 Role-Permission Matrix (representative)

| Action | Volunteer | Group Leader | Coordinator | Event Manager | Site Supervisor | Communications | Leadership | Admin | Auditor |
|---|---|---|---|---|---|---|---|---|---|
| View own profile | ✅ | ✅ | ✅ | — | — | — | — | ✅ | — |
| View volunteers (org-wide) | — | — | ✅ | scoped | scoped by site/shift only | — | read-only aggregate | ✅ | read-only |
| Approve applications | — | — | ✅ | — | — | — | — | ✅ | — |
| Create events/shifts | — | — | — | ✅ | — | — | — | ✅ | — |
| Check-in volunteers | — | — | — | — | ✅ (scoped) | — | — | ✅ | — |
| Approve hours | — | — | ✅ (scoped) | — | ✅ (scoped) | — | — | ✅ | — |
| Issue/revoke certificates | — | — | ✅ | — | — | — | — | ✅ | — |
| Send communications | — | — | ✅ | ✅ | — | ✅ | — | ✅ | — |
| View strategic reports | — | — | — | — | — | — | ✅ | ✅ | — |
| View audit logs | — | — | — | — | — | — | — | ✅ | ✅ |
| Manage permissions/config | — | — | — | — | — | — | — | ✅ | — |

### 5.3 Threat Model

| Threat | Risk | Mitigation | Implementation Point |
|---|---|---|---|
| SQL Injection | High | Parameterized queries/ORM only, no raw string concat | Repository layer |
| XSS | Medium-High | Output encoding, CSP headers, sanitize rich-text fields (feedback, notes) | Frontend render + API output encoding |
| CSRF | Medium | SameSite=strict cookies, CSRF tokens on state-changing form posts | Gateway/middleware |
| CORS misconfig | Medium | Explicit allow-list of origins, no wildcard with credentials | Gateway |
| Broken auth / session hijack | High | Short-lived JWT, rotation, MFA on privileged roles, device binding | Identity service |
| Privilege escalation / scope bypass | High | Scope check enforced server-side on every query (site_id/org_id filters in repository layer, not just UI) | Service + Repository layer |
| API abuse / scraping | Medium | Rate limiting, pagination caps, WAF | Gateway |
| Certificate enumeration/fraud | High | Random unguessable serials, revocation status, audit trail (PDF critical case) | Certificate module |
| Secrets in code | High | Vault/secret manager, no secrets in repo/env files committed | CI/CD + runtime config |
| Insecure file uploads | Medium-High | Type/size validation, virus scan, private bucket, signed expiring URLs | Onboarding document upload |
| Sensitive data exposure (health/background-check) | High | Field-level compartmentalization, encryption at rest, access logging | DB schema + audit service |
| Dependency vulnerabilities | Medium | Automated SCA scanning in CI (e.g., Dependabot/Snyk) | CI/CD pipeline |
| Data loss | High | Automated backups, PITR, quarterly restore drills | DevOps |
| Insufficient logging for incident response | Medium | Centralized structured logs, immutable audit log, alerting | Observability layer |

### 5.4 Additional Controls

- TLS 1.2+ everywhere; HSTS; secure headers (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy).
- Biometric attendance: **not implemented** unless a separate legal/necessity review approves it (PDF explicit caution).
- Background-check data: only status/date/provider-reference stored; full report stays with the external provider (PDF §10).

---

## 6. SYSTEM FLOWS

### 6.1 Registration & Assignment Flow

```
Volunteer → Frontend (opportunity list) → API (GET /opportunities)
  → Volunteer selects shift → API (POST /registrations)
  → Auth/Scope check → Scheduling Service:
        - lock shift row
        - check capacity, eligibility_rules_json, overlap exclusion constraint
        - if capacity available: status=registered/assigned
        - else: status=waitlisted
  → DB commit → Queue: send confirmation/waitlist notification
  → Response to Frontend (200/202)
```

### 6.2 Check-in → Hours → Certificate Flow

```
Supervisor/Volunteer → Frontend (QR scan / kiosk / roster)
  → API (POST /checkin) → idempotency check → Attendance record created
  → (event ends) → Coordinator/Supervisor reviews → API (PATCH /participation/{id}/approve)
  → Participation status: draft → submitted → supervisor_approved → finalized
  → Workflow Engine trigger: "hours approved" + "certificate rule satisfied"
  → Certificate Service: generate PDF, unique serial, immutable snapshot → store in Object Storage
  → Queue: notify volunteer "certificate available"
  → Public verification page reachable via serial/QR
```

---

## 7. FRONTEND — GOOGLE STITCH-DRIVEN DESIGN

### 7.1 UX Principles (from PDF, translated into design direction)

The UI must reflect the platform's actual identity — a lifecycle system for real people volunteering, not a generic admin CRUD dashboard. Direction: warm, purposeful, community-oriented visual language; avoid generic blue/purple "AI SaaS" gradients, glassmorphism, and repetitive card grids. Certificate and recognition surfaces in particular should feel earned and credible, not templated.

### 7.2 Stitch Design Process

```
Requirements (this plan, §1) → User Journeys (§7.4) → UX wireframes
  → Google Stitch exploration (multiple visual directions per key screen)
  → Stitch refinement (narrow to one direction, apply design tokens)
  → Approved design → Frontend implementation (component library)
  → Visual QA (against approved Stitch frames + accessibility audit)
```

**DECISION REQUIRED:** Exact visual identity (color palette, typography, illustration style) is a design decision to be made *inside* Stitch exploration with stakeholders — this plan defines the functional screens and states Stitch must cover, not the final palette.

### 7.3 Design Direction Constraints (explicit avoid-list from PDF)

Avoid: generic sidebar+card dashboards, generic blue/purple AI styling, excessive glassmorphism, repetitive card walls, template-like event pages, unnecessary animation.

### 7.4 User Journeys by Role

- **Prospective volunteer:** discover opportunity → apply → track application status → onboard → get approved.
- **Approved volunteer:** browse/search opportunities → register for shift → receive reminders → check in → view hours → download certificate → see recognition/milestones.
- **Group leader:** register a group → manage member roster → track group attendance/hours.
- **Coordinator:** review application queue → approve/reject/waitlist → monitor onboarding completion → manage recognition.
- **Event manager:** create event → define roles/shifts/capacity → publish → monitor fill rate.
- **Site supervisor:** view today's roster (scoped) → check in/out volunteers → approve hours on-site.
- **Leadership:** view strategic dashboard (retention, impact, conversion) — read-only.
- **Certificate verifier (public, no login):** enter/scan serial → see minimal validity status.

### 7.5 Screen Table (representative core set)

| Screen | Role | Purpose | Key Info | Actions | API Dependencies | States |
|---|---|---|---|---|---|---|
| Opportunity Portal | Public/Volunteer | Discover opportunities | title, dates, location, eligibility | search, filter, apply | GET /opportunities | loading, empty, error, populated |
| Application Form | Volunteer | Apply to opportunity | conditional questions, consent | submit, save-draft | POST /applications | validation-error, submitted, duplicate-detected |
| Application Review Queue | Coordinator | Process applications | applicant summary, docs | approve/reject/waitlist/request-info | PATCH /applications/{id}/review | empty-queue, loading |
| Onboarding Checklist | Volunteer | Complete requirements | requirement statuses | upload doc, sign waiver | POST /onboarding/.../submit | incomplete, pending-review, approved, expired |
| Volunteer Profile | Volunteer/Coordinator(scoped) | View lifecycle record | identity, history, credentials (compartmentalized) | edit (self), view (staff, scoped) | GET /volunteers/{id} | restricted-field-masked |
| Event Builder | Event Manager | Create event/roles/shifts | capacity, eligibility rules | create, clone template | POST /events, /shifts | draft, published |
| Shift Registration | Volunteer | Register/select shift | capacity remaining, requirements met | register, join waitlist | POST /registrations | full-waitlist-available, ineligible-blocked |
| Coordinator Roster | Coordinator/Event Manager | Manage assignments | registrations by status | assign, transfer, cancel | GET/PATCH /registrations | conflict-warning |
| Supervisor Check-in | Site Supervisor | Check in/out volunteers on-site | today's roster (scoped) | scan QR / manual confirm | POST /checkin, /checkout | offline-mode, sync-pending |
| Hours Approval | Supervisor/Coordinator | Approve participation | scheduled vs actual hours | approve, adjust (with reason) | PATCH /participation/{id}/approve | disputed, finalized-locked |
| Certificate Center | Volunteer | View/download certificates | issued certificates | download, share verification link | GET /certificates | none-yet, revoked-notice |
| Public Verification Page | Public | Verify certificate | minimal status | lookup by serial | GET /certificates/verify/{serial} | valid, revoked, not-found |
| Recognition Wall | Volunteer/Coordinator | View milestones/badges | equity-aware achievements | nominate (coordinator) | GET/POST /recognition | empty, populated |
| Leadership Dashboard | Leadership | Strategic overview | conversion, fill-rate, retention | filter by program/date | GET /reports/strategic | loading, empty |
| Audit Log Viewer | Auditor/Admin | Compliance review | action history | filter/export | GET /audit-logs | restricted-access-denied |

### 7.6 Stitch Screen → Component → API → Service → DB Mapping (example)

```
Stitch: "Shift Registration" screen
  → Frontend Component: <ShiftRegistrationCard/>
    → API: POST /api/v1/registrations
      → Backend Service: SchedulingService.register()
        → Repository: RegistrationRepository, ShiftRepository (row lock)
          → DB: shift, registration tables (transaction)
```

### 7.7 Responsive & Accessibility

- Mobile-first (primary volunteer usage is on-site/on-phone); tablet optimized for kiosk/supervisor check-in; desktop optimized for coordinator/admin/leadership dense views.
- WCAG 2.2 AA: keyboard navigation, focus states, color-contrast tokens, screen-reader labels on all icon-only actions, error messages linked to fields via `aria-describedby`.
- Explicit loading/empty/error/success states required for every screen in the table above (not optional polish) — since offline check-in and pending approvals are core to this domain.

---

## 8. PROJECT STRUCTURE

```
volunteer-platform/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── identity/            # auth, sessions, MFA
│   │   │   ├── volunteer-profile/
│   │   │   ├── recruitment/
│   │   │   ├── onboarding/
│   │   │   ├── event-scheduling/
│   │   │   ├── attendance/
│   │   │   ├── participation-ledger/
│   │   │   ├── certificate/
│   │   │   ├── recognition/
│   │   │   ├── communication/
│   │   │   ├── reporting/
│   │   │   ├── audit/
│   │   │   └── admin-config/
│   │   ├── common/                  # middleware, error envelope, validation
│   │   ├── workers/                 # queue consumers (reminders, cert-gen, sync)
│   │   └── main.ts / app entry
│   ├── migrations/
│   └── test/
├── frontend/
│   ├── apps/
│   │   ├── volunteer-portal/
│   │   ├── coordinator-admin/
│   │   ├── supervisor-checkin-pwa/   # offline-capable
│   │   └── public-verify/
│   ├── packages/
│   │   ├── design-system/           # Stitch-derived tokens/components
│   │   └── shared-api-client/
├── database/
│   ├── schema/
│   └── seed/
├── infrastructure/
│   ├── terraform/ (or IaC of choice)
│   ├── ci-cd/
│   └── monitoring/
└── docs/
```

---

## 9. TESTING

### 9.1 Test Types & Coverage Matrix

| Area | Unit | Integration | API | DB | E2E | Security | Performance |
|---|---|---|---|---|---|---|---|
| Auth/RBAC | ✅ | ✅ | ✅ | — | ✅ | ✅ | — |
| Scheduling/capacity | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Attendance/check-in | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (replay) | ✅ (peak) |
| Participation ledger | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Certificate issuance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (enumeration) | — |
| Communications | ✅ | ✅ | ✅ | — | — | — | — |
| Reporting | ✅ | ✅ | ✅ | ✅ | — | ✅ (data leakage) | ✅ |

### 9.2 Critical Acceptance Cases (from PDF §14 — mandatory, non-negotiable)

1. A volunteer cannot register for a role without required credentials.
2. Two simultaneous registrations cannot exceed capacity (row-lock/transaction test).
3. The same volunteer cannot be assigned to overlapping shifts.
4. A repeated QR scan cannot create duplicate attendance.
5. A supervisor cannot view volunteers outside assigned scope.
6. A certificate cannot be issued from unapproved/unfinalized hours.
7. A revoked certificate displays the correct public status.
8. Offline attendance synchronizes without duplicating records.
9. Consent withdrawal stops non-essential communications.
10. Every manual override records actor, time, previous value, new value, and reason.

### 9.3 UAT

Pilot with one real program (per Phase 0 recommendation) — coordinators and supervisors run a live event end-to-end before wider rollout.

---

## 10. PERFORMANCE + OBSERVABILITY

- **Targets (from PDF NFRs):** 99.9%+ monthly availability; pages <2s at p95; check-in acknowledgment <1s online.
- **Caching:** opportunity search results, dashboard aggregates (short TTL); no caching of participation/attendance writes (must be strongly consistent).
- **Background processing:** all notification sends, certificate PDF generation, and offline-sync reconciliation run via queue workers, never inline in the request path.
- **Scaling:** horizontal scaling of stateless API instances for peak registration windows and synchronized check-in periods (e.g., festival start time).
- **Observability:** structured logs + correlation IDs, metrics (request latency, queue depth, check-in throughput), health checks (`/healthz`, `/readyz`), alerting on error-rate/queue-backlog thresholds, distributed tracing **only if** the team splits modules into separate services later (not needed for MVP monolith).
- **Audit logs:** treated as an observability + compliance concern — retained per the org's configured retention schedule, immutable.

---

## 11. DEVOPS / DEPLOYMENT

- **Environments:** dev → staging → production, each with isolated DB and secrets.
- **Secrets management:** vault/secret-manager (not `.env` files in repo); rotated on schedule and on suspected compromise.
- **CI/CD:** on every PR — lint, unit tests, integration tests, SCA/dependency scan; on merge to main — build, migrate staging, run E2E smoke tests; manual/gated promotion to production.
- **DB migrations:** versioned, reversible where feasible, run as a distinct pipeline step before app deploy, never applied by the app on boot in production.
- **Deployment:** blue-green or rolling deploy to avoid downtime during check-in windows; feature flags for risky changes (e.g., new certificate rule engine version).
- **Rollback:** automated rollback to last known-good build + migration rollback plan documented per release.
- **HTTPS:** enforced everywhere, managed certificates, HSTS.
- **Backups:** automated DB backups + WAL archiving, tested restores quarterly (see §4.3).
- **Monitoring:** uptime checks, error-rate dashboards, queue-depth alerts, on-call escalation for check-in-day incidents specifically (highest business criticality window).
- **Infrastructure:** containerized services (Docker), orchestrated via managed Kubernetes or a simpler managed container platform — **DECISION REQUIRED**: choose based on team's existing ops maturity; a simpler managed PaaS (e.g., managed containers) is a reasonable default for an MVP-stage team to reduce ops burden.

---

## 12. PHASED IMPLEMENTATION PLAN

### Phase 0 — Discovery & Data Preparation

- **Objective:** Establish ground truth before building.
- **Prerequisites:** none.
- **Tasks:** map current workflows/exceptions; inventory existing forms/spreadsheets/systems; define authoritative source per data element; define roles/permissions/retention/consent policy; select pilot program.
- **Deliverables:** requirements sign-off, data-source inventory, pilot program selected.
- **Definition of Done:** stakeholders agree on scope, roles, and pilot program in writing.
- **Dependencies:** none (this phase blocks everything else).
- **Risks:** stakeholder misalignment on scope. **Mitigation:** written sign-off before Phase 1 starts.

### Phase 1 — Foundation (Database + Core Backend + Auth)

- **Objective:** Build the authoritative data model and identity layer.
- **Prerequisites:** Phase 0 sign-off.
- **Frontend tasks:** none yet (API-first).
- **Backend tasks:** volunteer-profile, identity, event-scheduling core services and repositories.
- **Database tasks:** implement schema in §4 (volunteer, contact_detail, consent_record, credential, event/opportunity/role/shift, registration, assignment).
- **Security tasks:** auth flows, MFA, RBAC+scope middleware.
- **Testing tasks:** unit + integration tests for capacity/overlap constraints (critical acceptance cases 1–3).
- **Deliverables:** working auth, volunteer CRUD, event/shift CRUD via API.
- **DoD:** all Phase 1 critical acceptance tests pass in CI.
- **Dependencies:** Phase 0.
- **Risks:** underestimating eligibility-rule complexity. **Mitigation:** model `eligibility_rules_json` as versioned/configurable from the start, not hardcoded.

### Phase 2 — Recruitment, Onboarding, Scheduling Engine

- **Objective:** Complete the pre-event lifecycle.
- **Prerequisites:** Phase 1.
- **Backend tasks:** recruitment, onboarding modules; workflow engine triggers table (§ workflow automation).
- **Database tasks:** application, onboarding-requirement tracking tables.
- **Frontend tasks:** Stitch exploration begins for Opportunity Portal, Application Form, Onboarding Checklist, Event Builder (design track runs in parallel with backend).
- **Security tasks:** document upload security (private storage, signed URLs, virus scan).
- **Testing tasks:** critical acceptance case 1 (credential-gated registration) end-to-end.
- **Deliverables:** functioning application → onboarding → approval pipeline.
- **DoD:** a volunteer can apply, complete onboarding, and become eligible for restricted roles only when requirements are met.
- **Dependencies:** Phase 1.
- **Risks:** onboarding rule complexity varies wildly per program. **Mitigation:** config-driven requirement templates, not per-program code branches.

### Phase 3 — Attendance & Participation Ledger

- **Objective:** Build the auditable record of what actually happened.
- **Prerequisites:** Phase 2 (need assignments to check in against).
- **Backend tasks:** attendance module (roster/QR/kiosk/self methods), participation-ledger module with status pipeline and adjustment-entry model.
- **Database tasks:** attendance, participation, participation_adjustment tables + idempotency keys.
- **Frontend tasks:** Supervisor Check-in PWA (offline-capable), Hours Approval screen.
- **Security tasks:** scope enforcement for supervisor visibility (critical acceptance case 5).
- **Testing tasks:** duplicate-scan prevention, offline-sync-without-duplication (critical acceptance cases 4, 8).
- **Deliverables:** end-to-end check-in → hours approval flow, offline-capable.
- **DoD:** all Phase 3 critical acceptance cases pass, including simulated poor-connectivity sync.
- **Dependencies:** Phase 2.
- **Risks:** offline conflict resolution is genuinely hard. **Mitigation:** design conflict resolution rules explicitly (last-writer-wins with audit trail) before building sync, not after.

### Phase 4 — Certificates & Recognition

- **Objective:** Automate trustworthy credentialing.
- **Prerequisites:** Phase 3 (needs finalized participation records).
- **Backend tasks:** certificate module (generation, serials, revoke/reissue), recognition module (equity-aware rules).
- **Database tasks:** certificate, recognition tables.
- **Frontend tasks:** Certificate Center, Public Verification Page, Recognition Wall.
- **Security tasks:** enumeration resistance on verification endpoint, minimal-disclosure verification payload.
- **Testing tasks:** critical acceptance cases 6, 7 (no cert from unapproved hours; correct revoked status).
- **Deliverables:** automated certificate issuance tied to approved participation only.
- **DoD:** certificate cannot be generated except from finalized participation; revoke/reissue verified in tests.
- **Dependencies:** Phase 3.
- **Risks:** certificate fraud/trust concerns. **Mitigation:** random serials + audit history + immutable snapshot, as specified in §4/§5.

### Phase 5 — Communications, Reporting, Admin

- **Objective:** Close the loop with engagement and visibility.
- **Prerequisites:** Phases 2–4 producing events to report on/communicate about.
- **Backend tasks:** communication module (templated, consent-linked), reporting module (operational + strategic, with small-group suppression).
- **Database tasks:** message templates/logs, analytics views (de-identified where required).
- **Frontend tasks:** Leadership Dashboard, Audit Log Viewer, admin configuration screens.
- **Security tasks:** consent-withdrawal enforcement (critical acceptance case 9), audit-log immutability (case 10).
- **Testing tasks:** consent withdrawal blocks non-essential messages; manual overrides always logged with actor/reason.
- **Deliverables:** working dashboards, communications pipeline, audit visibility.
- **DoD:** all remaining critical acceptance cases pass; reports match manually-verified sample data.
- **Dependencies:** Phases 2–4.
- **Risks:** demographic reporting privacy risk. **Mitigation:** small-group suppression enforced in the reporting service, not left to dashboard filters.

### Phase 6 — Integration, Hardening, Migration, Launch Readiness

- **Objective:** Production readiness.
- **Prerequisites:** Phases 1–5 functionally complete.
- **Tasks:** third-party integrations (email/SMS/SSO/calendar as prioritized), full security review (OWASP pass), performance/load testing at expected peak, legacy data migration per §15 sequence, backup/restore drill, accessibility audit (WCAG 2.2 AA), pilot go-live with the Phase 0 selected program.
- **Deliverables:** production deployment, migrated pilot data, monitoring/alerting live.
- **DoD:** pilot program runs one full live event end-to-end successfully; all Master Checklist (§16) items signed off.
- **Dependencies:** all prior phases.
- **Risks:** legacy data quality. **Mitigation:** staged migration with reconciliation and manual approval gate before cutover (§15).

---

## 13. DEVELOPER TASK BREAKDOWN (representative sample per phase)

| ID | Task | Area | Dependency | Priority | Output |
|---|---|---|---|---|---|
| DB-001 | Implement volunteer, contact_detail, consent_record schema | DB | Phase 0 sign-off | P0 | Migration files |
| DB-002 | Implement event/opportunity/role/shift schema w/ eligibility_rules_json | DB | DB-001 | P0 | Migration files |
| DB-003 | Implement registration/assignment w/ exclusion constraint | DB | DB-002 | P0 | Migration + constraint test |
| SEC-001 | Implement JWT auth + refresh rotation | Security | DB-001 | P0 | Identity service |
| SEC-002 | Implement RBAC+scope middleware | Security | SEC-001 | P0 | Middleware module |
| BE-001 | Volunteer profile CRUD service | Backend | DB-001, SEC-002 | P0 | API endpoints |
| BE-002 | Event/shift CRUD + capacity-locking service | Backend | DB-002/003 | P0 | API endpoints |
| BE-003 | Registration/waitlist service | Backend | BE-002 | P0 | API endpoints |
| TEST-001 | Concurrency test: capacity race condition | Testing | BE-002 | P0 | CI test suite |
| FE-001 | Volunteer profile screen (Stitch-approved) | Frontend | BE-001, Stitch design | P0 | Component |
| FE-002 | Opportunity portal + search (Stitch-approved) | Frontend | BE-003, Stitch design | P0 | Component |
| BE-004 | Onboarding requirement engine | Backend | BE-001 | P0 | API endpoints |
| DB-004 | Onboarding requirement/credential tables | DB | DB-001 | P0 | Migration |
| BE-005 | Attendance service w/ idempotent check-in | Backend | BE-003 | P0 | API endpoints |
| FE-003 | Supervisor check-in PWA (offline) | Frontend | BE-005 | P0 | PWA build |
| TEST-002 | Duplicate-scan and offline-sync tests | Testing | BE-005, FE-003 | P0 | CI + manual QA |
| BE-006 | Participation ledger + adjustment entries | Backend | BE-005 | P0 | API endpoints |
| BE-007 | Certificate generation + revoke/reissue | Backend | BE-006 | P0 | API + PDF worker |
| SEC-003 | Certificate verification enumeration hardening | Security | BE-007 | P0 | Rate limit + random serials |
| BE-008 | Recognition rule engine (equity-weighted) | Backend | BE-006 | P1 | API endpoints |
| BE-009 | Communication templates + consent linkage | Backend | BE-001 | P0 | Notification service |
| DEVOPS-001 | CI/CD pipeline w/ SCA scanning | DevOps | Phase 1 start | P0 | Pipeline config |
| DEVOPS-002 | Backup/restore automation + drill | DevOps | DB-001 | P0 | Runbook + test evidence |
| BE-010 | Reporting service w/ small-group suppression | Backend | BE-006 | P0 | API endpoints |
| FE-004 | Leadership dashboard (Stitch-approved) | Frontend | BE-010 | P1 | Component |

**Parallelizable:** FE-00x (Stitch design track) can run parallel to BE-00x once API contracts are agreed; DEVOPS-001/002 run parallel to all backend phases.
**Blocking:** DB-001→DB-002→DB-003 sequential; BE-005 blocks BE-006 blocks BE-007 (ledger integrity chain, cannot be parallelized).

---

## 14. MVP ROADMAP

**Must-have MVP (P0 — matches PDF Phase 1 "Minimum viable platform"):** volunteer account/profile, opportunity portal, configurable application forms, application review, event/role/shift/capacity management, individual registration + waitlists, email confirmations/reminders, supervisor roster + QR check-in, participation + hour approval, basic certificate generation + verification, operational dashboards, RBAC + audit logs.

**Required but later (P1 — PDF Phase 2 "Operational maturity"):** group/youth registration + guardian consent, recurring events, training/credential expiry tracking, kiosk + offline check-in, SMS/push messaging, recognition/milestone rules, feedback surveys, advanced reports, CRM/calendar/SSO integrations.

**Optional/future (P2 — PDF Phase 3 "Optimization"):** transparent opportunity recommendations, staffing/demand forecasting, supportive-only no-show risk signals, skills-gap analysis, advanced impact measurement, credential wallets/verification APIs, multi-organization administration, data-warehouse/BI integration.

---

## 15. TECHNICAL DECISIONS + RISKS

### 15.1 Key Decisions

| Decision | Options | Recommendation | Reason | Trade-off |
|---|---|---|---|---|
| Architecture style | Microservices / Modular monolith / Monolith | Modular monolith | Matches PDF §8 recommendation; simpler ops for expected scale | Must enforce discipline to keep module boundaries clean, or future extraction is harder |
| Database | Postgres / MySQL / NoSQL | PostgreSQL | Strong relational consistency required for capacity/registration/certificates (PDF §7) | NoSQL would need extra app-level integrity logic — not worth it here |
| Multi-tenancy | Single-org / SaaS multi-tenant | Single organization per deployment, `organization_id` present for future-proofing | PDF frames one organization; no stated need for SaaS multi-tenancy | Revisit schema-per-tenant vs shared if SaaS ambitions emerge |
| Mobile strategy | Native app / PWA / Responsive web | Mobile-first responsive + PWA offline check-in | Meets offline requirement without native app overhead in MVP | Native app (P2) would give better offline reliability/push if volume grows |
| Payments | Build in / Hosted checkout / Omit | Omit from MVP; hosted checkout (e.g., Stripe Checkout) if ever needed | PDF explicitly treats payment as optional/secondary to volunteer lifecycle | Revisit only if paid-ticket events are introduced |
| Biometric attendance | Build / Don't build | Don't build in MVP | PDF explicit caution; unresolved legal/necessity questions | Revisit only with dedicated legal/privacy review |

### 15.2 Risk Register

| Risk | Probability | Impact | Severity | Mitigation | Contingency |
|---|---|---|---|---|---|
| Low staff adoption | Medium | High | High | Co-design workflows with coordinators, pilot program, role-based training | Extended pilot period before full rollout |
| Poor legacy data quality | High | Medium | High | Deduplication + staged migration + reconciliation (§15 migration sequence) | Flag low-confidence records instead of blind import |
| Event-day connectivity failure | Medium | High | High | Offline rosters, encrypted local cache, later sync | Manual paper fallback procedure documented for worst case |
| Certificate fraud attempts | Low | High | Medium | Random serials, revocation, audit trail, rate-limited verification | Manual certificate audit process if anomaly detected |
| Scope creep beyond PDF | Medium | Medium | Medium | Strict P0/P1/P2 gates, all extras require decision sign-off | Re-baseline roadmap if scope expands |
| Privacy/regulatory misalignment | Medium | High | High | Legal review before launch on consent/retention/youth-data (per Requirement Gap §1.9) | Delay launch in affected jurisdiction until compliant |
| Overbooking/double-assignment bug | Low (with proper transaction design) | High | Medium | DB exclusion constraints + row locking (§4.3) tested under load | Manual coordinator correction workflow with adjustment-entry audit |

---

## 16. FINAL MASTER CHECKLIST

- [ ] **Requirements:** traceability table (§1.10) reviewed and signed off by stakeholders
- [ ] **Architecture:** module boundaries and diagram (§2) reviewed by engineering lead
- [ ] **Database:** schema (§4) migrated, constraints tested (capacity lock, overlap exclusion, idempotent attendance)
- [ ] **Backend:** all P0 modules implemented with error-envelope + logging conventions (§3)
- [ ] **APIs:** versioned, paginated, rate-limited, documented (§3.4)
- [ ] **Auth:** MFA on privileged roles, RBAC+scope enforced server-side (§5)
- [ ] **Security:** OWASP threat table (§5.3) mitigations verified, dependency scanning active in CI
- [ ] **Stitch/UI:** all core screens (§7.5) through Stitch exploration → approved design → implemented
- [ ] **Frontend:** responsive, WCAG 2.2 AA audited, all loading/empty/error/success states present
- [ ] **Integration:** email confirmed working end-to-end; SMS/SSO/calendar per priority (§1.7)
- [ ] **Testing:** all 10 critical acceptance cases (§9.2) passing in CI
- [ ] **Performance:** load-tested at expected peak registration/check-in concurrency
- [ ] **Monitoring:** health checks, alerting, and dashboards live in production
- [ ] **Deployment:** CI/CD, migrations, rollback plan, backups tested via restore drill
- [ ] **Documentation:** API docs, runbooks, data dictionary published
- [ ] **Production readiness:** pilot program (Phase 0 selection) has run one full live event successfully with no unresolved P0 defects

---

*End of master plan. All items marked DECISION REQUIRED should be resolved with stakeholders before or during the phase in which they first block progress — do not silently assume defaults for these in implementation.*
