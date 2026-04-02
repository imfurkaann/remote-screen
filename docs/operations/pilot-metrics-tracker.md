# Pilot Metrics Tracker

Date: 2026-04-01

## Purpose

Track Phase 14 pilot health in one place so the team can decide whether to continue, expand, or stop the pilot.

## Pilot Identity

- Pilot tenant:
- Pilot owner:
- Technical owner:
- Start date:
- Target end date:
- Screen count target: 10 to 20

## Daily Metrics

| Metric | Target | How to measure | Current value | Status |
| --- | --- | --- | --- | --- |
| Active screens | 10 to 20 | Connected screens with heartbeat in the last 24h |  |  |
| Playback success rate | >= 99.5% | Successful playback sessions divided by total sessions |  |  |
| Command success rate | >= 99.0% | Completed commands divided by dispatched commands |  |  |
| Sync latency p95 | <= 30 seconds | Time from publish to player activation |  |  |
| ACK within timeout | >= 95% | Commands acknowledged before timeout divided by total dispatched |  |  |
| Sev-1 incidents | 0 | Incident log count |  |  |
| Sev-2 incidents | <= 2 | Incident log count |  |  |

## Daily Check-In Questions

1. Are all pilot screens online and paired?
2. Did any playlist publish fail or lag unexpectedly?
3. Did any command time out, fail, or require retry?
4. Did any player lose reconnect recovery?
5. Did any incident require escalation or rollback?

## Decision Rules

- Continue the pilot if the daily metrics stay within threshold and no sev-1 incident occurs.
- Freeze rollout if command success or playback success drops below target.
- Stop the pilot if a sev-1 incident occurs or if the same sev-2 issue repeats without a fix.
- Expand only after the pilot owner signs off on the latest weekly review.

## Weekly Review Output

- Week number:
- Screens active:
- Playback success trend:
- Command success trend:
- Sync latency trend:
- Open blocker bugs:
- Decision: continue, pause, expand, or stop