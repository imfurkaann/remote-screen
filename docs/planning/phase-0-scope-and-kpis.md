# Phase 0 Scope and Success Metrics

Date: 2026-04-01
Owner: Product and Architecture

## 1. Target Customer Segments

### SMB (10 to 100 screens)

- Multi-location cafes, clinics, gyms, retail stores.
- Needs: Simple setup, predictable pricing, quick content updates.
- Buying motion: Self-serve or light sales support.

### Mid-Market (100 to 1000 screens)

- Franchise networks, regional chains, education campuses.
- Needs: Fleet controls, role-based access, device health visibility.
- Buying motion: Sales-assisted with pilot expectation.

### Enterprise (1000+ screens)

- Large retail, transportation, hospitality, corporate comms.
- Needs: SSO, auditability, compliance, advanced deployment controls.
- Buying motion: Security/procurement-heavy, contract-based.

## 2. MVP Scope Boundaries

### In scope (must ship)

- Device pairing with 6-digit code and owner linking.
- Playlist and media management from dashboard.
- Android local-cache playback only (no direct streaming).
- Socket-driven content sync with reconnect and recovery.
- Remote commands: REBOOT_APP, SET_VOLUME, FORCE_REFRESH, SCREENSHOT.
- Basic observability: command success/fail, sync latency, playback failures.

### Out of scope (MVP)

- Marketplace/app ecosystem.
- Advanced analytics beyond operational metrics.
- Enterprise SSO/SAML.
- White-label and multi-region failover.

## 3. Post-MVP Scope

### Pro

- Advanced scheduling rules and approval workflows.
- Enhanced analytics (content performance and uptime trends).
- Team roles and delegated administration improvements.
- Better rollout controls (canary by group, staged rollout policy).

### Enterprise

- SSO/SAML and SCIM provisioning.
- Audit log export and compliance reporting.
- Strict tenant isolation validation suite.
- Expanded incident and DR controls.

## 4. Success KPIs

### Product KPIs

- Active Screens: number of connected screens with heartbeat in 24h.
- Playback Success Rate: successful playback sessions divided by total sessions.
- Command Success Rate: completed commands divided by dispatched commands.

### Operational SLO Targets (MVP)

- Playback Success Rate >= 99.5% daily.
- Command Success Rate >= 99.0% daily.
- Sync Latency p95 <= 30 seconds after playlist publish.

### Pilot Acceptance Targets

- 10 to 20 screen pilot sustained for 14 days.
- 0 sev-1 incidents and <= 2 sev-2 incidents.
- At least 95% of command actions acknowledged within timeout.
