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
- `npm run test:rules`
- `npm run test:rules:emulator`
- `npm run test:ci`
- `npm run secrets:scan`
- `npm run secrets:scan:staged`
- `npm run security:status`
- `npm run hooks:install`
- `npm run test:coverage`

## Firestore Rules Testing
Rules tests use Firebase Emulator Suite with `@firebase/rules-unit-testing`.

### Local behavior without emulator
- `npm run test:rules` is emulator-aware.
- If Firestore emulator host/port is not available, tests print a warning and skip safely instead of failing setup/cleanup.

### Full rules validation
- Use `npm run test:rules:emulator` for full rules enforcement checks.
- This command runs `firebase emulators:exec --only firestore ...` and executes all assertions against live emulator state.

## CI Pipeline Commands
- `npm run test:ci` runs unit, integration, and Cloud Functions suites sequentially.
- Current script uses command chaining with `&&` for shell compatibility.
- Firestore rules validation remains a dedicated emulator-backed step via `npm run test:rules:emulator`.

## Secret Leak Prevention
- `npm run secrets:scan` scans tracked files for likely hardcoded credentials.
- `npm run secrets:scan:staged` scans only staged files (used by pre-commit hook).
- `npm run hooks:install` enables local git hooks via `.githooks/`.
- Firebase credential rotation procedure: see `docs/key-rotation-runbook.md`.

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
