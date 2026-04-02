# API Smoke Report

- Date: 2026-04-01
- Base URL: http://localhost:4100/api/v1

## Health
- PASS
- Response: {"ok":true,"service":"backend","version":"0.1.0"}

## Auth Dev Token
- PASS
- User: qa@demo.local

## Pairing Request Code
- PASS
- bootstrap_key_used: test-bootstrap-key
- device_id: 69cd63597095340d1d956e62
- code: 843768

## Pairing Confirm
- PASS
- linked: True

## Device Session Refresh
- PASS
- paired: True

## Telemetry Ingest and Query
- PASS
- accepted: True
- query_count: 1

## Command Dispatch and Status
- PASS
- dispatch_status: timeout
- get_status: timeout

## Gate Decision
- PASS
