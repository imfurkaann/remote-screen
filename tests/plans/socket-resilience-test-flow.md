# Socket and Resilience Test Flow

## Scope

Reliability of `SYNC_CONTENT` and `COMMAND_DISPATCH` delivery and status lifecycle.

## Scenarios

1. Online command dispatch with ACK.
2. Timeout path and retry transition.
3. Reconnect with exponential backoff.
4. Missed event recovery through resync flow.
5. Duplicate `command_id` dedupe behavior.

## Pass Criteria

1. No lost command in lifecycle tracking.
2. Valid status transitions (`sent -> acked -> completed` or `failed`/`timed_out`).
3. Retry count and timeout fields recorded.
4. Reconnect eventually restores command and sync path.

## Evidence

- Backend command records.
- Socket logs.
- Report markdown.
