# Error Envelope and Codes

Date: 2026-04-01

## Stable Error Envelope

All API errors must follow:

```json
{
  "code": "STRING_CODE",
  "message": "Human readable summary",
  "details": {},
  "correlation_id": "uuid"
}
```

## HTTP Mapping

- `400`: validation errors
- `401`: unauthenticated
- `403`: unauthorized
- `404`: resource not found
- `409`: conflict/idempotency issue
- `422`: semantic validation failure
- `429`: rate limit exceeded
- `500`: internal server error

## Baseline Error Codes

- `PAIRING_CODE_INVALID`
- `PAIRING_CODE_EXPIRED`
- `DEVICE_NOT_FOUND`
- `DEVICE_NOT_PAIRED`
- `COMMAND_TIMEOUT`
- `COMMAND_DUPLICATE`
- `PLAYLIST_VERSION_CONFLICT`
- `MEDIA_CHECKSUM_MISMATCH`
- `TENANT_ACCESS_DENIED`
- `RATE_LIMIT_EXCEEDED`
