# Regression Gate Checklist

Use this checklist before marking any feature or bug fix as complete.

## Functional Gate
- [ ] Acceptance criteria validated on target environments
- [ ] Negative cases validated
- [ ] Offline and reconnect behavior validated where applicable

## Test Gate
- [ ] Unit tests updated
- [ ] Integration tests updated
- [ ] E2E or flow tests updated for critical path
- [ ] Previously failing repro now passes

## Reliability Gate
- [ ] Timeout and retry behavior verified
- [ ] Idempotency behavior verified for commands/events
- [ ] Recovery path tested for missed events

## Security Gate
- [ ] Auth and permission checks validated
- [ ] Input validation and error envelopes validated
- [ ] Tenant boundary checks validated

## Observability Gate
- [ ] Structured logs include correlation ID
- [ ] Metrics updated for changed flow
- [ ] Alert thresholds reviewed

## Deployment Gate
- [ ] Feature flag or staged rollout defined
- [ ] Rollback trigger and actions documented
- [ ] Post-release watch window and owner assigned
