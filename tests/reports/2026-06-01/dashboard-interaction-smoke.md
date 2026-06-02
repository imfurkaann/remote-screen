# Dashboard Interaction Smoke Report

- Date: 2026-06-01
- Dashboard: http://localhost:3001
- Backend: http://localhost:4100/api/v1

## Login Route
- PASS
- Redirect status: 307
- Access cookie set: true

## Pairing Confirm Route
- PASS
- Redirect location: http://localhost:3001/screens/pair?status=ok

## Command Dispatch Route
- PASS
- Command status: timeout

## Gate Decision
- PASS
