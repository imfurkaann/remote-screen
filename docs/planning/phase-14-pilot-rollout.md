# Phase 14 Pilot Rollout

Date: 2026-04-01
Owner: Product, Customer Success, and Operations

## 1. Pilot Customer Profile

### Recommended ICP

- Multi-location SMB or mid-market customer.
- 10 to 20 screens in a single pilot wave.
- One operational owner and one technical contact.
- Willing to provide fast feedback during a 14-day window.
- Uses standard Android players and does not require custom hardware integrations.

### Disqualifiers

- Needs SSO, SCIM, or custom procurement before trialing.
- Requires large-scale rollout immediately.
- Cannot tolerate a staged canary or onboarding window.
- Lacks a responsible on-site or remote admin contact.

## 2. Pilot Scope

- Pair screens to the tenant.
- Publish playlists from the dashboard.
- Validate local-cache playback on Android devices.
- Validate remote commands and reconnect recovery.
- Monitor telemetry, offline state, and command completion.

## 3. Success Criteria

- Pilot sustains for 14 days.
- Playback success rate remains at or above MVP SLO target.
- Command success rate remains at or above MVP SLO target.
- Sync latency p95 stays within target after publish.
- No sev-1 incidents and no more than two sev-2 incidents.

## 4. Exit Criteria

- Pilot blocker bug list is closed or explicitly waived.
- Onboarding documentation is sufficient for the next customer.
- Pilot learnings are converted into follow-up backlog items.

## 5. Required Deliverables

- Pilot onboarding guide.
- Blocker tracking list.
- Daily success review template.
- End-of-pilot summary and next-step recommendation.