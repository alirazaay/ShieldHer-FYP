# Testing Guide

## Test Layers
- Unit tests: focused service and utility behavior in `__tests__/`.
- Integration tests: SOS lifecycle and cross-module flows in `tests/integration/`.
- Firestore rules tests: emulator-backed authorization checks in `tests/rules/`.
- Cloud Function tests: backend trigger and scheduler behavior in `tests/functions/`.

## Commands
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:functions`
- `npm run test:rules:emulator`
- `npm run test:coverage`

## Firestore Rules Testing
Rules tests use Firebase Emulator Suite with `@firebase/rules-unit-testing`.
CI executes rules tests via `firebase emulators:exec`.

## Coverage Target
Jest coverage threshold is configured at 70% global for branches, functions, lines, and statements.

## E2E Checklist

### SOS Flow
- User triggers SOS.
- Alert document appears in Firestore.
- Guardian receives push notification.
- Guardian responds and resolves alert.

### Offline Flow
- User triggers SOS while offline.
- Alert is persisted in local retry queue.
- Alert is retried on interval and on reconnection.
- SMS backup triggers after max retries.

### AI Flow
- Scream confidence reaches threshold and validation frames.
- Confirmation window appears.
- Cancel action prevents SOS dispatch.
- Allow countdown dispatches SOS.

### Guardian Flow
- Guardian dashboard displays active alerts.
- Guardian can respond to and resolve active alerts.
- Cancelled alerts are visible but not actionable.

### Police Flow
- Unresolved alert passes escalation timeout.
- Escalated alert appears in police alerts collection/dashboard.
- Authority notification payload includes alert context.

## CI Pipeline Gates
GitHub Actions workflow runs these checks:
- Install dependencies
- ESLint
- Unit tests
- Integration tests
- Cloud Function tests
- Firestore emulator rules tests
- Coverage reporting

Any failure blocks the pipeline.
