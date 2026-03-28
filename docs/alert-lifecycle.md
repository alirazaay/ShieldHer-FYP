# Alert Lifecycle

## Lifecycle States
- `active`: Alert created and awaiting guardian action.
- `responding`: Guardian acknowledged and is responding.
- `resolved`: Guardian marked incident as resolved.
- `cancelled`: Owner cancelled alert.
- `escalated` or `escalationState=completed`: Promoted to police workflow.

## End-to-End SOS Sequence
1. User triggers SOS.
2. App writes alert to Firestore with `status=active`.
3. `onAlertCreated` function sends guardian notifications.
4. Guardian responds (`status=responding`).
5. Guardian resolves (`status=resolved`) or owner cancels (`status=cancelled`).
6. If no response before timeout, escalation scheduler creates `policeAlerts` record.

## Offline and Retry Behavior
1. Firestore send fails or device is offline.
2. Alert is queued with `pending_retry` delivery status on device.
3. Retry worker attempts resend every 10 seconds.
4. After 5 failures, retry delay uses exponential backoff.
5. After 10 failures, SMS backup flow is triggered automatically.

## Timeline Events
Alert timeline records event progression for auditing.
- `triggered`
- `responded`
- `resolved`
- `alert_cancelled`

## Invariants
- Alert ownership is immutable.
- Alert location and creation metadata remain immutable post-create.
- Only owner can cancel an alert.
- Guardians can update limited response fields only.
- Police users can read escalated alerts only.

## Failure Handling
- Network failure: queued retry with visible user status.
- Queue persistence failure: immediate SMS backup attempt.
- Notification send failure: escalation queue still created.
- Scheduler fallback path supports index-missing query behavior.
